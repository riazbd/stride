import { db } from "@/lib/db";
import { json, err } from "../session";
import { LL } from "@/lib/geo";

// GET /api/segments?q=&sport=
export async function listSegments(viewerId: string | null, url: URL): Promise<Response> {
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  const sport = url.searchParams.get("sport");
  const where: any = {};
  if (sport === "run" || sport === "ride") where.sport = sport;
  if (q) where.OR = [
    { name: { contains: q } },
    { city: { contains: q } },
    { country: { contains: q } },
  ];
  const segs = await db.segment.findMany({ where, orderBy: { starredCount: "desc" }, take: 50 });
  const starred = viewerId
    ? new Set((await db.segmentStar.findMany({ where: { athleteId: viewerId }, select: { segmentId: true } })).map((s) => s.segmentId))
    : new Set<string>();
  const myEfforts = viewerId ? await db.segmentEffort.findMany({ where: { athleteId: viewerId } }) : [];
  const myBestBySeg = new Map<string, number>();
  for (const e of myEfforts) {
    const cur = myBestBySeg.get(e.segmentId);
    if (cur === undefined || e.timeS < cur) myBestBySeg.set(e.segmentId, e.timeS);
  }
  return json({
    segments: segs.map((s) => ({
      id: s.id, slug: s.slug, name: s.name, sport: s.sport, distanceM: s.distanceM,
      averageGrade: s.averageGrade, city: s.city, country: s.country,
      starredCount: s.starredCount,
      startLat: s.startLat, startLng: s.startLng, endLat: s.endLat, endLng: s.endLng,
      points: JSON.parse(s.points),
      isStarred: starred.has(s.id),
      myBestTimeS: myBestBySeg.get(s.id) ?? null,
    })),
  });
}

// GET /api/segments/:slugOrId
// Premium gating (Strava parity): free sees top-10 overall; premium gets the
// full leaderboard, the Following filter, and Local Legends.
export async function getSegment(idOrSlug: string, viewerId: string | null): Promise<Response> {
  const seg = await db.segment.findFirst({
    where: OR(idOrSlug),
    include: { creator: true },
  });
  if (!seg) return err(404, "Segment not found");
  const viewer = viewerId ? await db.athlete.findUnique({ where: { id: viewerId }, select: { premium: true } }) : null;
  const isPremium = !!viewer?.premium;
  const efforts = await db.segmentEffort.findMany({
    where: { segmentId: seg.id },
    include: { athlete: { select: { id: true, firstName: true, lastName: true, avatarColor: true, city: true, country: true, premium: true, sex: true, birthday: true } } },
    orderBy: { timeS: "asc" },
    take: 300,
  });
  const isStarred = viewerId ? !!(await db.segmentStar.findUnique({ where: { segmentId_athleteId: { segmentId: seg.id, athleteId: viewerId } } })) : false;

  const leaderboard = efforts.map((e, i) => ({
    rank: e.rank ?? i + 1,
    id: e.id,
    timeS: e.timeS,
    date: e.date.toISOString(),
    activityId: e.activityId,
    isPR: e.isPR,
    athlete: {
      id: e.athlete.id, firstName: e.athlete.firstName, lastName: e.athlete.lastName,
      avatarColor: e.athlete.avatarColor, city: e.athlete.city, country: e.athlete.country,
      premium: e.athlete.premium,
    },
  }));

  let followingIds = new Set<string>();
  if (viewerId && isPremium) {
    const rels = await db.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } });
    followingIds = new Set(rels.map((r) => r.followedId));
  }
  const mine = leaderboard.filter((l) => l.athlete.id === viewerId);
  const myRank = mine.length ? mine[0].rank : null;

  // local legends — most efforts on segment (premium only)
  const effortCounts = new Map<string, { count: number; athlete: any }>();
  for (const e of efforts) {
    const cur = effortCounts.get(e.athlete.id);
    if (cur) cur.count++;
    else effortCounts.set(e.athlete.id, { count: 1, athlete: leaderboard.find((l) => l.athlete.id === e.athlete.id)!.athlete });
  }
  const legends = [...effortCounts.values()].sort((a, b) => b.count - a.count).slice(0, 3).map((l) => ({ athlete: l.athlete, efforts: l.count }));

  return json({
    segment: {
      id: seg.id, slug: seg.slug, name: seg.name, description: seg.description,
      sport: seg.sport, distanceM: seg.distanceM, averageGrade: seg.averageGrade,
      maximumGrade: seg.maximumGrade, climbCat: seg.climbCat,
      elevationHigh: seg.elevationHigh, elevationLow: seg.elevationLow,
      city: seg.city, country: seg.country, starredCount: seg.starredCount,
      points: JSON.parse(seg.points),
      startLat: seg.startLat, startLng: seg.startLng, endLat: seg.endLat, endLng: seg.endLng,
      creator: seg.creator ? {
        id: seg.creator.id, firstName: seg.creator.firstName, lastName: seg.creator.lastName,
        avatarColor: seg.creator.avatarColor, city: seg.creator.city, country: seg.creator.country,
        bio: seg.creator.bio, premium: seg.creator.premium,
      } : null,
      createdAt: seg.createdAt.toISOString(),
    },
    leaderboard: {
      overall: leaderboard.slice(0, isPremium ? 300 : 10),
      following: isPremium ? leaderboard.filter((l) => followingIds.has(l.athlete.id)).slice(0, 50) : [],
      mine: mine.slice(0, 10),
      myRank,
      total: efforts.length,
    },
    legends: isPremium ? legends : [],
    viewerPremium: isPremium,
    isStarred,
  });
}

function OR(idOrSlug: string) {
  return { OR: [{ slug: idOrSlug }, { id: idOrSlug }] } as any;
}

// POST /api/segments/:id/star (toggle)
export async function toggleStar(idOrSlug: string, viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const seg = await db.segment.findFirst({ where: OR(idOrSlug) });
  if (!seg) return err(404, "Segment not found");
  const existing = await db.segmentStar.findUnique({
    where: { segmentId_athleteId: { segmentId: seg.id, athleteId: viewerId } },
  });
  if (existing) {
    await db.segmentStar.delete({ where: { id: existing.id } });
    await db.segment.update({ where: { id: seg.id }, data: { starredCount: { decrement: 1 } } });
    return json({ isStarred: false });
  }
  await db.segmentStar.create({ data: { segmentId: seg.id, athleteId: viewerId } });
  await db.segment.update({ where: { id: seg.id }, data: { starredCount: { increment: 1 } } });
  return json({ isStarred: true });
}
