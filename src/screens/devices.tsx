"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { HeartPulse, Gauge, FileUp, Loader2, RefreshCw, BatteryMedium, Bluetooth, BluetoothOff, CircleDot, CircleDashed, Info } from "lucide-react";
import { useNav, useUI } from "@/lib/nav";
import { useSensors, ZONE_COLORS, ZONE_NAMES, hrZoneIndex, bluetoothSupported, rememberedHrmName, rememberedCscName } from "@/lib/sensors";
import { ScreenHeader } from "@/components/app/shell";
import { SegmentedTabs } from "@/components/app/ui";
import { cn } from "@/lib/utils";

const WHEELS = [
  { label: "700×25c", m: 2.111 },
  { label: "700×32c", m: 2.155 },
  { label: "29″ MTB", m: 2.218 },
  { label: "26″ MTB", m: 2.07 },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { dot: string; text: string; cls: string }> = {
    connected: { dot: "bg-achievement", text: "Connected", cls: "text-achievement" },
    connecting: { dot: "bg-trophy animate-pulse", text: "Pairing…", cls: "text-trophy" },
    disconnected: { dot: "bg-destructive", text: "Disconnected", cls: "text-destructive" },
    unsupported: { dot: "bg-muted-foreground", text: "Unsupported", cls: "text-muted-foreground" },
  };
  const s = map[status] ?? { dot: "bg-muted-foreground/40", text: "Not connected", cls: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11.5px] font-bold", s.cls)}>
      <span className={cn("w-2 h-2 rounded-full", s.dot)} />
      {s.text}
    </span>
  );
}

