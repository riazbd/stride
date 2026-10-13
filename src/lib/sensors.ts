"use client";
import { create } from "zustand";
import { useRecorder } from "./recorder";

// Web Bluetooth LE sensor manager — heart-rate straps (0x180D) and
// cycling speed & cadence sensors (0x1816), exactly like Strava's
// "Connect Devices" but running live in the browser.

export type SensorStatus = "idle" | "connecting" | "connected" | "disconnected" | "unsupported";

export const ZONE_NAMES = ["Endurance", "Moderate", "Tempo", "Threshold", "Anaerobic"];
export const ZONE_COLORS = ["#6fb59c", "#5f9c88", "#e0a355", "#e07838", "#d5302a"];

export function hrZoneIndex(hr: number, maxHr = 190): number {
  const f = hr / Math.max(100, maxHr);
  if (f < 0.6) return 0;
  if (f < 0.7) return 1;
  if (f < 0.8) return 2;
  if (f < 0.9) return 3;
  return 4;
}

export function bluetoothSupported(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && "bluetooth" in navigator;
}

interface HrmState {
  status: SensorStatus;
  name: string | null;
  hr: number | null;
  rrMs: number | null;
  batteryPct: number | null;
  lastBeatAt: number | null;
  contact: boolean | null;
  error: string | null;
}

interface CscState {
  status: SensorStatus;
  name: string | null;
  cadence: number | null;
  speedKmh: number | null;
  batteryPct: number | null;
  error: string | null;
}

interface SensorsState {
  hrm: HrmState;
  csc: CscState;
  wheelCircM: number; // bike wheel circumference for speed math
  connectHrm: () => Promise<void>;
  disconnectHrm: () => void;
  connectCsc: () => Promise<void>;
  disconnectCsc: () => void;
  setWheelCircM: (m: number) => void;
}

// ── module-level (non-reactive) GATT refs ────────────────────────────────────
let hrmDevice: any = null;
let hrmWanted = false;
let hrmRetries = 0;
let cscDevice: any = null;
let cscWanted = false;
let cscRetries = 0;
let lastCrankRevs: number | null = null;
let lastCrankTime: number | null = null;
let lastWheelRevs: number | null = null;
let lastWheelTime: number | null = null;

const PREFS_KEY = "stride.sensorPrefs";
function savePrefs(p: { hrmName?: string | null; cscName?: string | null; wheelCircM?: number }) {
  try {
    const cur = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...p }));
  } catch { /* ignore */ }
}
function readPrefs(): { hrmName: string | null; cscName: string | null; wheelCircM: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { hrmName: p.hrmName ?? null, cscName: p.cscName ?? null, wheelCircM: typeof p.wheelCircM === "number" ? p.wheelCircM : 2.105 };
  } catch { return { hrmName: null, cscName: null, wheelCircM: 2.105 }; }
}

// ── Heart-rate measurement (0x2A37) parsing ──────────────────────────────────
// flags: bit0 HR uint16, bit1-2 sensor contact, bit3 energy expended, bit4 RR-intervals
function onHrmValue(ev: any) {
  try {
    const dv: DataView = ev.target.value;
    const flags = dv.getUint8(0);
    let off = 1;
    const hr = flags & 0x01 ? dv.getUint16(off, true) : dv.getUint8(off);
    off += flags & 0x01 ? 2 : 1;
    if (flags & 0x08) off += 2; // energy expended (kJ)
    let rrMs: number | null = null;
    if (flags & 0x10 && off + 1 < dv.byteLength) rrMs = Math.round(dv.getUint16(off, true) * (1000 / 1024));
    if (hr >= 25 && hr <= 255) {
      useRecorder.getState().noteHr(hr);
      useSensors.setState((s) => ({
        hrm: { ...s.hrm, hr, rrMs, lastBeatAt: Date.now(), contact: flags & 0x04 ? true : flags & 0x02 ? false : null },
      }));
    }
  } catch { /* malformed packet */ }
}

async function readBattery(server: any): Promise<number | null> {
  try {
    const svc = await server.getPrimaryService("battery_service");
    const chr = await svc.getCharacteristic("battery_level");
    const v = await chr.readValue();
    return v.getUint8(0);
  } catch { return null; }
}

