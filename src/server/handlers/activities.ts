import { db } from "@/lib/db";
import { json, err } from "../session";
import { activityCard } from "../transform";
import {
  TrackPoint, decodeTrack, trackStats, computeSplits, matchSegment, motionHops,
  bestEfforts, parsePauses, sanitizePauses, type Pause,
} from "@/lib/geo";
import { personalRecords, BEST_DISTANCES, evaluateChallenges, refreshGearDistance } from "../analytics";
import { canSeeActivity, clipTrack } from "../visibility";
import { hasFullAccess } from "../entitlement";
import { trainingLoad, maxHrOf } from "../effort";
import { rerankSegments } from "./segments";

const VISIBILITIES = ["everyone", "followers", "only_me"];

async function visibleActivity(id: string, viewerId: string | null) {
  const act = await db.activity.findUnique({
    where: { id },
    include: {
      athlete: true, gear: true, track: true, splits: true, laps: true,
      kudos: { include: { athlete: true } },
      comments: { include: { athlete: true }, orderBy: { createdAt: "asc" as const } },
      efforts: { include: { segment: true } },
      _count: { select: { kudos: true, comments: true } },
    },
  });
  if (!act || !(await canSeeActivity(act, viewerId))) return null;
  return act;
}

// GET /api/activities/:id
export async function getActivity(id: string, viewerId: string | null): Promise<Response> {
  const act = await visibleActivity(id, viewerId);
  if (!act) return err(404, "Activity not found");
  const kudosList = act.kudos.map((k) => ({
    id: k.athleteId,
    firstName: k.athlete.firstName,
    lastName: k.athlete.lastName,
    avatarColor: k.athlete.avatarColor,
  }));
  let track = act.track ? decodeTrack(act.track.points) : null;
  // privacy zone: non-owners don't get the points near the start and end
  if (track && viewerId !== act.athleteId) track = clipTrack(track, act.athlete.privacyRadiusM);
  const card = await activityCard(act, viewerId, { poly: false });

  // achievements: segment trophies + distance PRs
  const achievements: { type: string; label: string; detail: string; rank?: number }[] = [];
  for (const e of act.efforts) {
    if (e.isPR) {
      achievements.push({
        type: "segment_pr",
        label: e.rank === 1 ? (act.sport === "ride" ? "KOM" : "CR") : "PR",
        detail: `New personal record on ${e.segment.name}`,
        rank: e.rank ?? undefined,
      });
    } else if (e.rank && e.rank <= 3) {
      achievements.push({
        type: "segment_rank",
        label: `#${e.rank}`,
        detail: `${e.rank === 1 ? (act.sport === "ride" ? "KOM" : "CR") : `Rank ${e.rank}`} on ${e.segment.name}`,
        rank: e.rank,
      });
    }
  }
  if (track && ["run", "trail_run"].includes(act.sport)) {
    const myBest = bestEffortOfTrack(track, parsePauses(act.track?.pauses));
    const allPRs = await personalRecords(act.athleteId);
    for (const dist of [1000, 5000, 10000, 21097.5]) {
      const mine = myBest.get(dist);
      if (!mine) continue;
      const pr = allPRs.find((p) => p.distance === dist);
      if (!pr || mine <= pr.timeS) {
        const label = BEST_DISTANCES.find((b) => b.d === dist)?.label ?? `${dist / 1000}K`;
        achievements.push({ type: "distance_pr", label: "PR", detail: `Best ${label} time` });
      }
    }
  }

  return json({
    activity: {
      ...card,
      polyline: track ? track.map((p) => [p.lng, p.lat]) : null,
      track: track,
      splits: act.splits.map((s) => ({
        index: s.index, distanceM: s.distanceM, timeS: s.timeS,
        elevationDiff: s.elevationDiff, avgHr: s.avgHr, paceZone: s.paceZone,
      })),
      laps: act.laps.map((l) => ({ index: l.index, distanceM: l.distanceM, timeS: l.timeS })),
      kudos: kudosList,
      kudosCount: kudosList.length,
      comments: act.comments.map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        athlete: {
          id: c.athlete.id, firstName: c.athlete.firstName, lastName: c.athlete.lastName,
          avatarColor: c.athlete.avatarColor, city: c.athlete.city, country: c.athlete.country,
          bio: c.athlete.bio, premium: c.athlete.premium,
        },
      })),
      segmentEfforts: act.efforts
        .sort((a: any, b: any) => a.timeS - b.timeS)
        .map((e) => ({
          id: e.id,
          timeS: e.timeS,
          isPR: e.isPR,
          rank: e.rank,
          date: e.date.toISOString(),
          segment: {
            id: e.segment.id, name: e.segment.name, slug: e.segment.slug,
            distanceM: e.segment.distanceM, sport: e.segment.sport,
            city: e.segment.city, country: e.segment.country,
          },
        })),
      achievements,
      hasTrack: !!act.track,
    },
  });
}

