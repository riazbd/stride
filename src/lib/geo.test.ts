/// <reference types="bun-types" />
// Ground-truth accuracy tests for the GPS motion model. Run with `bun test`.
// Tracks are synthesized in local metres so the true distance / moving time
// is known exactly, then GPS-style noise is layered on top.
import { describe, expect, test } from "bun:test";
import { TrackPoint, trackStats, computeSplits, bestEffort, mulberry32, type Pause } from "./geo";

const LAT0 = 23.75;
const LNG0 = 90.39;
const M_PER_DEG_LAT = (Math.PI * 6371000) / 180;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

function pt(x: number, y: number, t: number, ele = 20): TrackPoint {
  return { lng: LNG0 + x / M_PER_DEG_LNG, lat: LAT0 + y / M_PER_DEG_LAT, ele, t };
}

// AR(1)-correlated noise, like real GPS wander (not independent per fix)
function gpsNoise(seed: number, sigmaM: number) {
  const r = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
  let nx = 0, ny = 0;
  const k = Math.sqrt(1 - 0.8 * 0.8);
  return () => {
    nx = 0.8 * nx + sigmaM * k * gauss();
    ny = 0.8 * ny + sigmaM * k * gauss();
    return [nx, ny] as const;
  };
}

/** Straight run north; `stops` = [atMetres, seconds] inserted with stationary jitter. */
function straightRun(opts: { metres: number; speed: number; hz?: number; stops?: [number, number][]; moveNoise?: number; stopNoise?: number; seed?: number }) {
  const { metres, speed, hz = 1, stops = [], moveNoise = 0, stopNoise = 2.5, seed = 7 } = opts;
  const noiseMove = gpsNoise(seed, moveNoise);
  const noiseStop = gpsNoise(seed + 1, stopNoise);
  const pts: TrackPoint[] = [];
  const step = speed / hz;
  let t = 0;
  let y = 0;
  const pending = [...stops].sort((a, b) => a[0] - b[0]);
  pts.push(pt(0, 0, 0));
  while (y < metres - 1e-9) {
    y = Math.min(metres, y + step);
    t += 1 / hz;
    const [nx, ny] = noiseMove();
    pts.push(pt(nx, y + ny, t));
    while (pending.length && y >= pending[0][0]) {
      const [, secs] = pending.shift()!;
      for (let s = 1; s <= secs; s++) {
        const [jx, jy] = noiseStop();
        pts.push(pt(jx, y + jy, ++t));
      }
    }
  }
  return pts;
}