function onHrmDisconnect() {
  if (!hrmWanted) {
    useSensors.setState((s) => ({ hrm: { ...s.hrm, status: "idle", hr: null, contact: null } }));
    return;
  }
  // sensor dropped (out of range / sleep) — best-effort reconnect, 5 tries
  hrmRetries++;
  if (hrmRetries > 5) {
    hrmWanted = false;
    useSensors.setState((s) => ({ hrm: { ...s.hrm, status: "disconnected", hr: null, error: "Strap disconnected — out of range?" } }));
    return;
  }
  useSensors.setState((s) => ({ hrm: { ...s.hrm, status: "connecting" } }));
  setTimeout(async () => {
    try {
      const server = await hrmDevice?.gatt?.connect();
      if (!server) throw new Error("gone");
      hrmRetries = 0;
      useSensors.setState((s) => ({ hrm: { ...s.hrm, status: "connected", error: null } }));
    } catch { onHrmDisconnect(); }
  }, 2500);
}

// ── CSC measurement (0x2A5B) parsing ─────────────────────────────────────────
// flags: bit0 wheel revs (uint32 + uint16 1/1024s), bit1 crank revs (uint16 + uint16)
function onCscValue(ev: any) {
  try {
    const dv: DataView = ev.target.value;
    const flags = dv.getUint8(0);
    let off = 1;
    let cadence: number | null = null;
    let speedKmh: number | null = null;
    const circ = useSensors.getState().wheelCircM;
    if (flags & 0x01 && off + 5 < dv.byteLength + 1) {
      const wheelRevs = dv.getUint32(off, true);
      const wheelTime = dv.getUint16(off + 4, true);
      off += 6;
      if (lastWheelRevs != null && lastWheelTime != null) {
        const dRev = (wheelRevs - lastWheelRevs + 0x100000000) % 0x100000000;
        let dT = (wheelTime - lastWheelTime + 0x10000) % 0x10000;
        if (dT > 0 && dRev < 4096) speedKmh = Math.round(((dRev * circ) / (dT / 1024)) * 3.6 * 10) / 10;
      }
      lastWheelRevs = wheelRevs;
      lastWheelTime = wheelTime;
    }
    if (flags & 0x02 && off + 3 < dv.byteLength + 1) {
      const crankRevs = dv.getUint16(off, true);
      const crankTime = dv.getUint16(off + 2, true);
      if (lastCrankRevs != null && lastCrankTime != null) {
        const dRev = (crankRevs - lastCrankRevs + 0x10000) % 0x10000;
        const dT = (crankTime - lastCrankTime + 0x10000) % 0x10000;
        if (dT > 0 && dRev < 4096) cadence = Math.round((dRev / (dT / 1024)) * 60);
      }
      lastCrankRevs = crankRevs;
      lastCrankTime = crankTime;
    }
    useSensors.setState((s) => ({ csc: { ...s.csc, cadence, speedKmh: speedKmh ?? s.csc.speedKmh } }));
  } catch { /* malformed packet */ }
}

function onCscDisconnect() {
  if (!cscWanted) {
    useSensors.setState((s) => ({ csc: { ...s.csc, status: "idle", cadence: null, speedKmh: null } }));
    return;
  }
  cscRetries++;
  if (cscRetries > 5) {
    cscWanted = false;
    useSensors.setState((s) => ({ csc: { ...s.csc, status: "disconnected", cadence: null, speedKmh: null, error: "Sensor disconnected — out of range?" } }));
    return;
  }
  useSensors.setState((s) => ({ csc: { ...s.csc, status: "connecting" } }));
  setTimeout(async () => {
    try {
      const server = await cscDevice?.gatt?.connect();
      if (!server) throw new Error("gone");
      cscRetries = 0;
      useSensors.setState((s) => ({ csc: { ...s.csc, status: "connected", error: null } }));
    } catch { onCscDisconnect(); }
  }, 2500);
}

const initialHrm: HrmState = { status: "idle", name: null, hr: null, rrMs: null, batteryPct: null, lastBeatAt: null, contact: null, error: null };
const initialCsc: CscState = { status: "idle", name: null, cadence: null, speedKmh: null, batteryPct: null, error: null };

