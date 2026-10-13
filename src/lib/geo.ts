// Geo engine — shared by seed, server analysis and client rendering.
// Track format: JSON array of [lng, lat, ele, t] (t = seconds since start, elapsed).

export type LL = [number, number];
export interface TrackPoint {
  lng: number;
  lat: number;
  ele: number;
  t: number;
}
export type RawPoint = [number, number, number, number];

const R = 6371000; // earth radius m
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LL, b: LL): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const la1 = rad(a[1]);
  const la2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function decodeTrack(json: string): TrackPoint[] {
  const raw = JSON.parse(json) as RawPoint[];
  return raw.map((p) => ({ lng: p[0], lat: p[1], ele: p[2], t: p[3] }));
}

export function encodeTrack(pts: TrackPoint[]): string {
  return JSON.stringify(
    pts.map((p) => [
      Math.round(p.lng * 1e5) / 1e5,
      Math.round(p.lat * 1e5) / 1e5,
      Math.round(p.ele * 10) / 10,
      Math.round(p.t),
    ])
  );
}

// ── Douglas-Peucker polyline simplification (for feed thumbnails / heatmaps) ─
function perpDist(p: LL, a: LL, b: LL): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return haversineM(p, a);
  // cross-track distance scaled to degrees (lat/lng mixed → approximate meters)
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len)));
  const proj: LL = [a[0] + t * dx, a[1] + t * dy];
  return haversineM(p, proj);
}

