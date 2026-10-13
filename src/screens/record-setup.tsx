"use client";
import React, { useState } from "react";
import { Satellite, ChevronDown, Plus, FileUp, Watch } from "lucide-react";
import { useNav } from "@/lib/nav";
import { useRecorder } from "@/lib/recorder";
import { ScreenHeader } from "@/components/app/shell";
import { SportIcon, SegmentedTabs } from "@/components/app/ui";
import { RECORD_SPORTS, sportOf } from "@/lib/sports";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const CATEGORIES: { id: string; label: string; sports: string[] }[] = [
  { id: "run", label: "Run", sports: ["run", "trail_run"] },
  { id: "ride", label: "Ride", sports: ["ride", "gravel", "mtb", "ebike", "virtual_ride"] },
  { id: "water", label: "Water", sports: ["swim", "open_water", "row", "kayak"] },
  { id: "snow", label: "Snow", sports: ["ski", "snowboard", "ice_skate"] },
  { id: "other", label: "Other", sports: ["walk", "hike", "workout", "gym", "yoga", "hiit", "tennis", "football", "basketball", "climb", "elliptical"] },
];

export function RecordSetupScreen() {
  const nav = useNav();
  const rec = useRecorder();
  const [cat, setCat] = useState("run");
  const [sport, setSport] = useState("run");
  const [autoPause, setAutoPause] = useState(true);
  const active = rec.state !== "idle";

  const gpsColor =
    rec.gpsStatus === "ok" ? "text-achievement" :
    rec.gpsStatus === "searching" ? "text-trophy" :
    rec.gpsStatus === "weak" ? "text-trophy" : "text-muted-foreground";

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Record"
        back={false}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav.push({ k: "importGpx" })}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-muted text-[12.5px] font-bold active:scale-95 transition-transform"
            >
              <FileUp size={15} /> GPX
            </button>
            <button onClick={() => nav.push({ k: "manual" })} className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-muted text-[12.5px] font-bold active:scale-95 transition-transform">
              <Plus size={15} /> Manual
            </button>
          </div>
        }
      />

      {active && (
        <button
          onClick={() => nav.push({ k: "recording" }, "record")}
          className="mx-4 mt-3 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <div className="flex-1 text-left">
            <div className="text-[13px] font-bold text-primary">{rec.state === "paused" ? "Paused" : "Recording"} — {sportOf(rec.sport).label}</div>
            <div className="tnum text-[12px] text-muted-foreground">{(rec.distanceM / 1000).toFixed(2)} km · {fmtDuration(rec.elapsedMs / 1000)}</div>
          </div>
          <span className="text-[12.5px] font-bold text-primary">Resume</span>
        </button>
      )}

      {/* sport picker */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Sport</div>
            <SegmentedTabs
              tabs={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
              value={cat}
              onChange={(id) => {
                setCat(id);
                setSport(CATEGORIES.find((c) => c.id === id)!.sports[0]);
              }}
              className="-mx-4 border-b-0"
            />
            <div className="grid grid-cols-4 gap-2 pt-3">
              {CATEGORIES.find((c) => c.id === cat)!.sports.map((s) => {
                const def = sportOf(s);
                return (
                  <button
                    key={s}
                    onClick={() => setSport(s)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all",
                      sport === s ? "border-primary bg-primary/5" : "border-border active:bg-muted"
                    )}
                    aria-pressed={sport === s}
                  >
                    <SportIcon sport={s} size={22} className={sport === s ? "text-primary" : "text-foreground"} />
                    <span className={cn("text-[10.5px] font-semibold leading-tight text-center px-1", sport === s ? "text-primary" : "text-muted-foreground")}>
                      {def.label.replace(" Bike", "").replace(" Mountain", "Mtn")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* options */}
          <div className="border-t border-border px-4 py-3 flex items-center gap-3">
            <Watch size={17} className="text-muted-foreground" />
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold">Auto-pause</div>
              <div className="text-[11.5px] text-muted-foreground">Pauses when you stop moving</div>
            </div>
            <button
              role="switch"
              aria-checked={autoPause}
              onClick={() => setAutoPause(!autoPause)}
              className={cn("w-11 h-6.5 rounded-full transition-colors relative h-6", autoPause ? "bg-primary" : "bg-muted")}
            >
              <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", autoPause ? "left-[22px]" : "left-0.5")} />
            </button>
          </div>
        </div>
      </div>

      {/* GPS status */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2.5 text-[12.5px]">
          <Satellite size={16} className={gpsColor} />
          {rec.gpsStatus === "ok" && <span className="text-achievement font-medium">GPS ready — accuracy ±{rec.gpsAccuracy}m</span>}
          {rec.gpsStatus === "searching" && <span className="text-trophy font-medium">Searching for GPS…</span>}
          {rec.gpsStatus === "weak" && <span className="text-trophy font-medium">Weak GPS signal</span>}
          {rec.gpsStatus === "off" && !active && (
            <span className="text-muted-foreground">
              {typeof navigator !== "undefined" && navigator.geolocation
                ? "GPS signal will be acquired when you start"
                : "GPS unavailable on this device"}
            </span>
          )}
          {rec.gpsStatus === "off" && active && <span className="text-muted-foreground">Waiting for GPS signal…</span>}
        </div>
      </div>

      <div className="flex-1" />

      {/* start button */}
      <div className="px-6 pb-24 pt-4">
        <button
          onClick={() => { rec.start(sport, autoPause); nav.push({ k: "recording" }, "record"); }}
          className="w-full h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center gap-3 font-extrabold text-[17px] tracking-[0.2em] active:scale-[0.97] transition-transform"
          style={{ boxShadow: "0 10px 24px -8px color-mix(in srgb, #fc4c02 60%, transparent)" }}
        >
          <span className="w-3.5 h-3.5 rounded-full bg-primary-foreground" />
          START
        </button>
        <p className="text-center text-[11px] text-muted-foreground mt-3">
          Uses your phone&apos;s GPS. Keep the screen on while recording.
        </p>
      </div>
    </div>
  );
}
