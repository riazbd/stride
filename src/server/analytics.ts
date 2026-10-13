import { db } from "@/lib/db";
import { bestEfforts, decodeTrack, parsePauses } from "@/lib/geo";

// best rolling efforts live with the motion model so they share its moving/stopped logic
export { bestEffort } from "@/lib/geo";

export const BEST_DISTANCES = [
  { d: 1000, label: "1K" },
  { d: 5000, label: "5K" },
  { d: 10000, label: "10K" },
  { d: 21097.5, label: "Half Marathon" },
  { d: 42195, label: "Marathon" },
  { d: 40000, label: "40K TT" },
];

// ─── Personal records across an athlete's history ────────────────────────────

export interface PRRecord {
  distance: number;
  label: string;
  timeS: number;
  activityId: string;
  startDate: string;
  activityTitle: string | null;
}

const RUN_SPORTS = ["run", "trail_run"];

// `visible` narrows to the activities a viewer may see (see visibility.ts);
// the owner passes nothing and gets every activity
export async function personalRecords(athleteId: string, visible: object = {}): Promise<PRRecord[]> {
  const acts = await db.activity.findMany({
    where: { athleteId, isTrainer: false, distanceM: { gte: 1000 }, ...visible },
    select: {
      id: true, title: true, startDate: true, sport: true,
      track: { select: { points: true, pauses: true } },
    },
    orderBy: { startDate: "asc" },
  });
  // distance PRs for running, 40K TT for rides — each track is decoded once
  const best = new Map<string, PRRecord>();
  for (const a of acts) {
    const dists = BEST_DISTANCES.filter((d) => (d.label === "40K TT" ? a.sport === "ride" : RUN_SPORTS.includes(a.sport)));
    if (!dists.length || !a.track) continue;
    let pts;
    try {
      pts = decodeTrack(a.track.points);
    } catch {
      continue;
    }
    const times = bestEfforts(pts, dists.map((d) => d.d), parsePauses(a.track.pauses));
    dists.forEach((dist, i) => {
      const t = times[i];
      const cur = best.get(dist.label);
      if (t && (!cur || t < cur.timeS)) {
        best.set(dist.label, { distance: dist.d, label: dist.label, timeS: t, activityId: a.id, startDate: a.startDate.toISOString(), activityTitle: a.title });
      }
    });
  }
  const prs = BEST_DISTANCES.map((d) => best.get(d.label)).filter((p): p is PRRecord => !!p);
  return prs;
}

// ─── Weekly / YTD / all-time stats ───────────────────────────────────────────

export interface PeriodStats {
  distanceM: number;
  movingTimeS: number;
  elevationM: number;
  activities: number;
  relativeEffort: number;
}

export function emptyStats(): PeriodStats {
  return { distanceM: 0, movingTimeS: 0, elevationM: 0, activities: 0, relativeEffort: 0 };
}

export function aggStats(rows: { distanceM: number; movingTimeS: number; elevationM: number; relativeEffort: number | null }[]): PeriodStats {
  const s = emptyStats();
  for (const r of rows) {
    s.distanceM += r.distanceM;
    s.movingTimeS += r.movingTimeS;
    s.elevationM += r.elevationM;
    s.activities += 1;
    s.relativeEffort += r.relativeEffort ?? 0;
  }
  return s;
}

export function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function athleteStats(athleteId: string) {
  const [week, ytd, all, last4] = await Promise.all([
    db.activity.findMany({
      where: { athleteId, startDate: { gte: startOfWeek() } },
      select: { distanceM: true, movingTimeS: true, elevationM: true, relativeEffort: true },
    }),
    db.activity.findMany({
      where: { athleteId, startDate: { gte: new Date(new Date().getFullYear(), 0, 1) } },
      select: { distanceM: true, movingTimeS: true, elevationM: true, relativeEffort: true },
    }),
    db.activity.findMany({
      where: { athleteId },
      select: { distanceM: true, movingTimeS: true, elevationM: true, relativeEffort: true },
    }),
    weeklyHistory(athleteId, 12),
  ]);
  return {
    week: aggStats(week),
    ytd: aggStats(ytd),
    all: aggStats(all),
    weekly: last4,
  };
}

