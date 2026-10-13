"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Bell, PenSquare, Flame, UserPlus, RotateCw } from "lucide-react";
import { api, FeedItem, WeeklyProgress } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { StrideMark, StrideWordmark } from "@/components/app/brand";
import { ActivityCard, PostCard, useUnits, AthleteRow } from "@/components/app/cards";
import { SegmentedTabs, Avatar, EmptyState } from "@/components/app/ui";
import { GoalRing } from "@/components/app/charts";
import { fmtDist, distUnit, fmtDuration, fmtElev, type Units } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FeedScreen() {
  const [scope, setScope] = useState<"following" | "you" | "clubs">("following");
  const nav = useNav();
  const unread = useUI((s) => s.unread);
  const setUnread = useUI((s) => s.setUnread);
  const units = useUnits();

  const feed = useInfiniteQuery({
    queryKey: ["feed", scope],
    queryFn: ({ pageParam }) => api.get<{ items: FeedItem[]; nextCursor: string | null }>(`feed?scope=${scope}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const summary = useQuery({
    queryKey: ["feed", "summary"],
    queryFn: () => api.get<WeeklyProgress>("feed/summary"),
  });
  const suggested = useQuery({
    queryKey: ["feed", "suggested"],
    queryFn: () => api.get<{ athletes: any[] }>("feed/suggested"),
    enabled: scope === "following",
  });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.data]);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        back={false}
        title={
          <span className="flex items-center gap-2">
            <StrideMark size={24} />
            <StrideWordmark height={15} />
          </span>
        }
        right={
          <>
            <button onClick={() => nav.push({ k: "postComposer" })} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="New post">
              <PenSquare size={20} className="text-foreground" />
            </button>
            <button onClick={() => nav.push({ k: "search" })} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="Search">
              <Search size={21} className="text-foreground" />
            </button>
            <button
              onClick={() => { setUnread(0); nav.push({ k: "notifications" }); }}
              className="relative w-9 h-9 flex items-center justify-center rounded-full active:bg-muted"
              aria-label="Notifications"
            >
              <Bell size={21} className="text-foreground" />
              {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
            </button>
          </>
        }
      />
      <SegmentedTabs
        tabs={[
          { id: "following", label: "Following" },
          { id: "you", label: "You" },
          { id: "clubs", label: "Clubs" },
        ]}
        value={scope}
        onChange={(s) => setScope(s as any)}
      />

      {/* weekly progress widget */}
      {summary.data && summary.data.week.activities > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <GoalRing
              progress={summary.data.goals.length ? summary.data.goals[0].current / Math.max(1, summary.data.goals[0].target) : 0}
              size={62}
            >
              <span className="tnum text-[15px] font-bold">{summary.data.week.activities}</span>
              <span className="text-[9px] text-muted-foreground uppercase">acts</span>
            </GoalRing>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[13px] font-bold uppercase tracking-wide">This Week</h3>
                {summary.data.streak > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-semibold text-trophy">
                    <Flame size={12} fill="currentColor" /> {summary.data.streak} wks
                  </span>
                )}
              </div>
              <div className="tnum flex gap-4 text-[13px] font-medium">
                <span><b className="text-[15px]">{fmtDist(summary.data.week.distanceM, units, 1)}</b> <span className="text-muted-foreground">{distUnit(units)}</span></span>
                <span><b className="text-[15px]">{fmtDuration(summary.data.week.movingTimeS, "compact")}</b></span>
                <span><b className="text-[15px]">{fmtElev(summary.data.week.elevationM, units)}</b></span>
              </div>
              {summary.data.goals.length > 0 && (
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {weeklyGoalLabel(summary.data.goals[0], units)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* feed items */}
      <div className="flex flex-col gap-2.5 px-4 pt-4 pb-24">
        {feed.isLoading && (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg h-[220px] animate-pulse" />
            ))}
          </div>
        )}
        {items.map((item, i) => (
          <React.Fragment key={item.type === "activity" ? `a${item.data.id}` : `p${item.data.id}`}>
            <div itemID={String(i)} />
            {item.type === "activity" ? <ActivityCard activity={item.data as any} /> : <PostCard post={item.data as any} />}
            {scope === "following" && suggested.data && i === 5 && suggested.data.athletes.length > 0 && (
              <SuggestedBlock athletes={suggested.data.athletes} />
            )}
          </React.Fragment>
        ))}
        {feed.isError && (
          <EmptyState
            icon={RotateCw}
            title="Couldn't load your feed"
            body={(feed.error as Error)?.message ?? "Check your connection and try again."}
            action={
              <button onClick={() => feed.refetch()} className="h-11 px-6 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] active:scale-[0.98] transition-transform">
                Retry
              </button>
            }
          />
        )}
        {!feed.isLoading && !feed.isError && items.length === 0 && (
          <EmptyState
            icon={PenSquare}
            title={scope === "you" ? "No activities yet" : "Your feed is quiet"}
            body={scope === "you" ? "Hit the record button to track your first activity." : "Follow more athletes to fill up your feed."}
          />
        )}
        {feed.isFetchingNextPage && <div className="py-4 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
        <div ref={sentinel} className="h-2" />
      </div>
    </div>
  );
}

// goal values arrive in SI: metres, or seconds for time goals
function weeklyGoalLabel(g: { metric: string; target: number; current: number; sport: string | null }, units: Units): string {
  const fmt = (v: number) =>
    g.metric === "time" ? fmtDuration(v, "compact") : g.metric === "elevation" ? fmtElev(v, units) : `${fmtDist(v, units, 1)} ${distUnit(units)}`;
  return `${fmt(g.current)} / ${fmt(g.target)} ${g.sport ?? "all-sport"} goal`;
}

function SuggestedBlock({ athletes }: { athletes: any[] }) {
  const qc = useQueryClient();
  const followMut = (id: string) => api.post(`athletes/${id}/follow`, { on: true }).then(() => qc.invalidateQueries({ queryKey: ["feed", "suggested"] }));
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 pt-3.5 pb-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">You might know</div>
      {athletes.slice(0, 3).map((a) => (
        <FollowRow key={a.id} athlete={a} onFollow={() => followMut(a.id)} />
      ))}
    </div>
  );
}

function FollowRow({ athlete, onFollow }: { athlete: any; onFollow: () => void }) {
  const [followed, setFollowed] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar athlete={athlete} size={42} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold truncate">{athlete.firstName} {athlete.lastName}</div>
        <div className="text-[11.5px] text-muted-foreground truncate">{athlete.city ?? "STRIDE athlete"}</div>
      </div>
      <button
        onClick={() => { if (!followed) { setFollowed(true); onFollow(); } }}
        className={cn(
          "px-4 h-8 rounded-md text-[12px] font-bold flex items-center gap-1 transition-colors",
          followed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        )}
      >
        {!followed && <UserPlus size={14} />}
        {followed ? "Following" : "Follow"}
      </button>
    </div>
  );
}
