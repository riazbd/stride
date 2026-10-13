"use client";
// Typed API client for all STRIDE endpoints

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  avatarColor: string;
  city: string | null;
  country: string | null;
  bio?: string | null;
  premium: boolean;
  followerCount?: number;
  followingCount?: number;
  isMe?: boolean;
  isFollowing?: boolean;
  isFollower?: boolean;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  createdAt?: string;
  email?: string;
  units?: string;
  theme?: string;
  birthday?: string | null;
  // premium + privacy (me only)
  premiumPlan?: "monthly" | "yearly" | null;
  maxHr?: number | null;
  privacyRadiusM?: number;
  defaultVisibility?: string;
}

export interface MeResponse {
  athlete: Athlete & { email: string; units: "km" | "mi"; theme: string };
  unreadCount: number;
}

export interface Activity {
  id: string;
  athlete: Athlete;
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
  effortSource?: "hr" | "rpe" | "estimate" | null;
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
  createdAt: string;
  // detail-only fields
  track?: [number, number, number, number][];
  splits?: Split[];
  laps?: { index: number; distanceM: number; timeS: number }[];
  kudos?: { id: string; firstName: string; lastName: string; avatarColor: string }[];
  comments?: CommentItem[];
  segmentEfforts?: SegmentEffortItem[];
  achievements?: { type: string; label: string; detail: string; rank?: number }[];
  hasTrack?: boolean;
}

export interface Split {
  index: number;
  distanceM: number;
  timeS: number;
  elevationDiff: number;
  avgHr?: number | null;
  paceZone: number;
}

export interface CommentItem {
  id: string;
  text: string;
  createdAt: string;
  athlete: Athlete;
}

export interface PostItem {
  id: string;
  athlete: Athlete;
  text: string;
  photo: string | null;
  createdAt: string;
  kudosCount: number;
  commentCount: number;
  hasKudos: boolean;
}

export interface SegmentEffortItem {
  id: string;
  timeS: number;
  isPR: boolean;
  rank: number | null;
  date: string;
  segment: { id: string; name: string; slug: string; distanceM: number; sport: string; city: string; country: string };
}

export interface FeedItem {
  type: "activity" | "post";
  data: Activity | PostItem;
}

export interface SegmentSummary {
  id: string;
  slug: string;
  name: string;
  sport: string;
  distanceM: number;
  averageGrade: number;
  city: string;
  country: string;
  starredCount: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  points: [number, number][];
  isStarred: boolean;
  myBestTimeS: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  timeS: number;
  date: string;
  activityId: string;
  isPR: boolean;
  athlete: Athlete;
}

export interface SegmentDetail {
  segment: SegmentSummary & {
    description: string | null;
    maximumGrade: number;
    climbCat: number;
    elevationHigh: number;
    elevationLow: number;
    creator: Athlete | null;
    createdAt: string;
  };
  leaderboard: {
    overall: LeaderboardEntry[];
    following: LeaderboardEntry[];
    mine: LeaderboardEntry[];
    myRank: number | null;
    total: number;
  };
  legends: { athlete: Athlete; efforts: number }[];
  isStarred: boolean;
  viewerPremium?: boolean;
}

export interface ClubSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sport: string;
  city: string;
  country: string;
  memberCount: number;
  coverColor: string;
  accentColor: string;
  privacy: string;
  role?: string;
  isMember?: boolean;
  nextEvent?: { id: string; title: string; startDate: string } | null;
}

export interface ClubDetail {
  club: ClubSummary & { createdAt: string };
  myRole: string | null;
  members: (Athlete & { role: string; weekDistanceM: number })[];
  events: ClubEvent[];
  feed: Activity[];
}

export interface ClubEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  durationMin: number;
  meetingSpot: string | null;
  sport: string;
  goingCount: number;
  going: { id: string; firstName: string; lastName: string; avatarColor: string; status: string }[];
  myStatus: string | null;
}

export interface ChallengeItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  type: string;
  goalValue: number;
  period: string;
  startDate: string;
  endDate: string;
  badgeIcon: string;
  accentColor: string;
  joinedCount: number;
  featured: boolean;
  isJoined: boolean;
  progress: number | null;
  completedAt: string | null;
  daysLeft: number;
}

export interface ChallengeDetail {
  challenge: ChallengeItem;
  isJoined: boolean;
  progress: number;
  rawProgress: number;
  completed: boolean;
  completedAt: string | null;
  contributors: { id: string; title: string | null; sport: string; distanceM: number; movingTimeS: number; elevationM: number; startDate: string }[];
}

export interface PeriodStats {
  distanceM: number;
  movingTimeS: number;
  elevationM: number;
  activities: number;
  relativeEffort: number;
}

export interface AthleteProfile {
  athlete: Athlete;
  stats: {
    week: PeriodStats;
    ytd: PeriodStats;
    all: PeriodStats;
    weekly: { weekStart: string; distanceM: number; movingTimeS: number; elevationM: number; activities: number }[];
  };
  clubCount: number;
  trophyCount: number;
  recentActivities: Activity[];
}

export interface GearItem {
  id: string;
  type: string;
  name: string;
  brand: string | null;
  model: string | null;
  distanceM: number;
  retired: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  text: string | null;
  read: boolean;
  activityId: string | null;
  postId: string | null;
  clubId: string | null;
  challengeId: string | null;
  actor: Athlete | null;
  createdAt: string;
}

export interface RouteItem {
  id: string;
  name: string;
  description: string | null;
  sport: string;
  distanceM: number;
  elevationM: number;
  estimatedTimeS: number | null;
  createdAt: string;
  points: [number, number][];
  creator: Athlete | null;
  isMine: boolean;
}

export interface TrainingDay {
  date: string;
  distanceM: number;
  movingTimeS: number;
  activities: { id: string; sport: string; title: string | null; distanceM: number; movingTimeS: number }[];
}

export interface FitnessPoint {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
  load: number;
}

export interface WeeklyProgress {
  week: PeriodStats;
  goals: { id: string; metric: string; target: number; sport: string | null; current: number }[]; // SI
  streak: number;
  weekStart: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Bad response");
  }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