function bestEffortOfTrack(track: TrackPoint[], pauses: Pause[] | null): Map<number, number> {
  const out = new Map<number, number>();
  const dists = [1000, 5000, 10000, 21097.5];
  bestEfforts(track, dists, pauses).forEach((t, i) => { if (t) out.set(dists[i], t); });
  return out;
}

// GET /api/activities/:id/analysis
// Premium subscribers get GAP + heart-rate zone analysis (Strava parity).
export async function analysis(id: string, viewerId: string | null): Promise<Response> {
  const act = await visibleActivity(id, viewerId);
  if (!act) return err(404, "Activity not found");
  const viewer = viewerId ? await db.athlete.findUnique({ where: { id: viewerId }, select: { premium: true } }) : null;
  const isPremium = hasFullAccess(viewer);
  // zones are the owner's, whoever is looking
  const ownerMaxHr = maxHrOf(act.athlete);
  if (!act.track) return json({ hasTrack: false, hasHr: false, splits: [], laps: [], isPremium });
  const pts = decodeTrack(act.track.points);
  const hops = motionHops(pts, parsePauses(act.track.pauses));
  // heart rate and power only ever come from a recorded sensor; nothing is invented
  const hrSeries = parseSeries(act.track.hrPoints);
  const hasHr = !!hrSeries;
  const hrAt = sampler(hrSeries);
  const powerAt = sampler(parseSeries(act.track.powerPoints));
  const hasPower = !!act.track.powerPoints;
  // rolling 30s pace + elevation (+ HR and power when recorded)
  const series: { t: number; d: number; ele: number; pace: number | null; hr: number | null; gap: number | null; watts?: number | null }[] = [];
  let dist = 0;
  const speedBuf: number[] = [];
  // grade-adjusted pace (GAP) — flat-equivalent speed model:
  // uphill costs ~2.8%/1% grade; gentle downhill assists, steep downhill hurts.
  const isPaceSport = ["run", "trail_run", "walk", "hike"].includes(act.sport);
  let gapDist = 0, gapTime = 0; // weighted accumulators for average GAP
  const gapFactor = (gradePct: number): number => {
    const g = Math.max(-35, Math.min(35, gradePct));
    if (g >= 0) return Math.min(2.5, 1 + 0.028 * g);
    const d = -g;
    if (d <= 10) return 1 + 0.012 * d * (1 - d / 16);
    return Math.max(0.6, 1 + 0.012 * 10 * 0.375 - 0.025 * (d - 10));
  };
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const h = hops[i - 1];
      if (h.moving) dist += h.d;
      speedBuf.push(h.moving && h.dt > 0 ? h.d / h.dt : 0);
    }
    // rolling pace over last ~30s of samples
    let vSum = 0, vN = 0;
    for (let k = Math.max(0, speedBuf.length - 8); k < speedBuf.length; k++) {
      if (speedBuf[k] > 0) { vSum += speedBuf[k]; vN++; }
    }
    const vAvg = vN ? vSum / vN : 0;
    const pace = vAvg > 0.7 ? 1000 / vAvg : null;
    const hr = hrAt(pts[i].t);
    // grade-adjusted pace (GAP) — premium only
    let gap: number | null = null;
    if (isPaceSport && isPremium && i > 0) {
      const { d, dt, moving } = hops[i - 1];
      const dEle = pts[i].ele - pts[i - 1].ele;
      if (moving && dt > 0 && d > 1) {
        const gradePct = (dEle / d) * 100;
        const gapV = (d / dt) * gapFactor(gradePct); // flat-equivalent speed
        if (gapV > 0.3) {
          gap = 1000 / gapV;
          gapDist += d;
          gapTime += d / gapV;
        }
      }
    }
    if (i % 2 === 0) series.push({ t: pts[i].t, d: Math.round(dist), ele: pts[i].ele, pace, hr, gap, ...(hasPower ? { watts: powerAt(pts[i].t) } : {}) });
  }
  // heart-rate zones (5 zones, time-weighted) — premium only
  let hrZones: { zone: number; name: string; range: string; timeS: number; pct: number }[] | null = null;
  if (isPremium && hasHr && series.length > 4) {
    const maxHr = ownerMaxHr;
    const bounds = [0.6, 0.7, 0.8, 0.9, 1.0].map((f) => Math.round(maxHr * f));
    const zoneNames = ["Endurance", "Moderate", "Tempo", "Threshold", "Anaerobic"];
    const times = [0, 0, 0, 0, 0];
    for (let i = 1; i < series.length; i++) {
      const dt = series[i].t - series[i - 1].t;
      if (dt <= 0) continue;
      const hr = series[i].hr;
      if (hr == null) continue;
      let z = 4;
      if (hr < bounds[0]) z = 0;
      else if (hr < bounds[1]) z = 1;
      else if (hr < bounds[2]) z = 2;
      else if (hr < bounds[3]) z = 3;
      times[z] += dt;
    }
    const total = times.reduce((a, b) => a + b, 0) || 1;
    hrZones = times.map((t, i) => ({
      zone: i + 1,
      name: zoneNames[i],
      range: i === 0 ? `Below ${bounds[0]} bpm` : `${bounds[i - 1] + 1}–${bounds[i]} bpm`,
      timeS: Math.round(t),
      pct: Math.round((t / total) * 100),
    }));
  }
  const avgGap = isPaceSport && isPremium && gapDist > 200 ? (gapTime / (gapDist / 1000)) : null;
  return json({
    hasTrack: true,
    series,
    hasHr,
    hasPower,
    isPremium,
    hrZones,
    avgGap,
    maxHr: ownerMaxHr,
    splits: act.splits.map((s) => ({ index: s.index, distanceM: s.distanceM, timeS: s.timeS, elevationDiff: s.elevationDiff, avgHr: s.avgHr, paceZone: s.paceZone })),
    laps: act.laps.map((l) => ({ index: l.index, distanceM: l.distanceM, timeS: l.timeS })),
    avgPace: act.avgSpeed ? 1000 / act.avgSpeed : null,
  });
}

