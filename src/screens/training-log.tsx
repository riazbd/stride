"use client";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, Footprints, Bike, Waves } from "lucide-react";
import { api, TrainingDay } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { useUnits } from "@/components/app/cards";
import { PremiumGate, usePremium } from "@/components/app/premium";
import { fmtDist, distUnit, fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SportIcon } from "@/components/app/ui";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function TrainingLogScreen({ id }: { id: string }) {
  const nav = useNav();
  const units = useUnits();
  const premium = usePremium();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const { data } = useQuery({
    queryKey: ["training-log", id, ym.y, ym.m],
    queryFn: () => api.get<{ days: TrainingDay[] }>(`athletes/${id}/training-log?year=${ym.y}&month=${ym.m}`),
    enabled: !!id,
  });

  const days = data?.days ?? [];
  const firstDow = (new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay() + 6) % 7; // Monday-start
  const maxDist = Math.max(1, ...days.map((d) => d.distanceM));
  const monthTotals = days.reduce(
    (acc, d) => ({ distance: acc.distance + d.distanceM, time: acc.time + d.movingTimeS, acts: acc.acts + d.activities.length }),
    { distance: 0, time: 0, acts: 0 }
  );
  const today = new Date().toISOString().slice(0, 10);

  const prevMonth = () => setYm((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { ...p, m: p.m - 1 }));
  const nextMonth = () => setYm((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { ...p, m: p.m + 1 }));

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Training Log" />
      {!premium ? (
        <div className="px-4 pt-4">
          <PremiumGate
            title="Training Log"
            body="Your full training history on a calendar — every month, every session."
            feature="trainingLog"
          />
          <div className="mt-3 bg-card border border-border rounded-lg p-4 opacity-50 select-none" aria-hidden>
            <div className="h-[220px] rounded bg-muted/60" />
          </div>
        </div>
      ) : (
      <>
      {/* month totals */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg px-4 py-3.5 grid grid-cols-3">
          <div>
            <div className="tnum text-[19px] font-extrabold text-primary leading-none">{fmtDist(monthTotals.distance, units, 1)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mt-1">{distUnit(units)} this month</div>
          </div>
          <div>
            <div className="tnum text-[19px] font-extrabold leading-none">{fmtDuration(monthTotals.time, "compact")}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mt-1">moving time</div>
          </div>
          <div>
            <div className="tnum text-[19px] font-extrabold leading-none">{monthTotals.acts}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mt-1">sessions</div>
          </div>
        </div>
      </div>

      {/* calendar */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-8 h-8 rounded-md flex items-center justify-center active:bg-muted" aria-label="Previous month"><ChevronLeft size={17} /></button>
            <span className="text-[14px] font-bold">{MONTHS[ym.m]} {ym.y}</span>
            <button onClick={nextMonth} className="w-8 h-8 rounded-md flex items-center justify-center active:bg-muted" aria-label="Next month"><ChevronRight size={17} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[10px] font-bold text-muted-foreground">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map((d) => {
              const isToday = d.date === today;
              const has = d.activities.length > 0;
              const intensity = has ? d.distanceM / maxDist : 0;
              return (
                <div
                  key={d.date}
                  className={cn(
                    "aspect-square rounded-md flex flex-col items-center justify-center relative",
                    has ? "bg-primary/12" : "bg-muted/50",
                    isToday && "ring-2 ring-primary"
                  )}
                  title={has ? `${fmtDist(d.distanceM, units, 1)} ${distUnit(units)} · ${fmtDuration(d.movingTimeS, "compact")}` : undefined}
                >
                  {has && intensity > 0.35 && <div className="absolute inset-0 rounded-md bg-primary/15" style={{ opacity: Math.min(1, intensity) }} />}
                  <span className={cn("tnum text-[11px] font-bold relative", isToday && "text-primary")}>{Number(d.date.slice(-2))}</span>
                  {has && (
                    <span className="relative flex gap-0.5 mt-0.5">
                      {d.activities.slice(0, 3).map((a, i) => (
                        <SportIcon key={i} sport={a.sport} size={9} className="text-primary" />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {/* legend */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <div className="flex gap-0.5">
                <div className="w-3 h-3 rounded-sm bg-primary/15" />
                <div className="w-3 h-3 rounded-sm bg-primary/30" />
                <div className="w-3 h-3 rounded-sm bg-primary/60" />
              </div>
              volume
            </div>
            <div className="flex-1" />
            <span className="text-[10.5px] text-muted-foreground">ring = today</span>
          </div>
        </div>
      </div>

      {/* day activity list */}
      <div className="px-4 pt-4">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Activities this month</h3>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {days.filter((d) => d.activities.length).length === 0 && (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No activities this month.</div>
          )}
          {days.filter((d) => d.activities.length > 0).reverse().map((d) => (
            <div key={d.date} className="border-b border-border last:border-0">
              <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {new Date(d.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
              {d.activities.map((a) => (
                <button key={a.id} onClick={() => nav.push({ k: "activity", id: a.id })} className="flex items-center gap-3 px-4 py-2.5 w-full text-left active:bg-muted">
                  <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <SportIcon sport={a.sport} size={15} />
                  </span>
                  <span className="text-[13.5px] font-semibold flex-1 truncate">{a.title}</span>
                  <span className="tnum text-[12px] text-muted-foreground">{fmtDist(a.distanceM, units, 1)} {distUnit(units)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
