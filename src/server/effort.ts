// Training load for one activity, from the best evidence available:
//
//   "hr"       heart rate recorded by a strap: Edwards TRIMP, minutes spent in
//              each zone (50–60 % … 90–100 % of max HR) weighted 1…5
//   "rpe"      no heart rate, but the athlete rated the effort 1–10:
//              session RPE (Foster), rating × minutes
//   "estimate" neither: minutes × a typical intensity for the sport
//
// The scales are matched so an hour at a steady, moderate effort lands near 90
// whichever source produced it. The source is stored next to the number, so the
// app can say when a load is only an estimate.

export type EffortSource = "hr" | "rpe" | "estimate";

const HR_SCALE = 0.5;
const RPE_SCALE = 0.3;

// typical session RPE when nothing better is known
const TYPICAL_RPE: Record<string, number> = {
  run: 4, trail_run: 4.5, virtual_run: 4, ride: 3.5, gravel: 3.8, mtb: 4.2, virtual_ride: 3.5, ebike: 2,
  walk: 1.5, hike: 3, swim: 4, open_water: 4, row: 4, kayak: 3, hiit: 6, crossfit: 6, workout: 3.5,
  gym: 3.5, yoga: 1.5, pilates: 2, tennis: 4, football: 5, basketball: 5,
};

export function maxHrOf(athlete: { maxHr?: number | null; birthday?: Date | null }, now = new Date()): number {
  if (athlete.maxHr) return athlete.maxHr;
  if (athlete.birthday) {
    const age = (now.getTime() - athlete.birthday.getTime()) / (365.25 * 86400000);
    if (age > 10 && age < 100) return Math.round(208 - 0.7 * age); // Tanaka
  }
  return 190;
}

function zoneWeight(hr: number, maxHr: number): number {
  const f = hr / maxHr;
  if (f < 0.5) return 0;
  if (f < 0.6) return 1;
  if (f < 0.7) return 2;
  if (f < 0.8) return 3;
  if (f < 0.9) return 4;
  return 5;
}

export interface EffortInput {
  sport: string;
  movingS: number;
  hrSeries?: [number, number][] | null; // [[t seconds, bpm], ...]
  avgHr?: number | null;
  perceivedEffort?: number | null;
  maxHr: number;
}

export function trainingLoad(x: EffortInput): { load: number; source: EffortSource } {
  const minutes = Math.max(0, x.movingS) / 60;
  if (x.hrSeries && x.hrSeries.length >= 8) {
    let trimp = 0;
    for (let i = 1; i < x.hrSeries.length; i++) {
      // gaps longer than 30 s (strap dropped, paused) don't count
      const dt = Math.min(30, x.hrSeries[i][0] - x.hrSeries[i - 1][0]);
      if (dt > 0) trimp += (dt / 60) * zoneWeight(x.hrSeries[i][1], x.maxHr);
    }
    return { load: Math.round(trimp * HR_SCALE), source: "hr" };
  }
  if (x.avgHr && x.avgHr > 40) {
    return { load: Math.round(minutes * zoneWeight(x.avgHr, x.maxHr) * HR_SCALE), source: "hr" };
  }
  if (x.perceivedEffort && x.perceivedEffort >= 1) {
    return { load: Math.round(minutes * Math.min(10, x.perceivedEffort) * RPE_SCALE), source: "rpe" };
  }
  return { load: Math.round(minutes * (TYPICAL_RPE[x.sport] ?? 3) * RPE_SCALE), source: "estimate" };
}