export function DevicesScreen() {
  const nav = useNav();
  const me = useUI((s) => s.me);
  const { hrm, csc, wheelCircM, connectHrm, disconnectHrm, connectCsc, disconnectCsc, setWheelCircM } = useSensors();
  const [wheelOpen, setWheelOpen] = useState(false);
  const supported = bluetoothSupported();
  const maxHr = me?.maxHr ?? 190;
  const lastHrm = rememberedHrmName();
  const lastCsc = rememberedCscName();

  const hrZone = hrm.hr ? hrZoneIndex(hrm.hr, maxHr) : null;

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Devices" />

      {!supported && (
        <div className="mx-4 mt-3 flex items-start gap-3 bg-trophy/10 border border-trophy/30 rounded-lg p-3.5">
          <BluetoothOff size={18} className="text-trophy shrink-0 mt-0.5" />
          <div className="text-[12px] leading-relaxed">
            <span className="font-bold text-trophy">Bluetooth pairing isn&apos;t available in this browser.</span>{" "}
            <span className="text-muted-foreground">Use Chrome or Edge on desktop, or Chrome on Android. On iPhone, sensors connect through your watch app instead — import its files below.</span>
          </div>
        </div>
      )}

      {/* ── Bluetooth sensors ─────────────────────────────────────────────── */}
      <div className="px-4 pt-5">
        <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Bluetooth sensors</div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* heart-rate strap */}
          <div className="p-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <HeartPulse size={20} className="text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold truncate">{hrm.name ?? "Heart-rate strap"}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {hrm.status === "connected"
                    ? hrm.name
                    : hrm.status === "connecting"
                      ? "Waiting for device…"
                      : hrm.status === "disconnected"
                        ? hrm.error ?? "Lost connection"
                        : lastHrm
                          ? `Reconnect ${lastHrm} · any BLE strap works`
                          : "Polar H10 · Garmin HRM-Dual · Wahoo TICKR"}
                </div>
              </div>
              {hrm.status === "connected" || hrm.status === "connecting" || hrm.status === "disconnected" ? (
                <button
                  onClick={hrm.status === "connected" ? disconnectHrm : connectHrm}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[12.5px] font-bold active:scale-95 transition-transform shrink-0",
                    hrm.status === "connected" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                  )}
                >
                  {hrm.status === "connecting" ? <Loader2 size={14} className="animate-spin" /> : hrm.status === "connected" ? <BluetoothOff size={14} /> : <RefreshCw size={14} />}
                  {hrm.status === "connected" ? "Disconnect" : hrm.status === "disconnected" ? "Reconnect" : "Pairing…"}
                </button>
              ) : (
                <button
                  onClick={connectHrm}
                  className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-bold active:scale-95 transition-transform shrink-0"
                >
                  <Bluetooth size={14} /> Connect
                </button>
              )}
            </div>

            {/* live reading */}
            {hrm.status === "connected" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="mt-4 flex items-center gap-4 rounded-lg bg-muted/60 border border-border p-4">
                  <motion.div
                    key={hrm.lastBeatAt ?? "static"}
                    initial={{ scale: 1.25, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45 }}
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${hrZone != null ? ZONE_COLORS[hrZone] : "#fc4c02"}22`, color: hrZone != null ? ZONE_COLORS[hrZone] : "#fc4c02" }}
                  >
                    <HeartPulse size={26} fill="currentColor" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="tnum text-[38px] font-extrabold leading-none tabular-nums" style={{ color: hrZone != null ? ZONE_COLORS[hrZone] : undefined }}>
                        {hrm.hr ?? "--"}
                      </span>
                      <span className="text-[13px] font-bold text-muted-foreground">bpm</span>
                    </div>
                    <div className="text-[11.5px] font-semibold text-muted-foreground mt-1 truncate">
                      {hrZone != null ? `Zone ${hrZone + 1} · ${ZONE_NAMES[hrZone]}` : "Waiting for first beat…"}
                      {hrm.batteryPct != null && <span className="ml-2 inline-flex items-center gap-1"><BatteryMedium size={12} />{hrm.batteryPct}%</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {[4, 3, 2, 1, 0].map((z) => (
                      <span key={z} className={cn("w-6 h-1.5 rounded-full transition-opacity", hrZone === z ? "opacity-100" : "opacity-25")} style={{ background: ZONE_COLORS[z] }} />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            {hrm.status === "idle" && hrm.error && hrm.error !== "No device selected" && (
              <div className="text-[11.5px] text-destructive mt-2">{hrm.error}</div>
            )}
          </div>

          {/* speed & cadence */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Gauge size={20} className="text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold truncate">{csc.name ?? "Speed & cadence"}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {csc.status === "connected"
                    ? csc.name
                    : csc.status === "connecting"
                      ? "Waiting for device…"
                      : csc.status === "disconnected"
                        ? csc.error ?? "Lost connection"
                        : lastCsc
                          ? `Reconnect ${lastCsc} · Garmin, Wahoo, Magene`
                          : "Cycling sensors · crank + wheel"}
                </div>
              </div>
              {csc.status === "connected" || csc.status === "connecting" || csc.status === "disconnected" ? (
                <button
                  onClick={csc.status === "connected" ? disconnectCsc : connectCsc}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[12.5px] font-bold active:scale-95 transition-transform shrink-0",
                    csc.status === "connected" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                  )}
                >
                  {csc.status === "connecting" ? <Loader2 size={14} className="animate-spin" /> : csc.status === "connected" ? <BluetoothOff size={14} /> : <RefreshCw size={14} />}
                  {csc.status === "connected" ? "Disconnect" : csc.status === "disconnected" ? "Reconnect" : "Pairing…"}
                </button>
              ) : (
                <button
                  onClick={connectCsc}
                  className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-bold active:scale-95 transition-transform shrink-0"
                >
                  <Bluetooth size={14} /> Connect
                </button>
              )}
            </div>

            {csc.status === "connected" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/60 border border-border p-3.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="tnum text-[28px] font-extrabold leading-none tabular-nums">{csc.cadence ?? "--"}</span>
                      <span className="text-[11px] font-bold text-muted-foreground">rpm</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">Cadence</div>
                  </div>
                  <div className="rounded-lg bg-muted/60 border border-border p-3.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="tnum text-[28px] font-extrabold leading-none tabular-nums">{csc.speedKmh ?? "--"}</span>
                      <span className="text-[11px] font-bold text-muted-foreground">km/h</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1 flex items-center gap-1">
                      Speed
                      {csc.batteryPct != null && <span className="ml-auto inline-flex items-center gap-0.5 font-bold"><BatteryMedium size={11} />{csc.batteryPct}%</span>}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <button
              onClick={() => setWheelOpen(!wheelOpen)}
              className="mt-3 flex items-center gap-2 w-full text-left text-[12px] font-semibold text-muted-foreground"
            >
              <CircleDashed size={13} />
              Wheel size: <span className="tnum font-bold text-foreground">{wheelCircM.toFixed(3)} m</span>
              <span className="ml-auto text-[11px]">needed for speed</span>
            </button>
            {wheelOpen && (
              <div className="grid grid-cols-4 gap-2 mt-2.5">
                {WHEELS.map((w) => (
                  <button
                    key={w.label}
                    onClick={() => setWheelCircM(w.m)}
                    className={cn(
                      "rounded-lg border py-2.5 flex flex-col items-center gap-0.5 transition-all active:scale-95",
                      Math.abs(wheelCircM - w.m) < 0.002 ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <span className={cn("text-[11px] font-bold", Math.abs(wheelCircM - w.m) < 0.002 ? "text-primary" : "text-foreground")}>{w.label}</span>
                    <span className="tnum text-[9.5px] text-muted-foreground">{w.m.toFixed(2)}m</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── watches & cycling computers (file-based) ───────────────────────── */}
      <div className="px-4 pt-6">
        <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Watches & cycling computers</div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button onClick={() => nav.push({ k: "importGpx" })} className="flex items-center gap-3 w-full px-4 py-4 text-left active:bg-muted transition-colors">
            <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <FileUp size={19} className="text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold">Import activity files</div>
              <div className="text-[11.5px] text-muted-foreground">Garmin · Coros · Suunto · Wahoo · Polar — upload .gpx exports with full GPS + HR data</div>
            </div>
          </button>
          <div className="border-t border-border px-4 py-3 flex items-center gap-2.5">
            <Info size={15} className="text-muted-foreground shrink-0" />
            <div className="text-[11.5px] text-muted-foreground leading-relaxed">
              Every STRIDE activity can be exported back as .gpx from its detail page — round-trip your data to any platform.
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground leading-relaxed">
          <CircleDot size={12} className="shrink-0" />
          Sensors stream live to your browser over Bluetooth — nothing is uploaded until you save an activity.
        </div>
      </div>
    </div>
  );
}
