import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard } from "../transform";
import { startOfWeek } from "../analytics";

// GET /api/clubs?mine=1 | discover
export async function listClubs(viewerId: string | null, url: URL): Promise<Response> {
  const mine = url.searchParams.get("mine") === "1";
  if (mine) {
    if (!viewerId) return err(401, "Sign in required");
    const rows = await db.clubMembership.findMany({
      where: { athleteId: viewerId },
      include: { club: { include: { events: { where: { startDate: { gte: new Date() } }, orderBy: { startDate: "asc" }, take: 1 } } } },
      orderBy: { joinedAt: "asc" },
    });
    return json({
      clubs: rows.map((m) => ({
        id: m.club.id, slug: m.club.slug, name: m.club.name, description: m.club.description,
        sport: m.club.sport, city: m.club.city, country: m.club.country,
        memberCount: m.club.memberCount, coverColor: m.club.coverColor, accentColor: m.club.accentColor,
        privacy: m.club.privacy, role: m.role,
        nextEvent: m.club.events[0] ? { id: m.club.events[0].id, title: m.club.events[0].title, startDate: m.club.events[0].startDate.toISOString() } : null,
      })),
    });
  }
  const clubs = await db.club.findMany({ orderBy: { memberCount: "desc" } });
  const joined = viewerId
    ? new Set((await db.clubMembership.findMany({ where: { athleteId: viewerId }, select: { clubId: true } })).map((m) => m.clubId))
    : new Set<string>();
  return json({
    clubs: clubs.map((c) => ({
      id: c.id, slug: c.slug, name: c.name, description: c.description, sport: c.sport,
      city: c.city, country: c.country, memberCount: c.memberCount,
      coverColor: c.coverColor, accentColor: c.accentColor, privacy: c.privacy,
      isMember: joined.has(c.id),
    })),
  });
}

// POST /api/clubs — create
export async function createClub(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const name = String(body?.name ?? "").trim();
  if (!name) return err(400, "Club name required");
  const sport = ["cycling", "running", "triathlon", "multi"].includes(body?.sport) ? body.sport : "cycling";
  const club = await db.club.create({
    data: {
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6),
      name, description: body?.description ? String(body.description).slice(0, 500) : null,
      sport, city: String(body?.city ?? "").trim() || "—", country: String(body?.country ?? "").trim() || "—",
      coverColor: body?.coverColor ?? "#fc4c02", memberCount: 1, privacy: "public",
      memberships: { create: { athleteId: viewerId, role: "owner" } },
    },
  });
  return json({ club: { id: club.id, slug: club.slug, name: club.name } });
}

// GET /api/clubs/:slugOrId
export async function getClub(idOrSlug: string, viewerId: string | null): Promise<Response> {
  const club = await db.club.findFirst({ where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }] } as any });
  if (!club) return err(404, "Club not found");
  const memberships = await db.clubMembership.findMany({
    where: { clubId: club.id },
    include: { athlete: true },
    orderBy: { joinedAt: "asc" },
  });
  const memberIds = memberships.map((m) => m.athleteId);
  const myMembership = viewerId ? memberships.find((m) => m.athleteId === viewerId) : null;

  // weekly distance leaderboard among members
  const weekStart = startOfWeek();
  const weekActs = await db.activity.groupBy({
    by: ["athleteId"],
    where: { athleteId: { in: memberIds }, startDate: { gte: weekStart } },
    _sum: { distanceM: true, movingTimeS: true },
    _count: true,
  });
  const members = memberships.map((m) => ({
    id: m.athlete.id, firstName: m.athlete.firstName, lastName: m.athlete.lastName,
    avatarColor: m.athlete.avatarColor, city: m.athlete.city, country: m.athlete.country,
    bio: m.athlete.bio, premium: m.athlete.premium, role: m.role,
    weekDistanceM: weekActs.find((w) => w.athleteId === m.athleteId)?._sum.distanceM ?? 0,
  })).sort((a: any, b: any) => b.weekDistanceM - a.weekDistanceM);

  const events = await db.clubEvent.findMany({
    where: { clubId: club.id, startDate: { gte: new Date(Date.now() - 86400000) } },
    orderBy: { startDate: "asc" },
  });
  const attendances = await db.eventAttendance.findMany({
    where: { eventId: { in: events.map((e) => e.id) } },
    include: { athlete: { select: { id: true, firstName: true, lastName: true, avatarColor: true } } },
  });

  // club feed: recent member activities
  const feedActs = await db.activity.findMany({
    where: { athleteId: { in: memberIds }, visibility: { in: ["everyone", "followers"] } },
    include: {
      athlete: true, track: true, gear: true,
      kudos: viewerId ? { where: { athleteId: viewerId } } : false,
      _count: { select: { kudos: true, comments: true } },
    },
    orderBy: { startDate: "desc" },
    take: 15,
  });

  return json({
    club: {
      id: club.id, slug: club.slug, name: club.name, description: club.description,
      sport: club.sport, city: club.city, country: club.country,
      memberCount: club.memberCount, coverColor: club.coverColor, accentColor: club.accentColor,
      privacy: club.privacy, createdAt: club.createdAt.toISOString(),
    },
    myRole: myMembership?.role ?? null,
    members: members.slice(0, 60),
    events: events.map((e) => ({
      id: e.id, title: e.title, description: e.description,
      startDate: e.startDate.toISOString(), durationMin: e.durationMin,
      meetingSpot: e.meetingSpot, sport: e.sport, goingCount: e.goingCount,
      going: attendances.filter((a) => a.eventId === e.id).map((a) => ({
        id: a.athlete.id, firstName: a.athlete.firstName, lastName: a.athlete.lastName, avatarColor: a.athlete.avatarColor,
        status: a.status,
      })),
      myStatus: viewerId ? attendances.find((a) => a.eventId === e.id && a.athleteId === viewerId)?.status ?? null : null,
    })),
    feed: await Promise.all(feedActs.map((a) => activityCard(a, viewerId))),
  });
}

