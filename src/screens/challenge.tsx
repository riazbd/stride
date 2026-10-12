"use client";
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Check, Users, Flame, Calendar } from "lucide-react";
import { api, ChallengeDetail } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { ActivityRow } from "@/components/app/cards";
import { useUnits } from "@/components/app/cards";
import { GoalRing } from "@/components/app/charts";
import { EmptyState } from "@/components/app/ui";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";
import { fmtDist, distUnit, longDate } from "@/lib/format";

const CHALLENGE_ICONS: Record<string, any> = {
  award: LucideIcons.Award, bike: LucideIcons.Bike, footprints: LucideIcons.Footprints,
  mountain: LucideIcons.Mountain, zap: LucideIcons.Zap, flower2: LucideIcons.Flower2,
};

export function ChallengeScreen({ slug }: { slug: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["challenge", slug],
    queryFn: () => api.get<ChallengeDetail>(`challenges/${slug}`),
  });

  const toggleJoin = async () => {
    if (!data) return;
    try {
      await api.post(`challenges/${slug}/join`, { action: data.isJoined ? "leave" : "join" });
      qc.invalidateQueries({ queryKey: ["challenge", slug] });
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast({ description: data.isJoined ? "Left challenge" : "Challenge joined — get after it" });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  if (isLoading) {
    return <div className="flex flex-col"><ScreenHeader title="Challenge" /><div className="p-4"><div className="h-48 rounded-xl bg-muted animate-pulse" /></div></div>;
  }
  if (!data) return <div className="flex flex-col"><ScreenHeader title="Challenge" /><EmptyState icon={Award} title="Challenge not found" /></div>;

  const { challenge: c, progress, completed, isJoined, contributors } = data;
  const pct = Math.min(1, progress / c.goalValue);
  const Icon = CHALLENGE_ICONS[c.badgeIcon] ?? LucideIcons.Award;

  const goalUnit = c.type === "time" ? "hrs" : c.type === "elevation" ? "m" : c.type === "activities" ? "sessions" : "km";
  const progressVal = c.type === "time" ? Math.round(progress / 60) : Math.round(progress);

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Challenge" />

      {/* hero */}
      <div className="px-4 pt-4">
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center text-center">
          <span className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: `${c.accentColor}18`, color: c.accentColor }}>
            <Icon size={30} />
          </span>
          <h1 className="text-[19px] font-extrabold leading-tight">{c.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
          <div className="text-[11.5px] text-muted-foreground mt-3 flex items-center gap-2">
            <Users size={12} /> {c.joinedCount.toLocaleString()} joined
            <span className="w-1 h-1 rounded-full bg-border" />
            <Calendar size={12} /> ends {longDate(c.endDate)}
          </div>

          {isJoined && (
            <div className="mt-5 w-full">
              <GoalRing progress={pct} size={110} stroke={9} color={completed ? "var(--achievement)" : c.accentColor}>
                <span className="tnum text-[24px] font-extrabold leading-none">{Math.round(pct * 100)}%</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mt-1">complete</span>
              </GoalRing>
              <div className="tnum text-[14px] font-bold mt-2">
                <span style={{ color: completed ? "var(--achievement)" : undefined }}>
                  {completed ? "Challenge complete" : `${progressVal} / ${goalUnit === "hrs" ? Math.round(c.goalValue / 60) : goalUnit === "m" ? c.goalValue.toLocaleString() : c.goalValue} ${goalUnit}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        <Button
          onClick={toggleJoin}
          className={cn("w-full h-12 rounded-lg font-bold text-[15px] active:scale-[0.98] transition-transform", isJoined && !completed ? "bg-muted text-foreground border border-border hover:bg-muted" : completed ? "bg-achievement text-white hover:bg-achievement/90" : "bg-primary text-primary-foreground hover:bg-primary")}
        >
          {completed ? "Completed" : isJoined ? "Leave Challenge" : "Join Challenge"}
        </Button>
      </div>

      {/* contributors */}
      {isJoined && (
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Your progress activities</h3>
          </div>
          {contributors.length === 0 ? (
            <EmptyState icon={Flame} title="Nothing logged yet" body="Activities recorded during the challenge window will count toward your progress." />
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden mt-2">
              {contributors.map((a) => (
                <ActivityRow
                  key={a.id}
                  a={a as any}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