// ── live sensor series helpers ────────────────────────────────────────────────
// client sends [[t, value], ...] from a connected Bluetooth sensor (HR strap or
// power meter), t on the same elapsed clock as the track; sanitize + compress
function sanitizeSeries(raw: any, min: number, max: number): [number, number][] | null {
  if (!Array.isArray(raw) || raw.length < 8) return null;
  const clean: [number, number][] = [];
  for (const x of raw) {
    if (!Array.isArray(x) || x.length < 2) continue;
    const t = +x[0]; const v = Math.round(+x[1]);
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(v) || v < min || v > max) continue;
    const tR = Math.round(t * 10) / 10;
    const last = clean[clean.length - 1];
    if (last && tR === last[0]) last[1] = v; // same tick — keep freshest
    else if (!last || tR > last[0]) clean.push([tR, v]);
  }
  if (clean.length < 8) return null;
  if (clean.length > 4000) { // downsample, keep endpoints
    const step = clean.length / 4000;
    const out: [number, number][] = [];
    for (let i = 0; i < 4000; i++) out.push(clean[Math.floor(i * step)]);
    if (out[out.length - 1][0] < clean[clean.length - 1][0]) out.push(clean[clean.length - 1]);
    return out;
  }
  return clean;
}

// stored [[t, value], ...] JSON → validated series (null when absent or junk)
function parseSeries(raw: string | null | undefined): [number, number][] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const clean = v
      .filter((x: any) => Array.isArray(x) && Number.isFinite(+x[0]) && Number.isFinite(+x[1]))
      .map((x: any) => [+x[0], Math.round(+x[1])] as [number, number]);
    return clean.length >= 2 ? clean : null;
  } catch { return null; }
}

