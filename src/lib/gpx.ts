"use client";
// GPX 1.1 parser for activity import — client-side, zero deps.
// Track format matches the server: [lng, lat, ele, t] with t = seconds since first point.
import { haversineM, type LL } from "@/lib/geo";

export interface GpxPoint {
  lng: number;
  lat: number;
  ele: number;
  t: number; // seconds since the first point
}

export interface GpxImport {
  name: string | null;
  points: GpxPoint[]; // downsampled to MAX_POINTS
  rawCount: number;
  startMs: number; // epoch ms of the first point
  distanceM: number;
  durationS: number;
  eleGainM: number;
}

const MAX_POINTS = 4000;

/** Parse a GPX file's XML text. Throws user-friendly errors. */
export function parseGpx(xml: string): GpxImport {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This file is not valid GPX/XML.");

  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length < 2) nodes = Array.from(doc.getElementsByTagName("rtept"));
  if (nodes.length < 2) throw new Error("No track points found — a GPX with a <trkseg> route is required.");

  const raw: { lng: number; lat: number; ele: number; absMs: number }[] = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute("lat") ?? "");
    const lng = parseFloat(n.getAttribute("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const ele = parseFloat(n.getElementsByTagName("ele")[0]?.textContent ?? "");
    const timeText = (n.getElementsByTagName("time")[0]?.textContent ?? "").trim();
    raw.push({ lng, lat, ele: isFinite(ele) ? ele : 0, absMs: timeText ? Date.parse(timeText) : NaN });
  }
  if (raw.length < 2) throw new Error("Track too short — at least 2 valid points are needed.");

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
  let rel: number[] = absMs.map((ms, i) => (useTime ? (ms - base) / 1000 : i));
  // enforce monotonic non-decreasing (GPS loggers occasionally emit out-of-order points)
  for (let i = 1; i < rel.length; i++) if (rel[i] < rel[i - 1]) rel[i] = rel[i - 1];

  // Downsample dense tracks so the JSON payload stays reasonable.
  const stride = Math.max(1, Math.ceil(raw.length / MAX_POINTS));
  const points: GpxPoint[] = [];
  let distanceM = 0;
  let eleGain = 0;
  for (let i = 0; i < raw.length; i += stride) {
    const p: GpxPoint = { lng: raw[i].lng, lat: raw[i].lat, ele: raw[i].ele, t: Math.round(rel[i]) };
    if (points.length) {
      const prev = points[points.length - 1];
      distanceM += haversineM([prev.lng, prev.lat] as LL, [p.lng, p.lat] as LL);
      const dEle = p.ele - prev.ele;
      if (dEle > 0) eleGain += dEle;
    }
    points.push(p);
  }

  const nameEl = doc.getElementsByTagName("name")[0];
  const name = nameEl?.textContent?.trim() || null;

  return {
    name,
    points,
    rawCount: raw.length,
    startMs: base,
    distanceM,
    durationS: Math.round(rel[rel.length - 1]),
    eleGainM: Math.round(eleGain),
  };
}
