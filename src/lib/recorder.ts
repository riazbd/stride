"use client";
import { create } from "zustand";
import { haversineM, elevationGain } from "@/lib/geo";

export interface RecPoint {
  lng: number;
  lat: number;
  ele: number;
  t: number; // seconds since start (elapsed clock)
}

export interface RecSplit {
  index: number;
  distanceM: number;
  timeS: number;
  elevationDiff: number;
  paceZone: number;
}

export interface RecDraft {
  sport: string;
  points: [number, number, number, number][];
  movingTimeS: number;
  elapsedTimeS: number;
  distanceM: number;
  elevationM: number;
  splits: RecSplit[];
  laps: { distanceM: number; timeS: number }[];
  startDate: string;
  avgHr: number | null;
  maxHr: number | null;
  hrSeries: [number, number][] | null; // [t, hr] samples from a live sensor
}

type GPSStatus = "off" | "searching" | "ok" | "weak";

interface RecorderState {
  state: "idle" | "recording" | "paused" | "finished";
  sport: string;
  points: RecPoint[];
  splits: RecSplit[];
  laps: { distanceM: number; timeS: number }[];
  startDate: number | null;
  elapsedMs: number;
  movingMs: number;
  distanceM: number;
  elevationM: number;
  currentSpeed: number;
  gpsStatus: GPSStatus;
  gpsAccuracy: number | null;
  autoPause: boolean;
  autoPaused: boolean;
  lastSplitAt: number; // epoch ms of last km split
  finishedDraft: RecDraft | null;
  _timer: any;
  _watch: number | null;
  _wakeLock: any;
  _hrSamples: { t: number; hr: number }[];
  noteHr: (hr: number) => void;
  _pauseAccumMs: number;
  _lastTickMs: number;
  _lastMoveAtMs: number;
  _eleHistory: number[];
  _prevSplitTimeS: number;
  start: (sport: string, autoPause: boolean) => void;
  pause: () => void;
  resume: () => void;
  addLap: () => void;
  finish: () => boolean; // builds and stores draft; false if nothing recorded
  buildDraft: () => RecDraft | null;
  discard: () => void;
  setAutoPause: (v: boolean) => void;
}

const AUTO_PAUSE_AFTER_MS = 8000;

function stopInternal() {
  const st = useRecorder.getState();
  if (st._timer) clearInterval(st._timer);
  if (st._watch != null && navigator.geolocation) navigator.geolocation.clearWatch(st._watch);
  try { st._wakeLock?.release?.(); } catch { /* noop */ }
  useRecorder.setState({ _timer: null, _watch: null, _wakeLock: null });
  document.removeEventListener("visibilitychange", onVisible);
}

function onVisible() {
  if (document.visibilityState === "visible" && useRecorder.getState().state === "recording") {
    const nav: any = navigator;
    nav.wakeLock?.request?.("screen").then((wl: any) => useRecorder.setState({ _wakeLock: wl })).catch(() => {});
  }
}

function startTicker() {
  const timer = setInterval(() => {
    const st = useRecorder.getState();
    if (st.state !== "recording") return;
    const now = Date.now();
    const dt = now - st._lastTickMs;
    const shouldAutoPause = st.autoPause && now - st._lastMoveAtMs > AUTO_PAUSE_AFTER_MS;
    const wasAutoPaused = st.autoPaused;
    useRecorder.setState({
      _lastTickMs: now,
      elapsedMs: now - (st.startDate ?? now) - st._pauseAccumMs,
      movingMs: shouldAutoPause ? st.movingMs : st.movingMs + dt,
      _pauseAccumMs: shouldAutoPause ? st._pauseAccumMs + dt : st._pauseAccumMs,
      autoPaused: shouldAutoPause,
      currentSpeed: shouldAutoPause ? 0 : st.currentSpeed,
    });
    if (shouldAutoPause !== wasAutoPaused) useRecorder.setState({ autoPaused: shouldAutoPause });
  }, 250);
  useRecorder.setState({ _timer: timer, _lastTickMs: Date.now() });
}

