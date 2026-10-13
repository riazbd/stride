import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard } from "../transform";
import { startOfWeek } from "../analytics";
import { followingIdsOf, visibleTo } from "../visibility";
import type { Prisma } from "@prisma/client";

const ORGANISER_ROLES = ["owner", "admin"];

function clubWhere(idOrSlug: string) {
  return { OR: [{ slug: idOrSlug }, { id: idOrSlug }] };
}

// recount instead of nudging, so concurrent joins can't make the number drift
async function recountMembers(tx: Prisma.TransactionClient, clubId: string) {
  await tx.club.update({ where: { id: clubId }, data: { memberCount: await tx.clubMembership.count({ where: { clubId } }) } });
}

// When an owner leaves (or deletes their account) the longest-standing admin,
// or failing that member, becomes owner; a club left with nobody is removed.
export async function handOverClubs(tx: Prisma.TransactionClient, athleteId: string, clubIds?: string[]) {
  const owned = await tx.clubMembership.findMany({
    where: { athleteId, role: "owner", ...(clubIds ? { clubId: { in: clubIds } } : {}) },
    select: { clubId: true },
  });
  for (const { clubId } of owned) {
    const others = await tx.clubMembership.findMany({
      where: { clubId, athleteId: { not: athleteId } },
      orderBy: { joinedAt: "asc" },
    });
    if (others.some((m) => m.role === "owner")) continue;
    const heir = others.find((m) => m.role === "admin") ?? others[0];
    if (heir) await tx.clubMembership.update({ where: { id: heir.id }, data: { role: "owner" } });
    else await tx.club.delete({ where: { id: clubId } });
  }
}

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
      coverColor: /^#[0-9a-fA-F]{6}$/.test(body?.coverColor ?? "") ? body.coverColor : "#fc4c02", memberCount: 1, privacy: "public",
      memberships: { create: { athleteId: viewerId, role: "owner" } },
    },
  });
  return json({ club: { id: club.id, slug: club.slug, name: club.name } });
}

// GET /api/clubs/:slugOrId
export async function getClub(idOrSlug: string, viewerId: string | null): Promise<Response> {
  const club = await db.club.findFirst({ where: clubWhere(idOrSlug) });
  if (!club) return err(404, "Club not found");
  const memberships = await db.clubMembership.findMany({
    where: { clubId: club.id },
    include: { athlete: true },
    orderBy: { joinedAt: "asc" },
  });
  const memberIds = memberships.map((m) => m.athleteId);
  const myMembership = viewerId ? memberships.find((m) => m.athleteId === viewerId) : null;
  // the leaderboard and feed show only activities this viewer may see
  const visible = visibleTo(viewerId, await followingIdsOf(viewerId));

  // weekly distance leaderboard among members
  const weekStart = startOfWeek();
  const weekActs = await db.activity.groupBy({
    by: ["athleteId"],
    where: { athleteId: { in: memberIds }, startDate: { gte: weekStart }, ...visible },
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
    where: { athleteId: { in: memberIds }, ...visible },
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
  const club = await db.club.findFirst({ where: clubWhere(idOrSlug) });
  if (!club) return err(404, "Club not found");
  const key = { clubId: club.id, athleteId: viewerId };
  // explicit action is safe to repeat; without one the call toggles
  const join = body?.action === "join" ? true : body?.action === "leave" ? false
    : !(await db.clubMembership.findUnique({ where: { clubId_athleteId: key } }));

  if (!join) {
    await db.$transaction(async (tx) => {
      await handOverClubs(tx, viewerId, [club.id]);
      await tx.clubMembership.deleteMany({ where: key });
      if (await tx.club.findUnique({ where: { id: club.id }, select: { id: true } })) await recountMembers(tx, club.id);
    });
    return json({ isMember: false });
  }
  const joined = await db.$transaction(async (tx) => {
    const { count } = await tx.clubMembership.createMany({ data: [key], skipDuplicates: true });
    await recountMembers(tx, club.id);
    return count > 0;
  });
  if (joined) {
    const [me, organisers] = await Promise.all([
      db.athlete.findUnique({ where: { id: viewerId }, select: { firstName: true } }),
      db.clubMembership.findMany({ where: { clubId: club.id, role: "owner" }, select: { athleteId: true } }),
    ]);
    await db.notification.createMany({
      data: organisers
        .filter((o) => o.athleteId !== viewerId)
        .map((o) => ({ recipientId: o.athleteId, actorId: viewerId, type: "club_join", clubId: club.id, text: `${me?.firstName ?? "Someone"} joined ${club.name}` })),
    });
  }
  return json({ isMember: true });
}

// POST /api/clubs/:id/events — create event (owner/admin)
export async function createEvent(idOrSlug: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const club = await db.club.findFirst({ where: clubWhere(idOrSlug) });
  if (!club) return err(404, "Club not found");
  const membership = await db.clubMembership.findUnique({ where: { clubId_athleteId: { clubId: club.id, athleteId: viewerId } } });
  if (!membership || !ORGANISER_ROLES.includes(membership.role)) return err(403, "Only the club's owner and admins can create events");
  const title = String(body?.title ?? "").trim().slice(0, 120);
  if (!title) return err(400, "Event title required");
  const startDate = body?.startDate ? new Date(body.startDate) : new Date(Date.now() + 86400000);
  if (Number.isNaN(startDate.getTime())) return err(400, "Invalid start date");
  const durationMin = Math.round(Number(body?.durationMin ?? 90));
  const event = await db.clubEvent.create({
    data: {
      clubId: club.id, title, description: body?.description ? String(body.description).slice(0, 800) : null,
      startDate,
      durationMin: Number.isFinite(durationMin) && durationMin > 0 && durationMin <= 24 * 60 ? durationMin : 90,
      meetingSpot: body?.meetingSpot ? String(body.meetingSpot).slice(0, 200) : null,
      sport: ["ride", "run", "walk", "hike", "swim"].includes(body?.sport) ? body.sport : club.sport === "cycling" ? "ride" : "run",
      goingCount: 1,
      attendances: { create: { athleteId: viewerId, status: "going" } },
    },
  });
  return json({ event: { id: event.id, title: event.title } });
}

// POST /api/clubs/:id/events/:eventId/rsvp
export async function rsvp(idOrSlug: string, eventId: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const club = await db.club.findFirst({ where: clubWhere(idOrSlug), select: { id: true } });
  const event = club ? await db.clubEvent.findFirst({ where: { id: eventId, clubId: club.id } }) : null;
  if (!event) return err(404, "Event not found");
  const status = body?.status === "interested" ? "interested" : body?.status === "none" ? "none" : "going";
  const key = { eventId, athleteId: viewerId };
  await db.$transaction(async (tx) => {
    if (status === "none") await tx.eventAttendance.deleteMany({ where: key });
    else await tx.eventAttendance.upsert({ where: { eventId_athleteId: key }, create: { ...key, status }, update: { status } });
    await tx.clubEvent.update({ where: { id: eventId }, data: { goingCount: await tx.eventAttendance.count({ where: { eventId, status: "going" } }) } });
  });
  return json({ myStatus: status === "none" ? null : status });
}
