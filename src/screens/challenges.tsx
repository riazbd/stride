"use client";
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, Award, Users, ChevronRight, Flame } from "lucide-react";
import { api, ChallengeItem } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { useUnits } from "@/components/app/cards";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/ui";
import * as LucideIcons from "lucide-react";

const CHALLENGE_ICONS: Record<string, any> = {
  award: LucideIcons.Award, bike: LucideIcons.Bike, footprints: LucideIcons.Footprints,
  mountain: LucideIcons.Mountain, zap: LucideIcons.Zap, flower2: LucideIcons.Flower2,
};

function goalLabel(c: ChallengeItem): string {
  switch (c.type) {
    case "distance": case "single_distance": return `${c.goalValue} km`;
    case "time": return `${Math.round(c.goalValue / 60)} hrs`;
    case "elevation": return `${c.goalValue.toLocaleString()} m`;
    case "activities": return `${c.goalValue} sessions`;
    default: return String(c.goalValue);
  }
}

export function ChallengesScreen({ embedded }: { embedded?: boolean }) {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<{ challenges: ChallengeItem[] }>("challenges"),
  });

  const join = async (slug: string) => {
    try {
      await api.post(`challenges/${slug}/join`, {});
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast({ description: "Challenge joined" });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col">
        {!embedded && <ScreenHeader title="Challenges" back={false} />}
        <div className="p-4 flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}</div>
      </div>
    );
  }

  const challenges = data?.challenges ?? [];
  const featured = challenges.filter((c) => c.featured);
  const rest = challenges.filter((c) => !c.featured);

  return (
    <div className={cn("flex flex-col min-h-full", !embedded && "pb-24")}>
      {!embedded && <ScreenHeader title="Challenges" back={false} />}
      {challenges.length === 0 && <EmptyState icon={Award} title="No challenges yet" />}

      {/* featured */}
      <div className="pt-3 pb-1 px-4">
        <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Featured this month</div>
      </div>
      <div className="overflow-x-auto no-scrollbar px-4 pt-2 flex gap-3 snap-x">
        {featured.map((c) => (
          <button
            key={c.id}
            onClick={() => nav.push({ k: "challenge", slug: c.slug })}
            className="snap-start shrink-0 w-[280px] rounded-xl border border-border bg-card p-4 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-start justify-between">
              <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${c.accentColor}18`, color: c.accentColor }}>
                {React.createElement(CHALLENGE_ICONS[c.badgeIcon] ?? LucideIcons.Award, { size: 24 })}
              </span>
              {c.daysLeft > 0 && <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide">{c.daysLeft} days left</span>}
            </div>
            <div className="text-[16px] font-extrabold leading-tight mt-3">{c.title}</div>
            <div className="text-[12px] text-muted-foreground mt-1 line-clamp-2 leading-snug">{c.description}</div>
            {c.isJoined && c.progress != null && (
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.progress / c.goalValue) * 100)}%`, background: c.accentColor }} />
                </div>
                <div className="tnum text-[11px] text-muted-foreground mt-1.5 font-semibold">
                  {c.progress.toFixed(c.progress < 10 ? 1 : 0)} / {goalLabel(c)}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* all */}
      <div className="pt-5 px-4">
        <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">All challenges</div>
      </div>
      <div className="flex flex-col">
        {[...featured, ...rest].map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => nav.push({ k: "challenge", slug: c.slug })}>
              <span className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.accentColor}18`, color: c.accentColor }}>
                {React.createElement(CHALLENGE_ICONS[c.badgeIcon] ?? LucideIcons.Award, { size: 21 })}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold truncate flex items-center gap-1.5">
                  {c.title}
                  {c.completedAt && <Check size={13} className="text-achievement" />}
                </div>
                <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>{goalLabel(c)} · {c.category}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <Users size={10} /> {c.joinedCount.toLocaleString()}
                </div>
                {c.isJoined && c.progress != null && (
                  <div className="h-1 rounded-full bg-muted overflow-hidden mt-2 max-w-[160px]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.progress / c.goalValue) * 100)}%`, background: c.accentColor }} />
                  </div>
                )}
              </div>
            </button>
            {!c.isJoined ? (
              <button onClick={() => join(c.slug)} className="px-3.5 h-8 rounded-md bg-primary/10 text-primary text-[12px] font-bold flex items-center gap-1 shrink-0">
                <Plus size={13} /> Join
              </button>
            ) : (
              <button onClick={() => nav.push({ k: "challenge", slug: c.slug })} className="px-3 h-8 rounded-md bg-muted text-[12px] font-bold flex items-center gap-1 shrink-0 text-muted-foreground">
                <Check size={13} className="text-achievement" /> Joined
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
