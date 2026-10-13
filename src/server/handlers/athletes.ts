import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard, athleteSummary } from "../transform";
import { athleteStats, personalRecords, fitnessSeries, trainingLog } from "../analytics";
import { followingIdsOf, visibleTo } from "../visibility";
import { hasFullAccess } from "../entitlement";
import { decodeTrack, simplifyTrack } from "@/lib/geo";

// GET /api/athletes/:id
export async function getAthlete(id: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const isMe = viewerId === athlete.id;
  const following = await followingIdsOf(viewerId);
  const visible = visibleTo(viewerId, following);
  const [stats, clubCount, trophyCount, recent, isFollower] = await Promise.all([
    athleteStats(athlete.id),
    db.clubMembership.count({ where: { athleteId: athlete.id } }),
    db.segmentEffort.count({ where: { athleteId: athlete.id, isPR: true, activity: visible } }),
    db.activity.findMany({
      where: { athleteId: athlete.id, ...visible },
      include: { athlete: true, track: true, gear: true, kudos: viewerId ? { where: { athleteId: viewerId } } : false, _count: { select: { kudos: true, comments: true } } },
      orderBy: { startDate: "desc" },
      take: 12,
    }),
    viewerId
      ? db.athleteFollow.findUnique({ where: { followerId_followedId: { followerId: athlete.id, followedId: viewerId } } })
      : null,
  ]);
  return json({
    athlete: {
      ...athleteSummary(athlete),
      // body measurements are personal: only the athlete sees them
      ...(isMe ? { heightCm: athlete.heightCm, weightKg: athlete.weightKg, sex: athlete.sex } : {}),
      createdAt: athlete.createdAt.toISOString(),
      isMe,
      isFollowing: following.includes(athlete.id),
      isFollower: !!isFollower,
    },
    stats,
    clubCount,
    trophyCount,
    recentActivities: await Promise.all(recent.map((a) => activityCard(a, viewerId))),
  });
}

// GET /api/athletes/:id/activities?before=
export async function athleteActivities(id: string, viewerId: string | null, url: URL): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const before = url.searchParams.get("before") ? new Date(url.searchParams.get("before")!) : new Date();
  if (Number.isNaN(before.getTime())) return err(400, "Bad cursor");
  const visible = visibleTo(viewerId, await followingIdsOf(viewerId));
  const rows = await db.activity.findMany({
    where: { athleteId: athlete.id, startDate: { lt: before }, ...visible },
    include: { athlete: true, track: true, gear: true, kudos: viewerId ? { where: { athleteId: viewerId } } : false, _count: { select: { kudos: true, comments: true } } },
    orderBy: { startDate: "desc" },
    take: 20,
  });
  const cards = await Promise.all(rows.map((a) => activityCard(a, viewerId)));
  return json({
    activities: cards,
    nextCursor: rows.length === 20 ? rows[rows.length - 1].startDate.toISOString() : null,
  });
}

// POST /api/athletes/:id/follow { on?: boolean } — sets the follow when `on` is
// given (safe to repeat), toggles it otherwise
export async function toggleFollow(id: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  if (id === viewerId) return err(400, "Cannot follow yourself");
  const target = await db.athlete.findUnique({ where: { id }, select: { id: true } });
  if (!target) return err(404, "Athlete not found");
  const key = { followerId: viewerId, followedId: id };
  let on: boolean = typeof body?.on === "boolean" ? body.on : !(await db.athleteFollow.findUnique({ where: { followerId_followedId: key } }));

  const changed = await db.$transaction(async (tx) => {
    const n = on
      ? (await tx.athleteFollow.createMany({ data: [key], skipDuplicates: true })).count
      : (await tx.athleteFollow.deleteMany({ where: key })).count;
    // counters are recounted, never nudged, so a race can't make them drift
    await tx.athlete.update({ where: { id }, data: { followerCount: await tx.athleteFollow.count({ where: { followedId: id } }) } });
    await tx.athlete.update({ where: { id: viewerId }, data: { followingCount: await tx.athleteFollow.count({ where: { followerId: viewerId } }) } });
    return n > 0;
  });
  if (on && changed) {
    await db.notification.create({ data: { recipientId: id, actorId: viewerId, type: "follow" } });
  }
  return json({ isFollowing: on });
}

