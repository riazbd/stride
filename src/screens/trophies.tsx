"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Award, Check, ChevronRight, Timer, Medal } from "lucide-react";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { EmptyState, Badge, SportIcon } from "@/components/app/ui";
import { useUnits } from "@/components/app/cards";
import { fmtDuration, fmtDist, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TrophiesScreen({ id }: { id: string }) {
  const nav = useNav();
  const units = useUnits();
  const { data } = useQuery({
    queryKey: ["trophies", id],
    queryFn: () => api.get<any>(`athletes/${id}/trophies`),
    enabled: !!id,
  });

  if (!data) return <div className="flex flex-col"><ScreenHeader title="Trophies" /><div className="p-4"><div className="h-40 rounded-lg bg-muted animate-pulse" /></div></div>;

  const { komCount, top3Count, prCount, segmentTrophies, distancePRs, completedChallenges } = data;

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Trophies & PRs" />

      {/* summary cards */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2.5">
        <SummaryCard icon={Trophy} value={komCount} label={komCount === 1 ? "KOM/CR" : "KOMs/CRs"} tone="trophy" />
        <SummaryCard icon={Medal} value={top3Count} label="Top 3s" tone="trophy" />
        <SummaryCard icon={Award} value={prCount} label="PRs" tone="primary" />
      </div>

      {/* distance PRs */}
      {distancePRs?.length > 0 && (
        <div className="px-4 pt-5">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Personal records</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {distancePRs.map((pr: any) => (
              <button key={pr.distance} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 w-full text-left active:bg-muted" onClick={() => nav.push({ k: "activity", id: pr.activityId })}>
                <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-col items-center justify-center shrink-0">
                  <Timer size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold">Best {pr.label}</div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{pr.activityTitle ?? "Run"} · {relativeDay(pr.startDate)}</div>
                </div>
                <span className="tnum text-[16px] font-extrabold text-primary">{fmtDuration(pr.timeS)}</span>
                <ChevronRight size={15} className="text-muted-foreground/60" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* segment trophies */}
      <div className="px-4 pt-5">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Segment records</h3>
        {segmentTrophies?.length === 0 ? (
          <EmptyState icon={Trophy} title="No segment trophies yet" body="Run or ride a segment faster than anyone else to claim a KOM/CR." />
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {segmentTrophies.map((t: any) => (
              <button
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 w-full text-left active:bg-muted"
                onClick={() => nav.push({ k: "activity", id: t.activityId })}
              >
                <span className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", t.kind === "kom" ? "bg-trophy/15 text-trophy" : "bg-primary/10 text-primary")}>
                  {t.kind === "kom" ? <Trophy size={18} /> : <Medal size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold truncate flex items-center gap-1.5">
                    {t.segmentName}
                    {t.rank === 1 && <Badge tone="trophy">{t.segmentSport === "ride" ? "KOM" : "CR"}</Badge>}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <SportIcon sport={t.segmentSport} size={11} />
                    {t.city} · {relativeDay(t.date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[14px] font-bold">{fmtDuration(t.timeS)}</div>
                  {t.rank && t.rank > 1 && <div className="tnum text-[10px] text-muted-foreground font-bold">rank #{t.rank}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* completed challenges */}
      {completedChallenges?.length > 0 && (
        <div className="px-4 pt-5">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Completed challenges</h3>
          <div className="flex flex-col gap-2">
            {completedChallenges.map((c: any) => (
              <button
                key={c.id}
                className="bg-card border border-border rounded-lg px-4 py-3.5 flex items-center gap-3 w-full text-left active:bg-muted"
                onClick={() => nav.push({ k: "challenge", slug: c.slug })}
              >
                <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${c.accentColor}18`, color: c.accentColor }}>
                  <Award size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold truncate flex items-center gap-1.5">
                    {c.title}
                    <Check size={13} className="text-achievement" />
                  </div>
                  <div className="text-[11px] text-muted-foreground">Completed {relativeDay(c.completedAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, value, label, tone }: { icon: any; value: number; label: string; tone: "trophy" | "primary" }) {
  return (
    <div className="bg-card border border-border rounded-lg py-4 flex flex-col items-center">
      <Icon size={20} className={tone === "trophy" ? "text-trophy" : "text-primary"} />
      <span className="tnum text-[24px] font-extrabold leading-none mt-1.5">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mt-1">{label}</span>
    </div>
  );
}