export interface WeeklyBucket {
  weekStart: string;
  distanceM: number;
  movingTimeS: number;
  elevationM: number;
  activities: number;
}

export async function weeklyHistory(athleteId: string, weeks: number): Promise<WeeklyBucket[]> {
  const now = new Date();
  const from = startOfWeek(now);
  from.setDate(from.getDate() - (weeks - 1) * 7);
  const rows = await db.activity.findMany({
    where: { athleteId, startDate: { gte: from } },
    select: { startDate: true, distanceM: true, movingTimeS: true, elevationM: true },
    orderBy: { startDate: "asc" },
  });
  const buckets: WeeklyBucket[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = new Date(from.getTime() + i * 7 * 86400000);
    buckets.push({ weekStart: ws.toISOString(), distanceM: 0, movingTimeS: 0, elevationM: 0, activities: 0 });
  }
  const msWeek = 7 * 86400000;
  for (const r of rows) {
    let idx = Math.floor((r.startDate.getTime() - from.getTime()) / msWeek);
    if (idx < 0 || idx >= weeks) continue;
    buckets[idx].distanceM += r.distanceM;
    buckets[idx].movingTimeS += r.movingTimeS;
    buckets[idx].elevationM += r.elevationM;
    buckets[idx].activities += 1;
  }
  return buckets;
}

// ─── Fitness & Freshness (CTL / ATL / TSB) ───────────────────────────────────

export interface FitnessPoint {
  date: string;
  fitness: number; // CTL
  fatigue: number; // ATL
  form: number; // TSB
  load: number; // daily TRIMP-ish (relative effort)
}

// calendar day where the activity happened, in its own time zone
export function localDayKey(startDate: Date, tzOffsetMin: number): string {
  return new Date(startDate.getTime() + tzOffsetMin * 60000).toISOString().slice(0, 10);
}

export async function fitnessSeries(athleteId: string, days = 90): Promise<FitnessPoint[]> {
  const from = new Date(Date.now() - (days + 30) * 86400000);
  const rows = await db.activity.findMany({
    where: { athleteId, startDate: { gte: from } },
    select: { startDate: true, tzOffsetMin: true, relativeEffort: true },
  });
  // daily load map
  const daily = new Map<string, number>();
  for (const r of rows) {
    const key = localDayKey(r.startDate, r.tzOffsetMin);
    daily.set(key, (daily.get(key) ?? 0) + (r.relativeEffort ?? 0));
  }
  let ctl = 0, atl = 0;
  const out: FitnessPoint[] = [];
  const start = new Date(from);
  for (let d = 0; d < days + 30; d++) {
    const day = new Date(start.getTime() + d * 86400000);
    const key = day.toISOString().slice(0, 10);
    const load = daily.get(key) ?? 0;
    ctl = ctl + (load - ctl) * (1 / 42);
    atl = atl + (load - atl) * (1 / 7);
    if (d >= 30) {
      out.push({
        date: day.toISOString(),
        fitness: Math.round(ctl),
        fatigue: Math.round(atl),
        form: Math.round(ctl - atl),
        load,
      });
    }
  }
  return out;
}

// ─── Training log (calendar) ─────────────────────────────────────────────────

export interface TrainingDay {
  date: string;
  distanceM: number;
  movingTimeS: number;
  activities: { id: string; sport: string; title: string | null; distanceM: number; movingTimeS: number }[];
}

export async function trainingLog(athleteId: string, year: number, month: number, visible: object = {}): Promise<TrainingDay[]> {
  // a day either side, then bucket by each activity's local date
  const start = new Date(Date.UTC(year, month, 1) - 86400000);
  const end = new Date(Date.UTC(year, month + 1, 1) + 86400000);
  const rows = await db.activity.findMany({
    where: { athleteId, startDate: { gte: start, lt: end }, ...visible },
    select: { id: true, sport: true, title: true, distanceM: true, movingTimeS: true, startDate: true, tzOffsetMin: true },
    orderBy: { startDate: "asc" },
  });
  const byDay = new Map<string, TrainingDay>();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    const key = new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10);
    byDay.set(key, { date: key, distanceM: 0, movingTimeS: 0, activities: [] });
  }
  for (const r of rows) {
    const key = localDayKey(r.startDate, r.tzOffsetMin);
    const day = byDay.get(key);
    if (!day) continue;
    day.distanceM += r.distanceM;
    day.movingTimeS += r.movingTimeS;
    day.activities.push({ id: r.id, sport: r.sport, title: r.title, distanceM: r.distanceM, movingTimeS: r.movingTimeS });
  }
  return [...byDay.values()];
}

