import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard, postCard, athleteSummary } from "../transform";
import { currentStreak, startOfWeek } from "../analytics";
import { followingIdsOf, visibleTo } from "../visibility";

// GET /api/feed?scope=following|you|clubs&before=<iso>
// feed items sort by when they happened: activity start, or post creation
type FeedItem = { type: "activity"; data: { startDate: string } } | { type: "post"; data: { createdAt: string } };
const when = (it: FeedItem) => (it.type === "activity" ? it.data.startDate : it.data.createdAt);

export async function feed(viewerId: string | null, url: URL): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const scope = url.searchParams.get("scope") ?? "following";
  const before = url.searchParams.get("before") ? new Date(url.searchParams.get("before")!) : new Date();
  const take = 15;

  if (Number.isNaN(before.getTime())) return err(400, "Bad cursor");

  const following = await followingIdsOf(viewerId);
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
    athleteIds = [viewerId, ...following];
  }

  // club members you don't follow only show you their public activities
  const visibilityFilter = scope === "you" ? {} : visibleTo(viewerId, following);

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
  ].sort((x, y) => (when(x) < when(y) ? 1 : -1));

  const page = items.slice(0, take);
  const oldest = page.length ? when(page[page.length - 1]) : null;

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
    db.goal.findMany({ where: { athleteId: viewerId, period: "weekly" }, orderBy: { createdAt: "asc" } }),
    currentStreak(viewerId),
  ]);
  // goal targets and progress are SI: metres, or seconds for time goals
  const goalsOut = goals.map((g) => {
    const rows = g.sport ? thisWeek.filter((a) => a.sport === g.sport) : thisWeek;
    const current =
      g.metric === "time" ? rows.reduce((a, r) => a + r.movingTimeS, 0) :
      g.metric === "elevation" ? rows.reduce((a, r) => a + r.elevationM, 0) :
      rows.reduce((a, r) => a + r.distanceM, 0);
    return { id: g.id, metric: g.metric, target: g.target, sport: g.sport, current };
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

// POST /api/posts/:id/kudos { on?: boolean } — gives kudos (on: false takes it
// back); repeating a request changes nothing
export async function postKudos(id: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const post = await db.post.findUnique({ where: { id } });
  if (!post) return err(404, "Post not found");
  if (body?.on === false) {
    await db.kudos.deleteMany({ where: { postId: post.id, athleteId: viewerId } });
    return json({ hasKudos: false });
  }
  const { count } = await db.kudos.createMany({ data: [{ postId: post.id, athleteId: viewerId }], skipDuplicates: true });
  if (count > 0 && post.athleteId !== viewerId) {
    await db.notification.create({ data: { recipientId: post.athleteId, actorId: viewerId, type: "kudos", postId: post.id } });
  }
  return json({ hasKudos: true });
}

function commentOut(r: { id: string; text: string; createdAt: Date; athlete: Parameters<typeof athleteSummary>[0] }) {
  const { followerCount: _f, followingCount: _g, ...athlete } = athleteSummary(r.athlete);
  return { id: r.id, text: r.text, createdAt: r.createdAt.toISOString(), athlete };
}

// GET /api/posts/:id/comments
export async function postComments(id: string): Promise<Response> {
  const rows = await db.comment.findMany({
    where: { postId: id },
    include: { athlete: true },
    orderBy: { createdAt: "asc" },
  });
  return json({ comments: rows.map(commentOut) });
}

// POST /api/posts/:id/comments
export async function postComment(id: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const post = await db.post.findUnique({ where: { id } });
  if (!post) return err(404, "Post not found");
  const text = String(body?.text ?? "").trim();
  if (!text) return err(400, "Comment text required");
  const row = await db.comment.create({
    data: { postId: post.id, athleteId: viewerId, text: text.slice(0, 500) },
    include: { athlete: true },
  });
  if (post.athleteId !== viewerId) {
    await db.notification.create({ data: { recipientId: post.athleteId, actorId: viewerId, type: "comment", postId: post.id } });
  }
  return json({ comment: commentOut(row) });
}
