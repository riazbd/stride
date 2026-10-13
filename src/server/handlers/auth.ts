import { db } from "@/lib/db";
import { createSession, setSessionCookie, clearSessionCookie, endSession, json, err } from "../session";
import { hasFullAccess } from "../entitlement";
import { hashPassword, verifyPassword, newToken, sha256, MIN_PASSWORD_LENGTH } from "../password";

const RESET_TTL_MS = 30 * 60_000;
const RESETS_PER_HOUR = 5;

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
  if (String(password).length < MIN_PASSWORD_LENGTH) return err(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
  await db.$transaction([
    db.athleteFollow.createMany({ data: popular.map((p) => ({ followerId: athlete.id, followedId: p.id })), skipDuplicates: true }),
    ...popular.map((p) => db.athlete.update({ where: { id: p.id }, data: { followerCount: { increment: 1 } } })),
    db.notification.createMany({ data: popular.map((p) => ({ recipientId: p.id, actorId: athlete.id, type: "follow" })) }),
    db.athlete.update({ where: { id: athlete.id }, data: { followingCount: popular.length } }),
  ]);
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

// POST /api/auth/forgot { email } — always answers ok, so it can't be used to
// probe which emails have accounts
export async function forgotPassword(body: any, origin: string): Promise<Response> {
  const email = String(body?.email ?? "").toLowerCase().trim();
  if (!email) return err(400, "Email required");
  const athlete = await db.athlete.findUnique({ where: { email } });
  let devResetUrl: string | undefined;
  if (athlete) {
    const recent = await db.passwordReset.count({
      where: { athleteId: athlete.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    });
    if (recent < RESETS_PER_HOUR) {
      const token = newToken();
      await db.passwordReset.create({
        data: { athleteId: athlete.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? origin}/?reset=${token}`;
      // No mail service is wired up: the link goes to the server log for the
      // operator, and in development straight back to the browser.
      console.info(`[auth] password reset link for ${email} (valid 30 min): ${url}`);
      if (process.env.NODE_ENV !== "production") devResetUrl = url;
    }
  }
  return json({ ok: true, ...(devResetUrl ? { devResetUrl } : {}) });
}

// POST /api/auth/reset { token, password } — single use; signs out every session
export async function resetPassword(body: any, https = false): Promise<Response> {
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");
  if (!token) return err(400, "This reset link is missing its token");
  if (password.length < MIN_PASSWORD_LENGTH) return err(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const reset = await db.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  const invalid = () => err(400, "This reset link is invalid or has expired");
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) return invalid();
  // claim it atomically so the same link can't be redeemed twice in parallel
  const claimed = await db.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return invalid();
  await db.athlete.update({ where: { id: reset.athleteId }, data: { password: hashPassword(password) } });
  await db.session.deleteMany({ where: { athleteId: reset.athleteId } });
  await db.passwordReset.deleteMany({ where: { athleteId: reset.athleteId, usedAt: null } });
  const sessionToken = await createSession(reset.athleteId);
  return setSessionCookie(json({ ok: true, athleteId: reset.athleteId }), sessionToken, https);
}

// POST /api/auth/logout — signs out this device only
export async function logout(sessionToken: string | null): Promise<Response> {
  await endSession(sessionToken);
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
      // everything is unlocked during the free beta; see entitlement.ts
      premium: hasFullAccess(athlete),
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