// linear interpolation over a time-sorted series; query with increasing t
function sampler(series: [number, number][] | null): (t: number) => number | null {
  let p = 0;
  return (t) => {
    if (!series) return null;
    while (p < series.length - 1 && series[p + 1][0] < t) p++;
    const a = series[p];
    const b = series[Math.min(p + 1, series.length - 1)];
    if (t <= a[0]) return a[1];
    if (b[0] <= a[0] || t >= b[0]) return b[1];
    return Math.round(a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]));
  };
}

// mean value inside a time window [t0, t1] of an [[t, v]] series
function meanInWindow(series: [number, number][], t0: number, t1: number): number | null {
  let sum = 0; let n = 0;
  for (const [t, v] of series) {
    if (t < t0) continue;
    if (t > t1) break;
    sum += v; n++;
  }
  return n ? Math.round(sum / n) : null;
}

// POST /api/activities — save a recorded or manual activity
export async function createActivity(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const b = body ?? {};
  // a retried upload (lost response, flaky network) returns the first save
  const clientId = typeof b.clientId === "string" && /^[\w-]{8,64}$/.test(b.clientId) ? b.clientId : null;
  if (clientId) {
    const prior = await db.activity.findUnique({
      where: { athleteId_clientId: { athleteId: viewerId, clientId } },
      include: { athlete: true, gear: true, track: true, _count: { select: { kudos: true, comments: true, efforts: true } } },
    });
    if (prior) {
      const card = await activityCard({ ...prior, kudos: [] }, viewerId, { poly: false });
      return json({ activity: card, duplicate: true });
    }
  }
  const sport = String(b.sport ?? "run");
  const startDate = b.startDate ? new Date(b.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) return err(400, "Invalid start date");
  const trackRaw = Array.isArray(b.track) ? b.track : null;
  const manual = b.manual === true;

  let points: TrackPoint[] | null = null;
  let stats = { distanceM: 0, movingS: 0, elapsedS: 0, elevationM: 0, avgSpeed: 0, maxSpeed: 0 };
  let splits: ReturnType<typeof computeSplits> = [];
  let avgHr: number | null = b.avgHr ? Math.round(b.avgHr) : null;
  let maxHr: number | null = b.maxHr ? Math.round(b.maxHr) : null;
  const hrSeries = sanitizeSeries(b.hrSeries, 25, 255); // real Bluetooth data wins
  if (hrSeries) {
    avgHr = Math.round(hrSeries.reduce((a, x) => a + x[1], 0) / hrSeries.length);
    maxHr = Math.max(...hrSeries.map((x) => x[1]));
  }
  const powerSeries = sanitizeSeries(b.powerSeries, 0, 3000);
  const avgWatts = powerSeries ? Math.round(powerSeries.reduce((a, x) => a + x[1], 0) / powerSeries.length) : null;
  const maxWatts = powerSeries ? Math.max(...powerSeries.map((x) => x[1])) : null;
  const pauses = sanitizePauses(b.pauses);

  if (trackRaw && trackRaw.length > 1) {
    points = trackRaw
      .map((p: number[]) => ({ lng: +p[0], lat: +p[1], ele: +(p[2] ?? 0) || 0, t: +(p[3] ?? 0) }))
      .filter((p: TrackPoint) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && Number.isFinite(p.t));
    if (points!.length < 2) return err(400, "Track has no valid points");
    stats = trackStats(points!, pauses);
    splits = computeSplits(points!, 1000, pauses);
    // the recorder's wall clock also covers time before the first fix and after the last
    const clientElapsed = Number(b.elapsedTimeS);
    if (Number.isFinite(clientElapsed) && clientElapsed > stats.elapsedS && clientElapsed < stats.elapsedS + 86400) {
      stats.elapsedS = clientElapsed;
    }
  } else if (!manual) {
    if (b.distanceM == null || b.movingTimeS == null) return err(400, "distance and moving time required for activities without GPS");
    stats = {
      distanceM: Number(b.distanceM), movingS: Math.round(Number(b.movingTimeS)),
      elapsedS: Math.round(Number(b.elapsedTimeS ?? b.movingTimeS)), elevationM: Number(b.elevationM ?? 0),
      avgSpeed: Number(b.distanceM) / Math.max(1, Number(b.movingTimeS)), maxSpeed: b.maxSpeed ? Number(b.maxSpeed) : 0,
    };
  } else {
    const distanceM = Number(b.distanceM ?? 0);
    const movingTimeS = Math.round(Number(b.movingTimeS ?? 0));
    stats = {
      distanceM, movingS: movingTimeS, elapsedS: Math.round(Number(b.elapsedTimeS ?? movingTimeS)),
      elevationM: Number(b.elevationM ?? 0),
      avgSpeed: movingTimeS > 0 ? distanceM / movingTimeS : 0, maxSpeed: 0,
    };
    avgHr = b.avgHr ? Math.round(b.avgHr) : null;
    maxHr = b.maxHr ? Math.round(b.maxHr) : null;
  }

  const me = await db.athlete.findUnique({ where: { id: viewerId } });
  if (!me) return err(401, "Session expired");
  // gear must be the athlete's own
  const gearId = b.gearId ? String(b.gearId) : null;
  if (gearId && !(await db.gear.findFirst({ where: { id: gearId, athleteId: viewerId }, select: { id: true } }))) {
    return err(400, "Unknown gear");
  }
  const perceivedEffort = b.perceivedEffort ? Math.max(1, Math.min(10, Math.round(Number(b.perceivedEffort)))) : null;
  // calories via MET
  const MET: Record<string, number> = { run: 9.8, trail_run: 10.5, ride: 6.8, gravel: 7.2, mtb: 8, walk: 3.5, hike: 6, swim: 8.3, open_water: 8.6, row: 7, kayak: 6, canoe: 5.8, ski: 7, snowboard: 6.5, ice_skate: 5.5, snowshoe: 8.5, workout: 5, gym: 6, yoga: 3, pilates: 3.5, hiit: 8, crossfit: 8.5, climb: 8, elliptical: 5, stair_climber: 9, tennis: 7.3, football: 7, basketball: 6.5, golf: 4.5, handcycle: 7, wheelchair: 6.5, sail: 3, windsurf: 6, surf: 5.5, virtual_run: 9.8, virtual_ride: 6.5, default: 5 };
  const movingH = stats.movingS / 3600;
  // a power meter measures the work directly: ~1 kcal burned per kJ at ~24% gross efficiency
  const calories = avgWatts != null && avgWatts > 0
    ? Math.round((avgWatts * stats.movingS) / 1000)
    : Math.round((MET[sport] ?? 5) * (me.weightKg ?? 70) * movingH * 1.05);
  const effort = trainingLoad({ sport, movingS: stats.movingS, hrSeries, avgHr, perceivedEffort, maxHr: maxHrOf(me) });


  const act = await db.activity.create({
    data: {
      athleteId: viewerId,
      sport,
      title: b.title ? String(b.title).slice(0, 120) : null,
      description: b.description ? String(b.description).slice(0, 2000) : null,
      startDate,
      tzOffsetMin: Math.round((b.tzOffsetMin ?? -new Date().getTimezoneOffset()) as number),
      distanceM: stats.distanceM,
      movingTimeS: Math.round(stats.movingS),
      elapsedTimeS: Math.round(stats.elapsedS),
      elevationM: stats.elevationM,
      startLat: points?.[0]?.lat ?? null,
      startLng: points?.[0]?.lng ?? null,
      endLat: points?.[points.length - 1]?.lat ?? null,
      endLng: points?.[points.length - 1]?.lng ?? null,
      avgSpeed: stats.avgSpeed || null,
      maxSpeed: stats.maxSpeed || null,
      avgHr, maxHr, avgWatts, maxWatts,
      calories,
      relativeEffort: effort.load,
      effortSource: effort.source,
      perceivedEffort,
      // nothing chosen → the athlete's own default, never silently public
      visibility: VISIBILITIES.includes(b.visibility) ? b.visibility : me.defaultVisibility,
      isCommute: !!b.isCommute,
      isTrainer: !points,
      gearId,
      photo: b.photo || null,
      deviceName: b.deviceName ? String(b.deviceName).slice(0, 80) : "STRIDE App",
      clientId,
      track: points
        ? {
            create: {
              points: JSON.stringify(points.map((p) => [p.lng, p.lat, p.ele, p.t])),
              hrPoints: hrSeries ? JSON.stringify(hrSeries) : null,
              powerPoints: powerSeries ? JSON.stringify(powerSeries) : null,
              pauses: pauses ? JSON.stringify(pauses) : null,
            },
          }
        : undefined,
      splits: {
        create: splits.map((s) => ({
          index: s.index, distanceM: s.distanceM, timeS: Math.round(s.timeS),
          elevationDiff: Math.round(s.elevationDiff), paceZone: s.paceZone,
          avgHr: hrSeries ? meanInWindow(hrSeries, s.tStart, s.tEnd) : null,
        })),
      },
      laps: Array.isArray(b.laps)
        ? { create: b.laps.map((l: any, i: number) => ({ index: i, distanceM: Number(l.distanceM ?? 0), timeS: Math.round(Number(l.timeS ?? 0)) })) }
        : undefined,
    },
    include: { track: true, athlete: true, gear: true },
  });

  await refreshGearDistance([act.gearId]);

  // segment matching (only for GPS activities)
  const newEffortIds: string[] = [];
  const matchedSegments: string[] = [];
  if (points) {
    const segments = await db.segment.findMany();
    for (const seg of segments) {
      if (seg.city !== (me.city ?? "") && Math.abs((act.startLng ?? 0) - seg.startLng) > 0.5) continue;
      const segPts = JSON.parse(seg.points) as [number, number][];
      const m = matchSegment(points, { start: [seg.startLng, seg.startLat], end: [seg.endLng, seg.endLat], points: segPts });
      if (m) {
        const prevBest = await db.segmentEffort.findFirst({
          where: { segmentId: seg.id, athleteId: viewerId },
          orderBy: { timeS: "asc" },
        });
        const effort = await db.segmentEffort.create({
          data: {
            segmentId: seg.id, athleteId: viewerId, activityId: act.id,
            timeS: m.timeS, avgSpeed: seg.distanceM / m.timeS, avgHr, date: startDate,
            isPR: !prevBest || m.timeS < prevBest.timeS,
          },
        });
        newEffortIds.push(effort.id);
        matchedSegments.push(seg.id);
        if (!prevBest || m.timeS < prevBest.timeS) {
          await db.notification.create({
            data: { recipientId: viewerId, type: "segment_record", activityId: act.id, text: `New personal record on ${seg.name}` },
          });
        }
      }
    }
  }
  // leaderboard ranks count public efforts only
  await rerankSegments(matchedSegments);
  await evaluateChallenges(viewerId);

  const card = await activityCard({ ...act, kudos: [], _count: { kudos: 0, comments: 0, efforts: newEffortIds.length } }, viewerId, { poly: false });
  return json({ activity: { ...card, polyline: points ? points.map((p) => [p.lng, p.lat]) : null } });
}