export const useSensors = create<SensorsState>((set, get) => ({
  hrm: initialHrm,
  csc: initialCsc,
  wheelCircM: readPrefs().wheelCircM,

  connectHrm: async () => {
    const nav: any = typeof navigator === "undefined" ? null : navigator;
    if (!nav?.bluetooth) {
      set((s) => ({ hrm: { ...s.hrm, status: "unsupported", error: "This browser can't pair Bluetooth sensors" } }));
      return;
    }
    set((s) => ({ hrm: { ...s.hrm, status: "connecting", error: null } }));
    hrmWanted = true;
    hrmRetries = 0;
    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: ["heart_rate"] }],
        optionalServices: ["battery_service", "device_information"],
      });
      hrmDevice = device;
      device.addEventListener("gattserverdisconnected", onHrmDisconnect);
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService("heart_rate");
      const chr = await svc.getCharacteristic("heart_rate_measurement");
      await chr.startNotifications();
      chr.addEventListener("characteristicvaluechanged", onHrmValue);
      const batteryPct = await readBattery(server);
      hrmRetries = 0;
      set((s) => ({
        hrm: { ...s.hrm, status: "connected", name: device.name ?? "Heart-rate strap", batteryPct, error: null },
      }));
      savePrefs({ hrmName: device.name ?? "Heart-rate strap" });
    } catch (e: any) {
      hrmWanted = false;
      const msg = e?.name === "NotFoundError" ? "No device selected" : (e?.message ?? "Connection failed");
      set((s) => ({ hrm: { ...s.hrm, status: "idle", hr: null, error: msg } }));
    }
  },

  disconnectHrm: () => {
    hrmWanted = false;
    try { hrmDevice?.gatt?.disconnect(); } catch { /* ignore */ }
    set((s) => ({ hrm: { ...s.hrm, status: "idle", hr: null, rrMs: null, contact: null, lastBeatAt: null, batteryPct: null } }));
  },

  connectCsc: async () => {
    const nav: any = typeof navigator === "undefined" ? null : navigator;
    if (!nav?.bluetooth) {
      set((s) => ({ csc: { ...s.csc, status: "unsupported", error: "This browser can't pair Bluetooth sensors" } }));
      return;
    }
    set((s) => ({ csc: { ...s.csc, status: "connecting", error: null } }));
    cscWanted = true;
    cscRetries = 0;
    lastCrankRevs = null; lastCrankTime = null; lastWheelRevs = null; lastWheelTime = null;
    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: ["cycling_speed_and_cadence"] }],
        optionalServices: ["battery_service", "device_information"],
      });
      cscDevice = device;
      device.addEventListener("gattserverdisconnected", onCscDisconnect);
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService("cycling_speed_and_cadence");
      const chr = await svc.getCharacteristic("csc_measurement");
      await chr.startNotifications();
      chr.addEventListener("characteristicvaluechanged", onCscValue);
      const batteryPct = await readBattery(server);
      cscRetries = 0;
      set((s) => ({
        csc: { ...s.csc, status: "connected", name: device.name ?? "Speed & cadence", batteryPct, error: null },
      }));
      savePrefs({ cscName: device.name ?? "Speed & cadence" });
    } catch (e: any) {
      cscWanted = false;
      const msg = e?.name === "NotFoundError" ? "No device selected" : (e?.message ?? "Connection failed");
      set((s) => ({ csc: { ...s.csc, status: "idle", error: msg } }));
    }
  },

  disconnectCsc: () => {
    cscWanted = false;
    try { cscDevice?.gatt?.disconnect(); } catch { /* ignore */ }
    set((s) => ({ csc: { ...s.csc, status: "idle", cadence: null, speedKmh: null, batteryPct: null } }));
  },

  setWheelCircM: (m) => {
    const v = Math.max(1.5, Math.min(2.4, Math.round(m * 1000) / 1000));
    set({ wheelCircM: v });
    savePrefs({ wheelCircM: v });
  },
}));

// remembered last device names (for "reconnect Polar H10" hints)
export function rememberedHrmName(): string | null { return readPrefs().hrmName; }
export function rememberedCscName(): string | null { return readPrefs().cscName; }
