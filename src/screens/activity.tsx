"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MoreHorizontal, Mountain, Timer, Zap, Heart, Gauge, MapPin, Route, Trophy, ChevronRight, Play, Pause, Square, Mountain as MountainIcon } from "lucide-react";
import { api, Activity } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { ActivityMap, MapView } from "@/components/app/MapView";
import { AnalysisChart, SplitsChart, RouteThumb } from "@/components/app/charts";
import { Avatar, SportIcon, Badge, EmptyState } from "@/components/app/ui";
import { PremiumGate, usePremium } from "@/components/app/premium";
import { useUnits } from "@/components/app/cards";
import { fmtDist, distUnit, fmtDuration, fmtPace, fmtElev, paceOf, speedOf, longDate, timeOfDay, relativeDay, MI } from "@/lib/format";
import { sportOf } from "@/lib/sports";
import { haversineM } from "@/lib/geo";
import { cn } from "@/lib/utils";

export function ActivityScreen({ id }: { id: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const me = useUI((s) => s.me);
  const units = useUnits();
  const premium = usePremium();
  const [splitsOpen, setSplitsOpen] = useState(true);
  const [lapsOpen, setLapsOpen] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<"elevation" | "pace" | "hr" | "gap">("elevation");

  const { data, isLoading } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => api.get<{ activity: Activity & { hasTrack: boolean } }>(`activities/${id}`),
  });
  const analysis = useQuery({
    queryKey: ["activity-analysis", id],
    queryFn: () => api.get<any>(`activities/${id}/analysis`),
    enabled: !!data?.activity.hasTrack,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Activity" />
        <div className="p-4 flex flex-col gap-3">
          <div className="h-[230px] rounded-lg bg-muted animate-pulse" />
          <div className="h-24 rounded-lg bg-muted animate-pulse" />
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Activity" />
        <EmptyState icon={Route} title="Activity unavailable" body="It may have been deleted or is private." />
      </div>
    );
  }

  const a = data.activity;
  const def = sportOf(a.sport);
  const isMine = me?.id === a.athlete.id;
  const paceMode = def.paceMode;
  const isPaceSport = ["run", "trail_run", "walk", "hike"].includes(a.sport);
  const unitM = units === "km" ? 1000 : MI;
  const splitLabel = units === "km" ? "km" : "mi";
  const displaySplits = units === "mi" && a.track?.length ? mileSplitsOf(a.track, unitM) ?? analysis.data?.splits ?? a.splits ?? [] : analysis.data?.splits ?? a.splits ?? [];

  const openComments = () => nav.openSheet({ k: "commentBox", target: { activityId: a.id } });

  return (
    <div className="flex flex-col min-h-full pb-20">
      <ScreenHeader
        title="Activity"
        right={
          <button
            onClick={() => nav.openSheet({ k: "activityOptions", activityId: a.id })}
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted"
            aria-label="Activity options"
          >
            <MoreHorizontal size={20} />
          </button>
        }
      />

      {/* athlete header */}
      <button className="flex items-center gap-2.5 px-4 py-3" onClick={() => nav.push({ k: "profile", id: a.athlete.id })}>
        <Avatar athlete={a.athlete} size={44} />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold truncate">{a.athlete.firstName} {a.athlete.lastName}</span>
            {a.athlete.premium && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </div>
          <div className="text-[12px] text-muted-foreground">{relativeDay(a.startDate)} at {timeOfDay(a.startDate)}</div>
        </div>
      </button>

      {/* title */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SportIcon sport={a.sport} size={16} />
          <h1 className="text-[18px] font-bold leading-snug">{a.title ?? def.label}</h1>
          {a.visibility !== "everyone" && <Badge tone="muted">{a.visibility === "followers" ? "Followers" : "Only you"}</Badge>}
          {a.isCommute && <Badge tone="muted">Commute</Badge>}
        </div>
        {a.description && <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{a.description}</p>}
      </div>

      {/* map */}
      {a.polyline && a.polyline.length > 1 ? (
        <PlaybackMap polyline={a.polyline} movingTimeS={a.movingTimeS} distanceM={a.distanceM} paceMode={paceMode} units={units} />
      ) : (
        <div className="mx-4 mb-1 rounded-lg bg-muted h-20 flex flex-col items-center justify-center text-muted-foreground">
          <MapPin size={20} className="mb-1" />
          <span className="text-[12px] font-medium">Indoor / no GPS</span>
        </div>
      )}

      {/* achievements */}
      {a.achievements && a.achievements.length > 0 && (
        <div className="px-4 pt-3">
          <div className="bg-trophy/8 border border-trophy/25 rounded-lg p-3 flex flex-col gap-2">
            {a.achievements.slice(0, 4).map((ach, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-trophy/15 flex items-center justify-center text-trophy shrink-0">
                  <Trophy size={15} />
                </span>
                <div className="text-[13px]">
                  <b className="text-trophy">{ach.label}</b> <span className="text-muted-foreground">{ach.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* stats grid */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="grid grid-cols-2 gap-y-5">
            <BigStat label="Distance" value={fmtDist(a.distanceM, units)} sub={distUnit(units)} accent />
            <BigStat label="Moving Time" value={fmtDuration(a.movingTimeS)} accent />
            {paceMode === "pace" ? (
              <BigStat label="Avg Pace" value={fmtPace(paceOf(a.distanceM, a.movingTimeS, units))} sub={`/${splitLabel}`} />
            ) : (
              <BigStat label="Avg Speed" value={speedOf(a.distanceM, a.movingTimeS, units).toFixed(1)} sub={units === "km" ? "km/h" : "mph"} />
            )}
            {paceMode === "pace" && a.maxSpeed && a.sport === "ride" ? (
              <BigStat label="Max Speed" value={speedOf(a.distanceM / (a.movingTimeS / (a.distanceM / a.maxSpeed)), a.movingTimeS, units).toFixed(1)} sub={units === "km" ? "km/h" : "mph"} />
            ) : (
              <BigStat label="Elevation" value={fmtElev(a.elevationM, units)} />
            )}
            <BigStat label="Elapsed" value={fmtDuration(a.elapsedTimeS)} muted />
            {a.calories != null && <BigStat label="Calories" value={String(a.calories)} muted />}
            {a.avgHr != null && <BigStat label="Avg HR" value={`${a.avgHr}`} sub="bpm" muted />}
            {a.maxHr != null && <BigStat label="Max HR" value={`${a.maxHr}`} sub="bpm" muted />}
            {a.calories != null && a.avgHr != null && (
              <BigStat label="Relative Effort" value={String(a.relativeEffort ?? "—")} muted />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Gauge size={12} /> {a.deviceName}</span>
            {a.gear && <span className="flex items-center gap-1"><Trophy size={12} /> {a.gear.name}</span>}
          </div>
        </div>
      </div>

      {/* segment efforts */}
      {a.segmentEfforts && a.segmentEfforts.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Route size={13} /> {a.segmentEfforts.length} segment{a.segmentEfforts.length > 1 ? "s" : ""} on this activity
            </div>
            {a.segmentEfforts.map((e) => (
              <button
                key={e.id}
                className="flex w-full items-center gap-3 px-4 py-2.5 border-t border-border active:bg-muted text-left"
                onClick={() => nav.push({ k: "segment", slug: e.segment.slug })}
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <SportIcon sport={e.segment.sport} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate flex items-center gap-1.5">
                    {e.segment.name}
                    {e.isPR && <Badge tone="trophy">{e.rank === 1 ? (e.segment.sport === "ride" ? "KOM" : "CR") : "PR"}</Badge>}
                    {!e.isPR && e.rank && e.rank <= 3 && <Badge tone="achievement">#{e.rank}</Badge>}
                  </div>
                  <div className="tnum text-[11.5px] text-muted-foreground">{(e.segment.distanceM / 1000).toFixed(2)} km · {fmtDuration(e.timeS)}</div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* splits */}
      {displaySplits.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <button className="flex w-full items-center justify-between px-4 py-3" onClick={() => setSplitsOpen(!splitsOpen)}>
              <span className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Splits · {splitLabel}</span>
              {splitsOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {splitsOpen && (
              <>
                <div className="px-2">
                  <SplitsChart splits={displaySplits} units={units} />
                </div>
                <div className="flex flex-col">
                  {displaySplits.map((s: any) => {
                    const pace = s.timeS / Math.max(1, s.distanceM / 1000);
                    const zoneColor = Math.abs(s.paceZone);
                    return (
                      <div key={s.index} className="flex items-center gap-3 px-4 py-2 border-t border-border">
                        <span className="tnum w-8 text-[13px] font-bold text-primary">{s.index + 1}</span>
                        <span className="tnum text-[13px] w-20 font-medium">{fmtDist(s.distanceM, units, 2)} {splitLabel}</span>
                        <span className="tnum text-[13px] w-16 font-medium">{fmtDuration(s.timeS)}</span>
                        {paceMode === "pace" ? (
                          <span className="tnum text-[13px] flex-1 text-right font-medium">{fmtPace(units === "mi" ? s.timeS / Math.max(1, s.distanceM / unitM) : pace)} /{splitLabel}</span>
                        ) : (
                          <span className="tnum text-[13px] flex-1 text-right font-medium">{((s.distanceM / Math.max(1, s.timeS)) * 3.6).toFixed(1)} km/h</span>
                        )}
                        {s.avgHr && <span className="tnum text-[11px] text-muted-foreground w-14 text-right">{s.avgHr} bpm</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* laps */}
      {a.laps && a.laps.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <button className="flex w-full items-center justify-between px-4 py-3" onClick={() => setLapsOpen(!lapsOpen)}>
              <span className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Laps · {a.laps.length}</span>
              {lapsOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {lapsOpen && a.laps.map((l) => (
              <div key={l.index} className="flex items-center gap-3 px-4 py-2 border-t border-border">
                <span className="tnum w-8 text-[13px] font-bold text-primary">{l.index + 1}</span>
                <span className="tnum text-[13px] w-20 font-medium">{fmtDist(l.distanceM, units, 2)} {splitLabel}</span>
                <span className="tnum text-[13px] font-medium">{fmtDuration(l.timeS)}</span>
                {paceMode === "pace" && (
                  <span className="tnum text-[13px] flex-1 text-right font-medium">{fmtPace(l.timeS / Math.max(1, l.distanceM / 1000))} /km</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* analysis */}
      {a.hasTrack && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex border-b border-border">
              {([
                ["elevation", "Elevation"],
                ["pace", paceMode === "speed" ? "Speed" : "Pace"],
                ["hr", "Heart Rate"],
                ...(isPaceSport ? [["gap", "GAP"] as const] : []),
              ] as [any, string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setAnalysisTab(t)}
                  className={cn(
                    "flex-1 py-2.5 text-[12px] font-bold uppercase tracking-wide",
                    analysisTab === t ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"
                  )}
                >
                  {label}
                  {t === "gap" && !premium && <span className="text-[9px] text-primary ml-1">PRO</span>}
                </button>
              ))}
            </div>
            <div className="px-2 py-3">
              {analysis.isLoading ? (
                <div className="h-[130px] bg-muted animate-pulse rounded" />
              ) : analysisTab === "gap" && !premium ? (
                <div className="py-3">
                  <PremiumGate
                    compact
                    title="Grade-adjusted pace"
                    body="Your flat-equivalent pace on every hill — the true measure of effort."
                    feature="gap"
                  />
                </div>
              ) : analysis.data?.series?.length ? (
                <AnalysisChart series={analysis.data.series} kind={analysisTab} units={units} />
              ) : (
                <div className="h-[100px] flex items-center justify-center text-[12px] text-muted-foreground">No analysis data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* heart-rate zones (premium) */}
      {a.hasTrack && a.avgHr != null && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Heart size={13} /> Heart-rate zones</span>
              {!premium && <span className="text-[10px] font-extrabold text-primary uppercase tracking-wide">Pro</span>}
            </div>
            {analysis.data?.hrZones && premium ? (
              <div className="px-4 pb-4 flex flex-col gap-2.5">
                {(analysis.data.hrZones as { zone: number; name: string; range: string; timeS: number; pct: number }[]).map((z) => (
                  <div key={z.zone} className="flex items-center gap-3">
                    <span className="tnum w-4 text-[12px] font-bold text-foreground">Z{z.zone}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12px] font-semibold">{z.name}</span>
                        <span className="tnum text-[11px] text-muted-foreground">{z.range}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, z.pct * 2)}%`,
                            background: ["#6fb59c", "#5f9c88", "#e0a355", "#e07838", "#d5302a"][z.zone - 1],
                          }}
                        />
                      </div>
                    </div>
                    <span className="tnum text-[11.5px] text-muted-foreground w-14 text-right">{fmtDuration(z.timeS, "compact")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 pb-4">
                <PremiumGate
                  compact
                  title="Unlock zone analysis"
                  body={`Time in all 5 zones across this activity, based on a ${(analysis.data?.maxHr ?? 190)} bpm max.`}
                  feature="hrZones"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* avg GAP stat (premium) */}
      {isPaceSport && analysis.data?.avgGap && premium && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg px-4 py-3.5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <MountainIcon size={18} />
            </span>
            <div className="flex-1">
              <div className="text-[12px] uppercase tracking-wide font-bold text-muted-foreground">Avg grade-adjusted pace</div>
              <div className="tnum text-[20px] font-bold">{fmtPace(analysis.data.avgGap)} <span className="text-[12px] font-semibold text-muted-foreground">/{distUnit(units)}</span></div>
            </div>
            <div className="tnum text-[11.5px] text-muted-foreground text-right">
              <div className="font-semibold text-foreground">{fmtPace(paceOf(a.distanceM, a.movingTimeS, units))}</div>
              <div>actual pace</div>
            </div>
          </div>
        </div>
      )}

      {/* kudos + comments */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            className="flex w-full items-center gap-2 px-4 py-3 border-b border-border active:bg-muted"
            onClick={() => nav.openSheet({ k: "kudosList", activityId: a.id })}
          >
            <div className="flex -space-x-1.5">
              {(a.kudos ?? []).slice(0, 8).map((k) => (
                <Avatar key={k.id} athlete={k} size={24} ring />
              ))}
            </div>
            <span className="text-[13px] font-medium">{a.kudosCount} kudos</span>
          </button>
          <div className="flex flex-col">
            {(a.comments ?? []).map((c) => (
              <div key={c.id} className="flex gap-2.5 px-4 py-3 border-b border-border last:border-b-0">
                <Avatar athlete={c.athlete} size={32} />
                <div className="min-w-0 flex-1">
                  <button onClick={() => nav.push({ k: "profile", id: c.athlete.id })} className="text-[13px] font-semibold">
                    {c.athlete.firstName} {c.athlete.lastName}
                  </button>
                  <p className="text-[13px] leading-snug mt-0.5 break-words">{c.text}</p>
                </div>
              </div>
            ))}
            <button className="flex items-center gap-2.5 px-4 py-3 active:bg-muted" onClick={openComments}>
              <Avatar athlete={me} size={32} />
              <span className="text-[13px] text-muted-foreground">Add a comment…</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity playback map (Strava-style flyover) ───────────────────────────
function PlaybackMap({
  polyline, movingTimeS, distanceM, paceMode, units,
}: {
  polyline: [number, number][];
  movingTimeS: number;
  distanceM: number;
  paceMode: "pace" | "speed" | "time";
  units: "km" | "mi";
}) {
  const cum = useMemo(() => {
    const arr = [0];
    for (let i = 1; i < polyline.length; i++) arr.push(arr[i - 1] + haversineM(polyline[i - 1], polyline[i]));
    return arr;
  }, [polyline]);
  const totalM = cum[cum.length - 1] || 1;
  const DURATION_MS = 18000; // full playback in 18s

  const [progress, setProgress] = useState<number | null>(null); // null = not started
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const base = (progress ?? 0) * DURATION_MS;
    const startedAt = performance.now() - base;
    const tick = () => {
      const p = (performance.now() - startedAt) / DURATION_MS;
      if (p >= 1) {
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(p);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
     
  }, [playing]);

  // interpolate marker position along the route
  const pos = useMemo(() => {
    if (progress == null || progress <= 0) return null;
    const target = progress * totalM;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const f = Math.min(1, Math.max(0, (target - cum[lo]) / seg));
    return {
      lng: polyline[lo][0] + (polyline[hi][0] - polyline[lo][0]) * f,
      lat: polyline[lo][1] + (polyline[hi][1] - polyline[lo][1]) * f,
    };
  }, [progress, cum, polyline, totalM]);

  const stop = () => {
    setPlaying(false);
    setProgress(null);
  };

  const elapsedS = progress != null ? progress * movingTimeS : 0;
  const coveredM = progress != null ? progress * distanceM : 0;
  const last = polyline[polyline.length - 1];
  const isLoop = Math.abs(last[0] - polyline[0][0]) < 0.001 && Math.abs(last[1] - polyline[0][1]) < 0.001;
  const lines = useMemo(() => [{ id: "route", coordinates: polyline, color: "#fc4c02", width: 4 }], [polyline]);
  const markers = useMemo(() => {
    const m: { lng: number; lat: number; kind: "start" | "finish" }[] = [{ lng: polyline[0][0], lat: polyline[0][1], kind: "start" }];
    if (!isLoop) m.push({ lng: last[0], lat: last[1], kind: "finish" });
    return m;
  }, [polyline, isLoop, last]);

  return (
    <div className="relative">
      <MapView
        lines={lines}
        markers={markers}
        liveMarker={pos}
        height={260}
      />
      {/* playback controls */}
      <div className="absolute bottom-2 inset-x-2 flex items-center gap-2 pointer-events-auto">
        {progress != null && (
          <button
            onClick={stop}
            className="w-11 h-11 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg flex items-center justify-center text-foreground active:scale-95 transition-transform"
            aria-label="Stop playback"
          >
            <Square size={15} fill="currentColor" />
          </button>
        )}
        <button
          onClick={() => { if (progress != null && progress < 1) setPlaying(!playing); else { setProgress(0.0001); setPlaying(true); } }}
          className="w-11 h-11 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg flex items-center justify-center text-foreground active:scale-95 transition-transform"
          aria-label={playing ? "Pause playback" : "Play activity"}
        >
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
        </button>
        {progress != null && (
          <div className="flex-1 h-11 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg flex items-center justify-center gap-3 px-4">
            <span className="tnum text-[12.5px] font-bold">{fmtDuration(Math.round(elapsedS), "compact")}</span>
            <span className="tnum text-[12.5px] text-muted-foreground">{fmtDist(coveredM, units, 2)}</span>
            <span className="tnum text-[12.5px] font-semibold text-primary">
              {coveredM > 30
                ? paceMode === "pace"
                  ? fmtPace(paceOf(coveredM, elapsedS, units))
                  : `${speedOf(coveredM, elapsedS, units).toFixed(1)}`
                : "—"}
            </span>
          </div>
        )}
        {/* progress track */}
        <div className="absolute -top-0.5 inset-x-2 h-1 rounded-full overflow-hidden">
          <div className="h-full bg-primary/80" style={{ width: progress != null ? `${progress * 100}%` : "0%" }} />
        </div>
      </div>
    </div>
  );
}

function mileSplitsOf(track: [number, number, number, number][], unitM: number) {  let acc = 0, idx = 0, lastT = 0;
  const out: { index: number; distanceM: number; timeS: number; paceZone: number; elevationDiff: number }[] = [];
  for (let i = 1; i < track.length; i++) {
    const d = haversineM([track[i - 1][0], track[i - 1][1]], [track[i][0], track[i][1]]);
    const dt = track[i][3] - track[i - 1][3];
    const v = dt > 0 ? d / dt : 0;
    if (v > 0.55 && v < 25) acc += d;
    if (acc >= (idx + 1) * unitM) {
      out.push({ index: idx, distanceM: unitM, timeS: Math.round(track[i][3] - lastT), paceZone: 0, elevationDiff: 0 });
      lastT = track[i][3];
      idx++;
    }
  }
  if (acc > idx * unitM + 80) out.push({ index: idx, distanceM: Math.round(acc - idx * unitM), timeS: Math.round(lastT), paceZone: 0, elevationDiff: 0 });
  return out.length ? out : null;
}

function BigStat({ label, value, sub, accent, muted }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className={cn("tnum text-[22px] font-bold leading-none flex items-baseline gap-1", accent && "text-primary", muted && "text-muted-foreground")}>
        {value}
        {sub && <span className="text-[12px] font-semibold text-muted-foreground">{sub}</span>}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}