// POST /api/clubs/:id/join | /leave
export async function joinClub(idOrSlug: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const club = await db.club.findFirst({ where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }] } as any });
  if (!club) return err(404, "Club not found");
  const existing = await db.clubMembership.findUnique({
    where: { clubId_athleteId: { clubId: club.id, athleteId: viewerId } },
  });
  const leaving = existing && body?.action !== "join";
  if (leaving) {
    await db.clubMembership.delete({ where: { id: existing.id } });
    await db.club.update({ where: { id: club.id }, data: { memberCount: { decrement: 1 } } });
    return json({ isMember: false });
  }
  if (!existing) {
    await db.clubMembership.create({ data: { clubId: club.id, athleteId: viewerId } });
    await db.club.update({ where: { id: club.id }, data: { memberCount: { increment: 1 } } });
    for (const admin of await db.clubMembership.findMany({ where: { clubId: club.id, role: "owner" }, select: { athleteId: true } })) {
      if (admin.athleteId !== viewerId) {
        await db.notification.create({
          data: { recipientId: admin.athleteId, actorId: viewerId, type: "club_join", clubId: club.id, text: `${(await db.athlete.findUnique({ where: { id: viewerId } }))?.firstName} joined ${club.name}` },
        });
      }
    }
  }
  return json({ isMember: true });
}

// POST /api/clubs/:id/events — create event (owner/admin)
export async function createEvent(idOrSlug: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const club = await db.club.findFirst({ where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }] } as any });
  if (!club) return err(404, "Club not found");
  const title = String(body?.title ?? "").trim();
  if (!title) return err(400, "Event title required");
  const event = await db.clubEvent.create({
    data: {
      clubId: club.id, title, description: body?.description ? String(body.description).slice(0, 800) : null,
      startDate: body?.startDate ? new Date(body.startDate) : new Date(Date.now() + 86400000),
      durationMin: Number(body?.durationMin ?? 90), meetingSpot: body?.meetingSpot ? String(body.meetingSpot) : null,
      sport: String(body?.sport ?? club.sport === "cycling" ? "ride" : "run"), goingCount: 1,
      attendances: { create: { athleteId: viewerId, status: "going" } },
    },
  });
  return json({ event: { id: event.id, title: event.title } });
}

// POST /api/clubs/:id/events/:eventId/rsvp
export async function rsvp(idOrSlug: string, eventId: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const event = await db.clubEvent.findUnique({ where: { id: eventId } });
  if (!event) return err(404, "Event not found");
  const status = body?.status === "interested" ? "interested" : body?.status === "none" ? "none" : "going";
  const existing = await db.eventAttendance.findUnique({
    where: { eventId_athleteId: { eventId, athleteId: viewerId } },
  });
  if (status === "none") {
    if (existing) {
      await db.eventAttendance.delete({ where: { id: existing.id } });
      await db.clubEvent.update({ where: { id: eventId }, data: { goingCount: { decrement: 1 } } });
    }
    return json({ myStatus: null });
  }
  if (!existing) {
    await db.eventAttendance.create({ data: { eventId, athleteId: viewerId, status } });
    await db.clubEvent.update({ where: { id: eventId }, data: { goingCount: { increment: 1 } } });
  } else if (existing.status !== status) {
    await db.eventAttendance.update({ where: { id: existing.id }, data: { status } });
  }
  return json({ myStatus: status });
}
