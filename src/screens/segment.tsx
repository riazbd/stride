"use client";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trophy, TrendingUp, ChevronRight, Mountain, Gauge, Ruler } from "lucide-react";
import { api, SegmentDetail, LeaderboardEntry } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { MapView } from "@/components/app/MapView";
import { Avatar, SegmentedTabs, Badge, EmptyState } from "@/components/app/ui";
import { useUnits } from "@/components/app/cards";
import { UnlockRow, PremiumGate } from "@/components/app/premium";
import { fmtDuration, fmtDist, agoLabel, timeOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function SegmentScreen({ slug }: { slug: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const [tab, setTab] = useState<"overall" | "following" | "mine">("overall");

  const { data, isLoading } = useQuery({
    queryKey: ["segment", slug],
    queryFn: () => api.get<SegmentDetail>(`segments/${slug}`),
  });

  const starMut = {
    toggle: async () => {
      if (!data) return;
      const was = data.isStarred;
      qc.setQueryData(["segment", slug], { ...data, isStarred: !was });
      try {
        await api.post(`segments/${slug}/star`, { on: !was });
        toast({ description: was ? "Star removed" : "Segment starred" });
      } catch {
        qc.setQueryData(["segment", slug], data);
      }
    },
  };

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Segment" />
        <div className="p-4 flex flex-col gap-3">
          <div className="h-[220px] rounded-lg bg-muted animate-pulse" />
          <div className="h-32 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    );
  }
  if (!data) return <div className="flex flex-col"><ScreenHeader title="Segment" /><EmptyState icon={Mountain} title="Segment not found" /></div>;

  const { segment: seg, leaderboard, legends, isStarred, viewerPremium } = data;
  const board = tab === "overall" ? leaderboard.overall : tab === "following" ? leaderboard.following : leaderboard.mine;
  const myEntry = leaderboard.mine[0];

  return (
    <div className="flex flex-col min-h-full pb-20">
      <ScreenHeader
        title={seg.name}
        subtitle={`${seg.city}, ${seg.country}`}
        right={
          <button
            onClick={starMut.toggle}
            className={cn("w-9 h-9 flex items-center justify-center rounded-full active:bg-muted", isStarred ? "text-trophy" : "text-muted-foreground")}
            aria-label={isStarred ? "Unstar segment" : "Star segment"}
          >
            <Star size={21} fill={isStarred ? "currentColor" : "none"} />
          </button>
        }
      />

      <MapView
        lines={[{ id: "seg", coordinates: seg.points, color: "#242427", width: 5 }]}
        markers={[
          { lng: seg.startLng, lat: seg.startLat, kind: "start" },
          { lng: seg.endLng, lat: seg.endLat, kind: "finish" },
        ]}
        height={240}
      />

      <div className="px-4 pt-4">
        <div className="flex items-start gap-2.5">
          <span className={cn("w-11 h-11 rounded-lg flex items-center justify-center shrink-0", seg.sport === "run" ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
            <Trophy size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-bold leading-tight">{seg.name}</h1>
            <div className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>{seg.city}, {seg.country}</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="capitalize">{seg.sport} segment</span>
            </div>
          </div>
        </div>
        {seg.description && <p className="text-[13px] text-muted-foreground mt-2.5 leading-relaxed">{seg.description}</p>}

        {/* stats */}
        <div className="mt-3.5 bg-card border border-border rounded-lg px-4 py-3.5 grid grid-cols-4">
          <SegStat icon={Ruler} label="Distance" value={`${(seg.distanceM / 1000).toFixed(1)} km`} />
          <SegStat icon={TrendingUp} label="Avg grade" value={`${seg.averageGrade.toFixed(1)}%`} />
          <SegStat icon={Mountain} label="Elev" value={`${Math.round(seg.elevationHigh - seg.elevationLow)} m`} />
          <SegStat icon={Star} label="Stars" value={String(seg.starredCount)} />
        </div>
      </div>

      {/* my standing */}
      {myEntry && (
        <div className="px-4 pt-3">
          <div className="bg-primary/5 border border-primary/25 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="tnum text-[22px] font-extrabold text-primary w-14">#{leaderboard.myRank ?? "—"}</span>
            <div className="flex-1">
              <div className="text-[13px] font-bold">Your best</div>
              <div className="tnum text-[12px] text-muted-foreground">
                {fmtDuration(myEntry.timeS)} · {agoLabel(myEntry.date)} ago
              </div>
            </div>
            {myEntry.isPR && <Badge tone="trophy">PR</Badge>}
          </div>
        </div>
      )}

      {/* leaderboard */}
      <div className="pt-4">
        <SegmentedTabs
          tabs={[
            { id: "overall", label: "Overall" },
            { id: "following", label: viewerPremium ? "Following" : "Following \u00B7" },
            { id: "mine", label: "You" },
          ]}
          value={tab}
          onChange={(t) => setTab(t as any)}
        />
        {tab === "following" && !viewerPremium ? (
          <div className="px-4 pt-3">
            <PremiumGate
              title="Filter by athletes you follow"
              body="See how you stack up against the people you train with."
              feature="following"
            />
            <div className="mt-3 flex flex-col opacity-40 select-none" aria-hidden>
              {leaderboard.overall.slice(0, 4).map((e) => <LeaderRow key={e.id} entry={e} meHighlight={false} onClickActivity={() => {}} />)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {board.length === 0 && (
              <EmptyState
                icon={Trophy}
                title={tab === "mine" ? "No efforts yet" : tab === "following" ? "No followed athletes here" : "No efforts yet"}
                body={tab === "mine" ? "Run or ride this segment to set a time." : undefined}
              />
            )}
            {board.map((e) => (
              <LeaderRow key={e.id} entry={e} meHighlight={false} onClickActivity={() => nav.push({ k: "activity", id: e.activityId })} />
            ))}
          </div>
        )}
        {tab === "overall" && !viewerPremium && leaderboard.total > 10 && (
          <UnlockRow label={`Unlock all ${leaderboard.total} efforts`} feature="leaderboard" />
        )}
        {tab === "overall" && viewerPremium && leaderboard.total > 10 && (
          <div className="px-4 py-3 text-[11.5px] text-muted-foreground text-center">
            Showing {Math.min(leaderboard.overall.length, leaderboard.total)} of {leaderboard.total} efforts
          </div>
        )}
      </div>

      {/* local legends (premium) */}
      {!viewerPremium ? (
        <div className="px-4 pt-2">
          <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-2">Local legends</div>
          <PremiumGate
            title="Local Legends"
            body="Meet the athletes who run or ride this segment the most."
            feature="legends"
            compact
          />
        </div>
      ) : legends.length > 0 && (
        <div className="px-4 pt-2">
          <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-2">Local legends</div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {legends.map((l) => (
              <button key={l.athlete.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 w-full text-left active:bg-muted" onClick={() => nav.push({ k: "profile", id: l.athlete.id })}>
                <Avatar athlete={l.athlete} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate">{l.athlete.firstName} {l.athlete.lastName}</div>
                  <div className="text-[11.5px] text-muted-foreground">{l.efforts} efforts</div>
                </div>
                <Badge tone="trophy">Legend</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderRow({ entry, meHighlight, onClickActivity }: { entry: LeaderboardEntry; meHighlight?: boolean; onClickActivity: () => void }) {
  const rankColor = entry.rank === 1 ? "text-trophy" : entry.rank === 2 ? "text-muted-foreground" : entry.rank === 3 ? "text-[#b0793f]" : "text-muted-foreground";
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 border-b border-border", meHighlight && "bg-primary/5")}>
      <span className={cn("tnum w-9 text-[15px] font-extrabold text-center", rankColor)}>{entry.rank}</span>
      <Avatar athlete={entry.athlete} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold truncate flex items-center gap-1.5">
          {entry.athlete.firstName} {entry.athlete.lastName}
          {entry.athlete.premium && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
          {entry.isPR && <Badge tone="trophy">PR</Badge>}
        </div>
        <div className="text-[11.5px] text-muted-foreground">{agoLabel(entry.date)} ago</div>
      </div>
      <button onClick={onClickActivity} className="flex items-center gap-1 text-right shrink-0 group">
        <span className="tnum text-[15px] font-bold text-primary">{fmtDuration(entry.timeS)}</span>
        <ChevronRight size={14} className="text-muted-foreground/50" />
      </button>
    </div>
  );
}

function SegStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted-foreground mb-1">
        <Icon size={11} />
        <span className="text-[10px] uppercase tracking-wide font-bold">{label}</span>
      </div>
      <div className="tnum text-[14px] font-bold">{value}</div>
    </div>
  );
}
