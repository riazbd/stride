import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard, athleteSummary } from "../transform";
import { athleteStats, personalRecords, fitnessSeries, trainingLog } from "../analytics";
import { decodeTrack, simplifyTrack } from "@/lib/geo";

// GET /api/athletes/:id
export async function getAthlete(id: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const isMe = viewerId === athlete.id;
  const isFollowing = viewerId
    ? !!(await db.athleteFollow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: athlete.id } } }))
    : false;
  const stats = await athleteStats(athlete.id);
  const clubCount = await db.clubMembership.count({ where: { athleteId: athlete.id } });
  const trophyCount = await db.segmentEffort.count({ where: { athleteId: athlete.id, isPR: true } });
  const recent = await db.activity.findMany({
    where: isMe ? { athleteId: athlete.id } : { athleteId: athlete.id, visibility: { in: isFollowing ? ["everyone", "followers"] : ["everyone"] } },
    include: { athlete: true, track: true, gear: true, kudos: viewerId ? { where: { athleteId: viewerId } } : false, _count: { select: { kudos: true, comments: true } } },
    orderBy: { startDate: "desc" },
    take: 12,
  });
  return json({
    athlete: {
      ...athleteSummary(athlete),
      heightCm: athlete.heightCm,
      weightKg: athlete.weightKg,
      sex: athlete.sex,
      createdAt: athlete.createdAt.toISOString(),
      isMe,
      isFollowing,
      isFollower: viewerId
        ? !!(await db.athleteFollow.findUnique({ where: { followerId_followedId: { followerId: athlete.id, followedId: viewerId } } }))
        : false,
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
  const isMe = viewerId === athlete.id;
  const before = url.searchParams.get("before") ? new Date(url.searchParams.get("before")!) : new Date();
  const isFollowing = viewerId
    ? !!(await db.athleteFollow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: athlete.id } } }))
    : false;
  const rows = await db.activity.findMany({
    where: {
      athleteId: athlete.id, startDate: { lt: before },
      ...(isMe ? {} : { visibility: { in: isFollowing ? ["everyone", "followers"] : ["everyone"] } }),
    },
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

// POST /api/athletes/:id/follow (toggle)
export async function toggleFollow(id: string, viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  if (id === viewerId) return err(400, "Cannot follow yourself");
  const target = await db.athlete.findUnique({ where: { id } });
  if (!target) return err(404, "Athlete not found");
  const existing = await db.athleteFollow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: id } } });
  if (existing) {
    await db.athleteFollow.delete({ where: { id: existing.id } });
    await db.athlete.update({ where: { id }, data: { followerCount: { decrement: 1 } } });
    await db.athlete.update({ where: { id: viewerId }, data: { followingCount: { decrement: 1 } } });
    return json({ isFollowing: false });
  }
  await db.athleteFollow.create({ data: { followerId: viewerId, followedId: id } });
  await db.athlete.update({ where: { id }, data: { followerCount: { increment: 1 } } });
  await db.athlete.update({ where: { id: viewerId }, data: { followingCount: { increment: 1 } } });
  await db.notification.create({ data: { recipientId: id, actorId: viewerId, type: "follow" } });
  return json({ isFollowing: true });
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
  const myFollowing = viewerId
    ? new Set((await db.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } })).map((r) => r.followedId))
    : new Set<string>();
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

// GET /api/athletes/:id/trophies
export async function trophies(id: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const efforts = await db.segmentEffort.findMany({
    where: { athleteId: id },
    include: { segment: true },
    orderBy: { date: "desc" },
  });
  const prs = efforts.filter((e) => e.isPR);
  const kom = prs.filter((e) => e.rank === 1);
  const top3 = prs.filter((e) => (e.rank ?? 99) <= 3 && e.rank !== 1);
  const distancePRs = await personalRecords(id);
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

// GET /api/athletes/:id/heatmap
export async function heatmap(id: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const tracks = await db.track.findMany({
    where: { activity: { athleteId: id, isTrainer: false, visibility: "everyone" } },
    select: { points: true },
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
export async function trainingLogOf(id: string, url: URL): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const now = new Date();
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());
  const month = Number(url.searchParams.get("month") ?? now.getMonth());
  const days = await trainingLog(id, year, month);
  return json({ year, month, days });
}

// GET /api/athletes/:id/fitness
export async function fitness(id: string, viewerId: string | null): Promise<Response> {
  const athlete = await db.athlete.findUnique({ where: { id } });
  if (!athlete) return err(404, "Athlete not found");
  const series = await fitnessSeries(id, 90);
  const last = series[series.length - 1];
  return json({
    series,
    current: last ?? null,
    latestLoad: series.slice(-7).reduce((a, p) => a + p.load, 0),
  });
}
