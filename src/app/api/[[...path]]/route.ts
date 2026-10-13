import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { athleteIdOf, sessionTokenOf, err, json } from "@/server/session";
import { hit, LIMITS, DEFAULT_WRITE_LIMIT } from "@/server/ratelimit";
import * as auth from "@/server/handlers/auth";
import * as feed from "@/server/handlers/feed";
import * as activities from "@/server/handlers/activities";
import * as segments from "@/server/handlers/segments";
import * as clubs from "@/server/handlers/clubs";
import * as challenges from "@/server/handlers/challenges";
import * as athletes from "@/server/handlers/athletes";
import * as me from "@/server/handlers/me";
import * as search from "@/server/handlers/search";
import * as reports from "@/server/handlers/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Record<string, string>;
  athleteId: string | null;
  sessionToken: string | null;
  body: any;
  url: URL;
  https: boolean;
}

type H = (ctx: Ctx) => Promise<Response>;

const table: [string, string, H][] = [
  ["POST", "auth/login", (c) => auth.login(c.body, c.https)],
  ["POST", "auth/signup", (c) => auth.signup(c.body, c.https)],
  ["POST", "auth/logout", (c) => auth.logout(c.sessionToken)],
  ["POST", "auth/forgot", (c) => auth.forgotPassword(c.body, c.url.origin)],
  ["POST", "auth/reset", (c) => auth.resetPassword(c.body, c.https)],
  ["GET", "auth/me", (c) => auth.me(c.athleteId)],

  ["GET", "feed", (c) => feed.feed(c.athleteId, c.url)],
  ["GET", "feed/summary", (c) => feed.feedSummary(c.athleteId)],
  ["GET", "feed/suggested", (c) => feed.suggestedAthletes(c.athleteId)],
  ["POST", "posts", (c) => feed.createPost(c.athleteId, c.body)],
  ["POST", "posts/:id/kudos", (c) => feed.postKudos(c.params.id, c.athleteId, c.body)],
  ["GET", "posts/:id/comments", (c) => feed.postComments(c.params.id)],
  ["POST", "posts/:id/comments", (c) => feed.postComment(c.params.id, c.athleteId, c.body)],

  ["GET", "activities/:id", (c) => activities.getActivity(c.params.id, c.athleteId)],
  ["GET", "activities/:id/analysis", (c) => activities.analysis(c.params.id, c.athleteId)],
  ["GET", "activities/:id/gpx", (c) => activities.exportGpx(c.params.id, c.athleteId)],
  ["POST", "activities", (c) => activities.createActivity(c.athleteId, c.body)],
  ["PATCH", "activities/:id", (c) => activities.updateActivity(c.params.id, c.athleteId, c.body)],
  ["DELETE", "activities/:id", (c) => activities.deleteActivity(c.params.id, c.athleteId)],
  ["POST", "activities/:id/kudos", (c) => activities.giveKudos(c.params.id, c.athleteId, c.body)],
  ["GET", "activities/:id/comments", (c) => activities.listComments(c.params.id, c.athleteId)],
  ["POST", "activities/:id/comments", (c) => activities.addComment(c.params.id, c.athleteId, c.body)],

  ["GET", "segments", (c) => segments.listSegments(c.athleteId, c.url)],
  ["GET", "segments/:id", (c) => segments.getSegment(c.params.id, c.athleteId)],
  ["POST", "segments/:id/star", (c) => segments.toggleStar(c.params.id, c.athleteId, c.body)],

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
  ["POST", "athletes/:id/follow", (c) => athletes.toggleFollow(c.params.id, c.athleteId, c.body)],
  ["GET", "athletes/:id/following", (c) => athletes.followList(c.params.id, "following", c.athleteId)],
  ["GET", "athletes/:id/followers", (c) => athletes.followList(c.params.id, "followers", c.athleteId)],
  ["GET", "athletes/:id/trophies", (c) => athletes.trophies(c.params.id, c.athleteId)],
  ["GET", "athletes/:id/heatmap", (c) => athletes.heatmap(c.params.id, c.athleteId)],
  ["GET", "athletes/:id/training-log", (c) => athletes.trainingLogOf(c.params.id, c.athleteId, c.url)],
  ["GET", "athletes/:id/fitness", (c) => athletes.fitness(c.params.id, c.athleteId)],

  ["GET", "me/notifications", (c) => me.notifications(c.athleteId)],
  ["POST", "me/notifications/read", (c) => me.markRead(c.athleteId, c.body)],
  ["PATCH", "me/settings", (c) => me.updateSettings(c.athleteId, c.body)],
  ["POST", "me/password", (c) => me.changePassword(c.athleteId, c.sessionToken, c.body)],
  ["POST", "me/delete", (c) => me.deleteAccount(c.athleteId, c.body)],
  ["GET", "me/gear", (c) => me.listGear(c.athleteId)],
  ["POST", "me/gear", (c) => me.createGear(c.athleteId, c.body)],
  ["PATCH", "me/gear/:id", (c) => me.updateGear(c.athleteId, c.params.id, c.body)],
  ["DELETE", "me/gear/:id", (c) => me.deleteGear(c.athleteId, c.params.id)],
  ["GET", "me/goals", (c) => me.listGoals(c.athleteId)],
  ["POST", "me/goals", (c) => me.setGoal(c.athleteId, c.body)],

  ["POST", "reports", (c) => reports.createReport(c.athleteId, c.body)],

  ["GET", "search", (c) => search.search(c.athleteId, c.url)],
  ["GET", "routes", (c) => search.listRoutes(c.athleteId)],
  ["POST", "routes", (c) => search.createRoute(c.athleteId, c.body)],
  ["DELETE", "routes/:id", (c) => search.deleteRoute(c.athleteId, c.params.id)],
];

