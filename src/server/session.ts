import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newToken, sha256 } from "./password";

const COOKIE = "stride_session";
const SESSION_DAYS = 30;

// The cookie carries a random token; the database keeps only its sha256, so a
// leaked database can't be replayed as live sessions.
export async function createSession(athleteId: string): Promise<string> {
  const token = newToken();
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      athleteId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
    },
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string, https = false) {
  // Lax keeps the cookie off cross-site POSTs (CSRF) while still sending it on
  // normal top-level navigation to the app.
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}

export function sessionTokenOf(req: NextRequest): string | null {
  return req.cookies.get(COOKIE)?.value || null;
}

export async function athleteIdOf(req: NextRequest): Promise<string | null> {
  const token = sessionTokenOf(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { athleteId: true, expiresAt: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.athleteId;
}

// ends only the session this cookie belongs to; other devices stay signed in
export async function endSession(token: string | null): Promise<void> {
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data as any, typeof init === "number" ? { status: init } : init);
}

export function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
