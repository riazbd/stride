import { db } from "@/lib/db";
import { haversineM, type TrackPoint } from "@/lib/geo";

// Who may see what. Every list or detail endpoint that returns other people's
// activities filters through these helpers, so the rules live in one place:
//   everyone  → anyone, signed in or not
//   followers → the owner and athletes who follow the owner
//   only_me   → the owner

export async function followingIdsOf(viewerId: string | null): Promise<string[]> {
  if (!viewerId) return [];
  const rows = await db.athleteFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } });
  return rows.map((r) => r.followedId);
}

// Prisma `where` fragment for activities the viewer may see
export function visibleTo(viewerId: string | null, followingIds: string[]) {
  if (!viewerId) return { visibility: "everyone" };
  return {
    OR: [
      { visibility: "everyone" },
      { visibility: "followers", athleteId: { in: followingIds } },
      { athleteId: viewerId },
    ],
  };
}

export async function canSeeActivity(
  act: { athleteId: string; visibility: string },
  viewerId: string | null
): Promise<boolean> {
  if (act.athleteId === viewerId) return true;
  if (act.visibility === "everyone") return true;
  if (act.visibility !== "followers" || !viewerId) return false;
  const rel = await db.athleteFollow.findUnique({
    where: { followerId_followedId: { followerId: viewerId, followedId: act.athleteId } },
  });
  return !!rel;
}

// Privacy zone: drop the points within `radiusM` of the start and of the end, so
// nobody but the owner can see where an activity began or finished.
export function clipTrack<T extends TrackPoint>(track: T[], radiusM: number): T[] {
  if (radiusM <= 0 || track.length < 2) return track;
  const first = track[0];
  const last = track[track.length - 1];
  let s = 0;
  let e = track.length - 1;
  while (s < track.length && haversineM([first.lng, first.lat], [track[s].lng, track[s].lat]) < radiusM) s++;
  while (e >= 0 && haversineM([last.lng, last.lat], [track[e].lng, track[e].lat]) < radiusM) e--;
  return e > s ? track.slice(s, e + 1) : [];
}
