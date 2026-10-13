import { NextRequest } from "next/server";
import { athleteIdOf, err, json } from "@/server/session";
import * as auth from "@/server/handlers/auth";
import * as feed from "@/server/handlers/feed";
import * as activities from "@/server/handlers/activities";
import * as segments from "@/server/handlers/segments";
import * as clubs from "@/server/handlers/clubs";
import * as challenges from "@/server/handlers/challenges";
import * as athletes from "@/server/handlers/athletes";
import * as me from "@/server/handlers/me";
import * as search from "@/server/handlers/search";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Record<string, string>;
  athleteId: string | null;
  body: any;
  url: URL;
  https: boolean;
}

type H = (ctx: Ctx) => Promise<Response>;

const table: [string, string, H][] = [
  ["POST", "auth/login", (c) => auth.login(c.body, c.https)],
  ["POST", "auth/signup", (c) => auth.signup(c.body, c.https)],
  ["POST", "auth/logout", (c) => auth.logout(c.athleteId)],
  ["GET", "auth/me", (c) => auth.me(c.athleteId)],

  ["GET", "feed", (c) => feed.feed(c.athleteId, c.url)],
  ["GET", "feed/summary", (c) => feed.feedSummary(c.athleteId)],
  ["GET", "feed/suggested", (c) => feed.suggestedAthletes(c.athleteId)],
  ["POST", "posts", (c) => feed.createPost(c.athleteId, c.body)],

  ["GET", "activities/:id", (c) => activities.getActivity(c.params.id, c.athleteId)],
  ["GET", "activities/:id/analysis", (c) => activities.analysis(c.params.id, c.athleteId)],
  ["GET", "activities/:id/gpx", (c) => activities.exportGpx(c.params.id, c.athleteId)],
  ["POST", "activities", (c) => activities.createActivity(c.athleteId, c.body)],
  ["PATCH", "activities/:id", (c) => activities.updateActivity(c.params.id, c.athleteId, c.body)],
  ["DELETE", "activities/:id", (c) => activities.deleteActivity(c.params.id, c.athleteId)],
  ["POST", "activities/:id/kudos", (c) => activities.toggleKudos(c.params.id, c.athleteId)],
  ["GET", "activities/:id/comments", (c) => activities.listComments(c.params.id, c.athleteId)],
  ["POST", "activities/:id/comments", (c) => activities.addComment(c.params.id, c.athleteId, c.body)],

  ["GET", "segments", (c) => segments.listSegments(c.athleteId, c.url)],
  ["GET", "segments/:id", (c) => segments.getSegment(c.params.id, c.athleteId)],
  ["POST", "segments/:id/star", (c) => segments.toggleStar(c.params.id, c.athleteId)],

  ["GET", "clubs", (c) => clubs.listClubs(c.athleteId, c.url)],
  ["POST", "clubs", (c) => clubs.createClub(c.athleteId, c.body)],
  ["GET", "clubs/:id", (c) => clubs.getClub(c.params.id, c.athleteId)],
  ["POST", "clubs/:id/join", (c) => clubs.joinClub(c.params.id, c.athleteId, c.body)],
  ["POST", "clubs/:id/events", (c) => clubs.createEvent(c.params.id, c.athleteId, c.body)],
  ["POST", "clubs/:id/events/:eventId/rsvp", (c) => clubs.rsvp(c.params.id, c.params.eventId, c.athleteId, c.body)],

  ["GET", "challenges", (c) => challenges.listChallenges(c.athleteId)],
  ["GET", "challenges/:slug", (c) => challenges.getChallenge(c.params.slug, c.athleteId)],
  ["POST", "challenges/:slug/join", (c) => challenges.joinChallenge(c.params.slug, c.athleteId, c.body)],

  ["GET", "athletes/:id", (c) => athletes.getAthlete(c.params.id, c.athleteId)],
  ["GET", "athletes/:id/activities", (c) => athletes.athleteActivities(c.params.id, c.athleteId, c.url)],
  ["POST", "athletes/:id/follow", (c) => athletes.toggleFollow(c.params.id, c.athleteId)],
  ["GET", "athletes/:id/following", (c) => athletes.followList(c.params.id, "following", c.athleteId)],
  ["GET", "athletes/:id/followers", (c) => athletes.followList(c.params.id, "followers", c.athleteId)],
  ["GET", "athletes/:id/trophies", (c) => athletes.trophies(c.params.id, c.athleteId)],
  ["GET", "athletes/:id/heatmap", (c) => athletes.heatmap(c.params.id, c.athleteId)],
  ["GET", "athletes/:id/training-log", (c) => athletes.trainingLogOf(c.params.id, c.url)],
  ["GET", "athletes/:id/fitness", (c) => athletes.fitness(c.params.id, c.athleteId)],

  ["GET", "me/notifications", (c) => me.notifications(c.athleteId)],
  ["POST", "me/notifications/read", (c) => me.markRead(c.athleteId, c.body)],
  ["PATCH", "me/settings", (c) => me.updateSettings(c.athleteId, c.body)],
  ["POST", "me/premium", (c) => me.premiumAction(c.athleteId, c.body)],
  ["POST", "me/password", (c) => me.changePassword(c.athleteId, c.body)],
  ["POST", "me/delete", (c) => me.deleteAccount(c.athleteId, c.body)],
  ["GET", "me/gear", (c) => me.listGear(c.athleteId)],
  ["POST", "me/gear", (c) => me.createGear(c.athleteId, c.body)],
  ["PATCH", "me/gear/:id", (c) => me.updateGear(c.athleteId, c.params.id, c.body)],
  ["DELETE", "me/gear/:id", (c) => me.deleteGear(c.athleteId, c.params.id)],
  ["GET", "me/goals", (c) => me.listGoals(c.athleteId)],
  ["POST", "me/goals", (c) => me.setGoal(c.athleteId, c.body)],

  ["GET", "search", (c) => search.search(c.athleteId, c.url)],
  ["GET", "routes", (c) => search.listRoutes(c.athleteId)],
  ["POST", "routes", (c) => search.createRoute(c.athleteId, c.body)],
  ["DELETE", "routes/:id", (c) => search.deleteRoute(c.athleteId, c.params.id)],

  ["POST", "posts/:id/kudos", postKudos],
  ["GET", "posts/:id/comments", postComments],
  ["POST", "posts/:id/comments", postComment],
];

