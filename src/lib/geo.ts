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

// ── Stats ────────────────────────────────────────────────────────────────────

export interface TrackStats {
  distanceM: number;
  elapsedS: number;
  movingS: number;
  elevationM: number;
  avgSpeed: number;
  maxSpeed: number;
}

const SPEED_EPS = 0.55; // m/s — below this we consider the athlete stopped

export function trackStats(pts: TrackPoint[]): TrackStats {
  let dist = 0;
  let moving = 0;
  let eleGain = 0;
  let maxSpeed = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversineM([pts[i - 1].lng, pts[i - 1].lat], [pts[i].lng, pts[i].lat]);
    const dt = pts[i].t - pts[i - 1].t;
    if (dt <= 0) continue;
    const v = d / dt;
    if (v > SPEED_EPS) {
      dist += d;
      moving += dt;
      if (v > maxSpeed && v < 25) maxSpeed = v;
    }
    const de = pts[i].ele - pts[i - 1].ele;
    if (de > 0) eleGain += de;
  }
  const elapsed = pts.length ? pts[pts.length - 1].t : 0;
  return {
    distanceM: dist,
    elapsedS: elapsed,
    movingS: moving,
    elevationM: eleGain,
    avgSpeed: moving > 0 ? dist / moving : 0,
    maxSpeed,
  };
}

// Splits — per unit (1000m / 1609.34m)
export interface SplitCalc {
  index: number;
  distanceM: number;
  timeS: number;
  elevationDiff: number;
  paceZone: number;
}

export function computeSplits(pts: TrackPoint[], unitM: number): SplitCalc[] {
  const splits: SplitCalc[] = [];
  let acc = 0;          // cumulative distance
  let accTime = 0;      // cumulative moving time
  let splitStartDist = 0;
  let splitStartTime = 0;
  let curIdx = 0;
  let accStartEle = pts[0]?.ele ?? 0;

  for (let i = 1; i < pts.length; i++) {
    const d = haversineM([pts[i - 1].lng, pts[i - 1].lat], [pts[i].lng, pts[i].lat]);
    const dt = pts[i].t - pts[i - 1].t;
    if (dt <= 0) continue;
    const v = d / dt;
    if (v > SPEED_EPS) {
      acc += d;
      accTime += dt;
    }
    if (acc >= (curIdx + 1) * unitM) {
      splits.push({
        index: curIdx,
        distanceM: acc - splitStartDist,
        timeS: accTime - splitStartTime,
        elevationDiff: (pts[i].ele ?? 0) - accStartEle,
        paceZone: 0,
      });
      accStartEle = pts[i].ele ?? 0;
      splitStartDist = acc;
      splitStartTime = accTime;
      curIdx++;
    }
  }
  // final partial split
  if (acc > splitStartDist + 50) {
    splits.push({
      index: curIdx,
      distanceM: acc - splitStartDist,
      timeS: accTime - splitStartTime,
      elevationDiff: (pts[pts.length - 1]?.ele ?? 0) - accStartEle,
      paceZone: 0,
    });
  }
  // pace zones relative to median split pace
  if (splits.length > 2) {
    const paces = splits.map((s) => s.timeS / Math.max(1, s.distanceM)).sort((a, b) => a - b);
    const med = paces[Math.floor(paces.length / 2)];
    for (const s of splits) {
      const rel = (med - s.timeS / Math.max(1, s.distanceM)) / med; // positive = faster
      s.paceZone = Math.max(-3, Math.min(3, Math.round(rel * 10)));
    }
  }
  return splits;
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
