import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newToken } from "./password";

const COOKIE = "stride_session";
const SESSION_DAYS = 30;

export async function createSession(athleteId: string): Promise<string> {
  const token = newToken();
  await db.session.create({
    data: {
      token,
      athleteId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
    },
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string, https = false) {
  // In third-party/embedded HTTPS contexts (e.g. hosted previews), browsers only
  // accept cookies with SameSite=None + Secure. Plain Lax is enough for
  // first-party localhost/http development.
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: https ? "none" : "lax",
    secure: https,
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}

export async function athleteIdOf(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    select: { athleteId: true, expiresAt: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.athleteId;
}

export async function athleteOf(req: NextRequest) {
  const id = await athleteIdOf(req);
  if (!id) return null;
  return db.athlete.findUnique({ where: { id } });
}

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data as any, typeof init === "number" ? { status: init } : init);
}

export function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