async function postKudos(c: Ctx): Promise<Response> {
  if (!c.athleteId) return err(401, "Sign in required");
  const post = await db.post.findUnique({ where: { id: c.params.id } });
  if (!post) return err(404, "Post not found");
  const existing = await db.kudos.findFirst({ where: { postId: post.id, athleteId: c.athleteId } });
  if (existing) {
    await db.kudos.delete({ where: { id: existing.id } });
    return json({ hasKudos: false });
  }
  await db.kudos.create({ data: { postId: post.id, athleteId: c.athleteId } });
  if (post.athleteId !== c.athleteId) {
    await db.notification.create({ data: { recipientId: post.athleteId, actorId: c.athleteId, type: "kudos", postId: post.id } });
  }
  return json({ hasKudos: true });
}

async function postComments(c: Ctx): Promise<Response> {
  const rows = await db.comment.findMany({
    where: { postId: c.params.id },
    include: { athlete: true },
    orderBy: { createdAt: "asc" },
  });
  return json({
    comments: rows.map((r) => ({
      id: r.id, text: r.text, createdAt: r.createdAt.toISOString(),
      athlete: {
        id: r.athlete.id, firstName: r.athlete.firstName, lastName: r.athlete.lastName,
        avatarColor: r.athlete.avatarColor, city: r.athlete.city, country: r.athlete.country,
        bio: r.athlete.bio, premium: r.athlete.premium,
      },
    })),
  });
}

async function postComment(c: Ctx): Promise<Response> {
  if (!c.athleteId) return err(401, "Sign in required");
  const post = await db.post.findUnique({ where: { id: c.params.id } });
  if (!post) return err(404, "Post not found");
  const text = String(c.body?.text ?? "").trim();
  if (!text) return err(400, "Comment text required");
  const row = await db.comment.create({
    data: { postId: post.id, athleteId: c.athleteId, text: text.slice(0, 500) },
    include: { athlete: true },
  });
  if (post.athleteId !== c.athleteId) {
    await db.notification.create({ data: { recipientId: post.athleteId, actorId: c.athleteId, type: "comment", postId: post.id } });
  }
  return json({
    comment: {
      id: row.id, text: row.text, createdAt: row.createdAt.toISOString(),
      athlete: {
        id: row.athlete.id, firstName: row.athlete.firstName, lastName: row.athlete.lastName,
        avatarColor: row.athlete.avatarColor, city: row.athlete.city, country: row.athlete.country,
        bio: row.athlete.bio, premium: row.athlete.premium,
      },
    },
  });
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function match(pattern: string, segments: string[]): Record<string, string> | null {
  const ps = pattern.split("/");
  if (ps.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(":")) params[ps[i].slice(1)] = decodeURIComponent(segments[i]);
    else if (ps[i] !== segments[i]) return null;
  }
  return params;
}

async function dispatch(req: NextRequest, method: string): Promise<Response> {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean).slice(1);
  let body: any = null;
  if (method !== "GET") {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }
  const athleteId = await athleteIdOf(req);
  const url = req.nextUrl;
  // behind the HTTPS preview proxy, Caddy sets x-forwarded-proto; direct dev is http
  const https = req.headers.get("x-forwarded-proto") === "https" || url.protocol === "https:";
  for (const [m, pattern, handler] of table) {
    if (m !== method) continue;
    const params = match(pattern, segments);
    if (params) {
      try {
        return await handler({ params, athleteId, body, url, https });
      } catch (e: any) {
        console.error("API error:", method, pattern, e?.message, e?.stack);
        return err(500, e?.message ?? "Server error");
      }
    }
  }
  return err(404, "Not found");
}

export async function GET(req: NextRequest) {
  return dispatch(req, "GET");
}
export async function POST(req: NextRequest) {
  return dispatch(req, "POST");
}
export async function PATCH(req: NextRequest) {
  return dispatch(req, "PATCH");
}
export async function PUT(req: NextRequest) {
  return dispatch(req, "PUT");
}
export async function DELETE(req: NextRequest) {
  return dispatch(req, "DELETE");
}
