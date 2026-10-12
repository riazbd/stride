"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Pause, Play, Trash2, Flag, Satellite, ChevronUp } from "lucide-react";
import { useNav } from "@/lib/nav";
import { useRecorder } from "@/lib/recorder";
import { MapView } from "@/components/app/MapView";
import { sportOf } from "@/lib/sports";
import { fmtDist, fmtDuration, fmtPace, MI } from "@/lib/format";
import { useUnits } from "@/components/app/cards";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function RecordingScreen() {
  const rec = useRecorder();
  const nav = useNav();
  const units = useUnits();
  const [mapExpanded, setMapExpanded] = useState(false);
  const def = sportOf(rec.sport);
  const paceMode = def.paceMode;
  const unitM = units === "km" ? 1000 : MI;

  const lastPoint = rec.points[rec.points.length - 1] ?? null;
  const follow = lastPoint ? { lng: lastPoint.lng, lat: lastPoint.lat } : null;
  const line = rec.points.map((p) => [p.lng, p.lat] as [number, number]);

  const dist = rec.distanceM;
  const elapsed = rec.elapsedMs / 1000;
  const moving = rec.movingMs / 1000;
  const currentPace = rec.currentSpeed > 0.6 ? unitM / rec.currentSpeed : 0;
  const avgPace = dist > 20 && moving > 5 ? moving / (dist / unitM) : 0;
  const currentSpeedKmh = rec.currentSpeed * 3.6;
  const lastSplit = rec.splits[rec.splits.length - 1];
  // flash the latest split for 3.5s after it happens (ticker re-renders 4x/s)
  const flash = rec.lastSplitAt && Date.now() - rec.lastSplitAt < 3500 ? rec.splits.length : null;

  const finish = () => {
    const ok = rec.finish();
    if (!ok) {
      nav.reset("record", { k: "recordSetup" });
      return;
    }
    nav.push({ k: "saveActivity" }, "record");
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* live map */}
      <div className={cn("relative transition-all duration-300 shrink-0", mapExpanded ? "h-[100dvh]" : "h-[38dvh] min-h-[240px]")}>
        <MapView
          lines={line.length > 1 ? [{ id: "live", coordinates: line, color: "#fc4c02", width: 4.5 }] : undefined}
          markers={lastPoint ? [{ lng: lastPoint.lng, lat: lastPoint.lat, kind: "me" }] : []}
          follow={follow}
          height="100%"
          fitTo="none"
          interactive={true}
        />
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <button
            onClick={() => { nav.pop(); }}
            className="w-9 h-9 rounded-full bg-background/90 backdrop-blur border border-border flex items-center justify-center shadow-sm"
            aria-label="Minimize"
          >
            <ChevronDown size={20} />
          </button>
          <div className="h-9 flex items-center gap-1.5 px-3 rounded-full bg-background/90 backdrop-blur border border-border shadow-sm">
            <Satellite size={13} className={rec.gpsStatus === "ok" ? "text-achievement" : "text-trophy"} />
            <span className="text-[11px] font-bold">{rec.gpsStatus === "ok" ? `±${rec.gpsAccuracy}m` : rec.gpsStatus === "searching" ? "GPS…" : "no GPS"}</span>
          </div>
          {rec.autoPaused && (
            <div className="h-9 flex items-center px-3 rounded-full bg-trophy/90 text-background text-[11px] font-bold shadow-sm animate-pulse">
              AUTO-PAUSED
            </div>
          )}
        </div>
        <button
          onClick={() => setMapExpanded(!mapExpanded)}
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-background/90 backdrop-blur border border-border flex items-center justify-center shadow-sm"
          aria-label={mapExpanded ? "Collapse map" : "Expand map"}
        >
          {mapExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {/* metrics */}
      <div className={cn("flex-1 flex flex-col min-h-0 transition-opacity", mapExpanded && "opacity-0 pointer-events-none")}>
        <div className="px-6 pt-5 flex items-baseline justify-between">
          <div>
            <div className="tnum text-[44px] font-extrabold leading-none tracking-tight tabular-nums">
              {paceMode === "pace" ? fmtDist(dist, units, 2) : fmtDist(dist, units, 2)}
              <span className="text-[16px] font-bold text-muted-foreground ml-1">{units === "km" ? "km" : "mi"}</span>
            </div>
            <div className="text-[12px] text-muted-foreground font-medium mt-1">{def.label}</div>
          </div>
          <div className="text-right">
            <div className="tnum text-[28px] font-bold leading-none">{fmtDuration(elapsed)}</div>
            <div className="tnum text-[11px] text-muted-foreground font-medium mt-1">
              moving {fmtDuration(moving)}
            </div>
          </div>
        </div>

        {/* secondary metrics */}
        <div className="px-6 pt-6 grid grid-cols-2 gap-y-4">
          {paceMode === "pace" ? (
            <>
              <Metric label="Current pace" value={currentPace ? fmtPace(currentPace, false) : "--:--"} sub={`/${units === "km" ? "km" : "mi"}`} />
              <Metric label="Avg pace" value={avgPace ? fmtPace(avgPace, false) : "--:--"} sub={`/${units === "km" ? "km" : "mi"}`} />
            </>
          ) : (
            <>
              <Metric label="Current speed" value={currentSpeedKmh ? currentSpeedKmh.toFixed(1) : "—"} sub={units === "km" ? "km/h" : "mph"} />
              <Metric label="Avg speed" value={dist > 20 && moving > 5 ? ((dist / moving) * 3.6).toFixed(1) : "—"} sub={units === "km" ? "km/h" : "mph"} />
            </>
          )}
          <Metric label="Elevation" value={String(Math.round(rec.elevationM))} sub="m gain" />
          <Metric label="Last split" value={lastSplit ? fmtPace(lastSplit.timeS / Math.max(1, lastSplit.distanceM / 1000), false) : "--:--"} sub={`/${units === "km" ? "km" : "mi"}`} />
        </div>

        {/* split flash */}
        {flash && lastSplit && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-6 mt-4 bg-trophy/10 border border-trophy/30 rounded-lg px-4 py-2.5 flex items-center justify-between"
          >
            <span className="text-[12px] font-bold text-trophy uppercase tracking-wide">Split {flash}</span>
            <span className="tnum text-[14px] font-bold text-trophy">{fmtDuration(lastSplit?.timeS ?? 0)} · {lastSplit ? fmtPace(lastSplit.timeS / Math.max(1, lastSplit.distanceM / 1000)) : ""}/{units === "km" ? "km" : "mi"}</span>
          </motion.div>
        )}

        <div className="flex-1 min-h-0" />

        {/* controls */}
        <div className="px-6 pb-8 pt-2">
          {rec.state === "recording" && !rec.autoPaused ? (
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={rec.addLap}
                className="w-14 h-14 rounded-full border-2 border-border flex flex-col items-center justify-center active:scale-95 transition-transform"
                aria-label="Add lap"
              >
                <Flag size={18} className="text-foreground" />
                <span className="text-[9px] font-bold text-muted-foreground mt-0.5">LAP</span>
              </button>
              <button
                onClick={rec.pause}
                className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
                style={{ boxShadow: "0 10px 24px -8px color-mix(in srgb, #fc4c02 60%, transparent)" }}
                aria-label="Pause"
              >
                <Pause size={30} fill="currentColor" />
              </button>
              <div className="w-14 h-14" />
            </div>
          ) : rec.autoPaused ? (
            <div className="flex items-center justify-center">
              <button
                onClick={() => { rec.setAutoPause(false); rec.resume(); setTimeout(() => useRecorder.getState().setAutoPause(true), 1000); }}
                className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Resume"
              >
                <Play size={30} fill="currentColor" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* slide to finish */}
              <SlideFinish onDone={finish} />
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={rec.resume}
                  className="w-16 h-16 rounded-full border-2 border-primary text-primary flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Resume"
                >
                  <Play size={24} fill="currentColor" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="w-16 h-16 rounded-full border-2 border-border text-muted-foreground flex flex-col items-center justify-center active:scale-95 transition-transform" aria-label="Discard">
                      <Trash2 size={20} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-w-[320px]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Discard activity?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the {(rec.distanceM / 1000).toFixed(2)} km you just recorded. This can&apos;t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep recording</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => { rec.discard(); nav.reset("record", { k: "recordSetup" }); }}
                      >
                        Discard
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="tnum text-[22px] font-bold leading-none flex items-baseline gap-1">
        {value}
        {sub && <span className="text-[11px] font-semibold text-muted-foreground">{sub}</span>}
      </div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function SlideFinish({ onDone }: { onDone: () => void }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const w = 300;
  return (
    <div ref={trackRef} className="slide-track relative w-full h-14 rounded-full bg-muted overflow-hidden select-none">
      <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
        {done ? "Finishing…" : "Slide to finish →"}
      </div>
      <motion.button
        drag="x"
        dragConstraints={{ left: 0, right: w }}
        dragElastic={0.02}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x > w * 0.72) {
            setDone(true);
            setTimeout(onDone, 350);
          }
        }}
        className="absolute left-0 top-0 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing touch-none"
        aria-label="Slide to finish"
      >
        <Flag size={22} fill="currentColor" />
      </motion.button>
    </div>
  );
}
