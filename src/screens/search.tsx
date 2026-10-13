"use client";
import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Trophy, Map, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { AthleteRow } from "@/components/app/cards";
import { SegmentedTabs, SportIcon, EmptyState } from "@/components/app/ui";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const RECENT_KEY = "stride-recent-searches";

export function SearchScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"athletes" | "clubs" | "segments">("athletes");
  // SearchScreen only mounts client-side after auth, so localStorage is safe here
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<any>(`search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const record = (term: string) => {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 8);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const follow = async (id: string) => {
    try {
      await api.post(`athletes/${id}/follow`, { on: true });
      qc.invalidateQueries({ queryKey: ["search"] });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  const results = data ?? { athletes: [], clubs: [], segments: [] };
  const total = (results.athletes?.length ?? 0) + (results.clubs?.length ?? 0) + (results.segments?.length ?? 0);

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Search" />
      <div className="px-4 pt-3">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q.trim().length >= 2 && record(q.trim())}
            placeholder="Athletes, clubs, segments…"
            className="w-full h-11 pl-10 pr-4 rounded-full bg-muted/70 text-[15px] outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
          {isFetching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {q.trim().length < 2 ? (
        <div className="px-4 pt-5">
          {recent.length > 0 && (
            <>
              <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent</div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} onClick={() => setQ(r)} className="px-3.5 h-8 rounded-full bg-muted text-[12.5px] font-semibold">
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}
          <EmptyState icon={Search} title="Search STRIDE" body="Find athletes to follow, clubs to join and segments to race." />
        </div>
      ) : (
        <>
          <div className="pt-3">
            <SegmentedTabs
              tabs={[
                { id: "athletes", label: "Athletes", count: results.athletes?.length },
                { id: "clubs", label: "Clubs", count: results.clubs?.length },
                { id: "segments", label: "Segments", count: results.segments?.length },
              ]}
              value={tab}
              onChange={(t) => setTab(t as any)}
            />
          </div>
          {total === 0 && !isFetching && <EmptyState icon={Search} title="No results" body={`Nothing found for "${q}"`} />}
          <div className="flex flex-col">
            {tab === "athletes" && results.athletes?.map((a: any) => (
              <AthleteRow
                key={a.id}
                athlete={a}
                sub={a.city ? `${a.city}${a.country ? ", " + a.country : ""}` : "STRIDE athlete"}
                right={
                  !a.isMe && !a.isFollowing ? (
                    <button onClick={(e) => { e.stopPropagation(); follow(a.id); }} className="px-3.5 h-8 rounded-md bg-primary/10 text-primary text-[12px] font-bold shrink-0">
                      Follow
                    </button>
                  ) : a.isMe ? (
                    <span className="text-[11px] text-muted-foreground font-bold uppercase px-2">You</span>
                  ) : undefined
                }
              />
            ))}
            {tab === "clubs" && results.clubs?.map((c: any) => (
              <button key={c.id} onClick={() => nav.push({ k: "club", slug: c.slug })} className="flex items-center gap-3 px-4 py-3 border-b border-border active:bg-muted text-left w-full">
                <span className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0"><Users size={19} className="text-muted-foreground" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate">{c.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{c.city} · {c.memberCount} members</div>
                </div>
              </button>
            ))}
            {tab === "segments" && results.segments?.map((s: any) => (
              <button key={s.id} onClick={() => nav.push({ k: "segment", slug: s.slug })} className="flex items-center gap-3 px-4 py-3 border-b border-border active:bg-muted text-left w-full">
                <span className={cn("w-11 h-11 rounded-lg flex items-center justify-center shrink-0", s.sport === "run" ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
                  <SportIcon sport={s.sport} size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate">{s.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{s.city} · {(s.distanceM / 1000).toFixed(1)} km</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
