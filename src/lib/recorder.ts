"use client";
import { create } from "zustand";
import { haversineM, trackStats, computeSplits, type Pause, type TrackPoint } from "@/lib/geo";
import { saveRecording, loadRecording, clearRecording } from "@/lib/rec-store";

export interface RecPoint {
  lng: number;
  lat: number;
  ele: number;
  t: number; // seconds since start on the wall clock (elapsed, pauses included)
}

export interface RecSplit {
  index: number;
  distanceM: number;
  timeS: number;
  elevationDiff: number;
  paceZone: number;
}

export interface RecDraft {
  clientId: string; // lets the server recognise a retried upload of the same activity
  sport: string;
  points: [number, number, number, number][];
  pauses: Pause[];
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
  avgWatts: number | null;
  maxWatts: number | null;
  powerSeries: [number, number][] | null; // [t, watts] samples from a power meter
}

type GPSStatus = "off" | "searching" | "ok" | "weak";

interface RecorderState {
  state: "idle" | "recording" | "paused" | "finished";
  sport: string;
  points: RecPoint[];
  splits: RecSplit[];
  laps: { distanceM: number; timeS: number }[];
  startDate: number | null;
  elapsedMs: number; // wall clock since start, pauses included (Strava "elapsed")
  movingMs: number; // excludes manual and auto pauses
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
  _hrSamples: { t: number; v: number }[];
  _powerSamples: { t: number; v: number }[];
  noteHr: (hr: number) => void;
  notePower: (watts: number) => void;
  _pauses: Pause[];
  _pausedAtMs: number | null;
  _gapNext: boolean; // next fix starts a fresh stretch (first fix after a manual pause)
  _rejects: number; // consecutive fixes rejected as teleports
  _lastTickMs: number;
  _lastMoveAtMs: number;
  _lastEle: number | null;
  _eleRef: number | null;
  _prevSplitTimeS: number;
  _splitStartEle: number | null;
  _lapStart: { distanceM: number; timeS: number };
  _clientId: string;
  _lastPersistMs: number;
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
const ELE_THRESHOLD_M = 2; // same hysteresis as geo.elevationGain
const FOOT_SPORTS = ["run", "trail_run", "walk", "hike", "virtual_run"];

// fastest believable speed between two fixes — anything quicker is a GPS jump
const maxSpeedFor = (sport: string) => (FOOT_SPORTS.includes(sport) ? 12 : 40);

const elapsedS = (st: { startDate: number | null }, now = Date.now()) =>
  Math.max(0, Math.round(((now - (st.startDate ?? now)) / 1000) * 10) / 10);

function stopInternal() {
  const st = useRecorder.getState();
  if (st._timer) clearInterval(st._timer);
  if (st._watch != null && navigator.geolocation) navigator.geolocation.clearWatch(st._watch);
  try { st._wakeLock?.release?.(); } catch { /* noop */ }
  useRecorder.setState({ _timer: null, _watch: null, _wakeLock: null });
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("pagehide", persistNow);
}

function onVisible() {
  const st = useRecorder.getState();
  // the browser may freeze or kill a hidden tab: save before that happens
  if (document.visibilityState === "hidden") persistNow();
  if (document.visibilityState === "visible" && st.state === "recording") {
    const nav: any = navigator;
    nav.wakeLock?.request?.("screen").then((wl: any) => useRecorder.setState({ _wakeLock: wl })).catch(() => {});
  }
}

// ── Crash safety ─────────────────────────────────────────────────────────────
// Everything needed to carry on is written to IndexedDB every few seconds and
// on every pause, lap, finish and tab hide. Lost at most: the last 5 seconds.

const PERSIST_EVERY_MS = 5000;

const SNAPSHOT_KEYS = [
  "state", "sport", "points", "splits", "laps", "startDate", "elapsedMs", "movingMs", "distanceM",
  "elevationM", "autoPause", "lastSplitAt", "finishedDraft", "_hrSamples", "_powerSamples", "_pauses",
  "_pausedAtMs", "_lastEle", "_eleRef", "_prevSplitTimeS", "_splitStartEle", "_lapStart", "_clientId",
] as const;

type Snapshot = Pick<RecorderState, (typeof SNAPSHOT_KEYS)[number]> & { v: 1; savedAtMs: number };

function persistNow() {
  const st = useRecorder.getState();
  if (st.state === "idle") return;
  const snap: any = { v: 1, savedAtMs: Date.now() };
  for (const k of SNAPSHOT_KEYS) snap[k] = st[k];
  useRecorder.setState({ _lastPersistMs: snap.savedAtMs });
  void saveRecording(snap);
}

// On app start: bring back an activity a closed or crashed tab left behind.
// A recording comes back paused at the moment it was last saved (the time the
// app was gone counts as paused); a finished one comes back ready to upload.
// Returns where to send the athlete, or null when there's nothing to recover.
export async function recoverRecording(): Promise<"recording" | "saveActivity" | null> {
  if (useRecorder.getState().state !== "idle") return null;
  const snap = await loadRecording<Snapshot>();
  if (!snap || snap.v !== 1) return null;
  const { v: _v, savedAtMs, ...rest } = snap;
  if (rest.state === "finished") {
    if (!rest.finishedDraft) { await clearRecording(); return null; }
    useRecorder.setState({ ...rest, state: "finished" });
    return "saveActivity";
  }
  if (rest.state !== "recording" && rest.state !== "paused") return null;
  if (!rest.points.length) { await clearRecording(); return null; }
  const pausedAt = rest.state === "paused" && rest._pausedAtMs ? rest._pausedAtMs : savedAtMs;
  useRecorder.setState({ ...rest, state: "paused", _pausedAtMs: pausedAt, currentSpeed: 0, autoPaused: false, gpsStatus: "searching" });
  startGps();
  startTicker();
  return "recording";
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ticks while recording *and* paused, so elapsed time keeps running like Strava's
function startTicker() {
  const timer = setInterval(() => {
    const st = useRecorder.getState();
    if (st.state !== "recording" && st.state !== "paused") return;
    const now = Date.now();
    const dt = now - st._lastTickMs;
    const recording = st.state === "recording";
    const autoPaused = recording && st.autoPause && now - st._lastMoveAtMs > AUTO_PAUSE_AFTER_MS;
    useRecorder.setState({
      _lastTickMs: now,
      elapsedMs: now - (st.startDate ?? now),
      movingMs: recording && !autoPaused ? st.movingMs + dt : st.movingMs,
      autoPaused,
      currentSpeed: recording && !autoPaused ? st.currentSpeed : 0,
    });
    if (now - st._lastPersistMs >= PERSIST_EVERY_MS) persistNow();
  }, 250);
  useRecorder.setState({ _timer: timer, _lastTickMs: Date.now() });
  window.addEventListener("pagehide", persistNow);
  document.addEventListener("visibilitychange", onVisible);
}

function startGps() {
  const get = useRecorder.getState;
  const set = useRecorder.setState;
  if (!navigator.geolocation) {
    set({ gpsStatus: "off" });
    return;
  }
  const watch = navigator.geolocation.watchPosition(
    (pos) => {
      const st = get();
      if (st.state === "idle" || st.state === "finished") return;
      const { latitude, longitude, altitude, accuracy } = pos.coords;
      if (accuracy == null || accuracy > 50) {
        set({ gpsStatus: st.points.length ? "weak" : "searching", gpsAccuracy: accuracy ? Math.round(accuracy) : null });
        return;
      }
      const gps = { gpsStatus: "ok" as GPSStatus, gpsAccuracy: Math.round(accuracy) };
      // paused: keep the GPS warm but record nothing
      if (st.state === "paused") { set(gps); return; }

      const now = Date.now();
      // devices that only sometimes report altitude would otherwise drop to 0 m
      const ele = altitude != null && Number.isFinite(altitude) ? altitude : (st._lastEle ?? 0);
      const point: RecPoint = { lng: longitude, lat: latitude, ele, t: elapsedS(st, now) };
      const prev = st.points[st.points.length - 1];

      // first fix, or first fix after a manual pause: a fresh stretch, no distance
      if (!prev || st._gapNext) {
        set({
          ...gps,
          points: [...st.points, point],
          _gapNext: false, _rejects: 0, _lastMoveAtMs: now,
          _lastEle: ele, _eleRef: st._eleRef ?? ele, _splitStartEle: st._splitStartEle ?? ele,
        });
        return;
      }

      const d = haversineM([prev.lng, prev.lat], [point.lng, point.lat]);
      const dt = Math.max(0.5, point.t - prev.t);
      const teleport = d / dt > maxSpeedFor(st.sport);
      // a jump is rejected — unless 5 fixes in a row disagree with the last
      // accepted one, in which case *that* fix was the bad one: re-anchor
      if (teleport && st._rejects < 5) { set({ ...gps, _rejects: st._rejects + 1 }); return; }
      // stationary wander: wait until we've clearly moved past the noise
      const minStep = Math.max(3, Math.min(10, accuracy * 0.5));
      if (!teleport && d < minStep) { set({ ...gps, _rejects: 0 }); return; }

      set((cur) => {
        const points = [...cur.points, point];
        const step = teleport ? 0 : d;
        const newDist = cur.distanceM + step;
        // live elevation gain with the same hysteresis as the server
        let elevationM = cur.elevationM;
        let eleRef = cur._eleRef ?? ele;
        if (ele - eleRef >= ELE_THRESHOLD_M) { elevationM += ele - eleRef; eleRef = ele; }
        else if (ele - eleRef <= -ELE_THRESHOLD_M) eleRef = ele;
        // live km splits
        const splits = [...cur.splits];
        let { _prevSplitTimeS: prevSplitTimeS, lastSplitAt, _splitStartEle: splitStartEle } = cur;
        if (Math.floor(newDist / 1000) > Math.floor(cur.distanceM / 1000)) {
          splits.push({
            index: splits.length,
            distanceM: 1000,
            timeS: Math.round(cur.movingMs / 1000 - prevSplitTimeS),
            elevationDiff: Math.round(ele - (splitStartEle ?? ele)),
            paceZone: 0,
          });
          prevSplitTimeS = cur.movingMs / 1000;
          splitStartEle = ele;
          lastSplitAt = now;
          if (navigator.vibrate) navigator.vibrate(60);
        }
        return {
          ...gps,
          points, splits, elevationM,
          distanceM: newDist,
          currentSpeed: teleport ? cur.currentSpeed : cur.currentSpeed * 0.7 + (d / dt) * 0.3,
          _rejects: 0,
          _lastMoveAtMs: now,
          _lastEle: ele,
          _eleRef: eleRef,
          _prevSplitTimeS: prevSplitTimeS,
          _splitStartEle: splitStartEle,
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

function seriesStats(samples: { t: number; v: number }[]) {
  if (samples.length < 8) return { avg: null, max: null, series: null };
  return {
    avg: Math.round(samples.reduce((a, b) => a + b.v, 0) / samples.length),
    max: Math.max(...samples.map((s) => s.v)),
    series: samples.map((s) => [s.t, s.v] as [number, number]),
  };
}

// append a live sensor reading, keeping only the freshest one per tenth-second
function pushSample(samples: { t: number; v: number }[], t: number, v: number) {
  const prev = samples[samples.length - 1];
  if (prev && prev.t === t) return [...samples.slice(0, -1), { t, v }];
  return [...samples, { t, v }];
}

const idle = {
  state: "idle" as const, points: [], splits: [], laps: [], startDate: null,
  elapsedMs: 0, movingMs: 0, distanceM: 0, elevationM: 0, currentSpeed: 0,
  gpsStatus: "off" as GPSStatus, gpsAccuracy: null, autoPaused: false,
  lastSplitAt: 0, finishedDraft: null,
  _hrSamples: [], _powerSamples: [], _pauses: [], _pausedAtMs: null, _gapNext: false, _rejects: 0,
  _lastEle: null, _eleRef: null, _prevSplitTimeS: 0, _splitStartEle: null,
  _lapStart: { distanceM: 0, timeS: 0 },
  _clientId: "", _lastPersistMs: 0,
};

export const useRecorder = create<RecorderState>((set, get) => ({
  ...idle,
  sport: "run",
  autoPause: true,
  _timer: null,
  _watch: null,
  _wakeLock: null,
  _lastTickMs: 0,
  _lastMoveAtMs: 0,

  // called by the sensors store on every Bluetooth notification
  noteHr: (hr) => {
    const st = get();
    if (st.state !== "recording") return;
    set({ _hrSamples: pushSample(st._hrSamples, elapsedS(st), hr) });
  },
  notePower: (watts) => {
    const st = get();
    if (st.state !== "recording") return;
    set({ _powerSamples: pushSample(st._powerSamples, elapsedS(st), watts) });
  },

  start: (sport, autoPause) => {
    stopInternal();
    const now = Date.now();
    set({ ...idle, state: "recording", sport, startDate: now, gpsStatus: "searching", autoPause, _lastMoveAtMs: now, _clientId: newClientId() });

    const nav: any = navigator;
    nav.wakeLock?.request?.("screen").then((wl: any) => set({ _wakeLock: wl })).catch(() => {});

    startGps();
    startTicker();
  },

  pause: () => {
    const st = get();
    if (st.state !== "recording") return;
    set({ state: "paused", currentSpeed: 0, autoPaused: false, _pausedAtMs: Date.now() });
    persistNow();
  },

  resume: () => {
    const st = get();
    const now = Date.now();
    if (st.state === "recording" && st.autoPaused) {
      // manual override of an auto-pause
      set({ autoPaused: false, _lastMoveAtMs: now });
      return;
    }
    if (st.state !== "paused") return;
    const from = elapsedS(st, st._pausedAtMs ?? now);
    const to = elapsedS(st, now);
    set({
      state: "recording",
      autoPaused: false,
      _lastMoveAtMs: now,
      _pausedAtMs: null,
      _pauses: to > from ? [...st._pauses, [from, to]] : st._pauses,
      _gapNext: true,
    });
    persistNow();
  },

  addLap: () => {
    const st = get();
    if (st.state === "idle" || st.state === "finished") return;
    const timeS = Math.round(st.movingMs / 1000);
    set({
      laps: [...st.laps, { distanceM: st.distanceM - st._lapStart.distanceM, timeS: timeS - st._lapStart.timeS }],
      _lapStart: { distanceM: st.distanceM, timeS },
    });
    persistNow();
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
    // kept on the phone until the upload succeeds (discard() clears it)
    persistNow();
    return true;
  },

  buildDraft: () => {
    const st = get();
    if (!st.points.length) return null;
    const now = Date.now();
    const pauses: Pause[] = [...st._pauses];
    if (st.state === "paused" && st._pausedAtMs != null) pauses.push([elapsedS(st, st._pausedAtMs), elapsedS(st, now)]);
    const pts: TrackPoint[] = st.points;
    // same motion model the server will apply, so the save screen matches the saved activity
    const stats = pts.length > 1 ? trackStats(pts, pauses) : null;
    const splits: RecSplit[] = computeSplits(pts, 1000, pauses).map(({ index, distanceM, timeS, elevationDiff, paceZone }) => ({
      index, distanceM, timeS: Math.round(timeS), elevationDiff: Math.round(elevationDiff), paceZone,
    }));
    const movingTimeS = Math.round(st.movingMs / 1000);
    // close the final lap so laps add up to the whole activity
    const laps = st.laps.length
      ? [...st.laps, { distanceM: st.distanceM - st._lapStart.distanceM, timeS: movingTimeS - st._lapStart.timeS }].filter((l) => l.timeS > 0)
      : [];
    const hr = seriesStats(st._hrSamples);
    const power = seriesStats(st._powerSamples);
    return {
      clientId: st._clientId,
      sport: st.sport,
      points: pts.map((p) => [p.lng, p.lat, p.ele, p.t]),
      pauses,
      movingTimeS: Math.max(1, Math.round(stats?.movingS ?? movingTimeS)),
      elapsedTimeS: Math.max(1, Math.round((now - (st.startDate ?? now)) / 1000)),
      distanceM: stats?.distanceM ?? st.distanceM,
      elevationM: stats?.elevationM ?? Math.round(st.elevationM),
      splits,
      laps,
      startDate: new Date(st.startDate ?? now).toISOString(),
      avgHr: hr.avg,
      maxHr: hr.max,
      hrSeries: hr.series,
      avgWatts: power.avg,
      maxWatts: power.max,
      powerSeries: power.series,
    };
  },

  discard: () => {
    stopInternal();
    set({ ...idle, _timer: null, _watch: null });
    void clearRecording();
  },
}));
