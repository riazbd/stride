import { db } from "@/lib/db";
import { json, err } from "../session";
import { athleteSummary } from "../transform";
import { pathLength } from "@/lib/geo";
import { hasFullAccess } from "../entitlement";

// GET /api/search?q=
export async function search(viewerId: string | null, url: URL): Promise<Response> {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ q, athletes: [], clubs: [], segments: [] });
  const [athletes, clubs, segments] = await Promise.all([
    db.athlete.findMany({
      where: { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }] },
      take: 12,
    }),
    db.club.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }] }, take: 8 }),
    db.segment.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }] }, take: 10 }),
  ]);
  const myFollowing = viewerId
    ? new Set((await db.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } })).map((r) => r.followedId))
    : new Set<string>();
  return json({
    q,
    athletes: athletes.map((a) => ({ ...athleteSummary(a), isFollowing: myFollowing.has(a.id), isMe: a.id === viewerId })),
    clubs: clubs.map((c) => ({ id: c.id, slug: c.slug, name: c.name, sport: c.sport, city: c.city, country: c.country, memberCount: c.memberCount })),
    segments: segments.map((s) => ({ id: s.id, slug: s.slug, name: s.name, sport: s.sport, city: s.city, distanceM: s.distanceM })),
  });
}

// GET /api/routes (mine + suggested)
export async function listRoutes(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const [mine, suggested] = await Promise.all([
    db.route.findMany({ where: { athleteId: viewerId }, orderBy: { createdAt: "desc" } }),
    db.route.findMany({ where: { athleteId: { not: viewerId }, isPublic: true }, orderBy: { createdAt: "desc" }, take: 10, include: { athlete: true } }),
  ]);
  const shape = (r: any) => ({
    id: r.id, name: r.name, description: r.description, sport: r.sport,
    distanceM: r.distanceM, elevationM: r.elevationM, estimatedTimeS: r.estimatedTimeS,
    createdAt: r.createdAt.toISOString(),
    points: JSON.parse(r.points),
    creator: r.athlete ? athleteSummary(r.athlete) : null,
    isMine: r.athleteId === viewerId,
  });
  return json({ mine: mine.map(shape), suggested: suggested.map(shape) });
}

// POST /api/routes — save from builder or from activity
export async function createRoute(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const name = String(body?.name ?? "").trim();
  const points = body?.points;
  if (!name) return err(400, "Route name required");
  if (!Array.isArray(points) || points.length < 2 || points.length > 20000) return err(400, "Route points required");
  const me = await db.athlete.findUnique({ where: { id: viewerId }, select: { premium: true } });
  if (!hasFullAccess(me)) return err(402, "The route builder is a Premium feature");
  const pts = points.map((p: any) => [Number(p[0]), Number(p[1]), Number(p[2] ?? 0)]);
  if (pts.some((p: number[]) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) {
    return err(400, "Invalid route point");
  }
  const distanceM = pathLength(pts.map((p) => [p[0], p[1]] as [number, number]));
  const route = await db.route.create({
    data: {
      athleteId: viewerId, name: name.slice(0, 80),
      description: body?.description ? String(body.description).slice(0, 300) : null,
      sport: ["ride", "run", "gravel", "walk"].includes(body?.sport) ? body.sport : "ride",
      points: JSON.stringify(pts.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5, Math.round(p[2])])),
      distanceM, elevationM: Number(body?.elevationM ?? 0),
      estimatedTimeS: body?.estimatedTimeS ? Math.round(Number(body.estimatedTimeS)) : null,
      isPublic: body?.isPublic !== false,
    },
  });
  return json({ route: { id: route.id, name: route.name } });
}

// DELETE /api/routes/:id
export async function deleteRoute(viewerId: string | null, id: string): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const route = await db.route.findUnique({ where: { id } });
  if (!route || route.athleteId !== viewerId) return err(404, "Route not found");
  await db.route.delete({ where: { id } });
  return json({ ok: true });
}