// GET /api/athletes/:id/following | /followers
export async function followList(id: string, which: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const rows = await db.athleteFollow.findMany({
    where: which === "followers" ? { followedId: id } : { followerId: id },
    include: { follower: true, followed: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const myFollowing = new Set(await followingIdsOf(viewerId));
  const people = rows.map((r) => {
    const a = which === "followers" ? r.follower : r.followed;
    return {
      ...athleteSummary(a),
      isFollowing: myFollowing.has(a.id),
      isMe: a.id === viewerId,
    };
  });
  return json({ people });
}

// GET /api/athletes/:id/trophies — only from activities the viewer may see
export async function trophies(id: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const visible = viewerId === id ? {} : visibleTo(viewerId, await followingIdsOf(viewerId));
  const efforts = await db.segmentEffort.findMany({
    where: { athleteId: id, activity: visible },
    include: { segment: true },
    orderBy: { date: "desc" },
  });
  const prs = efforts.filter((e) => e.isPR);
  const kom = prs.filter((e) => e.rank === 1);
  const top3 = prs.filter((e) => (e.rank ?? 99) <= 3 && e.rank !== 1);
  const distancePRs = await personalRecords(id, visible);
  const completed = await db.challengeEntry.findMany({
    where: { athleteId: id, completedAt: { not: null } },
    include: { challenge: true },
  });
  return json({
    komCount: kom.length,
    top3Count: top3.length,
    prCount: prs.length,
    segmentTrophies: prs.map((e) => ({
      id: e.id, segmentName: e.segment.name, segmentSlug: e.segment.slug,
      segmentSport: e.segment.sport, city: e.segment.city,
      timeS: e.timeS, date: e.date.toISOString(), rank: e.rank,
      activityId: e.activityId,
      kind: e.rank === 1 ? "kom" : "pr",
    })),
    distancePRs,
    completedChallenges: completed.map((c) => ({
      id: c.challenge.id, slug: c.challenge.slug, title: c.challenge.title,
      badgeIcon: c.challenge.badgeIcon, accentColor: c.challenge.accentColor,
      completedAt: c.completedAt!.toISOString(),
    })),
  });
}

// GET /api/athletes/:id/heatmap — the athlete's own heatmap. Every route they
// ever recorded, home and privacy zones included, so it is never shown to anyone else.
export async function heatmap(id: string, viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  if (viewerId !== id) return err(403, "Heatmaps are private to their athlete");
  const tracks = await db.track.findMany({
    where: { activity: { athleteId: id, isTrainer: false } },
    select: { points: true },
    orderBy: { activity: { startDate: "desc" } },
    take: 300,
  });
  const polylines: [number, number][][] = [];
  for (const t of tracks) {
    try {
      const pts = decodeTrack(t.points);
      const simp = simplifyTrack(pts, 20);
      if (simp.length > 1) polylines.push(simp.map((p) => [p.lng, p.lat]));
    } catch { /* skip corrupt */ }
  }
  return json({ polylines });
}

// GET /api/athletes/:id/training-log?year=&month=
export async function trainingLogOf(id: string, viewerId: string | null, url: URL): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const [athlete, viewer] = await Promise.all([
    db.athlete.findUnique({ where: { id }, select: { id: true } }),
    db.athlete.findUnique({ where: { id: viewerId }, select: { premium: true } }),
  ]);
  if (!athlete) return err(404, "Athlete not found");
  if (!hasFullAccess(viewer)) return err(402, "The training log is a Premium feature");
  const now = new Date();
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());
  const month = Number(url.searchParams.get("month") ?? now.getMonth());
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) return err(400, "Bad month");
  const visible = viewerId === id ? {} : visibleTo(viewerId, await followingIdsOf(viewerId));
  const days = await trainingLog(id, year, month, visible);
  return json({ year, month, days });
}

// GET /api/athletes/:id/fitness — the athlete's own training load
export async function fitness(id: string, viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  if (viewerId !== id) return err(403, "Fitness is private to its athlete");
  const viewer = await db.athlete.findUnique({ where: { id: viewerId }, select: { premium: true } });
  if (!hasFullAccess(viewer)) return err(402, "Fitness is a Premium feature");
  const [series, sources] = await Promise.all([
    fitnessSeries(id, 90),
    db.activity.groupBy({
      by: ["effortSource"],
      where: { athleteId: id, startDate: { gte: new Date(Date.now() - 90 * 86400000) } },
      _count: true,
    }),
  ]);
  const last = series[series.length - 1];
  const total = sources.reduce((a, s) => a + s._count, 0);
  const measured = sources.filter((s) => s.effortSource === "hr").reduce((a, s) => a + s._count, 0);
  return json({
    series,
    current: last ?? null,
    latestLoad: series.slice(-7).reduce((a, p) => a + p.load, 0),
    // share of the last 90 days' load that came from a heart-rate strap
    measuredShare: total ? measured / total : 0,
  });
}
