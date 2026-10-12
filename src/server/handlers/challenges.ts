import { db } from "@/lib/db";
import { json, err } from "../session";
import { challengeProgress } from "../analytics";

// GET /api/challenges
export async function listChallenges(viewerId: string | null): Promise<Response> {
  const challenges = await db.challenge.findMany({ orderBy: [{ featured: "desc" }, { joinedCount: "desc" }] });
  const joined = viewerId
    ? new Map((await db.challengeEntry.findMany({ where: { athleteId: viewerId } })).map((e) => [e.challengeId, e]))
    : new Map<string, any>();
  const out = [];
  for (const c of challenges) {
    const entry = joined.get(c.id);
    const progress = entry ? await challengeProgress(viewerId!, c) : null;
    out.push({
      id: c.id, slug: c.slug, title: c.title, description: c.description,
      category: c.category, type: c.type, goalValue: c.goalValue, period: c.period,
      startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(),
      badgeIcon: c.badgeIcon, accentColor: c.accentColor, joinedCount: c.joinedCount,
      featured: c.featured,
      isJoined: !!entry,
      progress: progress !== null ? Math.min(progress, c.goalValue) : null,
      completedAt: entry?.completedAt?.toISOString() ?? null,
      daysLeft: Math.max(0, Math.ceil((c.endDate.getTime() - Date.now()) / 86400000)),
    });
  }
  return json({ challenges: out });
}

// GET /api/challenges/:slug
export async function getChallenge(slug: string, viewerId: string | null): Promise<Response> {
  const c = await db.challenge.findUnique({ where: { slug } });
  if (!c) return err(404, "Challenge not found");
  const entry = viewerId ? await db.challengeEntry.findUnique({ where: { challengeId_athleteId: { challengeId: c.id, athleteId: viewerId } } }) : null;
  const progress = entry ? await challengeProgress(viewerId!, c) : 0;
  // contributors: activities within window matching filter
  const map: Record<string, string[]> = {
    run: ["run", "trail_run"], ride: ["ride", "gravel", "mtb", "ebike", "virtual_ride"],
    walk: ["walk", "hike"], yoga: ["yoga"], general: undefined,
  };
  const sports = map[c.category];
  const contributors = entry
    ? await db.activity.findMany({
        where: {
          athleteId: viewerId!, startDate: { gte: c.startDate, lte: c.endDate },
          ...(sports ? { sport: { in: sports } } : {}),
        },
        select: { id: true, title: true, sport: true, distanceM: true, movingTimeS: true, elevationM: true, startDate: true },
        orderBy: { startDate: "desc" },
        take: 20,
      })
    : [];
  const topParticipants = await db.challengeEntry.findMany({
    where: { challengeId: c.id },
    take: 1,
  });
  return json({
    challenge: {
      id: c.id, slug: c.slug, title: c.title, description: c.description,
      category: c.category, type: c.type, goalValue: c.goalValue, period: c.period,
      startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(),
      badgeIcon: c.badgeIcon, accentColor: c.accentColor, joinedCount: c.joinedCount,
      featured: c.featured, daysLeft: Math.max(0, Math.ceil((c.endDate.getTime() - Date.now()) / 86400000)),
    },
    isJoined: !!entry,
    progress: Math.min(progress, c.goalValue),
    rawProgress: progress,
    completed: progress >= c.goalValue,
    completedAt: entry?.completedAt?.toISOString() ?? null,
    contributors: contributors.map((a) => ({
      id: a.id, title: a.title, sport: a.sport, distanceM: a.distanceM,
      movingTimeS: a.movingTimeS, elevationM: a.elevationM, startDate: a.startDate.toISOString(),
    })),
  });
}

// POST /api/challenges/:slug/join | leave
export async function joinChallenge(slug: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const c = await db.challenge.findUnique({ where: { slug } });
  if (!c) return err(404, "Challenge not found");
  const existing = await db.challengeEntry.findUnique({ where: { challengeId_athleteId: { challengeId: c.id, athleteId: viewerId } } });
  if (body?.action === "leave") {
    if (existing) {
      await db.challengeEntry.delete({ where: { id: existing.id } });
      await db.challenge.update({ where: { id: c.id }, data: { joinedCount: { decrement: 1 } } });
    }
    return json({ isJoined: false });
  }
  if (!existing) {
    await db.challengeEntry.create({ data: { challengeId: c.id, athleteId: viewerId } });
    await db.challenge.update({ where: { id: c.id }, data: { joinedCount: { increment: 1 } } });
  }
  return json({ isJoined: true });
}
