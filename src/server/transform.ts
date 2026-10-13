import { db } from "@/lib/db";
import { decodeTrack, simplifyTrack, TrackPoint } from "@/lib/geo";

// API payload shapes shared with the client

export interface AthleteSummary {
  id: string;
  firstName: string;
  lastName: string;
  avatarColor: string;
  city: string | null;
  country: string | null;
  bio: string | null;
  premium: boolean;
  followerCount?: number;
  followingCount?: number;
}

export function athleteSummary(a: {
  id: string; firstName: string; lastName: string; avatarColor: string;
  city: string | null; country: string | null; bio?: string | null; premium: boolean;
  followerCount?: number; followingCount?: number;
}): AthleteSummary {
  return {
    id: a.id, firstName: a.firstName, lastName: a.lastName, avatarColor: a.avatarColor,
    city: a.city, country: a.country, bio: a.bio ?? null, premium: a.premium,
    followerCount: a.followerCount, followingCount: a.followingCount,
  };
}

export interface ActivityCard {
  id: string;
  athlete: AthleteSummary;
  sport: string;
  title: string | null;
  description: string | null;
  startDate: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  elevationM: number;
  avgSpeed: number | null;
  maxSpeed: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgWatts?: number | null;
  maxWatts?: number | null;
  calories: number | null;
  relativeEffort: number | null;
  effortSource: string | null;
  perceivedEffort: number | null;
  visibility: string;
  isCommute: boolean;
  isTrainer: boolean;
  deviceName: string;
  photo: string | null;
  flagged: boolean;
  gear: { id: string; name: string; type: string } | null;
  polyline: [number, number][] | null;
  startLat: number | null;
  startLng: number | null;
  kudosCount: number;
  commentCount: number;
  hasKudos: boolean;
  achievementCount: number;
  prCount?: number;
  createdAt: string;
}

const trackSimplifyCache = new Map<string, [number, number][] | null>();

// Privacy zones (Strava-style): clip points within radius of start & end for non-owners.
export function clipPrivacyPolyline(
  pts: [number, number][] | null,
  radiusM: number
): [number, number][] | null {
  if (!pts || radiusM <= 0 || pts.length < 4) return pts;
  const R = Math.PI / 180;
  const dist = (a: [number, number], b: [number, number]) => {
    const dLat = (b[1] - a[1]) * R;
    const dLng = (b[0] - a[0]) * R;
    return 6371000 * Math.sqrt(dLat * dLat + dLng * dLng * Math.cos(a[1] * R));
  };
  const start = pts[0];
  const end = pts[pts.length - 1];
  let s = 0;
  while (s < pts.length && dist(start, pts[s]) < radiusM) s++;
  let e = pts.length - 1;
  while (e >= 0 && dist(end, pts[e]) < radiusM) e--;
  if (e <= s) return null; // route fully inside privacy zone -> hide entirely
  return pts.slice(s, e + 1);
}

export async function activityCard(
  act: any,
  viewerId: string | null,
  opts: { poly?: boolean } = { poly: true }
): Promise<ActivityCard> {
  let kudosCount = (act as any)._count?.kudos;
  if (kudosCount === undefined) kudosCount = act.kudosCount;
  let commentCount = (act as any)._count?.comments;
  if (commentCount === undefined) commentCount = act.commentCount;
  let athlete = act.athlete;
  if (!athlete) athlete = await db.athlete.findUnique({ where: { id: act.athleteId } });
  const isOwner = viewerId === act.athleteId;

  let polyline: [number, number][] | null = null;
  if (opts.poly !== false && act.track && !act.isTrainer) {
    let cached = trackSimplifyCache.get(act.id);
    if (cached === undefined) {
      const tps = decodeTrack(act.track.points);
      const simp = simplifyTrack(tps, 18);
      cached = simp.map((p) => [p.lng, p.lat] as [number, number]);
      if (trackSimplifyCache.size > 600) trackSimplifyCache.clear();
      trackSimplifyCache.set(act.id, cached);
    }
    polyline = cached;
    // privacy zone: clip for anyone who is not the owner
    if (polyline && viewerId !== act.athleteId) {
      const radius = (athlete as any)?.privacyRadiusM ?? 0;
      if (radius > 0) polyline = clipPrivacyPolyline(polyline, radius);
    }
  }

  let hasKudos = false;
  if (viewerId) {
    // callers usually include the viewer's kudos; otherwise look it up
    hasKudos = Array.isArray(act.kudos)
      ? act.kudos.some((k: any) => k.athleteId === viewerId)
      : !!(await db.kudos.findFirst({ where: { activityId: act.id, athleteId: viewerId } }));
  }

  const achievementCount = (act as any)._count?.efforts ?? 0;

  return {
    id: act.id,
    athlete: athleteSummary(athlete),
    sport: act.sport,
    title: act.title,
    description: act.description,
    startDate: act.startDate.toISOString(),
    distanceM: act.distanceM,
    movingTimeS: act.movingTimeS,
    elapsedTimeS: act.elapsedTimeS,
    elevationM: act.elevationM,
    avgSpeed: act.avgSpeed,
    maxSpeed: act.maxSpeed,
    avgHr: act.avgHr,
    maxHr: act.maxHr,
    avgWatts: act.avgWatts ?? null,
    maxWatts: act.maxWatts ?? null,
    calories: act.calories,
    relativeEffort: act.relativeEffort,
    effortSource: act.effortSource ?? null,
    perceivedEffort: act.perceivedEffort,
    visibility: act.visibility,
    isCommute: act.isCommute,
    isTrainer: act.isTrainer,
    deviceName: act.deviceName,
    photo: act.photo,
    flagged: act.flagged,
    gear: act.gear ? { id: act.gear.id, name: act.gear.name, type: act.gear.type } : null,
    polyline,
    // the exact start point is the owner's alone (it is often their front door)
    startLat: isOwner ? act.startLat : null,
    startLng: isOwner ? act.startLng : null,
    kudosCount: kudosCount ?? 0,
    commentCount: commentCount ?? 0,
    hasKudos,
    achievementCount,
    createdAt: act.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export interface PostCard {
  id: string;
  athlete: AthleteSummary;
  text: string;
  photo: string | null;
  createdAt: string;
  kudosCount: number;
  commentCount: number;
  hasKudos: boolean;
}

export async function postCard(p: any, viewerId: string | null): Promise<PostCard> {
  let athlete = p.athlete;
  if (!athlete) athlete = await db.athlete.findUnique({ where: { id: p.athleteId } });
  let hasKudos = false;
  if (viewerId && Array.isArray(p.kudos)) hasKudos = p.kudos.some((k: any) => k.athleteId === viewerId);
  else if (viewerId) {
    hasKudos = !!(await db.kudos.findFirst({ where: { postId: p.id, athleteId: viewerId } }));
  }
  return {
    id: p.id,
    athlete: athleteSummary(athlete),
    text: p.text,
    photo: p.photo,
    createdAt: p.createdAt.toISOString(),
    kudosCount: (p as any)._count?.kudos ?? p.kudosCount ?? 0,
    commentCount: (p as any)._count?.comments ?? p.commentCount ?? 0,
    hasKudos,
  };
}

export function rawTrackOf(pointsJson: string | null | undefined): TrackPoint[] | null {
  if (!pointsJson) return null;
  try {
    return decodeTrack(pointsJson);
  } catch {
    return null;
  }
}