export function simplify(points: LL[], toleranceM: number): LL[] {
  if (points.length <= 2) return points;
  let maxD = -1;
  let idx = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > toleranceM) {
    const left = simplify(points.slice(0, idx + 1), toleranceM);
    const right = simplify(points.slice(idx), toleranceM);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

export function simplifyTrack(pts: TrackPoint[], toleranceM: number): TrackPoint[] {
  if (pts.length <= 2) return pts;
  const lls = pts.map((p) => [p.lng, p.lat] as LL);
  const keep = new Set<number>([0, pts.length - 1]);
  // iterative DP on indices
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(lls[i], lls[s], lls[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > toleranceM && idx > 0) {
      keep.add(idx);
      stack.push([s, idx], [idx, e]);
    }
  }
  return [...keep].sort((x, y) => x - y).map((i) => pts[i]);
}

// ── Motion model ─────────────────────────────────────────────────────────────
// Raw GPS lies in two ways that inflate stats if every hop is trusted:
//  • a phone standing still reports fixes a few metres apart every second,
//    which hop-by-hop looks like a slow walk;
//  • noise while moving zig-zags the line, adding distance (badly at walking pace).
// So: teleport fixes are interpolated away, positions are smoothed over a
// speed-adaptive window (~6 m of travel), and a hop only counts as moving when
// the *net* displacement across ±8 s clears SPEED_EPS — wander goes nowhere,
// real motion does. Nothing is smoothed or windowed across a manual pause.
// Trade-off: the window can't pinpoint the instant you stopped, so roughly the
// first and last 5–7 s of each stop still count as moving. Narrower windows fix
// that but start mistaking heavy GPS wander for motion.

/** [tStart, tEnd] in track seconds while the recorder was manually paused. */
export type Pause = [number, number];

export const SPEED_EPS = 0.55; // m/s — net speed below this means stopped
const TELEPORT_SPEED = 50; // m/s — faster than any human-powered sport
const STOP_WINDOW_S = 8; // half-width of the moving/stopped window
const STOP_REACH_M = 12; // GPS wander while stopped stays well inside this
const SMOOTH_DIST_M = 6; // smoothing window covers about this much travel
const SMOOTH_MIN_S = 1;
const SMOOTH_MAX_S = 5;
const MAX_SPEED_WINDOW_S = 5;

export interface Hop {
  d: number; // metres (smoothed)
  dt: number; // seconds
  moving: boolean;
}

function spansPause(t0: number, t1: number, pauses?: Pause[] | null): boolean {
  if (!pauses) return false;
  for (const [a, b] of pauses) if (a < t1 && b > t0) return true;
  return false;
}

/** One hop per consecutive point pair: hops[i - 1] joins pts[i - 1] → pts[i]. */
export function motionHops(pts: TrackPoint[], pauses?: Pause[] | null): Hop[] {
  const n = pts.length;
  if (n < 2) return [];
  // contiguous runs between pauses
  const runStart = new Array<number>(n).fill(0);
  const runEnd = new Array<number>(n).fill(n - 1);
  const broken = new Array<boolean>(n).fill(false); // hop (i-1 → i) spans a pause
  for (let i = 1; i < n; i++) {
    broken[i] = spansPause(pts[i - 1].t, pts[i].t, pauses);
    runStart[i] = broken[i] ? i : runStart[i - 1];
  }
  for (let i = n - 2; i >= 0; i--) runEnd[i] = broken[i + 1] ? i : runEnd[i + 1];

  // 1) teleports: a fix that implies an impossible speed from the last good fix
  //    is replaced by interpolation; 5 in a row means the old anchor was the bad one
  const lng = pts.map((p) => p.lng);
  const lat = pts.map((p) => p.lat);
  const bad = new Array<boolean>(n).fill(false);
  let good = 0;
  let streak = 0;
  for (let i = 1; i < n; i++) {
    if (runStart[i] === i) { good = i; streak = 0; continue; }
    const v = haversineM([lng[good], lat[good]], [lng[i], lat[i]]) / Math.max(1, pts[i].t - pts[good].t);
    if (v > TELEPORT_SPEED && streak < 5) { bad[i] = true; streak++; }
    else { good = i; streak = 0; }
  }
  for (let i = 0; i < n; i++) {
    if (!bad[i]) continue;
    let a = i - 1; while (a >= runStart[i] && bad[a]) a--;
    let b = i + 1; while (b <= runEnd[i] && bad[b]) b++;
    if (a < runStart[i] && b > runEnd[i]) continue;
    if (a < runStart[i]) { lng[i] = lng[b]; lat[i] = lat[b]; continue; }
    if (b > runEnd[i]) { lng[i] = lng[a]; lat[i] = lat[a]; continue; }
    const f = pts[b].t > pts[a].t ? (pts[i].t - pts[a].t) / (pts[b].t - pts[a].t) : 0;
    lng[i] = lng[a] + f * (lng[b] - lng[a]);
    lat[i] = lat[a] + f * (lat[b] - lat[a]);
  }

  // 2) speed-adaptive centred moving average (prefix sums + binary search)
  const cx = new Float64Array(n + 1);
  const cy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { cx[i + 1] = cx[i] + lng[i]; cy[i + 1] = cy[i] + lat[i]; }
  const lowerT = (t: number, lo: number, hi: number) => { // first index in [lo, hi] with time ≥ t
    hi++;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m + 1; else hi = m; }
    return lo;
  };
  const upperT = (t: number, lo: number, hi: number) => { // last index in [lo, hi] with time ≤ t
    hi++;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m + 1; else hi = m; }
    return lo - 1;
  };
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r0 = runStart[i], r1 = runEnd[i];
    let a = lowerT(pts[i].t - 4, r0, r1), b = upperT(pts[i].t + 4, r0, r1);
    if (a === b) { a = Math.max(r0, i - 1); b = Math.min(r1, i + 1); } // sparse samples
    const span = pts[b].t - pts[a].t;
    // path speed, not net: net reads ~0 at a hairpin and the widened
    // window would then drag the apex inwards
    let path = 0;
    for (let k = a + 1; k <= b; k++) path += haversineM([lng[k - 1], lat[k - 1]], [lng[k], lat[k]]);
    const v = span > 0 ? path / span : 0;
    // symmetric window, shrunk near run ends so endpoints stay put
    const s = Math.min(
      v > 0 ? Math.max(SMOOTH_MIN_S, Math.min(SMOOTH_MAX_S, SMOOTH_DIST_M / v)) : SMOOTH_MAX_S,
      pts[i].t - pts[r0].t,
      pts[r1].t - pts[i].t,
    );
    const lo = lowerT(pts[i].t - s, r0, r1);
    const hi = upperT(pts[i].t + s, r0, r1);
    const c = hi - lo + 1;
    sx[i] = (cx[hi + 1] - cx[lo]) / c;
    sy[i] = (cy[hi + 1] - cy[lo]) / c;
  }

  // 3) moving = net displacement across a ±STOP_WINDOW_S window around the hop
  const hops: Hop[] = [];
  let a = 0;
  let b = 0;
  for (let i = 1; i < n; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    const d = haversineM([sx[i - 1], sy[i - 1]], [sx[i], sy[i]]);
    if (broken[i] || dt <= 0) {
      hops.push({ d: broken[i] ? 0 : d, dt: Math.max(0, dt), moving: false });
      continue;
    }
    if (a < runStart[i]) a = runStart[i];
    while (a < i - 1 && pts[i - 1].t - pts[a + 1].t >= STOP_WINDOW_S) a++;
    if (b < i) b = i;
    while (b < runEnd[i] && pts[b].t - pts[i].t < STOP_WINDOW_S) b++;
    const net = haversineM([sx[a], sy[a]], [sx[b], sy[b]]);
    let moving = net / Math.max(2 * STOP_WINDOW_S, pts[b].t - pts[a].t) >= SPEED_EPS;
    if (!moving) {
      // a hairpin turn nets ~0 displacement but still reaches far from the hop
      for (let k = a; k <= b && !moving; k++) moving = haversineM([sx[i], sy[i]], [sx[k], sy[k]]) >= STOP_REACH_M;
    }
    hops.push({ d, dt, moving });
  }
  return hops;
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface TrackStats {
  distanceM: number;
  elapsedS: number;
  movingS: number;
  elevationM: number;
  avgSpeed: number;
  maxSpeed: number;
}

