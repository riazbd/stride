import { db } from "@/lib/db";
import { json, err, clearSessionCookie } from "../session";
import { verifyPassword, hashPassword, sha256, MIN_PASSWORD_LENGTH } from "../password";
import { startOfWeek } from "../analytics";
import { hasFullAccess } from "../entitlement";
import { handOverClubs } from "./clubs";
import { rerankSegments } from "./segments";

// GET /api/me/notifications
export async function notifications(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const rows = await db.notification.findMany({
    where: { recipientId: viewerId },
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const athleteCards = new Map<string, any>();
  for (const n of rows) {
    if (n.actor && !athleteCards.has(n.actor.id)) {
      athleteCards.set(n.actor.id, {
        id: n.actor.id, firstName: n.actor.firstName, lastName: n.actor.lastName,
        avatarColor: n.actor.avatarColor, city: n.actor.city, country: n.actor.country,
        bio: n.actor.bio, premium: n.actor.premium,
      });
    }
  }
  return json({
    notifications: rows.map((n) => ({
      id: n.id, type: n.type, text: n.text, read: n.read,
      activityId: n.activityId, postId: n.postId, clubId: n.clubId, challengeId: n.challengeId,
      actor: n.actor ? athleteCards.get(n.actor.id) : null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount: rows.filter((n) => !n.read).length,
  });
}

// POST /api/me/notifications/read {id?} — one or all
export async function markRead(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  if (body?.id) {
    await db.notification.updateMany({ where: { id: String(body.id), recipientId: viewerId }, data: { read: true } });
  } else {
    await db.notification.updateMany({ where: { recipientId: viewerId }, data: { read: true } });
  }
  return json({ ok: true });
}

// PATCH /api/me/settings
export async function updateSettings(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const b = body ?? {};
  const data: any = {};
  if (b.firstName !== undefined) data.firstName = String(b.firstName).trim().slice(0, 40);
  if (b.lastName !== undefined) data.lastName = String(b.lastName).trim().slice(0, 40);
  if (b.bio !== undefined) data.bio = String(b.bio ?? "").slice(0, 300);
  if (b.city !== undefined) data.city = String(b.city).slice(0, 60);
  if (b.country !== undefined) data.country = String(b.country).slice(0, 60);
  if (b.units !== undefined) data.units = b.units === "mi" ? "mi" : "km";
  if (b.theme !== undefined && ["system", "light", "dark"].includes(b.theme)) data.theme = b.theme;
  if (b.sex !== undefined) data.sex = b.sex === "M" || b.sex === "F" ? b.sex : null;
  if (b.weightKg !== undefined) data.weightKg = Number(b.weightKg) || null;
  if (b.heightCm !== undefined) data.heightCm = Number(b.heightCm) || null;
  if (b.avatarColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(b.avatarColor)) data.avatarColor = b.avatarColor;
  if (b.maxHr !== undefined) data.maxHr = Number(b.maxHr) >= 120 && Number(b.maxHr) <= 230 ? Math.round(Number(b.maxHr)) : null;
  if (b.privacyRadiusM !== undefined) {
    const r = Number(b.privacyRadiusM);
    data.privacyRadiusM = [0, 200, 250, 500, 750, 1000].includes(r) ? r : 0;
  }
  if (b.defaultVisibility !== undefined && ["everyone", "followers", "only_me"].includes(b.defaultVisibility)) {
    data.defaultVisibility = b.defaultVisibility;
  }
  await db.athlete.update({ where: { id: viewerId }, data });
  return json({ ok: true });
}

// POST /api/me/password { current, next } — other devices are signed out
export async function changePassword(viewerId: string | null, sessionToken: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) return err(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const me = await db.athlete.findUnique({ where: { id: viewerId } });
  if (!me) return err(404, "Athlete not found");
  if (!verifyPassword(current, me.password)) return err(400, "Current password is incorrect");
  await db.$transaction([
    db.athlete.update({ where: { id: viewerId }, data: { password: hashPassword(next) } }),
    db.session.deleteMany({ where: { athleteId: viewerId, tokenHash: { not: sha256(sessionToken ?? "") } } }),
  ]);
  return json({ ok: true });
}

// POST /api/me/delete { password } — erases the account and everything in it:
// activities and tracks, posts, comments, kudos, follows, memberships, gear,
// goals, routes, notifications, reports and sessions (schema cascades). Counters
// on other people's profiles, clubs, segments, events and challenges are
// recounted, and owned clubs pass to the next admin or member. All or nothing.
export async function deleteAccount(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const me = await db.athlete.findUnique({ where: { id: viewerId } });
  if (!me) return err(404, "Athlete not found");
  if (!verifyPassword(String(body?.password ?? ""), me.password)) return err(400, "Password is incorrect");

  const segmentIds = (await db.segmentEffort.findMany({ where: { athleteId: viewerId }, select: { segmentId: true }, distinct: ["segmentId"] }))
    .map((e) => e.segmentId);
  await db.$transaction(async (tx) => {
    const [followers, following, clubs, stars, events, entries] = await Promise.all([
      tx.athleteFollow.findMany({ where: { followedId: viewerId }, select: { followerId: true } }),
      tx.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } }),
      tx.clubMembership.findMany({ where: { athleteId: viewerId }, select: { clubId: true } }),
      tx.segmentStar.findMany({ where: { athleteId: viewerId }, select: { segmentId: true } }),
      tx.eventAttendance.findMany({ where: { athleteId: viewerId }, select: { eventId: true } }),
      tx.challengeEntry.findMany({ where: { athleteId: viewerId }, select: { challengeId: true } }),
    ]);
    await handOverClubs(tx, viewerId);
    await tx.athlete.delete({ where: { id: viewerId } });

    for (const { followerId } of followers) {
      await tx.athlete.update({ where: { id: followerId }, data: { followingCount: await tx.athleteFollow.count({ where: { followerId } }) } });
    }
    for (const { followedId } of following) {
      await tx.athlete.update({ where: { id: followedId }, data: { followerCount: await tx.athleteFollow.count({ where: { followedId } }) } });
    }
    for (const { clubId } of clubs) {
      await tx.club.updateMany({ where: { id: clubId }, data: { memberCount: await tx.clubMembership.count({ where: { clubId } }) } });
    }
    for (const { segmentId } of stars) {
      await tx.segment.update({ where: { id: segmentId }, data: { starredCount: await tx.segmentStar.count({ where: { segmentId } }) } });
    }
    for (const { eventId } of events) {
      await tx.clubEvent.updateMany({ where: { id: eventId }, data: { goingCount: await tx.eventAttendance.count({ where: { eventId, status: "going" } }) } });
    }
    for (const { challengeId } of entries) {
      await tx.challenge.update({ where: { id: challengeId }, data: { joinedCount: await tx.challengeEntry.count({ where: { challengeId } }) } });
    }
  }, { timeout: 30_000 });
  // their efforts left the leaderboards; close the gaps in the ranks
  await rerankSegments(segmentIds);
  return clearSessionCookie(json({ ok: true }));
}

// ── Gear ──
export async function listGear(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const gear = await db.gear.findMany({ where: { athleteId: viewerId }, orderBy: [{ retired: "asc" }, { createdAt: "desc" }] });
  return json({ gear });
}

export async function createGear(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const name = String(body?.name ?? "").trim();
  if (!name) return err(400, "Gear name required");
  const type = ["shoes", "bike", "other"].includes(body?.type) ? body.type : "shoes";
  const row = await db.gear.create({
    data: {
      athleteId: viewerId, type, name: name.slice(0, 60),
      brand: body?.brand ? String(body.brand).slice(0, 40) : null,
      model: body?.model ? String(body.model).slice(0, 40) : null,
      isDefault: !!body?.isDefault,
    },
  });
  if (row.isDefault) {
    await db.gear.updateMany({ where: { athleteId: viewerId, id: { not: row.id }, type: row.type }, data: { isDefault: false } });
  }
  return json({ gear: row });
}

export async function updateGear(viewerId: string | null, id: string, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const gear = await db.gear.findUnique({ where: { id } });
  if (!gear || gear.athleteId !== viewerId) return err(404, "Gear not found");
  const data: any = {};
  if (body?.name !== undefined) {
    data.name = String(body.name).trim().slice(0, 60);
    if (!data.name) return err(400, "Gear name required");
  }
  if (body?.retired !== undefined) {
    data.retired = !!body.retired;
    // retired gear stops being picked for new activities
    if (data.retired) data.isDefault = false;
  }
  if (body?.isDefault !== undefined && !data.retired) data.isDefault = !!body.isDefault && !gear.retired;
  const [, row] = await db.$transaction([
    db.gear.updateMany({
      where: data.isDefault ? { athleteId: viewerId, id: { not: id }, type: gear.type } : { id: "" },
      data: { isDefault: false },
    }),
    db.gear.update({ where: { id }, data }),
  ]);
  return json({ gear: row });
}

export async function deleteGear(viewerId: string | null, id: string): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const gear = await db.gear.findUnique({ where: { id } });
  if (!gear || gear.athleteId !== viewerId) return err(404, "Gear not found");
  await db.gear.delete({ where: { id } });
  return json({ ok: true });
}

// ── Goals ──
// Goals support period (weekly | monthly | yearly) + metric (distance | time | elevation) + sport.
// GET returns each goal with live progress for the current period window.
export async function listGoals(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const goals = await db.goal.findMany({ where: { athleteId: viewerId } });
  const now = new Date();
  const windows: Record<string, { from: Date; to: Date }> = {
    weekly: { from: startOfWeek(now), to: new Date(now.getTime() + 86400000) },
    monthly: { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
    yearly: { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) },
  };
  const out = await Promise.all(goals.map(async (g) => {
    const w = windows[g.period] ?? windows.weekly;
    const rows = await db.activity.findMany({
      where: {
        athleteId: viewerId,
        startDate: { gte: w.from, lt: w.to },
        ...(g.sport ? { sport: g.sport } : {}),
      },
      select: { distanceM: true, movingTimeS: true, elevationM: true },
    });
    // SI like the target: metres, or seconds for time goals
    const value =
      g.metric === "time" ? rows.reduce((a, r) => a + r.movingTimeS, 0) :
      g.metric === "elevation" ? rows.reduce((a, r) => a + r.elevationM, 0) :
      rows.reduce((a, r) => a + r.distanceM, 0);
    return {
      id: g.id, metric: g.metric, target: g.target, period: g.period, sport: g.sport,
      current: Math.round(value),
    };
  }));
  // stable order: weekly first, then monthly, yearly; distance first
  const periodOrder: Record<string, number> = { weekly: 0, monthly: 1, yearly: 2 };
  out.sort((a, b) => (periodOrder[a.period] ?? 9) - (periodOrder[b.period] ?? 9) || a.metric.localeCompare(b.metric));
  return json({ goals: out });
}

// POST /api/me/goals { metric, period, sport, target } — target in SI units:
// metres for distance and elevation, seconds for time. 0 removes the goal.
export async function setGoal(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const metric = ["distance", "time", "elevation"].includes(body?.metric) ? body.metric : "distance";
  const raw = Number(body?.target ?? 0);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1e8) return err(400, "Invalid goal target");
  const target = Math.round(raw);
  const sport = ["run", "ride"].includes(body?.sport) ? body.sport : null;
  const period = ["weekly", "monthly", "yearly"].includes(body?.period) ? body.period : "weekly";
  if (period !== "weekly") {
    const me = await db.athlete.findUnique({ where: { id: viewerId }, select: { premium: true } });
    if (!hasFullAccess(me)) return err(402, "Monthly and yearly goals are a Premium feature");
  }
  const existing = await db.goal.findFirst({ where: { athleteId: viewerId!, metric, sport, period } });
  if (existing) {
    if (target <= 0) {
      await db.goal.delete({ where: { id: existing.id } });
      return json({ deleted: true });
    }
    const row = await db.goal.update({ where: { id: existing.id }, data: { target } });
    return json({ goal: row });
  }
  if (target <= 0) return json({ deleted: true });
  const row = await db.goal.create({ data: { athleteId: viewerId!, metric, target, sport, period } });
  return json({ goal: row });
}