// PATCH /api/activities/:id
export async function updateActivity(id: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const act = await db.activity.findUnique({ where: { id } });
  if (!act || act.athleteId !== viewerId) return err(404, "Activity not found");
  const b = body ?? {};
  const data: any = {};
  if (b.title !== undefined) data.title = b.title ? String(b.title).slice(0, 120) : null;
  if (b.description !== undefined) data.description = b.description ? String(b.description).slice(0, 2000) : null;
  if (b.visibility !== undefined && VISIBILITIES.includes(b.visibility)) data.visibility = b.visibility;
  if (b.gearId !== undefined) {
    data.gearId = b.gearId ? String(b.gearId) : null;
    if (data.gearId && !(await db.gear.findFirst({ where: { id: data.gearId, athleteId: viewerId }, select: { id: true } }))) {
      return err(400, "Unknown gear");
    }
  }
  if (b.isCommute !== undefined) data.isCommute = !!b.isCommute;
  if (b.perceivedEffort !== undefined) {
    data.perceivedEffort = b.perceivedEffort ? Math.max(1, Math.min(10, Math.round(Number(b.perceivedEffort) || 1))) : null;
    // a new rating changes the load unless heart rate already measured it
    if (act.effortSource !== "hr") {
      const me = await db.athlete.findUnique({ where: { id: viewerId }, select: { maxHr: true, birthday: true } });
      const effort = trainingLoad({ sport: act.sport, movingS: act.movingTimeS, perceivedEffort: data.perceivedEffort, maxHr: maxHrOf(me ?? {}) });
      data.relativeEffort = effort.load;
      data.effortSource = effort.source;
    }
  }
  await db.activity.update({ where: { id }, data });
  if (data.gearId !== undefined) await refreshGearDistance([act.gearId, data.gearId]);
  if (data.visibility !== undefined && data.visibility !== act.visibility) await rerankSegmentsOf(id);
  return json({ ok: true });
}

