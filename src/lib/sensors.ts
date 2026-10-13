"use client";
import { create } from "zustand";
import { useRecorder } from "./recorder";

// Web Bluetooth LE sensor manager — heart-rate straps (0x180D), cycling
// speed & cadence sensors (0x1816) and power meters (0x1818), exactly like
// Strava's "Connect Devices" but running live in the browser.

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

interface PmState {
  status: SensorStatus;
  name: string | null;
  watts: number | null;
  cadence: number | null;
  batteryPct: number | null;
  error: string | null;
}

interface SensorsState {
  hrm: HrmState;
  csc: CscState;
  pm: PmState;
  wheelCircM: number; // bike wheel circumference for speed math
  connectHrm: () => Promise<void>;
  disconnectHrm: () => void;
  connectCsc: () => Promise<void>;
  disconnectCsc: () => void;
  connectPm: () => Promise<void>;
  disconnectPm: () => void;
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
let pmDevice: any = null;
let pmWanted = false;
let pmRetries = 0;
let pmLastCrankRevs: number | null = null;
let pmLastCrankTime: number | null = null;

const PREFS_KEY = "stride.sensorPrefs";
function savePrefs(p: { hrmName?: string | null; cscName?: string | null; pmName?: string | null; wheelCircM?: number }) {
  try {
    const cur = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...p }));
  } catch { /* ignore */ }
}
function readPrefs(): { hrmName: string | null; cscName: string | null; pmName: string | null; wheelCircM: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { hrmName: p.hrmName ?? null, cscName: p.cscName ?? null, pmName: p.pmName ?? null, wheelCircM: typeof p.wheelCircM === "number" ? p.wheelCircM : 2.105 };
  } catch { return { hrmName: null, cscName: null, pmName: null, wheelCircM: 2.105 }; }
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

// ── Cycling power measurement (0x2A63) parsing ───────────────────────────────
// flags uint16, instantaneous power sint16 (W), then optional fields in order:
// bit0 pedal balance (u8), bit2 accumulated torque (u16), bit4 wheel revs
// (u32 + u16), bit5 crank revs (u16 + u16 1/1024 s) — used for cadence
function onPmValue(ev: any) {
  try {
    const dv: DataView = ev.target.value;
    const flags = dv.getUint16(0, true);
    const watts = dv.getInt16(2, true);
    let off = 4;
    if (flags & 0x01) off += 1;
    if (flags & 0x04) off += 2;
    if (flags & 0x10) off += 6;
    let cadence: number | null | undefined;
    if (flags & 0x20 && off + 4 <= dv.byteLength) {
      const crankRevs = dv.getUint16(off, true);
      const crankTime = dv.getUint16(off + 2, true);
      if (pmLastCrankRevs != null && pmLastCrankTime != null) {
        const dRev = (crankRevs - pmLastCrankRevs + 0x10000) % 0x10000;
        const dT = (crankTime - pmLastCrankTime + 0x10000) % 0x10000;
        if (dT > 0 && dRev < 4096) cadence = Math.round((dRev / (dT / 1024)) * 60);
        else if (dRev === 0) cadence = 0; // coasting: no new crank event
      }
      pmLastCrankRevs = crankRevs;
      pmLastCrankTime = crankTime;
    }
    if (watts >= 0 && watts <= 3000) {
      useRecorder.getState().notePower(watts);
      useSensors.setState((s) => ({ pm: { ...s.pm, watts, cadence: cadence === undefined ? s.pm.cadence : cadence } }));
    }
  } catch { /* malformed packet */ }
}

function onPmDisconnect() {
  if (!pmWanted) {
    useSensors.setState((s) => ({ pm: { ...s.pm, status: "idle", watts: null, cadence: null } }));
    return;
  }
  pmRetries++;
  if (pmRetries > 5) {
    pmWanted = false;
    useSensors.setState((s) => ({ pm: { ...s.pm, status: "disconnected", watts: null, cadence: null, error: "Power meter disconnected — out of range?" } }));
    return;
  }
  useSensors.setState((s) => ({ pm: { ...s.pm, status: "connecting" } }));
  setTimeout(async () => {
    try {
      const server = await pmDevice?.gatt?.connect();
      if (!server) throw new Error("gone");
      pmRetries = 0;
      useSensors.setState((s) => ({ pm: { ...s.pm, status: "connected", error: null } }));
    } catch { onPmDisconnect(); }
  }, 2500);
}

const initialHrm: HrmState = { status: "idle", name: null, hr: null, rrMs: null, batteryPct: null, lastBeatAt: null, contact: null, error: null };
const initialCsc: CscState = { status: "idle", name: null, cadence: null, speedKmh: null, batteryPct: null, error: null };
const initialPm: PmState = { status: "idle", name: null, watts: null, cadence: null, batteryPct: null, error: null };

export const useSensors = create<SensorsState>((set, get) => ({
  hrm: initialHrm,
  csc: initialCsc,
  pm: initialPm,
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

  connectPm: async () => {
    const nav: any = typeof navigator === "undefined" ? null : navigator;
    if (!nav?.bluetooth) {
      set((s) => ({ pm: { ...s.pm, status: "unsupported", error: "This browser can't pair Bluetooth sensors" } }));
      return;
    }
    set((s) => ({ pm: { ...s.pm, status: "connecting", error: null } }));
    pmWanted = true;
    pmRetries = 0;
    pmLastCrankRevs = null; pmLastCrankTime = null;
    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: ["cycling_power"] }],
        optionalServices: ["battery_service", "device_information"],
      });
      pmDevice = device;
      device.addEventListener("gattserverdisconnected", onPmDisconnect);
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService("cycling_power");
      const chr = await svc.getCharacteristic("cycling_power_measurement");
      await chr.startNotifications();
      chr.addEventListener("characteristicvaluechanged", onPmValue);
      const batteryPct = await readBattery(server);
      pmRetries = 0;
      set((s) => ({
        pm: { ...s.pm, status: "connected", name: device.name ?? "Power meter", batteryPct, error: null },
      }));
      savePrefs({ pmName: device.name ?? "Power meter" });
    } catch (e: any) {
      pmWanted = false;
      const msg = e?.name === "NotFoundError" ? "No device selected" : (e?.message ?? "Connection failed");
      set((s) => ({ pm: { ...s.pm, status: "idle", error: msg } }));
    }
  },

  disconnectPm: () => {
    pmWanted = false;
    try { pmDevice?.gatt?.disconnect(); } catch { /* ignore */ }
    set((s) => ({ pm: { ...s.pm, status: "idle", watts: null, cadence: null, batteryPct: null } }));
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
export function rememberedPmName(): string | null { return readPrefs().pmName; }
