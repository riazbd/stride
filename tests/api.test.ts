/// <reference types="bun-types" />
// API tests for the Phase 0 blockers: privacy, security and data integrity.
// They drive the real route handler against a throwaway Postgres database.
//
//   TEST_DATABASE_URL=postgresql://…/stride_test bun test tests/
//
// Without TEST_DATABASE_URL (or when its database name doesn't contain
// "test") the suite is skipped, so it can never touch real data.
import { describe, expect, test, beforeAll, beforeEach, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import type { NextRequest as NextRequestT } from "next/server";

const TEST_URL = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => {
  try {
    return /test/i.test(new URL(TEST_URL).pathname);
  } catch {
    return false;
  }
})();
if (enabled) process.env.DATABASE_URL = TEST_URL;

const suite = enabled ? describe : describe.skip;

// loaded after DATABASE_URL points at the test database
let db: typeof import("../src/lib/db").db;
let route: typeof import("../src/app/api/[[...path]]/route");
let NextRequest: typeof NextRequestT;
let createSession: typeof import("../src/server/session").createSession;
let resetRateLimits: typeof import("../src/server/ratelimit").resetRateLimits;
let hashPassword: typeof import("../src/server/password").hashPassword;

type Who = { id: string; token: string };
let A: Who; // owner of the activities, privacy zone 200 m
let B: Who; // follows A
let C: Who; // stranger
const acts: Record<"pub" | "fol" | "priv", string> = { pub: "", fol: "", priv: "" };
let segmentSlug = "";
let clubSlug = "";

// ── helpers ──────────────────────────────────────────────────────────────────