async function rerankSegmentsOf(activityId: string) {
  const efforts = await db.segmentEffort.findMany({ where: { activityId }, select: { segmentId: true } });
  await rerankSegments(efforts.map((e) => e.segmentId));
}

// DELETE /api/activities/:id
export async function deleteActivity(id: string, viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const act = await db.activity.findUnique({ where: { id }, include: { efforts: { select: { segmentId: true } } } });
  if (!act || act.athleteId !== viewerId) return err(404, "Activity not found");
  await db.activity.delete({ where: { id } });
  await refreshGearDistance([act.gearId]);
  await rerankSegments(act.efforts.map((e) => e.segmentId));
  return json({ ok: true });
}

// POST /api/activities/:id/kudos { on?: boolean } — gives kudos (on: false takes
// it back); repeating a request changes nothing
export async function giveKudos(id: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const act = await visibleActivity(id, viewerId);
  if (!act) return err(404, "Activity not found");
  if (body?.on === false) {
    await db.kudos.deleteMany({ where: { activityId: id, athleteId: viewerId } });
    return json({ hasKudos: false });
  }
  const { count } = await db.kudos.createMany({ data: [{ activityId: id, athleteId: viewerId }], skipDuplicates: true });
  if (count > 0 && act.athleteId !== viewerId) {
    await db.notification.create({ data: { recipientId: act.athleteId, actorId: viewerId, type: "kudos", activityId: id } });
  }
  return json({ hasKudos: true });
}