// ── Request guards ───────────────────────────────────────────────────────────

// origins besides our own that may call the API with cookies (the Capacitor
// app shell, e.g. "capacitor://localhost,https://localhost")
const extraOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);

function hostOf(req: NextRequest): string {
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
}

// CSRF: a write must come from our own pages. Browsers always send Origin on
// cross-site POSTs, and a cross-site form can't send application/json without
// a CORS preflight, which we never grant.
function crossSiteWrite(req: NextRequest): string | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) return "Requests must be JSON";
  const origin = req.headers.get("origin");
  if (origin) {
    if (extraOrigins.has(origin)) return null;
    try {
      if (new URL(origin).host !== hostOf(req)) return "Cross-site request blocked";
    } catch {
      return "Cross-site request blocked";
    }
  } else if (req.headers.get("sec-fetch-site") === "cross-site") {
    return "Cross-site request blocked";
  }
  return null;
}

function clientIp(req: NextRequest): string {
  // behind the reverse proxy the first x-forwarded-for entry is the client
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function tooMany(retryAfterS: number): Response {
  const res = err(429, "Too many requests — please wait a moment and try again");
  res.headers.set("Retry-After", String(retryAfterS));
  return res;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function match(pattern: string, segments: string[]): Record<string, string> | null {
  const ps = pattern.split("/");
  if (ps.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(":")) {
      try {
        params[ps[i].slice(1)] = decodeURIComponent(segments[i]);
      } catch {
        return null;
      }
    } else if (ps[i] !== segments[i]) return null;
  }
  return params;
}

async function dispatch(req: NextRequest, method: string): Promise<Response> {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean).slice(1);
  let route: { pattern: string; handler: H; params: Record<string, string> } | null = null;
  for (const [m, pattern, handler] of table) {
    if (m !== method) continue;
    const params = match(pattern, segments);
    if (params) {
      route = { pattern, handler, params };
      break;
    }
  }
  if (!route) return err(404, "Not found");

  const write = method !== "GET";
  if (write) {
    const blocked = crossSiteWrite(req);
    if (blocked) return err(403, blocked);
  }

  const requestId = randomBytes(6).toString("hex");
  try {
    const athleteId = await athleteIdOf(req);
    const ip = clientIp(req);
    const limits = LIMITS[route.pattern];
    if (limits?.ip) {
      const wait = hit(`ip:${route.pattern}:${ip}`, limits.ip);
      if (wait) return tooMany(wait);
    }
    if (write && athleteId) {
      const wait =
        (limits?.account && hit(`acct:${route.pattern}:${athleteId}`, limits.account)) ||
        hit(`acct:*:${athleteId}`, DEFAULT_WRITE_LIMIT);
      if (wait) return tooMany(wait);
    }

    let body: any = null;
    if (write) {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }
    const url = req.nextUrl;
    const https = req.headers.get("x-forwarded-proto") === "https" || url.protocol === "https:";
    return await route.handler({ params: route.params, athleteId, sessionToken: sessionTokenOf(req), body, url, https });
  } catch (e: any) {
    // details stay in the server log; the client gets an id to quote
    console.error(`[api ${requestId}]`, method, route.pattern, e?.message, e?.stack);
    return json({ error: "Something went wrong on our side. Please try again.", requestId }, 500);
  }
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
