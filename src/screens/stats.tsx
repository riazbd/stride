"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Zap } from "lucide-react";
import { api, AthleteProfile } from "@/lib/api";
import { ScreenHeader } from "@/components/app/shell";
import { useUnits } from "@/components/app/cards";
import { WeeklyBars } from "@/components/app/charts";
import { fmtDist, distUnit, fmtDuration, fmtElev } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatsScreen({ id }: { id: string }) {
  const units = useUnits();
  const { data } = useQuery({
    queryKey: ["profile", id],
    queryFn: () => api.get<AthleteProfile>(`athletes/${id}`),
    enabled: !!id,
  });

  if (!data) return <div className="flex flex-col"><ScreenHeader title="Stats" /><div className="p-4"><div className="h-40 rounded-lg bg-muted animate-pulse" /></div></div>;
  const { stats, athlete } = data;
  const goal = 40;

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Stats" subtitle={`${athlete.firstName} ${athlete.lastName}`} />

      {/* totals */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-3">
            {[
              { label: "This week", s: stats.week },
              { label: "This year", s: stats.ytd },
              { label: "All time", s: stats.all },
            ].map((row, i) => (
              <div key={row.label} className={cn("py-4 px-2 text-center", i > 0 && "border-l border-border")}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{row.label}</div>
                <div className="tnum text-[17px] font-extrabold mt-1.5 leading-none">{fmtDist(row.s.distanceM, units, 1)}</div>
                <div className="text-[9px] text-muted-foreground mb-2">{distUnit(units)}</div>
                <div className="tnum text-[12px] font-semibold">{fmtDuration(row.s.movingTimeS, "compact")}</div>
                <div className="tnum text-[11px] text-muted-foreground">{row.s.activities} acts</div>
                <div className="tnum text-[11px] text-muted-foreground">{fmtElev(row.s.elevationM, units)} up</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* weekly chart */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Weekly distance · last 12 weeks</h3>
          <WeeklyBars data={stats.weekly} units={units} height={130} />
          <div className="grid grid-cols-4 mt-2 pt-3 border-t border-border text-center">
            <MiniStat label="Avg / wk" value={fmtDist(stats.weekly.reduce((a, w) => a + w.distanceM, 0) / Math.max(1, stats.weekly.filter((w) => w.activities > 0).length || 12), units, 1)} />
            <MiniStat label="Biggest wk" value={fmtDist(Math.max(0, ...stats.weekly.map((w) => w.distanceM)), units, 1)} />
            <MiniStat label="Total time" value={fmtDuration(stats.weekly.reduce((a, w) => a + w.movingTimeS, 0), "compact")} />
            <MiniStat label="Sessions" value={String(stats.weekly.reduce((a, w) => a + w.activities, 0))} />
          </div>
        </div>
      </div>

      {/* relative effort */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-primary" />
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Distance · last 12 weeks</h3>
          </div>
          <div className="flex items-end gap-1 h-20">
            {stats.weekly.map((w, i) => {
              const max = Math.max(1, ...stats.weekly.map((x) => x.distanceM));
              return (
                <div key={i} className="flex-1 bg-primary/25 rounded-t-sm relative" style={{ height: `${Math.max(4, (w.distanceM / max) * 100)}%` }}>
                  {w.activities > 0 && <div className="absolute bottom-0 inset-x-0 bg-primary rounded-t-sm" style={{ height: "100%", opacity: 0.35 + 0.65 * (w.distanceM / max) }} />}
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">Estimated training load from volume and intensity.</div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tnum text-[13.5px] font-bold">{value}</div>
      <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold mt-0.5">{label}</div>
    </div>
  );
}