async function call(
  method: string,
  path: string,
  opts: { as?: Who | null; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any; res: Response }> {
  const headers: Record<string, string> = { origin: "http://localhost", "content-type": "application/json", ...opts.headers };
  if (opts.as) headers.cookie = `stride_session=${opts.as.token}`;
  const req = new NextRequest(`http://localhost/api/${path}`, {
    method,
    headers,
    body: method === "GET" || opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const handler = (route as any)[method] as (r: NextRequestT) => Promise<Response>;
  const res = await handler(req);
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, res };
}

// a straight 2.4 km run heading east from central Dhaka, one fix a second at 3 m/s
function track(offsetM = 0): number[][] {
  const lat = 23.75;
  const mPerDegLng = 111195 * Math.cos((lat * Math.PI) / 180);
  const out: number[][] = [];
  for (let i = 0; i <= 800; i++) out.push([90.39 + (offsetM + i * 3) / mPerDegLng, lat, 10, i]);
  return out;
}

async function athlete(first: string, extra: Record<string, unknown> = {}): Promise<Who> {
  const row = await db.athlete.create({
    data: { email: `${first.toLowerCase()}@test.local`, password: hashPassword("password123"), firstName: first, lastName: "Test", city: "Dhaka", ...extra },
  });
  return { id: row.id, token: await createSession(row.id) };
}

// ── setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!enabled) return;
  const push = spawnSync("bunx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  if (push.status !== 0) throw new Error("prisma db push failed: " + push.stderr?.toString());

  ({ db } = await import("../src/lib/db"));
  route = await import("../src/app/api/[[...path]]/route");
  ({ NextRequest } = await import("next/server"));
  ({ createSession } = await import("../src/server/session"));
  ({ resetRateLimits } = await import("../src/server/ratelimit"));
  ({ hashPassword } = await import("../src/server/password"));

  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

  A = await athlete("Alice", { privacyRadiusM: 200, heightCm: 170, weightKg: 60, sex: "F", maxHr: 190 });
  B = await athlete("Bob");
  C = await athlete("Carol");
  await call("POST", `athletes/${A.id}/follow`, { as: B, body: { on: true } });

  // a segment along the middle of the route, so every one of A's runs crosses it
  const t = track();
  const segPts = t.slice(200, 501).filter((_, i) => i % 20 === 0).map((p) => [p[0], p[1], p[2]]);
  const seg = await db.segment.create({
    data: {
      slug: "test-straight", name: "Test Straight", sport: "run", distanceM: 900, city: "Dhaka", country: "Bangladesh",
      points: JSON.stringify(segPts), startLng: t[200][0], startLat: t[200][1], endLng: t[500][0], endLat: t[500][1],
    },
  });
  segmentSlug = seg.slug;

  for (const [key, visibility] of [["pub", "everyone"], ["fol", "followers"], ["priv", "only_me"]] as const) {
    const r = await call("POST", "activities", {
      as: A,
      body: { sport: "run", title: `${key} run`, track: track(), visibility, startDate: new Date(Date.now() - 3600_000).toISOString() },
    });
    expect(r.status).toBe(200);
    acts[key] = r.data.activity.id;
  }

  const club = await call("POST", "clubs", { as: A, body: { name: "Test Runners", sport: "running", city: "Dhaka" } });
  clubSlug = club.data.club.slug;
  await call("POST", `clubs/${clubSlug}/join`, { as: B, body: { action: "join" } });
  await call("POST", `clubs/${clubSlug}/join`, { as: C, body: { action: "join" } });
}, 120_000);

beforeEach(() => {
  if (enabled) resetRateLimits();
});

afterAll(async () => {
  if (enabled) await db.$disconnect();
});

// ── privacy ──────────────────────────────────────────────────────────────────

suite("privacy", () => {
  test("#1 heatmap is the owner's alone", async () => {
    expect((await call("GET", `athletes/${A.id}/heatmap`)).status).toBe(401);
    expect((await call("GET", `athletes/${A.id}/heatmap`, { as: C })).status).toBe(403);
    const own = await call("GET", `athletes/${A.id}/heatmap`, { as: A });
    expect(own.status).toBe(200);
    expect(own.data.polylines.length).toBe(3);
  });

  test("#2 segment leaderboards hold public efforts only", async () => {
    const asC = await call("GET", `segments/${segmentSlug}`, { as: C });
    const ids = asC.data.leaderboard.overall.map((e: any) => e.activityId);
    expect(ids).toEqual([acts.pub]);
    expect(asC.data.leaderboard.total).toBe(1);
    // the owner still sees every one of their own efforts
    const asA = await call("GET", `segments/${segmentSlug}`, { as: A });
    expect(asA.data.leaderboard.mine.length).toBe(3);
    const ranks = await db.segmentEffort.findMany({ where: { segment: { slug: segmentSlug } }, include: { activity: true } });
    for (const e of ranks) expect(e.rank).toBe(e.activity.visibility === "everyone" ? 1 : null);
  });

  test("#3 club feeds hide followers-only activities from non-followers", async () => {
    const seen = async (who: Who) => (await call("GET", `clubs/${clubSlug}`, { as: who })).data.feed.map((a: any) => a.id);
    expect((await seen(C)).sort()).toEqual([acts.pub]);
    expect((await seen(B)).sort()).toEqual([acts.pub, acts.fol].sort());
    const feedC = await call("GET", "feed?scope=clubs", { as: C });
    const feedIds = feedC.data.items.filter((i: any) => i.type === "activity").map((i: any) => i.data.id);
    expect(feedIds).toContain(acts.pub);
    expect(feedIds).not.toContain(acts.fol);
    expect(feedIds).not.toContain(acts.priv);
  });

  test("#4 height, weight and sex are shown to the athlete only", async () => {
    const anon = await call("GET", `athletes/${A.id}`);
    expect(anon.data.athlete.heightCm).toBeUndefined();
    expect(anon.data.athlete.weightKg).toBeUndefined();
    expect(anon.data.athlete.sex).toBeUndefined();
    const own = await call("GET", `athletes/${A.id}`, { as: A });
    expect(own.data.athlete.heightCm).toBe(170);
  });

  test("#5 an activity saved without a visibility uses the athlete's default", async () => {
    await call("PATCH", "me/settings", { as: C, body: { defaultVisibility: "followers" } });
    const r = await call("POST", "activities", { as: C, body: { sport: "run", manual: true, distanceM: 1000, movingTimeS: 300 } });
    expect(r.data.activity.visibility).toBe("followers");
  });

  test("#6 only the owner can download a GPX", async () => {
    expect((await call("GET", `activities/${acts.pub}/gpx`, { as: B })).status).toBe(404);
    const own = await call("GET", `activities/${acts.pub}/gpx`, { as: A });
    expect(own.status).toBe(200);
    expect(String(own.data)).toContain("<gpx");
  });

  test("privacy zone: others never get the exact start point", async () => {
    const r = await call("GET", `activities/${acts.pub}`, { as: C });
    expect(r.data.activity.startLat).toBeNull();
    const first = r.data.activity.track[0];
    const start = track()[0];
    // the first visible point is at least 200 m from the real start
    expect((first.lng - start[0]) * 111195 * Math.cos((23.75 * Math.PI) / 180)).toBeGreaterThan(195);
  });

  test("followers-only and private activities are hidden from strangers", async () => {
    expect((await call("GET", `activities/${acts.fol}`, { as: C })).status).toBe(404);
    expect((await call("GET", `activities/${acts.fol}`, { as: B })).status).toBe(200);
    expect((await call("GET", `activities/${acts.priv}`, { as: B })).status).toBe(404);
    const trophies = await call("GET", `athletes/${A.id}/trophies`, { as: C });
    expect(trophies.data.segmentTrophies.every((t: any) => t.activityId === acts.pub)).toBe(true);
  });
});

// ── security ─────────────────────────────────────────────────────────────────

suite("security", () => {
  test("#7 cross-site and non-JSON writes are refused; cookies are SameSite=Lax", async () => {
    const evil = await call("POST", `activities/${acts.pub}/kudos`, { as: C, body: {}, headers: { origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    const form = await call("POST", `activities/${acts.pub}/kudos`, { as: C, body: {}, headers: { "content-type": "text/plain" } });
    expect(form.status).toBe(403);
    const login = await call("POST", "auth/login", { body: { email: "bob@test.local", password: "password123" } });
    expect(login.status).toBe(200);
    expect(login.res.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=lax");
  });

  test("#8 Premium can't be switched on through the API", async () => {
    expect((await call("POST", "me/premium", { as: C, body: { action: "subscribe" } })).status).toBe(404);
    expect((await db.athlete.findUnique({ where: { id: C.id } }))?.premium).toBe(false);
  });

  test("#9 only club owners and admins create events", async () => {
    expect((await call("POST", `clubs/${clubSlug}/events`, { as: C, body: { title: "Hijack" } })).status).toBe(403);
    expect((await call("POST", `clubs/${clubSlug}/events`, { as: A, body: { title: "Long run" } })).status).toBe(200);
  });

  test("#10 fitness is private and gated on the server", async () => {
    expect((await call("GET", `athletes/${A.id}/fitness`, { as: C })).status).toBe(403);
    expect((await call("GET", `athletes/${A.id}/fitness`, { as: A })).status).toBe(200);
    expect((await call("GET", `athletes/${A.id}/training-log`)).status).toBe(401);
  });

  test("#11 login is rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await call("POST", "auth/login", { body: { email: "bob@test.local", password: "wrong-password" } })).status;
    }
    expect(last).toBe(429);
  });

  test("#12 server errors don't leak internals", async () => {
    const r = await call("POST", "activities", { as: C, body: { sport: "run", track: [[0, 0, 0, 0], [0, 0.001, 0, "x"], ["a"]], startDate: "2020-01-01T00:00:00Z", laps: [{ distanceM: "boom" }] } });
    if (r.status === 500) {
      expect(r.data.requestId).toBeString();
      expect(JSON.stringify(r.data)).not.toMatch(/prisma|invocation|\\src\\|\/src\//i);
    } else {
      expect(r.status).toBeLessThan(500);
    }
  });

  test("#13 sessions are stored hashed; logout ends one device", async () => {
    const second = await createSession(B.id);
    expect(await db.session.count({ where: { tokenHash: second } })).toBe(0);
    await call("POST", "auth/logout", { as: { id: B.id, token: second }, body: {} });
    expect((await call("GET", "auth/me", { as: { id: B.id, token: second } })).status).toBe(401);
    expect((await call("GET", "auth/me", { as: B })).status).toBe(200);
  });
});

// ── data integrity ───────────────────────────────────────────────────────────

suite("data", () => {
  test("#15 kudos can't be duplicated", async () => {
    await Promise.all([1, 2, 3].map(() => call("POST", `activities/${acts.pub}/kudos`, { as: B, body: { on: true } })));
    expect(await db.kudos.count({ where: { activityId: acts.pub, athleteId: B.id } })).toBe(1);
  });

  test("#16 parallel follows keep counters right", async () => {
    await Promise.all([1, 2, 3, 4].map(() => call("POST", `athletes/${B.id}/follow`, { as: C, body: { on: true } })));
    const b = await db.athlete.findUnique({ where: { id: B.id } });
    expect(b?.followerCount).toBe(await db.athleteFollow.count({ where: { followedId: B.id } }));
    expect(b?.followerCount).toBe(1);
  });

  test("#17 finishing a challenge is saved", async () => {
    const now = new Date();
    await db.challenge.create({
      data: {
        slug: "test-5k", title: "Run 2 km", description: "", category: "run", type: "distance", goalValue: 2,
        startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000),
      },
    });
    const join = await call("POST", "challenges/test-5k/join", { as: A, body: {} });
    expect(join.data.completed).toBe(true);
    const entry = await db.challengeEntry.findFirst({ where: { athleteId: A.id, challenge: { slug: "test-5k" } } });
    expect(entry?.completedAt).not.toBeNull();
  });

  test("#18 goals are stored and reported in SI units", async () => {
    await call("POST", "me/goals", { as: B, body: { metric: "time", period: "weekly", target: 5 * 3600 } });
    await call("POST", "activities", { as: B, body: { sport: "run", manual: true, distanceM: 5000, movingTimeS: 1800 } });
    const g = (await call("GET", "me/goals", { as: B })).data.goals.find((x: any) => x.metric === "time");
    expect(g.target).toBe(18000);
    expect(g.current).toBe(1800);
  });

  test("#20 gear mileage follows its activities", async () => {
    const gear = (await call("POST", "me/gear", { as: B, body: { name: "Shoes", type: "shoes" } })).data.gear;
    const act = (await call("POST", "activities", { as: B, body: { sport: "run", manual: true, distanceM: 4000, movingTimeS: 1200, gearId: gear.id } })).data.activity;
    expect((await db.gear.findUnique({ where: { id: gear.id } }))?.distanceM).toBe(4000);
    await call("DELETE", `activities/${act.id}`, { as: B });
    expect((await db.gear.findUnique({ where: { id: gear.id } }))?.distanceM).toBe(0);
    // someone else's gear can't be used
    expect((await call("POST", "activities", { as: C, body: { sport: "run", manual: true, distanceM: 1, movingTimeS: 1, gearId: gear.id } })).status).toBe(400);
  });

  test("#21/#22 no invented heart rate; load says where it came from", async () => {
    const analysis = await call("GET", `activities/${acts.pub}/analysis`, { as: A });
    expect(analysis.data.hasHr).toBe(false);
    expect(analysis.data.series.every((p: any) => p.hr === null)).toBe(true);
    const act = await db.activity.findUnique({ where: { id: acts.pub } });
    expect(act?.effortSource).toBe("estimate");
  });

  test("#23 a retried upload doesn't create a duplicate", async () => {
    const body = { clientId: "rec-12345678", sport: "run", track: track(), visibility: "only_me" };
    const first = await call("POST", "activities", { as: C, body });
    const again = await call("POST", "activities", { as: C, body });
    expect(again.data.activity.id).toBe(first.data.activity.id);
    expect(again.data.duplicate).toBe(true);
  });

  test("#24 reports reach the moderation queue", async () => {
    const r = await call("POST", "reports", { as: C, body: { targetType: "activity", targetId: acts.pub, reason: "fake" } });
    expect(r.status).toBe(200);
    expect(await db.report.count({ where: { targetId: acts.pub, status: "open" } })).toBe(1);
  });

  test("#14 deleting an account removes everything and fixes counters", async () => {
    const before = await db.athlete.findUnique({ where: { id: A.id } });
    expect(before?.followerCount).toBe(1);
    const r = await call("POST", "me/delete", { as: B, body: { password: "password123" } });
    expect(r.status).toBe(200);
    expect(await db.athlete.findUnique({ where: { id: B.id } })).toBeNull();
    expect(await db.kudos.count({ where: { athleteId: B.id } })).toBe(0);
    expect((await db.athlete.findUnique({ where: { id: A.id } }))?.followerCount).toBe(0);
    expect((await db.club.findUnique({ where: { slug: clubSlug } }))?.memberCount).toBe(2);
    // owners hand their clubs on rather than orphaning them
    await call("POST", "me/delete", { as: A, body: { password: "password123" } });
    const club = await db.club.findUnique({ where: { slug: clubSlug }, include: { memberships: true } });
    expect(club?.memberships.map((m) => m.role)).toEqual(["owner"]);
  });
});