// GET /api/activities/:id/comments — list
export async function listComments(id: string, viewerId: string | null): Promise<Response> {
  const act = await visibleActivity(id, viewerId);
  if (!act) return err(404, "Activity not found");
  const rows = await db.comment.findMany({
    where: { activityId: id },
    include: { athlete: true },
    orderBy: { createdAt: "asc" },
  });
  return json({
    comments: rows.map((c) => ({
      id: c.id, text: c.text, createdAt: c.createdAt.toISOString(),
      athlete: {
        id: c.athlete.id, firstName: c.athlete.firstName, lastName: c.athlete.lastName,
        avatarColor: c.athlete.avatarColor, city: c.athlete.city, country: c.athlete.country,
        bio: c.athlete.bio, premium: c.athlete.premium,
      },
    })),
  });
}

// POST /api/activities/:id/comments
export async function addComment(id: string, viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const act = await visibleActivity(id, viewerId);
  if (!act) return err(404, "Activity not found");
  const text = String(body?.text ?? "").trim();
  if (!text) return err(400, "Comment text required");
  const row = await db.comment.create({
    data: { activityId: id, athleteId: viewerId, text: text.slice(0, 500) },
    include: { athlete: true },
  });
  if (act.athleteId !== viewerId) {
    await db.notification.create({ data: { recipientId: act.athleteId, actorId: viewerId, type: "comment", activityId: id } });
  }
  return json({
    comment: {
      id: row.id, text: row.text, createdAt: row.createdAt.toISOString(),
      athlete: {
        id: row.athlete.id, firstName: row.athlete.firstName, lastName: row.athlete.lastName,
        avatarColor: row.athlete.avatarColor, city: row.athlete.city, country: row.athlete.country,
        bio: row.athlete.bio, premium: row.athlete.premium,
      },
    },
  });
}

