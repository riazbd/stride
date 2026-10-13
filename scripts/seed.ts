/* eslint-disable @typescript-eslint/no-require-imports */
// STRIDE seed — generates a fully realistic dataset: athletes, GPS activities on real
// Dhaka streets (OSRM-snapped), segments w/ real matched efforts, clubs, challenges,
// gear, posts, kudos, comments and notifications.
import { db } from "../src/lib/db";
import { hashPassword } from "../src/server/password";
import { ROUTES, fetchRouteGeometries, RouteDef } from "./seed-routes";
import {
  LL, TrackPoint, haversineM, encodeTrack, computeSplits, trackStats,
  elevationGain, mulberry32, pathLength, matchSegment,
} from "../src/lib/geo";
import { trainingLoad } from "../src/server/effort";
import { refreshGearDistance, evaluateChallenges } from "../src/server/analytics";
import { rerankSegments } from "../src/server/handlers/segments";

const NOW = new Date();
const PW = hashPassword("stridedemo");
const rnd = mulberry32(20261013);
const pick = <T>(arr: T[], r = rnd): T => arr[Math.floor(r() * arr.length)];
const rint = (a: number, b: number, r = rnd) => Math.floor(a + r() * (b - a + 1));
const rfloat = (a: number, b: number, r = rnd) => a + r() * (b - a);

// ─── Athletes ────────────────────────────────────────────────────────────────
interface AthleteSpec {
  first: string; last: string; email: string; city: string; country: string;
  sex: "M" | "F"; weightKg: number; heightCm: number; birthYear: number;
  color: string; bio: string; premium: boolean; restHr: number; maxHr: number;
  runPace: number; ridePace: number; sports: string[]; tz: number;
}

const ATHLETES: AthleteSpec[] = [
  { first: "Alex", last: "Rahman", email: "alex@striden.app", city: "Dhaka", country: "Bangladesh", sex: "M", weightKg: 68, heightCm: 174, birthYear: 1994, color: "#fc4c02", bio: "Runner first, cyclist second. Chasing sub-1:50 half. Hatirjheel mornings.", premium: true, restHr: 52, maxHr: 192, runPace: 305, ridePace: 145, sports: ["run", "ride", "gym"], tz: 360 },
  { first: "Nusrat", last: "Jahan", email: "nusrat@striden.app", city: "Dhaka", country: "Bangladesh", sex: "F", weightKg: 54, heightCm: 161, birthYear: 1997, color: "#2c7f8f", bio: "Marathoner in the making. Gulshan Lake regular.", premium: false, restHr: 54, maxHr: 198, runPace: 345, ridePace: 190, sports: ["run", "walk"], tz: 360 },
  { first: "Tanvir", last: "Hasan", email: "tanvir@striden.app", city: "Dhaka", country: "Bangladesh", sex: "M", weightKg: 74, heightCm: 178, birthYear: 1991, color: "#404046", bio: "BDCyclists. 4:45 AM club rides, all year.", premium: true, restHr: 50, maxHr: 188, runPace: 340, ridePace: 132, sports: ["ride"], tz: 360 },
  { first: "Farhana", last: "Akter", email: "farhana@striden.app", city: "Dhaka", country: "Bangladesh", sex: "F", weightKg: 58, heightCm: 164, birthYear: 1993, color: "#b0486a", bio: "Ran my first 10K this year. Next stop: 21K.", premium: false, restHr: 56, maxHr: 196, runPace: 370, ridePace: 210, sports: ["run", "walk"], tz: 360 },
  { first: "Imran", last: "Chowdhury", email: "imran@striden.app", city: "Dhaka", country: "Bangladesh", sex: "M", weightKg: 81, heightCm: 180, birthYear: 1988, color: "#5a6472", bio: "Weekend warrior on the Trek. Coffee after, always.", premium: false, restHr: 58, maxHr: 184, runPace: 380, ridePace: 145, sports: ["ride"], tz: 360 },
  { first: "Ravi", last: "Sharma", email: "ravi@striden.app", city: "Dhaka", country: "Bangladesh", sex: "M", weightKg: 70, heightCm: 176, birthYear: 1992, color: "#3d7a4f", bio: "Tri-in-training. Swim, bike, run, repeat.", premium: true, restHr: 48, maxHr: 194, runPace: 320, ridePace: 138, sports: ["run", "ride", "swim"], tz: 360 },
  { first: "Priya", last: "Das", email: "priya@striden.app", city: "Dhaka", country: "Bangladesh", sex: "F", weightKg: 52, heightCm: 158, birthYear: 1996, color: "#7a5c9e", bio: "Track nights + lake runs. Zone 2 enjoyer.", premium: false, restHr: 52, maxHr: 199, runPace: 355, ridePace: 205, sports: ["run", "yoga"], tz: 360 },
  { first: "Shafiq", last: "Islam", email: "shafiq@striden.app", city: "Dhaka", country: "Bangladesh", sex: "M", weightKg: 77, heightCm: 175, birthYear: 1990, color: "#8a6d3b", bio: "Gazipur out-and-backs before breakfast.", premium: false, restHr: 51, maxHr: 186, runPace: 360, ridePace: 128, sports: ["ride"], tz: 360 },
  { first: "Maria", last: "Schmidt", email: "maria@striden.app", city: "Berlin", country: "Germany", sex: "F", weightKg: 56, heightCm: 168, birthYear: 1995, color: "#c29238", bio: "Tiergarten loops and tempo Tuesdays.", premium: true, restHr: 50, maxHr: 197, runPace: 315, ridePace: 150, sports: ["run"], tz: 120 },
  { first: "James", last: "Wilson", email: "james@striden.app", city: "London", country: "United Kingdom", sex: "M", weightKg: 78, heightCm: 182, birthYear: 1987, color: "#4a5d7a", bio: "Regent's Park laps. Coffee-powered.", premium: false, restHr: 53, maxHr: 185, runPace: 400, ridePace: 125, sports: ["ride"], tz: 60 },
  { first: "Emma", last: "Taylor", email: "emma@striden.app", city: "London", country: "United Kingdom", sex: "F", weightKg: 55, heightCm: 165, birthYear: 1994, color: "#c05a78", bio: "10K specialist. Chasing sub-50.", premium: true, restHr: 51, maxHr: 197, runPace: 330, ridePace: 200, sports: ["run"], tz: 60 },
  { first: "Jack", last: "Thompson", email: "jack@striden.app", city: "Sydney", country: "Australia", sex: "M", weightKg: 76, heightCm: 179, birthYear: 1993, color: "#3e8a8f", bio: "Centennial Park commuter. Ocean swims on weekends.", premium: false, restHr: 49, maxHr: 193, runPace: 325, ridePace: 135, sports: ["run", "ride", "swim"], tz: 600 },
  { first: "Aisha", last: "Rahman", email: "aisha@striden.app", city: "Singapore", country: "Singapore", sex: "F", weightKg: 51, heightCm: 160, birthYear: 1998, color: "#a04a8a", bio: "Marina Bay sunrise runs. Heat training by default.", premium: false, restHr: 53, maxHr: 200, runPace: 365, ridePace: 210, sports: ["run"], tz: 480 },
  { first: "Carlos", last: "Mendes", email: "carlos@striden.app", city: "Boston", country: "United States", sex: "M", weightKg: 72, heightCm: 177, birthYear: 1989, color: "#6d8a3a", bio: "Charles River laps before work.", premium: false, restHr: 52, maxHr: 189, runPace: 350, ridePace: 130, sports: ["ride", "run"], tz: -240 },
  { first: "Yuki", last: "Tanaka", email: "yuki@striden.app", city: "Tokyo", country: "Japan", sex: "F", weightKg: 50, heightCm: 157, birthYear: 1995, color: "#4a7a9e", bio: "Imperial Palace 5K every morning before the office.", premium: true, restHr: 49, maxHr: 199, runPace: 340, ridePace: 195, sports: ["run"], tz: 540 },
  { first: "Sarah", last: "Johnson", email: "sarah@striden.app", city: "Boulder", country: "United States", sex: "F", weightKg: 57, heightCm: 166, birthYear: 1991, color: "#8a8a3a", bio: "Trails over roads, always. Mesa+Flagstaff weekly.", premium: true, restHr: 47, maxHr: 195, runPace: 420, ridePace: 175, sports: ["trail_run", "hike"], tz: -360 },
];

