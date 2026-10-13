"use client";
import React, { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, MapPin, Mountain, Route as RouteIcon, Timer, Upload, TriangleAlert, Check } from "lucide-react";
import { useNav } from "@/lib/nav";
import { useToast } from "@/hooks/use-toast";
import { ScreenHeader } from "@/components/app/shell";
import { SportIcon } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { parseGpx, type GpxImport } from "@/lib/gpx";
import { sportOf } from "@/lib/sports";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const IMPORT_SPORTS = ["run", "trail_run", "ride", "gravel", "mtb", "walk", "hike", "swim", "row", "workout", "yoga", "ski"];

const VISIBILITIES = [
  { id: "everyone", label: "Everyone" },
  { id: "followers", label: "Followers" },
  { id: "only_me", label: "Only you" },
];

export function ImportGpxScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [gpx, setGpx] = useState<GpxImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sport, setSport] = useState("run");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("everyone");
  const [saving, setSaving] = useState(false);

  const pick = () => fileRef.current?.click();

  const onFile = async (f: File | null) => {
    if (!f) return;
    setError(null);
    if (!/\.gpx$/i.test(f.name) && f.type !== "application/gpx+xml" && f.type !== "application/xml" && f.type !== "text/xml") {
      setError("Please choose a .gpx file.");
      return;
    }
    setReading(true);
    try {
      const text = await f.text();
      const parsed = parseGpx(text);
      setGpx(parsed);
      setFileName(f.name);
      setTitle(parsed.name ?? f.name.replace(/\.gpx$/i, "").replace(/[-_]/g, " "));
      setSport(/ride|bik|cycl/i.test(parsed.name ?? "") ? "ride" : /hike/i.test(parsed.name ?? "") ? "hike" : "run");
    } catch (e: any) {
      setGpx(null);
      setError(e?.message ?? "Could not read this GPX file.");
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    if (!gpx) return;
    setSaving(true);
    try {
      const res = await api.post<{ activity: { id: string } }>("activities", {
        sport,
        title: title.trim() || gpx.name || null,
        startDate: new Date(gpx.startMs).toISOString(),
        tzOffsetMin: -new Date(gpx.startMs).getTimezoneOffset(),
        track: gpx.points.map((p) => [p.lng, p.lat, p.ele, p.t]),
        visibility,
        deviceName: "GPX import",
      });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      toast({ description: "Activity imported from GPX" });
      nav.reset("home", { k: "feed" });
      nav.push({ k: "activity", id: res.activity.id });
    } catch (e: any) {
      toast({ description: e?.message ?? "Import failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Import GPX" />
      <input
        ref={fileRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void onFile(f);
          e.target.value = "";
        }}
      />

      {!gpx ? (
        <div className="px-4 pt-4">
          <button
            onClick={pick}
            disabled={reading}
            className="w-full flex flex-col items-center gap-3 py-12 rounded-xl border-2 border-dashed border-border active:bg-muted transition-colors"
          >
            {reading ? (
              <Loader2 size={34} className="animate-spin text-primary" />
            ) : (
              <span className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload size={28} className="text-primary" />
              </span>
            )}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[15px] font-bold">{reading ? "Reading file…" : "Choose a GPX file"}</span>
              <span className="text-[12px] text-muted-foreground text-center px-8">
                Exported from Strava, Garmin, COROS, Suunto, Apple Watch or any GPX device
              </span>
            </div>
          </button>
          {error && (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2.5">
              <TriangleAlert size={16} /> {error}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pt-4 flex flex-col gap-4 pb-24">
          {/* summary card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileUp size={18} className="text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold truncate">{fileName}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {gpx.rawCount.toLocaleString()} GPS points{gpx.rawCount > gpx.points.length ? ` (sampled to ${gpx.points.length})` : ""}
                </div>
              </div>
              <button
                onClick={() => { setGpx(null); setError(null); }}
                className="text-[12px] font-bold text-primary active:scale-95 transition-transform"
              >
                Change
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-3">
              {[
                { icon: RouteIcon, v: `${(gpx.distanceM / 1000).toFixed(2)} km`, l: "Distance" },
                { icon: Timer, v: fmtDuration(gpx.durationS), l: "Time" },
                { icon: Mountain, v: `${gpx.eleGainM} m`, l: "Elev gain" },
                { icon: MapPin, v: new Date(gpx.startMs).toLocaleDateString(undefined, { month: "short", day: "numeric" }), l: "Date" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col items-center gap-0.5">
                  <s.icon size={15} className="text-muted-foreground" />
                  <span className="tnum text-[13px] font-bold">{s.v}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* title */}
          <div>
            <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Morning Run"
              className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* sport */}
          <div>
            <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Sport</label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {IMPORT_SPORTS.map((s) => {
                const def = sportOf(s);
                return (
                  <button
                    key={s}
                    onClick={() => setSport(s)}
                    aria-pressed={sport === s}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-all",
                      sport === s ? "border-primary bg-primary/5" : "border-border active:bg-muted"
                    )}
                  >
                    <SportIcon sport={s} size={20} className={sport === s ? "text-primary" : "text-foreground"} />
                    <span className={cn("text-[10px] font-semibold leading-tight text-center px-1", sport === s ? "text-primary" : "text-muted-foreground")}>
                      {def.label.replace(" Mountain", "Mtn")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* visibility */}
          <div>
            <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Visibility</label>
            <div className="mt-2 flex gap-2">
              {VISIBILITIES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVisibility(v.id)}
                  className={cn(
                    "flex-1 h-10 rounded-lg border text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-all",
                    visibility === v.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground active:bg-muted"
                  )}
                >
                  {visibility === v.id && <Check size={14} />}
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={submit}
            disabled={saving}
            className="w-full h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center gap-2 font-extrabold text-[16px] active:scale-[0.97] transition-transform disabled:opacity-60"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : null}
            Import Activity
          </button>
        </div>
      )}
    </div>
  );
}