const within = (actual: number, expected: number, pct: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(pct / 100);

describe("trackStats", () => {
  test("clean steady run is exact", () => {
    const s = trackStats(straightRun({ metres: 3000, speed: 3 }));
    within(s.distanceM, 3000, 0.2);
    within(s.movingS, 1000, 0.5);
    expect(s.elapsedS).toBe(1000);
  });

  test("a 2-minute stop with GPS wander is not counted as distance or moving time", () => {
    const s = trackStats(straightRun({ metres: 3000, speed: 3, stops: [[1500, 120]] }));
    within(s.distanceM, 3000, 1);
    within(s.movingS, 1000, 1.5);
    expect(s.elapsedS).toBe(1120);
  });

  test("stationary jitter before the start does not count", () => {
    const s = trackStats(straightRun({ metres: 2000, speed: 3, stops: [[0, 60]] }));
    within(s.distanceM, 2000, 1);
    within(s.movingS, 2000 / 3, 2);
  });

  test("slow walking is still moving", () => {
    const s = trackStats(straightRun({ metres: 600, speed: 1.1 }));
    within(s.distanceM, 600, 0.5);
    within(s.movingS, 600 / 1.1, 1);
  });

  test("sparse 5-second sampling keeps full distance", () => {
    const s = trackStats(straightRun({ metres: 2000, speed: 4, hz: 0.2 }));
    within(s.distanceM, 2000, 0.5);
    within(s.movingS, 500, 1);
  });

  test("an out-and-back turnaround is not mistaken for a stop", () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i <= 166; i++) pts.push(pt(0, i * 3, i));
    for (let i = 1; i <= 166; i++) pts.push(pt(0, 498 - i * 3, 166 + i));
    const s = trackStats(pts);
    within(s.distanceM, 996, 0.5);
    within(s.movingS, 332, 1);
  });

  test("movement during a manual pause is excluded", () => {
    // 1 km, then a 60 s pause during which the athlete walks 200 m, then 1 km more
    const pts: TrackPoint[] = [];
    let t = 0;
    for (let i = 0; i <= 333; i++) pts.push(pt(0, i * 3, (t = i)));
    const pauseStart = t;
    t += 60;
    for (let i = 0; i <= 333; i++) pts.push(pt(0, 1200 + i * 3, t + i));
    const pauses: Pause[] = [[pauseStart + 0.5, pauseStart + 59.5]];
    const s = trackStats(pts, pauses);
    within(s.distanceM, 1998, 0.5);
    within(s.movingS, 666, 1);
    const naive = trackStats(pts);
    expect(naive.distanceM).toBeGreaterThan(2150); // proves the pause is what fixed it
  });

  test("GPS noise while moving barely inflates distance", () => {
    within(trackStats(straightRun({ metres: 3000, speed: 3, moveNoise: 1.5, seed: 7 })).distanceM, 3000, 2);
    within(trackStats(straightRun({ metres: 600, speed: 0.8, moveNoise: 1.5, seed: 7 })).distanceM, 600, 6);
  });

  test("teleporting fixes are ignored", () => {
    const pts = straightRun({ metres: 1500, speed: 3 });
    pts[200] = { ...pts[200], lng: pts[200].lng + 0.01 }; // ~1 km sideways for one fix
    pts[201] = { ...pts[201], lng: pts[201].lng + 0.01 };
    const s = trackStats(pts);
    within(s.distanceM, 1500, 0.5);
    expect(s.maxSpeed).toBeLessThan(3.5);
  });

  test("max speed is not inflated by GPS noise", () => {
    const s = trackStats(straightRun({ metres: 3000, speed: 3, moveNoise: 1.5, seed: 11 }));
    expect(s.maxSpeed).toBeLessThan(4.2);
    expect(s.maxSpeed).toBeGreaterThan(2.8);
  });

  test("elevation gain ignores sensor noise", () => {
    const r = mulberry32(3);
    const pts: TrackPoint[] = [];
    for (let i = 0; i <= 1000; i++) {
      const y = i * 3;
      pts.push(pt(0, y, i, 20 + 10 * Math.sin((y / 3000) * 4 * Math.PI) + (r() - 0.5)));
    }
    within(trackStats(pts).elevationM, 40, 8);
  });
});

describe("computeSplits", () => {
  test("splits are exactly one unit with interpolated times", () => {
    const sp = computeSplits(straightRun({ metres: 3000, speed: 3 }), 1000);
    expect(sp.length).toBe(3);
    for (const s of sp) {
      expect(s.distanceM).toBeCloseTo(1000, 0);
      within(s.timeS, 1000 / 3, 0.5);
    }
  });

  test("a stop does not slow down the split it happens in", () => {
    const sp = computeSplits(straightRun({ metres: 3000, speed: 3, stops: [[1500, 120]] }), 1000);
    expect(sp.length).toBe(3);
    within(sp[1].timeS, 1000 / 3, 4);
  });

  test("splits carry their elapsed time window", () => {
    const sp = computeSplits(straightRun({ metres: 2500, speed: 2.5 }), 1000);
    expect(sp.length).toBe(3);
    expect(sp[0].tStart).toBe(0);
    within(sp[0].tEnd, 400, 0.5);
    within(sp[1].tEnd, 800, 0.5);
    within(sp[2].distanceM, 500, 0.5);
  });
});

describe("bestEffort", () => {
  test("finds the fastest 1K inside a longer run", () => {
    const pts: TrackPoint[] = [];
    let t = 0;
    for (let i = 0; i <= 1000; i++) pts.push(pt(0, i, (t = i * (300 / 1000))));
    for (let i = 1; i <= 1000; i++) pts.push(pt(0, 1000 + i, t + i * (240 / 1000)));
    within(bestEffort(pts, 1000)!, 240, 1);
  });

  test("ignores time spent stopped", () => {
    const best = bestEffort(straightRun({ metres: 3000, speed: 4, stops: [[1500, 120]] }), 1000);
    within(best!, 250, 3);
  });
});