const TITLES: Record<string, string[]> = {
  run: ["Morning Run", "Evening Run", "Lunch Run", "Easy Run", "Tempo Run", "Long Run", "Recovery Jog", "Intervals", "Progression Run", "Track Session", "Fartlek", "Steady State", "Shakeout Run"],
  trail_run: ["Mesa Trail Loop", "Trail Out & Back", "Sunrise Trail Run"],
  hike: ["Mesa Trail Hike", "Flagstaff Hike"],
  ride: ["Morning Ride", "Evening Ride", "Hatirjheel Loop", "Weekend Ride", "Zone 2 Ride", "Sunrise Ride", "Gazipur Out & Back", "Saturday Ride", "Commute Home", "Tempo Ride", "Bashundhara Loop"],
  walk: ["Evening Walk", "Lake Walk", "Recovery Walk"],
  gym: ["Gym Session", "Strength Training", "Leg Day", "Upper Body Push"],
  yoga: ["Morning Yoga", "Yoga Flow"],
  swim: ["Pool Swim", "Morning Swim", "Open Water Swim"],
};

const DESCS = [
  "Legs felt great today", "Hot and humid but got it done", "Negative split the back half",
  "With the Tuesday group", "Held pace on the tempo blocks", "Traffic was rough but the legs were good",
  "First time back in weeks — slow is fine", "Watch died at 8k, guessing the rest", "Perfect weather for it",
  "Cruised easy, saving the legs", "Rain delay then a break in the clouds", "Felt strong the whole way",
  "Grinding up that headwind", "Post-work stress relief", "Same loop, different day",
];

const COMMENTS = [
  "Great pace!", "Strong!", "Nice work — I need to get back out there",
  "Those splits are spicy", "Solid negative split", "Beautiful morning for it",
  "You're flying lately", "Save some speed for the rest of us", "See you Saturday?",
  "Beast mode", "That elevation tho", "Consistency is paying off",
  "You made that look easy", "Chasing you on that segment next week",
];

// ─── Simulation ──────────────────────────────────────────────────────────────

interface SimOpts {
  geom: LL[]; sport: string; targetDistM: number; paceSecKm: number; seed: number;
  eleBase: number; eleRange: number; hills: number;
  restHr: number; maxHr: number; weightKg: number; met: number; startAt: Date;
  effort?: number; // 0..1 intensity multiplier
}

const HR_CEILING: Record<string, number> = {
  walk: 0.45, hike: 0.6, run: 0.92, trail_run: 0.93, ride: 0.9, swim: 0.88,
};

function cumLengths(geom: LL[]): { cums: number[]; total: number } {
  const cums = [0];
  for (let i = 1; i < geom.length; i++) cums.push(cums[i - 1] + haversineM(geom[i - 1], geom[i]));
  return { cums, total: cums[cums.length - 1] };
}

function pointAt(geom: LL[], cums: number[], s: number): LL {
  if (s <= 0) return geom[0];
  if (s >= cums[cums.length - 1]) return geom[geom.length - 1];
  let lo = 0, hi = cums.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cums[mid] <= s) lo = mid; else hi = mid;
  }
  const seg = cums[hi] - cums[lo] || 1;
  const t = (s - cums[lo]) / seg;
  return [geom[lo][0] + (geom[hi][0] - geom[lo][0]) * t, geom[lo][1] + (geom[hi][1] - geom[lo][1]) * t];
}