export const useRecorder = create<RecorderState>((set, get) => ({
  state: "idle",
  sport: "run",
  points: [],
  splits: [],
  laps: [],
  startDate: null,
  elapsedMs: 0,
  movingMs: 0,
  distanceM: 0,
  elevationM: 0,
  currentSpeed: 0,
  gpsStatus: "off",
  gpsAccuracy: null,
  autoPause: true,
  autoPaused: false,
  lastSplitAt: 0,
  finishedDraft: null,
  _timer: null,
  _watch: null,
  _wakeLock: null,
  _hrSamples: [],

  // called by the sensors store on every Bluetooth HR notification
  noteHr: (hr) => {
    const st = useRecorder.getState();
    if (st.state === "idle" || st.state === "finished") return;
    const t = Math.max(0, Math.round(((st.startDate ? Date.now() - st.startDate - st._pauseAccumMs : 0) / 1000) * 10) / 10);
    const prev = st._hrSamples[st._hrSamples.length - 1];
    if (prev && prev.t === t) {
      // same tenth-second — keep the freshest reading
      useRecorder.setState({ _hrSamples: [...st._hrSamples.slice(0, -1), { t, hr }] });
      return;
    }
    useRecorder.setState({ _hrSamples: [...st._hrSamples, { t, hr }] });
  },
  _pauseAccumMs: 0,
  _lastTickMs: 0,
  _lastMoveAtMs: 0,
  _eleHistory: [],
  _prevSplitTimeS: 0,

  start: (sport, autoPause) => {
    stopInternal();
    const now = Date.now();
    set({
      state: "recording", sport, points: [], splits: [], laps: [],
      startDate: now, elapsedMs: 0, movingMs: 0, distanceM: 0, elevationM: 0,
      currentSpeed: 0, gpsStatus: "searching", gpsAccuracy: null,
      autoPause, autoPaused: false,
      _pauseAccumMs: 0, _lastMoveAtMs: now, _eleHistory: [], _prevSplitTimeS: 0, _hrSamples: [],
    });

    const nav: any = navigator;
    if (nav.wakeLock?.request) {
      nav.wakeLock.request("screen").then((wl: any) => set({ _wakeLock: wl })).catch(() => {});
      document.addEventListener("visibilitychange", onVisible);
    }

    if (!navigator.geolocation) {
      set({ gpsStatus: "off" });
    } else {
      const watch = navigator.geolocation.watchPosition(
        (pos) => {
          const st = get();
          if (st.state === "idle") return;
          const { latitude, longitude, altitude, accuracy } = pos.coords;
          if (accuracy == null || accuracy > 50) {
            set({ gpsStatus: st.points.length ? "weak" : "searching", gpsAccuracy: accuracy ? Math.round(accuracy) : null });
            return;
          }
          const elapsedS = st.startDate ? (Date.now() - st.startDate - st._pauseAccumMs) / 1000 : 0;
          const point: RecPoint = {
            lng: longitude, lat: latitude,
            ele: altitude != null && !isNaN(altitude) ? altitude : 0,
            t: Math.max(0, Math.round(elapsedS * 10) / 10),
          };
          const prev = st.points[st.points.length - 1];
          if (!prev) {
            set({
              points: [point],
              gpsStatus: "ok",
              gpsAccuracy: Math.round(accuracy),
              _eleHistory: point.ele ? [point.ele] : [],
              _lastMoveAtMs: Date.now(),
            });
            return;
          }
          const d = haversineM([prev.lng, prev.lat], [point.lng, point.lat]);
          if (d <= 2 || d >= 80) {
            // stationary jitter or GPS teleport — don't extend the track
            set({ gpsStatus: "ok", gpsAccuracy: Math.round(accuracy) });
            return;
          }
          const dt = Math.max(0.1, point.t - prev.t);
          const speed = d / dt;
          set((cur) => {
            const points = [...cur.points, point];
            const eleHistory = point.ele ? [...cur._eleHistory, point.ele] : cur._eleHistory;
            const newDist = cur.distanceM + d;
            // live km splits
            const splits = [...cur.splits];
            let prevSplitTimeS = cur._prevSplitTimeS;
            let lastSplitAt = cur.lastSplitAt;
            if (Math.floor(newDist / 1000) > Math.floor(cur.distanceM / 1000)) {
              splits.push({
                index: splits.length,
                distanceM: 1000,
                timeS: Math.round(cur.movingMs / 1000 - cur._prevSplitTimeS),
                elevationDiff: Math.round(point.ele - (points[points.length - 2]?.ele ?? point.ele)),
                paceZone: 0,
              });
              prevSplitTimeS = cur.movingMs / 1000;
              lastSplitAt = Date.now();
              if (navigator.vibrate) navigator.vibrate(60);
            }
            return {
              points, eleHistory, splits,
              distanceM: newDist,
              currentSpeed: cur.currentSpeed * 0.7 + speed * 0.3,
              gpsStatus: "ok",
              gpsAccuracy: Math.round(accuracy),
              _lastMoveAtMs: Date.now(),
              _prevSplitTimeS: prevSplitTimeS,
              lastSplitAt,
            };
          });
        },
        () => {
          const st = get();
          set({ gpsStatus: st.points.length ? "weak" : "off" });
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
      );
      set({ _watch: watch });
    }
    startTicker();
  },

  pause: () => {
    const st = get();
    if (st.state !== "recording") return;
    if (st._timer) clearInterval(st._timer);
    set({ state: "paused", currentSpeed: 0, _timer: null, autoPaused: false });
  },

  resume: () => {
    const st = get();
    if (st.state !== "paused") return;
    const now = Date.now();
    set({ state: "recording", _lastMoveAtMs: now, autoPaused: false });
    startTicker();
  },

  addLap: () => {
    const st = get();
    if (st.state === "idle") return;
    set({ laps: [...st.laps, { distanceM: st.distanceM, timeS: Math.round(st.movingMs / 1000) }] });
  },

  setAutoPause: (v) => set({ autoPause: v }),

  finish: () => {
    const st = get();
    const draft = st.buildDraft();
    if (!draft) {
      st.discard();
      return false;
    }
    stopInternal();
    set({ state: "finished", finishedDraft: draft, currentSpeed: 0 });
    return true;
  },

  buildDraft: () => {
    const st = get();
    if (!st.points.length) return null;
    // precise splits recomputed from the track
    const splits: RecSplit[] = [];
    let acc = 0, idx = 0, splitStartEle = st.points[0].ele;
    let lastSplitEndT = 0;
    for (let i = 1; i < st.points.length; i++) {
      const a = st.points[i - 1], b = st.points[i];
      const d = haversineM([a.lng, a.lat], [b.lng, b.lat]);
      const dt = b.t - a.t;
      const v = dt > 0 ? d / dt : 0;
      if (v > 0.55 && v < 25) acc += d;
      if (acc >= (idx + 1) * 1000) {
        splits.push({
          index: idx, distanceM: 1000, timeS: Math.round(b.t - lastSplitEndT),
          elevationDiff: Math.round(b.ele - splitStartEle), paceZone: 0,
        });
        lastSplitEndT = b.t;
        splitStartEle = b.ele;
        idx++;
      }
    }
    const lastPartial = acc - idx * 1000;
    if (lastPartial > 80) {
      splits.push({
        index: idx, distanceM: Math.round(lastPartial),
        timeS: Math.round(st.movingMs / 1000 - lastSplitEndT),
        elevationDiff: Math.round(st.points[st.points.length - 1].ele - splitStartEle), paceZone: 0,
      });
    }
    if (splits.length > 2) {
      const paces = splits.map((s) => s.timeS / Math.max(1, s.distanceM)).sort((a, b) => a - b);
      const med = paces[Math.floor(paces.length / 2)];
      for (const s of splits) {
        s.paceZone = Math.max(-3, Math.min(3, Math.round(((med - s.timeS / Math.max(1, s.distanceM)) / med) * 10)));
      }
    }
    // live heart-rate stats from a connected Bluetooth strap
    const samples = st._hrSamples;
    const avgHr = samples.length >= 8 ? Math.round(samples.reduce((a, b) => a + b.hr, 0) / samples.length) : null;
    const maxHr = samples.length >= 8 ? Math.max(...samples.map((s) => s.hr)) : null;
    const hrSeries = samples.length >= 8 ? samples.map((s) => [s.t, s.hr] as [number, number]) : null;
    return {
      sport: st.sport,
      points: st.points.map((p) => [p.lng, p.lat, p.ele, p.t]),
      movingTimeS: Math.max(1, Math.round(st.movingMs / 1000)),
      elapsedTimeS: Math.max(1, Math.round(st.elapsedMs / 1000)),
      distanceM: st.distanceM,
      elevationM: elevationGain(st._eleHistory.length ? st._eleHistory : st.points.map((p) => p.ele)),
      splits,
      laps: st.laps,
      startDate: new Date(st.startDate ?? Date.now()).toISOString(),
      avgHr,
      maxHr,
      hrSeries,
    };
  },

  discard: () => {
    stopInternal();
    set({
      state: "idle", points: [], splits: [], laps: [], startDate: null,
      elapsedMs: 0, movingMs: 0, distanceM: 0, elevationM: 0, currentSpeed: 0,
      gpsStatus: "off", gpsAccuracy: null, autoPaused: false,
      _pauseAccumMs: 0, _eleHistory: [], _prevSplitTimeS: 0, _timer: null, _watch: null, _hrSamples: [],
      finishedDraft: null, lastSplitAt: 0,
    });
  },
}));