// GET /api/activities/:id/gpx — download your own activity as a GPX 1.1 file.
// A GPX is the full-resolution, timestamped track, so only its owner gets it.
export async function exportGpx(id: string, viewerId: string | null): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const act = await visibleActivity(id, viewerId);
  if (!act || act.athleteId !== viewerId) return err(404, "Activity not found");
  if (!act.track) return err(404, "This activity has no GPS track to export");
  const track = decodeTrack(act.track.points);
  if (track.length < 2) return err(422, "Track too short to export");

  const startMs = act.startDate.getTime();
  const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
  const name = esc(act.title ?? `${act.sport.replace(/_/g, " ")} activity`);
  const iso = (t: number) => new Date(startMs + t * 1000).toISOString();
  // live heart rate (Garmin TrackPointExtension) and power (<power>, which
  // Strava and Garmin read) per point when we have them
  const hrAt = sampler(parseSeries(act.track.hrPoints));
  const powerAt = sampler(parseSeries(act.track.powerPoints));
  const pauses = parsePauses(act.track.pauses) ?? [];
  // every manual pause starts a new <trkseg>, so importers don't bridge the gap
  const segs: string[][] = [[]];
  let pi = 0;
  for (const [i, p] of track.entries()) {
    if (i > 0) {
      let crossed = false;
      while (pi < pauses.length && pauses[pi][0] < p.t) {
        if (pauses[pi][1] > track[i - 1].t) crossed = true;
        pi++;
      }
      if (crossed) segs.push([]);
    }
    const hr = hrAt(p.t);
    const watts = powerAt(p.t);
    const ext =
      hr != null || watts != null
        ? `<extensions>` +
          (watts != null ? `<power>${watts}</power>` : "") +
          (hr != null ? `<gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension>` : "") +
          `</extensions>`
        : "";
    segs[segs.length - 1].push(
      `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">` +
        `<ele>${p.ele.toFixed(1)}</ele>` +
        `<time>${iso(p.t)}</time>` +
        ext +
        `</trkpt>`
    );
  }
  const trksegs = segs.map((rows) => `    <trkseg>\n${rows.join("\n")}\n    </trkseg>`).join("\n");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="STRIDE" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n` +
    `  <metadata>\n    <name>${name}</name>\n    <time>${track[0].t ? iso(track[0].t) : new Date(startMs).toISOString()}</time>\n  </metadata>\n` +
    `  <trk>\n    <name>${name}</name>\n    <type>${act.sport}</type>\n${trksegs}\n  </trk>\n` +
    `</gpx>\n`;
  const file = `stride-${act.startDate.toISOString().slice(0, 10)}-${act.id.slice(-4)}.gpx`;
  return new Response(xml, {
    headers: {
      "content-type": "application/gpx+xml; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