function simulate(o: SimOpts): { points: TrackPoint[]; hrSeries: [number, number][]; avgHr: number | null; maxHr: number; calories: number } {
  const r = mulberry32(o.seed);
  const { cums, total } = cumLengths(o.geom);
  // build working path (repeat loops / out-back to hit target distance)
  let path: LL[] = [];
  if (o.targetDistM <= total * 0.92) {
    // sub-path with random offset
    const off = r() * Math.max(0, total - o.targetDistM);
    const s0 = off, s1 = off + o.targetDistM;
    for (let s = s0; s <= s1; s += 25) path.push(pointAt(o.geom, cums, s));
    path.push(pointAt(o.geom, cums, s1));
  } else {
    const reps = Math.ceil(o.targetDistM / total);
    for (let k = 0; k < reps; k++) {
      const g = k % 2 === 1 ? [...o.geom].reverse().slice(1) : k > 0 ? o.geom.slice(1) : o.geom;
      path = path.concat(g);
    }
  }
  const pathCums = cumLengths(path);
  const pathTotal = pathCums.total;

  const baseV = 1000 / o.paceSecKm * (0.97 + r() * 0.06);
  const eff = o.effort ?? 0.75;
  const surges: [number, number, number][] = []; // [startFrac, endFrac, boost]
  if (o.sport === "run" || o.sport === "ride") {
    const n = rint(0, 3, r);
    for (let i = 0; i < n; i++) {
      const sf = 0.15 + r() * 0.7;
      surges.push([sf, sf + 0.03 + r() * 0.06, 1.1 + r() * 0.12]);
    }
  }
  const pauses: number[] = [];
  const np = o.sport === "run" ? (r() < 0.5 ? 1 : 0) : r() < 0.25 ? 1 : 0;
  for (let i = 0; i < np; i++) pauses.push(0.18 + r() * 0.6);

  const points: [number, number, number, number][] = []; // [lng, lat, ele, t]
  let s = 0, t = 0, warm = 0;
  let jitLat = 0, jitLng = 0;
  let hrSum = 0, hrN = 0, hrMax = 0;
  const hrSeries: [number, number][] = [];
  const dt = 4;
  let pauseUntil = -1;
  let pauseLeft = 0;

  while (s < pathTotal) {
    const frac = s / pathTotal;
    // speed model: warmup, fatigue, noise, surges
    warm = Math.min(1, warm + dt / 100);
    let v = baseV * eff * (0.78 + 0.22 * warm) * (1 - 0.05 * frac) * (0.985 + r() * 0.03);
    for (const [a, b, boost] of surges) if (frac >= a && frac <= b) v *= boost;

    if (pauseUntil >= 0 && t < pauseUntil) {
      // paused at spot
      const p = pointAt(path, pathCums.cums, s);
      let hr = o.restHr + 30 * Math.max(0.2, 1 - (pauseUntil - t) / 40);
      points.push([p[0] + jitLng, p[1] + jitLat, eleAt(frac), Math.round(t)]);
      t += dt;
      continue;
    }
    if (pauses.length && frac > pauses[0]) {
      pauses.shift();
      pauseLeft = 18 + r() * 40;
      pauseUntil = t + pauseLeft;
    }

    s = Math.min(pathTotal, s + v * dt);
    t += dt;
    const p = pointAt(path, pathCums.cums, s);
    // GPS jitter random walk (±3m)
    jitLat = Math.max(-3e-5, Math.min(3e-5, jitLat + (r() - 0.5) * 1.2e-5));
    jitLng = Math.max(-3e-5, Math.min(3e-5, jitLng + (r() - 0.5) * 1.2e-5));
    // HR tracks relative intensity (v / base speed), capped by sport-specific ceiling
    const ceiling = HR_CEILING[o.sport] ?? 0.85;
    const hrFrac = Math.min(ceiling, 0.35 + 0.45 * (v / baseV) + 0.05 * frac);
    let hr = o.restHr + (o.maxHr - o.restHr) * hrFrac + (r() - 0.5) * 5;
    hr = Math.max(o.restHr + 8, Math.min(o.maxHr - 2, hr));
    hrSum += hr; hrN++;
    hrMax = Math.max(hrMax, hr);
    hrSeries.push([Math.round(t), Math.round(hr)]);
    points.push([p[0] + jitLng, p[1] + jitLat, eleAt(frac), Math.round(t)]);
  }

  function eleAt(frac: number): number {
    const ph = o.seed % 7;
    let e = o.eleBase + o.eleRange * 0.5 * Math.sin(frac * 6.3 + ph) + o.eleRange * 0.3 * Math.sin(frac * 17 + ph * 2);
    if (o.hills) {
      // climb to mid-route, descend after
      const tri = frac < 0.5 ? frac * 2 : (1 - frac) * 2;
      e += o.hills * tri;
    }
    return Math.round(e * 10) / 10;
  }

  const avgHr = hrN ? Math.round(hrSum / hrN) : null;
  const stats = trackStats(points.map((p) => ({ lng: p[0], lat: p[1], ele: p[2], t: p[3] })));
  const movingH = stats.movingS / 3600;
  const calories = Math.round(o.met * o.weightKg * movingH * 1.05);
  return {
    points: points.map((p) => ({ lng: p[0], lat: p[1], ele: p[2], t: p[3] })),
    hrSeries, avgHr, maxHr: Math.round(hrMax), calories,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Clearing database...");
  const tabNames = ["Notification", "Comment", "Kudos", "SegmentEffort", "SegmentStar", "EventAttendance", "ClubEvent", "ClubMembership", "Club", "ChallengeEntry", "Challenge", "Goal", "Gear", "Route", "Track", "Split", "Lap", "Post", "Activity", "AthleteFollow", "Session", "Segment", "Report", "PasswordReset", "Athlete"];
  for (const t of tabNames) await (db as any)[t].deleteMany({});

  const geoms = await fetchRouteGeometries();
  const routeById = new Map<string, { def: RouteDef; geom: LL[] }>();
  for (const r of ROUTES) {
    const g = (geoms[r.id] as LL[] | undefined) ?? r.waypoints;
    routeById.set(r.id, { def: r, geom: g });
  }

  console.log("Creating athletes...");
  const athletes: Record<string, { id: string; spec: AthleteSpec }> = {};
  for (const a of ATHLETES) {
    const row = await db.athlete.create({
      data: {
        email: a.email, password: PW, firstName: a.first, lastName: a.last,
        avatarColor: a.color, bio: a.bio, city: a.city, country: a.country,
        sex: a.sex, weightKg: a.weightKg, heightCm: a.heightCm,
        birthday: new Date(Date.UTC(a.birthYear, rint(0, 11), rint(1, 28))),
        units: "km", premium: a.premium,
      },
    });
    athletes[a.email] = { id: row.id, spec: a };
  }
  const me = athletes["alex@striden.app"];
  const byFirst = (n: string) => Object.values(athletes).find((x) => x.spec.first === n)!;

  console.log("Creating follows...");
  const follow = async (from: string, to: string) => {
    await db.athleteFollow.create({ data: { followerId: from, followedId: to } });
    await db.athlete.update({ where: { id: to }, data: { followerCount: { increment: 1 } } });
    await db.athlete.update({ where: { id: from }, data: { followingCount: { increment: 1 } } });
  };
  const dhakaCrew = ["Nusrat", "Tanvir", "Farhana", "Imran", "Ravi", "Priya", "Shafiq"];
  for (const n of [...dhakaCrew, "Maria", "Emma", "Jack"]) await follow(me.id, byFirst(n).id);
  for (const n of dhakaCrew) if (rnd() < 0.8) await follow(byFirst(n).id, me.id);
  const pairs: [string, string][] = [
    ["Nusrat", "Farhana"], ["Nusrat", "Priya"], ["Farhana", "Priya"], ["Tanvir", "Imran"],
    ["Tanvir", "Shafiq"], ["Imran", "Shafiq"], ["Ravi", "Tanvir"], ["Ravi", "Nusrat"],
    ["Maria", "Emma"], ["Jack", "Carlos"], ["Yuki", "Maria"],
    ["Sarah", "Carlos"], ["Aisha", "Nusrat"],
  ];
  for (const [a, b] of pairs) { await follow(byFirst(a).id, byFirst(b).id); await follow(byFirst(b).id, byFirst(a).id); }

  console.log("Creating activities...");
  let activitySeed = 1;

  async function createActivity(spec: AthleteSpec, athleteId: string, opts: {
    routeId: string; sport: string; km: number; daysAgo: number; hour: number; minute?: number;
    title?: string; description?: string | null; effort?: number; paceSecKm?: number;
    gearId?: string | null; visibility?: string; isCommute?: boolean; laps?: boolean; photo?: string | null;
  }) {
    const { def, geom } = routeById.get(opts.routeId)!;
    const seed = activitySeed++ * 7919;
    const startAt = new Date(NOW.getTime() - opts.daysAgo * 86400000);
    startAt.setUTCHours(opts.hour, opts.minute ?? rint(0, 55), rint(0, 59), 0);
    const pace = opts.paceSecKm ??
      (opts.sport === "ride" ? spec.ridePace :
       opts.sport === "walk" ? rint(590, 700) :
       opts.sport === "hike" ? rint(660, 800) :
       opts.sport === "trail_run" ? spec.runPace * 1.35 : spec.runPace);
    const met = opts.sport === "ride" ? 6.8 : opts.sport === "run" ? 9.8 : ["walk", "hike"].includes(opts.sport) ? 4.5 : 5.5;
    const sim = simulate({
      geom, sport: opts.sport, targetDistM: opts.km * 1000, paceSecKm: pace * rfloat(0.96, 1.04),
      seed, eleBase: def.eleBase, eleRange: def.eleRange, hills: def.hills ?? 0,
      restHr: spec.restHr, maxHr: spec.maxHr, weightKg: spec.weightKg, met, startAt, effort: opts.effort ?? 0.75,
    });
    const tps = sim.points;
    const stats = trackStats(tps);
    const splits = computeSplits(tps, 1000);
    const title = opts.title ?? pick(TITLES[opts.sport] ?? TITLES.run);
    const description = opts.description === undefined ? (rnd() < 0.35 ? pick(DESCS) : null) : opts.description;
    // demo athletes with a watch (the premium ones) record heart rate; the rest
    // have none, exactly like phone-only users
    const hasStrap = spec.premium;
    const perceivedEffort = Math.max(1, Math.min(10, Math.round((opts.effort ?? 0.75) * 10)));
    const effort = trainingLoad({
      sport: opts.sport, movingS: stats.movingS, hrSeries: hasStrap ? sim.hrSeries : null,
      perceivedEffort: hasStrap ? null : perceivedEffort, maxHr: spec.maxHr,
    });
    const activity = await db.activity.create({
      data: {
        athleteId, sport: opts.sport, title, description,
        startDate: startAt, tzOffsetMin: spec.tz,
        distanceM: stats.distanceM, movingTimeS: Math.round(stats.movingS), elapsedTimeS: Math.round(stats.elapsedS),
        elevationM: elevationGain(tps.map((p) => p.ele)),
        startLat: tps[0].lat, startLng: tps[0].lng, endLat: tps[tps.length - 1].lat, endLng: tps[tps.length - 1].lng,
        avgSpeed: stats.avgSpeed, maxSpeed: stats.maxSpeed,
        avgHr: hasStrap ? sim.avgHr : null, maxHr: hasStrap ? sim.maxHr : null,
        calories: sim.calories, relativeEffort: effort.load, effortSource: effort.source,
        perceivedEffort,
        visibility: opts.visibility ?? "everyone", isCommute: opts.isCommute ?? false,
        gearId: opts.gearId ?? null, photo: opts.photo ?? null,
        deviceName: hasStrap ? "Garmin Forerunner 965" : "STRIDE App",
        track: { create: { points: encodeTrack(tps), hrPoints: hasStrap ? JSON.stringify(sim.hrSeries) : null } },
        splits: {
          create: splits.map((s) => {
            const inSplit = sim.hrSeries.filter(([t]) => t >= s.tStart && t <= s.tEnd);
            return {
              index: s.index, distanceM: s.distanceM, timeS: Math.round(s.timeS),
              elevationDiff: Math.round(s.elevationDiff),
              avgHr: hasStrap && inSplit.length ? Math.round(inSplit.reduce((a, x) => a + x[1], 0) / inSplit.length) : null,
              paceZone: s.paceZone,
            };
          }),
        },
        ...(opts.laps
          ? { laps: { create: splits.map((s) => ({ index: s.index, distanceM: s.distanceM, timeS: Math.round(s.timeS) })) } }
          : {}),
      },
    });
    return { activity, tps, splits };
  }

  // ── Gear first (so activities can reference it) ──
  const ghost = await db.gear.create({ data: { athleteId: me.id, type: "shoes", name: "Brooks Ghost 15", brand: "Brooks", model: "Ghost 15", isDefault: true } });
  const pegasus = await db.gear.create({ data: { athleteId: me.id, type: "shoes", name: "Nike Pegasus 40", brand: "Nike", model: "Pegasus 40" } });
  const domane = await db.gear.create({ data: { athleteId: me.id, type: "bike", name: "Trek Domane AL 4", brand: "Trek", model: "Domane AL 4" } });
  const kayano = await db.gear.create({ data: { athleteId: me.id, type: "shoes", name: "Asics Gel-Kayano 28", brand: "Asics", retired: true } });
  const tanvirBike = await db.gear.create({ data: { athleteId: byFirst("Tanvir").id, type: "bike", name: "Giant TCR Advanced 2", brand: "Giant", model: "TCR Advanced 2" } });
  const nusratShoes = await db.gear.create({ data: { athleteId: byFirst("Nusrat").id, type: "shoes", name: "Saucony Endorphin Speed 3", brand: "Saucony", isDefault: true } });
  const sarahShoes = await db.gear.create({ data: { athleteId: byFirst("Sarah").id, type: "shoes", name: "Hoka Speedgoat 5", brand: "Hoka", isDefault: true } });

  // ── Alex's activities (rich history) ──
  const aRuns: Array<[string, number, number, number, number | undefined, string | undefined]> = [
    // [route, km, daysAgo, hour, effort, title]
    ["gulshan_lake", 8.1, 0, 6, 0.68, "Morning Run"],
    ["hatirjheel", 28.5, 1, 18, 0.7, "Evening Ride — Hatirjheel Loop"],
    ["dhanmondi", 18.4, 2, 6, 0.72, "Sunday Long Run"],
    ["ramna", 6.2, 3, 7, 0.6, "Recovery Jog"],
    ["gulshan_lake", 10.3, 4, 6, 0.82, "Tempo Run"],
    ["chandrima", 8.0, 6, 6, 0.68, "Morning Run"],
    ["gulshan_lake", 14.6, 8, 6, 0.7, "Long Run"],
    ["hatirjheel", 34.2, 9, 6, 0.72, "Sunrise Ride"],
    ["uttara", 10.5, 10, 6, 0.75, "Progression Run"],
    ["gulshan_lake", 8.2, 11, 18, 0.62, "Evening Run"],
    ["dhanmondi", 21.1, 13, 6, 0.88, "Dhaka Half Marathon"],
    ["ramna", 5.9, 15, 7, 0.58, "Shakeout Run"],
    ["hatirjheel", 41.8, 16, 6, 0.74, "Saturday Ride"],
    ["gulshan_lake", 12.4, 18, 6, 0.7, "Long Run"],
    ["chandrima", 6.8, 20, 6, 0.66, "Morning Run"],
    ["bashundhara", 38.6, 22, 6, 0.73, "Bashundhara Loop"],
    ["gulshan_lake", 9.9, 24, 6, 0.84, "Intervals"],
    ["uttara", 15.2, 26, 6, 0.7, "Long Run"],
    ["hatirjheel", 26.8, 27, 18, 0.68, "Evening Ride"],
    ["gulshan_lake", 7.6, 29, 6, 0.64, "Easy Run"],
    ["ramna", 6.5, 31, 7, 0.62, "Morning Run"],
    ["gazipur", 62.3, 33, 6, 0.76, "Gazipur Out & Back"],
    ["gulshan_lake", 16.8, 35, 6, 0.71, "Long Run"],
    ["chandrima", 5.4, 37, 6, 0.6, "Recovery Jog"],
    ["hatirjheel", 30.4, 39, 6, 0.7, "Morning Ride"],
    ["gulshan_lake", 11.7, 41, 6, 0.8, "Tempo Run"],
    ["uttara", 8.9, 43, 6, 0.66, "Morning Run"],
    ["gulshan_lake", 14.1, 45, 6, 0.7, "Long Run"],
    ["dhanmondi", 6.7, 47, 18, 0.63, "Evening Run"],
    ["ramna", 5.1, 50, 7, 0.6, "Easy Run"],
    ["gulshan_lake", 18.9, 55, 6, 0.72, "Long Run"],
    ["hatirjheel", 22.6, 58, 6, 0.69, "Morning Ride"],
    ["gulshan_lake", 12.8, 62, 6, 0.74, "Steady State"],
    ["dhanmondi", 9.4, 68, 6, 0.67, "Morning Run"],
    ["gulshan_lake", 15.5, 72, 6, 0.7, "Long Run"],
  ];
  for (const [route, km, daysAgo, hour, effort, title] of aRuns) {
    const isRide = /Ride/.test(title!);
    await createActivity(me.spec, me.id, {
      routeId: route, sport: isRide ? "ride" : "run", km, daysAgo, hour, effort, title,
      gearId: isRide ? domane.id : rnd() < 0.7 ? ghost.id : pegasus.id,
      laps: !isRide && rnd() < 0.4,
      visibility: daysAgo === 11 ? "followers" : "everyone",
    });
  }
  // Alex indoor/no-track activities (his watch measured heart rate)
  const indoorLoad = (sport: string, movingS: number, avgHr: number) => {
    const e = trainingLoad({ sport, movingS, avgHr, maxHr: me.spec.maxHr });
    return { relativeEffort: e.load, effortSource: e.source };
  };
  await db.activity.create({
    data: {
      athleteId: me.id, sport: "gym", title: "Strength Training", description: "Squats + core. Feeling it.",
      startDate: daysAgo(5), tzOffsetMin: 360, distanceM: 0, movingTimeS: 2760, elapsedTimeS: 3300,
      elevationM: 0, avgHr: 112, maxHr: 145, calories: 322, perceivedEffort: 6,
      ...indoorLoad("gym", 2760, 112),
      isTrainer: true, visibility: "everyone",
    },
  });
  await db.activity.create({
    data: {
      athleteId: me.id, sport: "yoga", title: "Recovery Yoga",
      startDate: daysAgo(7), tzOffsetMin: 360, distanceM: 0, movingTimeS: 2400, elapsedTimeS: 2400,
      elevationM: 0, avgHr: 84, maxHr: 102, calories: 118, perceivedEffort: 2,
      ...indoorLoad("yoga", 2400, 84),
      isTrainer: true, visibility: "everyone",
    },
  });
  await db.activity.create({
    data: {
      athleteId: me.id, sport: "swim", title: "Pool Swim", description: "2k straight, steady.",
      startDate: daysAgo(12), tzOffsetMin: 360, distanceM: 2000, movingTimeS: 3180, elapsedTimeS: 3180,
      elevationM: 0, avgHr: 138, maxHr: 162, calories: 486, perceivedEffort: 7,
      ...indoorLoad("swim", 3180, 138),
      isTrainer: true, visibility: "everyone", deviceName: "Garmin Forerunner 965",
    },
  });
  function daysAgo(n: number, hour = 19) {
    const d = new Date(NOW.getTime() - n * 86400000);
    d.setUTCHours(hour, 15, 0, 0);
    return d;
  }

  // ── Other athletes ──
  const others: Array<{ first: string; plans: Array<[string, string, number, number, number]> }> = [
    { first: "Nusrat", plans: [["gulshan_lake", "run", 9.8, 0, 6], ["gulshan_lake", "run", 14.2, 2, 6], ["gulshan_lake", "run", 8.4, 3, 17], ["dhanmondi", "run", 11.5, 5, 6], ["gulshan_lake", "run", 25.2, 7, 6], ["ramna", "walk", 3.4, 8, 18], ["gulshan_lake", "run", 12.6, 9, 6], ["gulshan_lake", "run", 16.3, 12, 6], ["gulshan_lake", "run", 7.9, 15, 17]] },
    { first: "Tanvir", plans: [["hatirjheel", "ride", 44.5, 0, 5], ["airport", "ride", 19.8, 2, 6], ["hatirjheel", "ride", 38.2, 4, 5], ["gazipur", "ride", 74.6, 6, 5], ["hatirjheel", "ride", 41.1, 8, 5], ["bashundhara", "ride", 36.4, 11, 5], ["hatirjheel", "ride", 48.7, 14, 5], ["airport", "ride", 16.2, 17, 18]] },
    { first: "Farhana", plans: [["dhanmondi", "run", 5.2, 1, 6], ["dhanmondi", "run", 7.8, 3, 6], ["ramna", "walk", 4.1, 4, 18], ["dhanmondi", "run", 10.4, 6, 6], ["gulshan_lake", "run", 6.6, 9, 17], ["dhanmondi", "run", 9.2, 13, 6], ["dhanmondi", "run", 4.8, 18, 6]] },
    { first: "Imran", plans: [["bashundhara", "ride", 31.8, 2, 6], ["hatirjheel", "ride", 24.6, 5, 6], ["gazipur", "ride", 51.2, 9, 6], ["bashundhara", "ride", 28.4, 13, 6], ["hatirjheel", "ride", 33.7, 20, 6]] },
    { first: "Ravi", plans: [["hatirjheel", "ride", 40.2, 1, 6], ["gulshan_lake", "run", 10.1, 2, 18], ["uttara", "run", 8.7, 4, 6], ["hatirjheel", "ride", 55.4, 6, 6], ["gulshan_lake", "run", 13.8, 8, 6], ["bashundhara", "ride", 42.9, 12, 6], ["gulshan_lake", "run", 16.5, 19, 6]] },
    { first: "Priya", plans: [["uttara", "run", 7.3, 1, 6], ["uttara", "run", 9.6, 4, 6], ["uttara", "run", 11.9, 8, 6], ["uttara", "run", 6.4, 12, 6], ["uttara", "run", 8.8, 16, 6], ["uttara", "run", 14.2, 23, 6]] },
    { first: "Shafiq", plans: [["gazipur", "ride", 82.4, 3, 5], ["gazipur", "ride", 66.1, 7, 5], ["airport", "ride", 42.8, 13, 5], ["gazipur", "ride", 91.5, 21, 5], ["hatirjheel", "ride", 37.3, 28, 5]] },
    { first: "Maria", plans: [["berlin", "run", 10.6, 0, 7], ["berlin", "run", 15.4, 2, 8], ["berlin", "run", 8.2, 5, 7], ["berlin", "run", 12.7, 8, 9], ["berlin", "run", 18.3, 12, 8], ["berlin", "run", 9.4, 17, 7]] },
    { first: "James", plans: [["london", "ride", 48.2, 1, 7], ["london", "ride", 36.8, 6, 7], ["london", "ride", 58.9, 10, 8], ["london", "ride", 29.4, 16, 18]] },
    { first: "Emma", plans: [["london", "run", 10.0, 0, 7], ["london", "run", 8.2, 2, 7], ["london", "run", 12.4, 4, 7], ["london", "run", 9.6, 7, 7], ["london", "run", 14.8, 11, 8], ["london", "run", 7.7, 14, 7]] },
    { first: "Jack", plans: [["sydney", "run", 9.4, 1, 6], ["sydney", "ride", 41.7, 3, 7], ["sydney", "run", 14.6, 5, 6], ["sydney", "ride", 55.2, 9, 7], ["sydney", "run", 11.3, 12, 6], ["sydney", "ride", 38.5, 18, 7]] },
    { first: "Aisha", plans: [["singapore", "run", 8.5, 0, 6], ["singapore", "run", 11.2, 3, 6], ["singapore", "run", 6.9, 6, 6], ["singapore", "run", 13.6, 9, 6], ["singapore", "run", 9.1, 15, 6]] },
    { first: "Carlos", plans: [["boston", "ride", 44.3, 2, 7], ["boston", "ride", 33.8, 6, 7], ["boston", "ride", 52.6, 11, 8], ["boston", "run", 7.2, 14, 7], ["boston", "ride", 40.1, 19, 7]] },
    { first: "Yuki", plans: [["tokyo", "run", 5.1, 0, 6], ["tokyo", "run", 5.0, 1, 6], ["tokyo", "run", 5.2, 2, 6], ["tokyo", "run", 10.4, 4, 6], ["tokyo", "run", 5.1, 5, 6], ["tokyo", "run", 5.0, 6, 6], ["tokyo", "run", 12.8, 9, 6], ["tokyo", "run", 5.1, 11, 6]] },
    { first: "Sarah", plans: [["boulder", "trail_run", 14.8, 1, 7], ["boulder", "trail_run", 21.3, 4, 7], ["boulder", "hike", 11.6, 8, 8], ["boulder", "trail_run", 17.9, 12, 7], ["boulder", "trail_run", 12.2, 17, 7]] },
  ];
  for (const { first, plans } of others) {
    const at = byFirst(first);
    for (const [route, sport, km, daysAgoN, hour] of plans) {
      await createActivity(at.spec, at.id, {
        routeId: route, sport, km, daysAgo: daysAgoN, hour,
        gearId: first === "Tanvir" ? tanvirBike.id : first === "Nusrat" ? nusratShoes.id : first === "Sarah" ? sarahShoes.id : null,
        laps: sport === "run" && rnd() < 0.3,
      });
    }
  }

  // ── Segments (sub-paths of real routes) ──
  console.log("Creating segments...");
  interface SegDef { routeId: string; name: string; sport: string; a: number; distM: number; desc: string }
  const segDefs: SegDef[] = [
    { routeId: "hatirjheel", name: "Hatirjheel Sprint", sport: "ride", a: 0.05, distM: 1200, desc: "Flat and fast along the lakeside expressway. Hold your line." },
    { routeId: "hatirjheel", name: "Hatirjheel KOM", sport: "ride", a: 0.42, distM: 3000, desc: "The full lake run — 3 km of open road. Local legend maker." },
    { routeId: "gulshan_lake", name: "Gulshan Lake 1K", sport: "run", a: 0.12, distM: 1000, desc: "The every-morning 1K along the lake path. Watch the joggers." },
    { routeId: "dhanmondi", name: "Dhanmondi Lake Sprint", sport: "run", a: 0.02, distM: 800, desc: "Short, punchy, crowded after 6 PM." },
    { routeId: "ramna", name: "Ramna Park 1K", sport: "run", a: 0.08, distM: 1000, desc: "Tree-lined park loop segment. PBs happen at sunrise." },
    { routeId: "uttara", name: "Uttara Sector 2K", sport: "run", a: 0.1, distM: 2000, desc: "Two sectors of quiet grid streets." },
    { routeId: "airport", name: "Airport Road TT", sport: "ride", a: 0.08, distM: 5000, desc: "5 km time trial down the airport corridor. Earnings: bragging rights." },
    { routeId: "bashundhara", name: "Bashundhara Sprint", sport: "ride", a: 0.28, distM: 1500, desc: "Wide lanes, big ring territory." },
    { routeId: "chandrima", name: "Chandrima 1K", sport: "run", a: 0.0, distM: 1000, desc: "The president's park loop. Flat, green, peaceful." },
    { routeId: "boulder", name: "Mesa Trail Climb", sport: "run", a: 0.15, distM: 2500, desc: "Singletrack climb with Front Range views. Earn the downhill." },
  ];
  for (const sd of segDefs) {
    const { geom, def } = routeById.get(sd.routeId)!;
    const { cums, total } = cumLengths(geom);
    const sub: LL[] = [];
    const s0 = sd.a * total, s1 = s0 + sd.distM;
    for (let s = s0; s <= Math.min(s1, total); s += 20) sub.push(pointAt(geom, cums, s));
    sub.push(pointAt(geom, cums, Math.min(s1, total)));
    const distance = pathLength(sub);
    const elevs = sub.map((_, i) => def.eleBase + (def.hills ?? 0) * (i / sub.length));
    await db.segment.create({
      data: {
        slug: sd.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: sd.name, description: sd.desc, sport: sd.sport, distanceM: distance,
        averageGrade: 0.4, maximumGrade: 2.1, climbCat: 0,
        elevationHigh: Math.max(...elevs), elevationLow: Math.min(...elevs),
        points: JSON.stringify(sub.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5, Math.round(elevs[sub.indexOf(p)] * 10) / 10])),
        city: def.city, country: def.country,
        startLat: sub[0][1], startLng: sub[0][0], endLat: sub[sub.length - 1][1], endLng: sub[sub.length - 1][0],
        starredCount: rint(3, 220),
        creatorId: rnd() < 0.5 ? me.id : byFirst(pick(dhakaCrew)).id,
      },
    });
  }

  console.log("Matching segment efforts...");
  const segments = await db.segment.findMany();
  const allActivities = await db.activity.findMany({ include: { track: true } });
  const trackCache = new Map<string, TrackPoint[]>();
  for (const act of allActivities) {
    if (act.track) trackCache.set(act.id, JSON.parse(act.track.points).map((p: [number, number, number, number]) => ({ lng: p[0], lat: p[1], ele: p[2], t: p[3] })));
  }
  const effortsToCreate: { segmentId: string; athleteId: string; activityId: string; timeS: number; avgSpeed: number; avgHr: number | null; date: Date }[] = [];
  for (const seg of segments) {
    const segPts: LL[] = JSON.parse(seg.points);
    for (const act of allActivities) {
      if (!act.track) continue;
      const segCity = seg.city;
      if (segCity !== "Dhaka" && act.startLat) {
        // only match boulder segment to boulder-ish activities (approx by elevation/coords)
        if (Math.abs(act.startLng! - seg.startLng) > 0.5) continue;
      }
      const tps = trackCache.get(act.id)!;
      const m = matchSegment(tps, { start: [seg.startLng, seg.startLat], end: [seg.endLng, seg.endLat], points: segPts });
      if (m) {
        const timeS = m.timeS;
        // only count moving time
        const sub = tps.slice(m.startIdx, m.endIdx + 1);
        let moving = 0;
        for (let i = 1; i < sub.length; i++) {
          const d = haversineM([sub[i - 1].lng, sub[i - 1].lat], [sub[i].lng, sub[i].lat]);
          const dt = sub[i].t - sub[i - 1].t;
          if (dt > 0 && d / dt > 0.55) moving += dt;
        }
        if (moving < timeS * 0.85) continue; // mostly paused, skip
        effortsToCreate.push({
          segmentId: seg.id, athleteId: act.athleteId, activityId: act.id,
          timeS, avgSpeed: seg.distanceM / timeS, avgHr: act.avgHr, date: act.startDate,
        });
      }
    }
  }
  for (const e of effortsToCreate) {
    await db.segmentEffort.create({ data: e });
  }
  // PRs per athlete; leaderboard ranks over public efforts, as the app computes them
  for (const seg of segments) {
    const efforts = await db.segmentEffort.findMany({ where: { segmentId: seg.id }, orderBy: { timeS: "asc" } });
    const bestPerAthlete = new Map<string, { timeS: number; id: string }>();
    for (const e of efforts) {
      const best = bestPerAthlete.get(e.athleteId);
      if (best === undefined || e.timeS < best.timeS) bestPerAthlete.set(e.athleteId, { timeS: e.timeS, id: e.id });
    }
    for (const { id: effortId } of bestPerAthlete.values()) {
      await db.segmentEffort.update({ where: { id: effortId }, data: { isPR: true } });
    }
  }
  await rerankSegments(segments.map((g) => g.id));
  console.log(`Created ${effortsToCreate.length} segment efforts`);

  console.log("Creating clubs...");
  const clubSpecs = [
    { slug: "dhaka-runners", name: "Dhaka Runners", sport: "running", city: "Dhaka", country: "Bangladesh", coverColor: "#fc4c02", accentColor: "#242427", description: "The original Dhaka running community. Track nights Wednesdays, long runs Sundays, all paces welcome.", members: ["Alex", "Nusrat", "Farhana", "Priya", "Ravi"] },
    { slug: "bdcyclists", name: "BDCyclists", sport: "cycling", city: "Dhaka", country: "Bangladesh", coverColor: "#242427", accentColor: "#fc4c02", description: "Bangladesh's largest cycling community. Rides every weekend from Hatirjheel. Lights on, helmets on.", members: ["Tanvir", "Imran", "Shafiq", "Alex"] },
    { slug: "hatirjheel-morning-crew", name: "Hatirjheel Morning Crew", sport: "cycling", city: "Dhaka", country: "Bangladesh", coverColor: "#2c7f8f", accentColor: "#e8e8ea", description: "5 AM starts, 3 laps, coffee after. The early crew owns the lake.", members: ["Tanvir", "Imran", "Alex", "Ravi"] },
    { slug: "gulshan-lake-striders", name: "Gulshan Lake Striders", sport: "running", city: "Dhaka", country: "Bangladesh", coverColor: "#b0486a", accentColor: "#242427", description: "Sunrise runs around Gulshan-Banani lake. Beginners to Boston qualifiers.", members: ["Nusrat", "Farhana", "Priya", "Alex"] },
    { slug: "trail-bangladesh", name: "Trail Bangladesh", sport: "multi", city: "Dhaka", country: "Bangladesh", coverColor: "#3d7a4f", accentColor: "#e8e8ea", description: "Finding and running the trails of Bangladesh — Gazipur, Bhawal, Bandarban.", members: ["Ravi", "Sarah", "Priya"] },
    { slug: "dhaka-tri-club", name: "Dhaka Tri Club", sport: "triathlon", city: "Dhaka", country: "Bangladesh", coverColor: "#5a6472", accentColor: "#fc4c02", description: "Swim, bike, run — brick by brick. Pool sessions Mondays and Thursdays.", members: ["Ravi", "Jack", "Alex"] },
  ];
  const clubs: Record<string, string> = {};
  for (const c of clubSpecs) {
    const owner = byFirst(c.members[0]);
    const row = await db.club.create({
      data: {
        slug: c.slug, name: c.name, description: c.description, sport: c.sport,
        city: c.city, country: c.country, coverColor: c.coverColor, accentColor: c.accentColor,
        memberCount: 0, privacy: "public",
      },
    });
    clubs[c.slug] = row.id;
    for (const [i, m] of c.members.entries()) {
      await db.clubMembership.create({
        data: { clubId: row.id, athleteId: byFirst(m).id, role: i === 0 ? "owner" : "member" },
      });
    }
    // counts are real: the members that exist
    await db.club.update({ where: { id: row.id }, data: { memberCount: c.members.length } });
  }

  console.log("Creating club events...");
  const day = 86400000;
  // helper: date N days ahead at a given time
  const at = (days: number, hour: number, minute: number) => {
    const d = new Date(NOW.getTime() + days * day);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };
  // next occurrence of a given weekday (0=Sun..6=Sat) at a time
  const nextDow = (dow: number, hour: number, minute: number) => {
    const d = new Date(NOW);
    let add = (dow - d.getUTCDay() + 7) % 7;
    if (add === 0) add = 7;
    const t = new Date(d.getTime() + add * day);
    t.setUTCHours(hour, minute, 0, 0);
    return t;
  };
  const events = [
    { club: "bdcyclists", title: "Saturday Sunrise Ride — Hatirjheel", desc: "5:45 AM at the ramp. 3 laps + coffee. No-drop ride.", date: () => nextDow(6, 5, 45), dur: 120, sport: "ride", spot: "Hatirjheel Ramp, Tejgaon", going: ["Alex", "Tanvir", "Imran", "Shafiq"] },
    { club: "dhaka-runners", title: "Wednesday Track Night", desc: "800m repeats at the national stadium track. Bring spikes if you have them.", date: () => nextDow(3, 19, 30), dur: 75, sport: "run", spot: "Bangabandhu National Stadium", going: ["Nusrat", "Farhana", "Priya"] },
    { club: "gulshan-lake-striders", title: "Long Run Sunday — 21K Lake Loop", desc: "Easy pace, 4 laps of the lake. Water station at the boathouse.", date: () => nextDow(0, 6, 30), dur: 150, sport: "run", spot: "Gulshan Lake Boathouse", going: ["Alex", "Nusrat", "Farhana"] },
    { club: "dhaka-runners", title: "Monthly 10K Time Trial", desc: "Race the clock on the flat airport service road. Podium gets cake.", date: () => at(13, 6, 0), dur: 60, sport: "run", spot: "Airport Service Road", going: ["Alex", "Priya", "Ravi"] },
    { club: "hatirjheel-morning-crew", title: "Full Moon Night Ride", desc: "Full moon lap + midnight biryani. Lights mandatory.", date: () => at(8, 20, 0), dur: 180, sport: "ride", spot: "Hatirjheel Ramp, Tejgaon", going: ["Tanvir", "Imran"] },
  ];
  for (const ev of events) {
    const start = ev.date();
    const row = await db.clubEvent.create({
      data: {
        clubId: clubs[ev.club], title: ev.title, description: ev.desc, startDate: start,
        durationMin: ev.dur, meetingSpot: ev.spot, sport: ev.sport, goingCount: ev.going.length,
      },
    });
    for (const g of ev.going) {
      await db.eventAttendance.create({ data: { eventId: row.id, athleteId: byFirst(g).id, status: "going" } });
    }
  }

  console.log("Creating challenges...");
  const chSpecs = [
    { slug: "october-run-100", title: "October Running Challenge", desc: "Run 100 km between October 1 and October 31.", cat: "run", type: "distance", goal: 100, badge: "award", accent: "#fc4c02", featured: true },
    { slug: "october-ride-250", title: "October Ride Challenge", desc: "Ride 250 km this month. Every pedal stroke counts.", cat: "ride", type: "distance", goal: 250, badge: "bike", accent: "#242427", featured: true },
    { slug: "october-walk-100", title: "October Walking Challenge", desc: "Walk 100 km this month. Step by step.", cat: "walk", type: "distance", goal: 100, badge: "footprints", accent: "#8a6d3b" },
    { slug: "monthly-gran-fondo", title: "Monthly Gran Fondo", desc: "Ride 130 km in a single activity this month.", cat: "ride", type: "single_distance", goal: 130, badge: "mountain", accent: "#404046", featured: true },
    { slug: "october-climb-2000", title: "October Climbing Challenge", desc: "Gain 2,000 m of elevation across all activities.", cat: "general", type: "elevation", goal: 2000, badge: "mountain", accent: "#3d7a4f" },
    { slug: "october-yoga", title: "October Yoga Challenge", desc: "15 yoga sessions this month. Flexibility is fitness.", cat: "yoga", type: "activities", goal: 15, badge: "flower2", accent: "#8a5d7a" },
    { slug: "october-5k", title: "October 5K Challenge", desc: "Run 5 km in a single activity this month.", cat: "run", type: "single_distance", goal: 5, badge: "zap", accent: "#b0486a" },
    { slug: "october-gravel-100", title: "October Gravel Challenge", desc: "Ride 100 km of gravel this month.", cat: "ride", type: "distance", goal: 100, badge: "mountain", accent: "#7a5c3e" },
  ];
  const challengeIds: Record<string, string> = {};
  for (const c of chSpecs) {
    const start = new Date(Date.UTC(NOW.getUTCFullYear(), 9, 1, 0, 0, 0));
    const end = new Date(Date.UTC(NOW.getUTCFullYear(), 9, 31, 23, 59, 59));
    const row = await db.challenge.create({
      data: {
        slug: c.slug, title: c.title, description: c.desc, category: c.cat, type: c.type,
        goalValue: c.goal, period: "monthly", startDate: start, endDate: end,
        badgeIcon: c.badge, accentColor: c.accent, joinedCount: 0, featured: !!c.featured,
      },
    });
    challengeIds[c.slug] = row.id;
  }
  for (const [slug, id] of Object.entries(challengeIds)) {
    const joiners = slug.includes("ride") ? ["Alex", "Tanvir", "Imran", "Shafiq", "James"] : ["Alex", "Nusrat", "Priya", "Emma", "Maria"];
    for (const j of joiners) {
      await db.challengeEntry.create({ data: { challengeId: id, athleteId: byFirst(j).id } });
    }
    await db.challenge.update({ where: { id }, data: { joinedCount: joiners.length } });
  }
  // completion is evaluated the same way the app does after each activity
  for (const a of Object.values(athletes)) await evaluateChallenges(a.id);

  console.log("Creating routes & goals & posts...");
  for (const rid of ["hatirjheel", "gulshan_lake", "gazipur", "bashundhara"]) {
    const { def, geom } = routeById.get(rid)!;
    const simplified = simplifyLL(geom);
    await db.route.create({
      data: {
        athleteId: me.id, name: { hatirjheel: "Hatirjheel Sunrise Loop", gulshan_lake: "Gulshan Lake Path", gazipur: "Gazipur Out & Back", bashundhara: "Bashundhara Block Ride" }[rid]!,
        description: "Created from a recent activity. Saved for repeats.",
        sport: rid === "gulshan_lake" ? "run" : "ride",
        points: JSON.stringify(simplified),
        distanceM: pathLength(geom),
        elevationM: 20, isPublic: true,
      },
    });
  }
  // goal targets are SI: metres
  await db.goal.create({ data: { athleteId: me.id, metric: "distance", target: 40000, sport: "run" } });
  await db.goal.create({ data: { athleteId: me.id, metric: "distance", target: 60000, sport: "ride" } });

  const postSpecs: Array<[string, string, number]> = [
    ["Nusrat", "Race week! Taper mode engaged. Easy laps around Gulshan this morning, legs feeling springy. See you at the start line on Sunday.", 1],
    ["Tanvir", "Anyone up for the Airport Road TT this Saturday? 5:45 AM at the toll plaza. Big ring only. Lights on, helmets on.", 2],
    ["Ravi", "Brick session done. 40k ride straight into a 5k run off the bike. Legs are actual noodles right now.", 3],
    ["Maria", "Berlin autumn running is unbeatable right now. Golden hour through Tiergarten, leaves crunching underfoot. Come visit and I'll show you the loop.", 4],
    ["Jack", "Rode to work along Centennial Park again this morning. Best commute in the world, hands down. Commute miles still count.", 5],
    ["Emma", "New 10K PB attempt next weekend — pacing help welcome. Targeting sub-50 for the first time. Slightly terrified.", 6],
  ];
  for (const [who, text, daysAgoN] of postSpecs) {
    await db.post.create({
      data: {
        athleteId: byFirst(who).id, text,
        createdAt: new Date(NOW.getTime() - daysAgoN * day - rint(1, 8) * 3600000),
      },
    });
  }

  console.log("Creating kudos & comments...");
  const feedActivities = await db.activity.findMany({ where: { visibility: "everyone" }, orderBy: { startDate: "desc" } });
  const athleteRows = Object.values(athletes);
  for (const act of feedActivities) {
    const fans = athleteRows.filter((a) => a.id !== act.athleteId);
    const n = rint(2, Math.min(11, fans.length));
    const shuffled = [...fans].sort(() => rnd() - 0.5).slice(0, n);
    for (const f of shuffled) {
      await db.kudos.create({
        data: {
          activityId: act.id, athleteId: f.id,
          createdAt: new Date(Math.min(Date.now(), act.startDate.getTime() + rint(1, 20) * 3600000)),
        },
      });
    }
    if (act.sport !== "yoga" && rnd() < 0.5) {
      const cn = rint(1, 3);
      const commenters = [...fans].sort(() => rnd() - 0.5).slice(0, cn);
      for (const c of commenters) {
        await db.comment.create({
          data: {
            activityId: act.id, athleteId: c.id, text: pick(COMMENTS),
            createdAt: new Date(Math.min(Date.now(), act.startDate.getTime() + rint(1, 24) * 3600000)),
          },
        });
      }
    }
  }
  // posts get kudos/comments too
  const posts = await db.post.findMany();
  for (const p of posts) {
    const fans = athleteRows.filter((a) => a.id !== p.athleteId).sort(() => rnd() - 0.5).slice(0, rint(1, 6));
    for (const f of fans) {
      await db.kudos.create({ data: { postId: p.id, athleteId: f.id, createdAt: new Date(p.createdAt.getTime() + rint(1, 12) * 3600000) } });
    }
    if (rnd() < 0.7) {
      await db.comment.create({
        data: { postId: p.id, athleteId: fans[0].id, text: pick(COMMENTS), createdAt: new Date(p.createdAt.getTime() + rint(1, 10) * 3600000) },
      });
    }
  }

  console.log("Creating notifications...");
  const latestRun = feedActivities.find((a) => a.athleteId === me.id && a.sport === "run");
  const latestRide = feedActivities.find((a) => a.athleteId === me.id && a.sport === "ride");
  const notifSpecs = [
    { type: "kudos", actor: "Nusrat", activityId: latestRun?.id, agoH: 2 },
    { type: "kudos", actor: "Priya", activityId: latestRun?.id, agoH: 4 },
    { type: "comment", actor: "Tanvir", activityId: latestRide?.id, agoH: 8, text: "Clean lap splits on that one" },
    { type: "comment", actor: "Farhana", activityId: latestRun?.id, agoH: 9, text: "You're flying lately" },
    { type: "follow", actor: "Aisha", agoH: 26 },
    { type: "club_join", actor: "Imran", clubId: clubs["hatirjheel-morning-crew"], text: "Imran joined Hatirjheel Morning Crew", agoH: 50 },
  ];
  for (const n of notifSpecs) {
    await db.notification.create({
      data: {
        recipientId: me.id, actorId: n.actor ? byFirst(n.actor).id : null,
        type: n.type, activityId: n.activityId ?? null,
        clubId: n.clubId ?? null, text: n.text ?? null,
        read: n.agoH > 40,
        createdAt: new Date(Date.now() - n.agoH * 3600000),
      },
    });
  }

  // gear mileage is the sum of the activities that used it
  await refreshGearDistance([ghost.id, pegasus.id, domane.id, kayano.id, tanvirBike.id, nusratShoes.id, sarahShoes.id]);

  const counts = {
    athletes: await db.athlete.count(),
    activities: await db.activity.count(),
    segments: await db.segment.count(),
    efforts: await db.segmentEffort.count(),
    clubs: await db.club.count(),
    challenges: await db.challenge.count(),
    kudos: await db.kudos.count(),
    comments: await db.comment.count(),
  };
  console.log("SEED COMPLETE", JSON.stringify(counts));
}

function simplifyLL(geom: LL[]): LL[] {
  const { simplify } = require("../src/lib/geo");
  return simplify(geom, 30);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
