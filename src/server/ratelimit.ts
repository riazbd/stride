// Fixed-window rate limits kept in process memory. STRIDE runs as a single Node
// process on the VPS, so this is enough for the beta; move it to Postgres or
// Redis before running more than one instance.

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
let lastSweep = Date.now();

export interface Limit {
  max: number;
  windowMs: number;
}

// counts one hit against `key`; returns seconds to wait when over the limit
export function hit(key: string, limit: Limit, now = Date.now()): number | null {
  if (now - lastSweep > 60_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    lastSweep = now;
  }
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + limit.windowMs };
    windows.set(key, w);
  }
  w.count++;
  return w.count > limit.max ? Math.ceil((w.resetAt - now) / 1000) : null;
}

export function resetRateLimits() {
  windows.clear();
}

const MIN = 60_000;
const HOUR = 60 * MIN;

// per route: limits by client IP, and by account once signed in
export const LIMITS: Record<string, { ip?: Limit; account?: Limit }> = {
  "auth/login": { ip: { max: 10, windowMs: 15 * MIN } },
  "auth/signup": { ip: { max: 5, windowMs: HOUR } },
  "auth/forgot": { ip: { max: 5, windowMs: HOUR } },
  "auth/reset": { ip: { max: 10, windowMs: HOUR } },
  "me/password": { account: { max: 5, windowMs: 15 * MIN } },
  "me/delete": { account: { max: 5, windowMs: 15 * MIN } },
  "activities/:id/comments": { account: { max: 30, windowMs: 10 * MIN } },
  "posts/:id/comments": { account: { max: 30, windowMs: 10 * MIN } },
  posts: { account: { max: 20, windowMs: HOUR } },
  activities: { account: { max: 60, windowMs: HOUR } },
  reports: { account: { max: 20, windowMs: HOUR } },
  clubs: { account: { max: 5, windowMs: HOUR } },
};

// every other write, so a script can't hammer toggles or settings
export const DEFAULT_WRITE_LIMIT: Limit = { max: 300, windowMs: 10 * MIN };