export function trackStats(pts: TrackPoint[], pauses?: Pause[] | null): TrackStats {
  const hops = motionHops(pts, pauses);
  let dist = 0;
  let moving = 0;
  // cumulative moving distance/time, for a rolling max speed that GPS noise can't spike
  const cumD = [0];
  const cumT = [0];
  for (const h of hops) {
    if (h.moving) { dist += h.d; moving += h.dt; }
    cumD.push(dist);
    cumT.push(cumT[cumT.length - 1] + h.dt);
  }
  let maxSpeed = 0;
  let j = 0;
  for (let i = 1; i < pts.length; i++) {
    while (j < i - 1 && cumT[i] - cumT[j + 1] >= MAX_SPEED_WINDOW_S) j++;
    const span = cumT[i] - cumT[j];
    if (span >= MAX_SPEED_WINDOW_S) maxSpeed = Math.max(maxSpeed, (cumD[i] - cumD[j]) / span);
  }
  const elapsed = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
  return {
    distanceM: dist,
    elapsedS: elapsed,
    movingS: moving,
    elevationM: elevationGain(pts.map((p) => p.ele)),
    avgSpeed: moving > 0 ? dist / moving : 0,
    maxSpeed: Math.min(maxSpeed, TELEPORT_SPEED),
  };
}

// Splits — per unit (1000m / 1609.34m), boundaries interpolated inside the hop
export interface SplitCalc {
  index: number;
  distanceM: number;
  timeS: number; // moving time
  elevationDiff: number;
  paceZone: number;
  tStart: number; // track time (elapsed) the split began
  tEnd: number;
}

export function computeSplits(pts: TrackPoint[], unitM: number, pauses?: Pause[] | null): SplitCalc[] {
  const splits: SplitCalc[] = [];
  if (pts.length < 2) return splits;
  const hops = motionHops(pts, pauses);
  let acc = 0; // cumulative moving distance
  let accTime = 0; // cumulative moving time
  let startDist = 0;
  let startTime = 0;
  let startT = pts[0].t;
  let startEle = pts[0].ele;

  for (let i = 1; i < pts.length; i++) {
    const h = hops[i - 1];
    if (!h.moving || h.d <= 0) continue;
    const a = pts[i - 1], b = pts[i];
    while (acc + h.d >= startDist + unitM) {
      const f = (startDist + unitM - acc) / h.d;
      const time = accTime + f * h.dt;
      const t = a.t + f * (b.t - a.t);
      const ele = a.ele + f * (b.ele - a.ele);
      splits.push({
        index: splits.length, distanceM: unitM, timeS: time - startTime,
        elevationDiff: ele - startEle, paceZone: 0, tStart: startT, tEnd: t,
      });
      startDist += unitM;
      startTime = time;
      startT = t;
      startEle = ele;
    }
    acc += h.d;
    accTime += h.dt;
  }
  // final partial split
  if (acc > startDist + 50) {
    const last = pts[pts.length - 1];
    splits.push({
      index: splits.length, distanceM: acc - startDist, timeS: accTime - startTime,
      elevationDiff: last.ele - startEle, paceZone: 0, tStart: startT, tEnd: last.t,
    });
  }
  // pace zones relative to median split pace
  if (splits.length > 2) {
    const paces = splits.map((s) => s.timeS / Math.max(1, s.distanceM)).sort((x, y) => x - y);
    const med = paces[Math.floor(paces.length / 2)];
    for (const s of splits) {
      const rel = (med - s.timeS / Math.max(1, s.distanceM)) / med; // positive = faster
      s.paceZone = Math.max(-3, Math.min(3, Math.round(rel * 10)));
    }
  }
  return splits;
}

// ── Best rolling efforts (fastest moving time over a target distance) ───────
type EffortPoint = { lng: number; lat: number; t: number; ele?: number };

