"use client";
// GPX 1.1 parser for activity import — client-side, zero deps.
// Track format matches the server: [lng, lat, ele, t] with t = seconds since first point.
import { trackStats, type Pause } from "@/lib/geo";

export interface GpxPoint {
  lng: number;
  lat: number;
  ele: number;
  t: number; // seconds since the first point
}

export interface GpxImport {
  name: string | null;
  type: string | null; // <trk><type>, e.g. "running", "cycling", "ride"
  points: GpxPoint[]; // downsampled to MAX_POINTS
  pauses: Pause[]; // gaps between <trkseg>s — devices start a new segment on pause
  hrSeries: [number, number][] | null; // [t, bpm] from TrackPointExtension
  powerSeries: [number, number][] | null; // [t, watts] from <power>
  rawCount: number;
  startMs: number; // epoch ms of the first point
  distanceM: number; // same motion model the server applies on save
  movingS: number;
  durationS: number;
  eleGainM: number;
}

const MAX_POINTS = 4000;

// first descendant element with this local name, regardless of namespace prefix
function childByLocalName(el: Element, name: string): Element | null {
  const all = el.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) if (all[i].localName === name) return all[i];
  return null;
}

/** Parse a GPX file's XML text. Throws user-friendly errors. */
export function parseGpx(xml: string): GpxImport {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This file is not valid GPX/XML.");

  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length < 2) nodes = Array.from(doc.getElementsByTagName("rtept"));
  if (nodes.length < 2) throw new Error("No track points found — a GPX with a <trkseg> route is required.");

  const raw: { lng: number; lat: number; ele: number; absMs: number; seg: Element | null; hr: number; watts: number }[] = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute("lat") ?? "");
    const lng = parseFloat(n.getAttribute("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const ele = parseFloat(n.getElementsByTagName("ele")[0]?.textContent ?? "");
    const timeText = (n.getElementsByTagName("time")[0]?.textContent ?? "").trim();
    const ext = n.getElementsByTagName("extensions")[0];
    const hr = ext ? parseFloat(childByLocalName(ext, "hr")?.textContent ?? "") : NaN;
    const watts = ext ? parseFloat((childByLocalName(ext, "power") ?? childByLocalName(ext, "PowerInWatts"))?.textContent ?? "") : NaN;
    raw.push({
      lng, lat, ele: isFinite(ele) ? ele : NaN, absMs: timeText ? Date.parse(timeText) : NaN,
      seg: n.parentElement?.localName === "trkseg" ? n.parentElement : null, hr, watts,
    });
  }
  if (raw.length < 2) throw new Error("Track too short — at least 2 valid points are needed.");
  // missing elevation: carry the last known value rather than dropping to 0 m
  let lastEle = raw.find((p) => isFinite(p.ele))?.ele ?? 0;
  for (const p of raw) {
    if (isFinite(p.ele)) lastEle = p.ele;
    else p.ele = lastEle;
  }

  // Timestamps: if >= 90% of points carry <time>, interpolate the gaps; otherwise assume 1 s cadence.
  const timedCount = raw.filter((p) => isFinite(p.absMs)).length;
  const useTime = timedCount / raw.length >= 0.9;
  const absMs: number[] = raw.map((p) => (useTime ? p.absMs : NaN));
  if (useTime) {
    const known = raw.map((p, i) => (isFinite(p.absMs) ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < known.length - 1; k++) {
      const a = known[k], b = known[k + 1];
      if (b - a > 1) {
        const span = raw[b].absMs - raw[a].absMs;
        for (let i = a + 1; i < b; i++) absMs[i] = raw[a].absMs + (span * (i - a)) / (b - a);
      }
    }
    const firstKnown = known[0], lastKnown = known[known.length - 1];
    for (let i = 0; i < firstKnown; i++) absMs[i] = raw[firstKnown].absMs;
    for (let i = lastKnown + 1; i < raw.length; i++) absMs[i] = raw[lastKnown].absMs;
  }
  const base = useTime ? absMs[0] : Date.now();
  const rel: number[] = absMs.map((ms, i) => (useTime ? (ms - base) / 1000 : i));
  // enforce monotonic non-decreasing (GPS loggers occasionally emit out-of-order points)
  for (let i = 1; i < rel.length; i++) if (rel[i] < rel[i - 1]) rel[i] = rel[i - 1];

  // a new <trkseg> means the device was paused: nothing is counted across the gap
  const pauses: Pause[] = [];
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].seg !== raw[i - 1].seg && rel[i] > rel[i - 1]) pauses.push([rel[i - 1], rel[i]]);
  }

  // sensor series at full resolution (the server downsamples)
  const series = (key: "hr" | "watts", min: number, max: number) => {
    const out: [number, number][] = [];
    raw.forEach((p, i) => {
      const v = p[key];
      if (isFinite(v) && v >= min && v <= max) out.push([Math.round(rel[i] * 10) / 10, Math.round(v)]);
    });
    return out.length >= 8 ? out : null;
  };

  // Downsample dense tracks so the JSON payload stays reasonable — but never
  // drop the points on either side of a pause.
  const stride = Math.max(1, Math.ceil(raw.length / MAX_POINTS));
  const points: GpxPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const segEdge = i === raw.length - 1 || raw[i].seg !== raw[i + 1]?.seg || (i > 0 && raw[i].seg !== raw[i - 1].seg);
    if (i % stride !== 0 && !segEdge) continue;
    points.push({ lng: raw[i].lng, lat: raw[i].lat, ele: raw[i].ele, t: Math.round(rel[i] * 10) / 10 });
  }

  const stats = trackStats(points, pauses);
  const nameEl = doc.getElementsByTagName("name")[0];
  const name = nameEl?.textContent?.trim() || null;
  const typeEl = doc.getElementsByTagName("trk")[0]?.getElementsByTagName("type")[0];

  return {
    name,
    type: typeEl?.textContent?.trim().toLowerCase() || null,
    points,
    pauses,
    hrSeries: series("hr", 25, 255),
    powerSeries: series("watts", 0, 3000),
    rawCount: raw.length,
    startMs: base,
    distanceM: stats.distanceM,
    movingS: Math.round(stats.movingS),
    durationS: Math.round(rel[rel.length - 1]),
    eleGainM: Math.round(stats.elevationM),
  };
}
