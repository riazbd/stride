import { db } from "@/lib/db";
import { createSession, setSessionCookie, clearSessionCookie, json, err } from "../session";
import { hashPassword, verifyPassword } from "../password";

export async function login(body: any, https = false): Promise<Response> {
  const { email, password } = body ?? {};
  if (!email || !password) return err(400, "Email and password required");
  const athlete = await db.athlete.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (!athlete || !verifyPassword(String(password), athlete.password)) {
    return err(401, "Invalid email or password");
  }
  const token = await createSession(athlete.id);
  const res = json({ ok: true, athleteId: athlete.id });
  return setSessionCookie(res, token, https);
}

export async function signup(body: any, https = false): Promise<Response> {
  const { email, password, firstName, lastName, city, country, sex, weightKg, units } = body ?? {};
  if (!email || !password || !firstName) return err(400, "Email, password and first name are required");
  const exists = await db.athlete.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (exists) return err(409, "An account with that email already exists");
  const colors = ["#fc4c02", "#2c7f8f", "#404046", "#b0486a", "#3d7a4f", "#7a5c9e", "#5a6472", "#c29238"];
  const athlete = await db.athlete.create({
    data: {
      email: String(email).toLowerCase().trim(),
      password: hashPassword(String(password)),
      firstName: String(firstName).trim(),
      lastName: String(lastName ?? "").trim(),
      city: city ? String(city) : null,
      country: country ? String(country) : null,
      sex: sex === "M" || sex === "F" ? sex : null,
      weightKg: weightKg ? Number(weightKg) : null,
      units: units === "mi" ? "mi" : "km",
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
    },
  });
  // Auto-follow a starter pack so the feed is alive
  const popular = await db.athlete.findMany({
    where: { id: { not: athlete.id }, followerCount: { gte: 3 } },
    orderBy: { followerCount: "desc" },
    take: 10,
  });
  for (const p of popular) {
    await db.athleteFollow.create({ data: { followerId: athlete.id, followedId: p.id } });
    await db.athlete.update({ where: { id: p.id }, data: { followerCount: { increment: 1 } } });
    await db.notification.create({ data: { recipientId: p.id, actorId: athlete.id, type: "follow" } });
  }
  await db.athlete.update({ where: { id: athlete.id }, data: { followingCount: popular.length } });
  await db.notification.create({
    data: {
      recipientId: athlete.id, type: "welcome",
      text: "Welcome to STRIDE! Record your first activity with the record button, and follow athletes to fill your feed.",
    },
  });
  const token = await createSession(athlete.id);
  const res = json({ ok: true, athleteId: athlete.id });
  return setSessionCookie(res, token, https);
}

export async function logout(viewerId: string | null): Promise<Response> {
  if (viewerId) {
    await db.session.deleteMany({ where: { athleteId: viewerId } });
  }
  return clearSessionCookie(json({ ok: true }));
}

export async function me(viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Not signed in");
  const athlete = await db.athlete.findUnique({ where: { id: viewerId } });
  if (!athlete) return err(401, "Session expired");
  const unread = await db.notification.count({ where: { recipientId: viewerId, read: false } });
  return json({
    athlete: {
      id: athlete.id,
      email: athlete.email,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      avatarColor: athlete.avatarColor,
      bio: athlete.bio,
      city: athlete.city,
      country: athlete.country,
      sex: athlete.sex,
      birthday: athlete.birthday?.toISOString() ?? null,
      weightKg: athlete.weightKg,
      heightCm: athlete.heightCm,
      units: athlete.units,
      theme: athlete.theme,
      premium: athlete.premium,
      premiumPlan: athlete.premiumPlan,
      premiumSince: athlete.premiumSince?.toISOString() ?? null,
      maxHr: athlete.maxHr,
      privacyRadiusM: athlete.privacyRadiusM,
      defaultVisibility: athlete.defaultVisibility,
      followerCount: athlete.followerCount,
      followingCount: athlete.followingCount,
      createdAt: athlete.createdAt.toISOString(),
    },
    unreadCount: unread,
  });
}
