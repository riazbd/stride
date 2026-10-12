import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard, postCard } from "../transform";
import { athleteStats, currentStreak, startOfWeek } from "../analytics";

// GET /api/feed?scope=following|you|clubs&before=<iso>
export async function feed(viewerId: string | null, url: URL): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const scope = url.searchParams.get("scope") ?? "following";
  const before = url.searchParams.get("before") ? new Date(url.searchParams.get("before")!) : new Date();
  const take = 15;

  let athleteIds: string[];
  if (scope === "you") {
    athleteIds = [viewerId];
  } else if (scope === "clubs") {
    const myClubs = await db.clubMembership.findMany({ where: { athleteId: viewerId }, select: { clubId: true } });
    const members = await db.clubMembership.findMany({
      where: { clubId: { in: myClubs.map((c) => c.clubId) } },
      select: { athleteId: true },
    });
    athleteIds = [...new Set([viewerId, ...members.map((m) => m.athleteId)])];
  } else {
    const following = await db.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } });
    athleteIds = [viewerId, ...following.map((f) => f.followedId)];
  }

  const visibilityFilter = scope === "you" ? {} : { visibility: { in: ["everyone", "followers"] } };

  const [acts, posts] = await Promise.all([
    db.activity.findMany({
      where: { athleteId: { in: athleteIds }, startDate: { lt: before }, ...visibilityFilter },
      include: {
        athlete: true, track: true, gear: true, kudos: { where: { athleteId: viewerId } },
        _count: { select: { kudos: true, comments: true, efforts: true } },
      },
      orderBy: { startDate: "desc" },
      take: take + 5,
    }),
    scope === "you"
      ? []
      : db.post.findMany({
          where: { athleteId: { in: athleteIds }, createdAt: { lt: before } },
          include: { athlete: true, kudos: { where: { athleteId: viewerId } }, _count: { select: { kudos: true, comments: true } } },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
  ]);

  const items = [
    ...(await Promise.all(acts.map((a) => activityCard(a, viewerId)))).map((a) => ({ type: "activity" as const, data: a })),
    ...(await Promise.all(posts.map((p) => postCard(p, viewerId)))).map((p) => ({ type: "post" as const, data: p })),
  ].sort((x, y) => (x.data.startDate ?? (x.data as any).createdAt) < (y.data.startDate ?? (y.data as any).createdAt) ? 1 : -1);

  const page = items.slice(0, take);
  const oldest = page.length
    ? page[page.length - 1].type === "activity"
      ? (page[page.length - 1].data as any).startDate
      : (page[page.length - 1].data as any).createdAt
    : null;

  return json({ items: page, nextCursor: oldest });
}

// GET /api/feed/summary
export async function feedSummary(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const weekStart = startOfWeek();
  const [thisWeek, goals, streak] = await Promise.all([
    db.activity.findMany({
      where: { athleteId: viewerId, startDate: { gte: weekStart } },
      select: { distanceM: true, movingTimeS: true, elevationM: true, relativeEffort: true, sport: true },
    }),
    db.goal.findMany({ where: { athleteId: viewerId, period: "weekly" } }),
    currentStreak(viewerId),
  ]);
  const perSport = new Map<string, number>();
  for (const a of thisWeek) perSport.set(a.sport, (perSport.get(a.sport) ?? 0) + a.distanceM);
  const goalsOut = goals.map((g) => {
    const current = g.sport ? (perSport.get(g.sport) ?? 0) : thisWeek.reduce((a, r) => a + r.distanceM, 0);
    return { id: g.id, metric: g.metric, target: g.target, sport: g.sport, currentM: current };
  });
  return json({
    week: {
      distanceM: thisWeek.reduce((a, r) => a + r.distanceM, 0),
      movingTimeS: thisWeek.reduce((a, r) => a + r.movingTimeS, 0),
      elevationM: thisWeek.reduce((a, r) => a + r.elevationM, 0),
      activities: thisWeek.length,
      relativeEffort: thisWeek.reduce((a, r) => a + (r.relativeEffort ?? 0), 0),
    },
    goals: goalsOut,
    streak,
    weekStart: weekStart.toISOString(),
  });
}

// POST /api/posts — create a text post
export async function createPost(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const text = String(body?.text ?? "").trim();
  if (!text) return err(400, "Post text is required");
  const post = await db.post.create({
    data: {
      athleteId: viewerId, text, visibility: "everyone",
      photo: body?.photo ? String(body.photo) : null,
    },
    include: { athlete: true, _count: { select: { kudos: true, comments: true } } },
  });
  return json({ post: await postCard(post, viewerId) });
}

// GET /api/feed/suggested — athletes you may know
export async function suggestedAthletes(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const following = await db.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } });
  const followedIds = new Set(following.map((f) => f.followedId));
  followedIds.add(viewerId);
  const candidates = await db.athlete.findMany({
    where: { id: { notIn: [...followedIds] } },
    orderBy: { followerCount: "desc" },
    take: 6,
  });
  return json({
    athletes: candidates.map((a) => ({
      id: a.id, firstName: a.firstName, lastName: a.lastName, avatarColor: a.avatarColor,
      city: a.city, country: a.country, bio: a.bio, premium: a.premium, followerCount: a.followerCount,
    })),
  });
}