// ─── Challenge progress (live-computed) ──────────────────────────────────────

export async function challengeProgress(athleteId: string, challenge: any): Promise<number> {
  const rows = await db.activity.findMany({
    where: {
      athleteId,
      startDate: { gte: challenge.startDate, lte: challenge.endDate },
      ...challengeSportFilter(challenge),
    },
    select: { distanceM: true, movingTimeS: true, elevationM: true },
  });
  switch (challenge.type) {
    case "distance":
      return rows.reduce((a, r) => a + r.distanceM, 0) / 1000;
    case "single_distance":
      return Math.max(0, ...rows.map((r) => r.distanceM), 0) / 1000;
    case "time":
      return rows.reduce((a, r) => a + r.movingTimeS, 0) / 60;
    case "elevation":
      return rows.reduce((a, r) => a + r.elevationM, 0);
    case "activities":
      return rows.length;
    default:
      return 0;
  }
}

function challengeSportFilter(c: any) {
  const map: Record<string, string[] | undefined> = {
    run: ["run", "trail_run"],
    ride: ["ride", "gravel", "mtb", "ebike", "virtual_ride"],
    walk: ["walk", "hike"],
    yoga: ["yoga"],
    general: undefined,
  };
  const sports = map[c.category];
  if (!sports) return {};
  return { sport: { in: sports } };
}

// Marks every joined, still-open challenge the athlete has now finished and
// tells them. Runs after an activity is saved or edited and when they join.
// Returns the slugs completed by this call.
export async function evaluateChallenges(athleteId: string, now = new Date()): Promise<string[]> {
  const entries = await db.challengeEntry.findMany({
    where: { athleteId, completedAt: null, challenge: { startDate: { lte: now }, endDate: { gte: new Date(now.getTime() - 86400000) } } },
    include: { challenge: true },
  });
  const done: string[] = [];
  for (const e of entries) {
    const progress = await challengeProgress(athleteId, e.challenge);
    if (progress < e.challenge.goalValue) continue;
    // only the first caller to flip completedAt sends the notification
    const claimed = await db.challengeEntry.updateMany({ where: { id: e.id, completedAt: null }, data: { completedAt: now } });
    if (claimed.count !== 1) continue;
    await db.notification.create({
      data: {
        recipientId: athleteId, type: "challenge_milestone", challengeId: e.challengeId,
        text: `You completed ${e.challenge.title}! Your badge is on your trophy case.`,
      },
    });
    done.push(e.challenge.slug);
  }
  return done;
}

// ─── Gear mileage ────────────────────────────────────────────────────────────

// Gear.distanceM is a cache of the distance of every activity using that gear;
// recomputing it (rather than adding and subtracting) keeps it right through
// edits, re-assignments and deletions.
export async function refreshGearDistance(gearIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(gearIds.filter((g): g is string => !!g))];
  for (const id of ids) {
    const sum = await db.activity.aggregate({ where: { gearId: id }, _sum: { distanceM: true } });
    await db.gear.updateMany({ where: { id }, data: { distanceM: sum._sum.distanceM ?? 0 } });
  }
}

// ─── Streak (consecutive active weeks) ───────────────────────────────────────

export async function currentStreak(athleteId: string): Promise<number> {
  const from = new Date(Date.now() - 400 * 86400000);
  const rows = await db.activity.findMany({
    where: { athleteId, startDate: { gte: from } },
    select: { startDate: true },
  });
  const weeks = new Set(rows.map((r) => weekStartKey(r.startDate)));
  let streak = 0;
  let cursor = startOfWeek();
  // if current week has nothing yet, start from last week
  if (!weeks.has(weekStartKey(cursor))) cursor = new Date(cursor.getTime() - 7 * 86400000);
  while (weeks.has(weekStartKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 7 * 86400000);
  }
  return streak;
}

function weekStartKey(d: Date): string {
  const ws = startOfWeek(d);
  return ws.toISOString().slice(0, 10);
}