/** Fastest moving time for each target distance; hops are computed once. */
export function bestEfforts(pts: EffortPoint[], targetsM: number[], pauses?: Pause[] | null): (number | null)[] {
  if (pts.length < 5) return targetsM.map(() => null);
  const hops = motionHops(pts.map((p) => ({ ...p, ele: p.ele ?? 0 })), pauses);
  const cum: number[] = [0];
  const cumT: number[] = [0];
  for (const h of hops) {
    cum.push(cum[cum.length - 1] + (h.moving ? h.d : 0));
    cumT.push(cumT[cumT.length - 1] + (h.moving ? h.dt : 0));
  }
  return targetsM.map((targetM) => {
    if (cum[cum.length - 1] < targetM) return null;
    let best: number | null = null;
    let j = 0;
    for (let i = 1; i < cum.length; i++) {
      if (cum[i] < targetM) continue;
      // latest start j that still leaves ≥ targetM, then interpolate the exact start
      while (j + 1 < i && cum[i] - cum[j + 1] >= targetM) j++;
      const over = cum[i] - cum[j] - targetM;
      const hopD = cum[j + 1] - cum[j];
      const startT = hopD > 0 ? cumT[j] + (over / hopD) * (cumT[j + 1] - cumT[j]) : cumT[j];
      const time = cumT[i] - startT;
      if (time > 0 && (best === null || time < best)) best = time;
    }
    return best;
  });
}

export function bestEffort(pts: EffortPoint[], targetM: number, pauses?: Pause[] | null): number | null {
  return bestEfforts(pts, [targetM], pauses)[0];
}

/** Stored Track.pauses JSON → validated intervals (null when absent or junk). */
export function parsePauses(raw: string | null | undefined): Pause[] | null {
  if (!raw) return null;
  try {
    return sanitizePauses(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Untrusted pause list → sorted, finite, non-empty intervals (max 500). */
export function sanitizePauses(raw: unknown): Pause[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Pause[] = [];
  for (const x of raw.slice(0, 500)) {
    if (!Array.isArray(x) || x.length < 2) continue;
    const a = Number(x[0]), b = Number(x[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a) out.push([a, b]);
  }
  out.sort((p, q) => p[0] - q[0]);
  return out.length ? out : null;
}

// ── Segment matching ─────────────────────────────────────────────────────────
// Attempts to find a contiguous portion of the track covering the segment.

export interface SegmentGeom {
  start: LL;
  end: LL;
  points: LL[];
}

export function matchSegment(track: TrackPoint[], seg: SegmentGeom): { startIdx: number; endIdx: number; timeS: number } | null {
  const TOLERANCE = 45;
  // find indices near segment start
  const startIdxs: number[] = [];
  for (let i = 0; i < track.length; i++) {
    if (haversineM([track[i].lng, track[i].lat], seg.start) < TOLERANCE) startIdxs.push(i);
  }
  if (!startIdxs.length) return null;
  const segLen = pathLength(seg.points);
  let best: { startIdx: number; endIdx: number; timeS: number } | null = null;

  for (const si of startIdxs) {
    // walk track forward, tracking furthest progress along segment polyline
    let progress = 0; // index along seg.points
    let endIdx = -1;
    for (let i = si; i < Math.min(track.length, si + 4000); i++) {
      // advance segment progress while track point is near next seg vertex
      while (progress < seg.points.length - 1) {
        const d = haversineM([track[i].lng, track[i].lat], seg.points[progress + 1]);
        if (d < 25) progress++;
        else break;
      }
      const dEnd = haversineM([track[i].lng, track[i].lat], seg.end);
      if (progress >= seg.points.length - 2 && dEnd < TOLERANCE) {
        endIdx = i;
        break;
      }
    }
    if (endIdx > si) {
      const timeS = track[endIdx].t - track[si].t;
      // sanity: effort speed plausible
      const v = segLen / Math.max(1, timeS);
      if (v > 0.8 && v < 22 && (!best || timeS < best.timeS)) best = { startIdx: si, endIdx, timeS };
    }
  }
  return best;
}

export function pathLength(points: LL[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineM(points[i - 1], points[i]);
  return d;
}

export function boundsOf(lls: LL[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of lls) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

// ── Seeded RNG (deterministic) ───────────────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Elevation gain with hysteresis (noise-robust, like real watch firmware)
export function elevationGain(eles: number[], threshold = 2.0): number {
  if (eles.length < 2) return 0;
  let ref = eles[0];
  let gain = 0;
  for (const e of eles) {
    const d = e - ref;
    if (d >= threshold) {
      gain += d;
      ref = e;
    } else if (d <= -threshold) {
      ref = e;
    }
  }
  return Math.round(gain);
}
