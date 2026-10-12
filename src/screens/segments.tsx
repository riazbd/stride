"use client";
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, Search, Mountain, Zap, MapPin } from "lucide-react";
import { api, SegmentSummary } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { SegmentedTabs, SportIcon, EmptyState } from "@/components/app/ui";
import { MapView } from "@/components/app/MapView";
import { useUnits } from "@/components/app/cards";
import { Input } from "@/components/ui/input";
import { fmtDuration, fmtDist } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SegmentsScreen() {
  const nav = useNav();
  const units = useUnits();
  const [tab, setTab] = useState<"all" | "starred" | "mine">("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["segments", q],
    queryFn: () => api.get<{ segments: SegmentSummary[] }>(`segments${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  const segments = useMemo(() => {
    let list = data?.segments ?? [];
    if (tab === "starred") list = list.filter((s) => s.isStarred);
    if (tab === "mine") list = list.filter((s) => s.myBestTimeS != null);
    return list;
  }, [data, tab]);

  const mapLines = useMemo(
    () => segments.slice(0, 25).map((s, i) => ({ id: `seg${i}`, coordinates: s.points, color: s.sport === "run" ? "#fc4c02" : "#242427", width: 4 })),
    [segments]
  );
  const mapMarkers = useMemo(
    () => segments.slice(0, 25).map((s) => ({ lng: s.startLng, lat: s.startLat, kind: "segment" as const })),
    [segments]
  );

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Segments" back={false} />
      <div className="px-4 pt-3">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search segments"
            className="h-11 pl-10 rounded-full bg-muted/70 border-0 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>
      <div className="pt-2">
        <SegmentedTabs
          tabs={[
            { id: "all", label: "All", count: data?.segments.length },
            { id: "starred", label: "Starred" },
            { id: "mine", label: "My efforts" },
          ]}
          value={tab}
          onChange={(t) => setTab(t as any)}
        />
      </div>
      <MapView lines={mapLines.length ? mapLines : undefined} markers={mapMarkers.length ? mapMarkers : undefined} height={220} />
      <div className="flex flex-col">
        {isLoading && <div className="p-4 flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}
        {!isLoading && segments.length === 0 && (
          <EmptyState icon={Mountain} title={tab === "starred" ? "No starred segments" : "No segments found"} body={tab === "mine" ? "Run or ride a segment to see your efforts here." : "Try a different search."} />
        )}
        {segments.map((s) => (
          <button
            key={s.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-border active:bg-muted transition-colors text-left"
            onClick={() => nav.push({ k: "segment", slug: s.slug })}
          >
            <span className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", s.sport === "run" ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
              <SportIcon sport={s.sport} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold truncate">{s.name}</div>
              <div className="text-[11.5px] text-muted-foreground truncate flex items-center gap-1.5">
                <MapPin size={11} />
                {s.city}, {s.country} · {(s.distanceM / 1000).toFixed(1)} km
              </div>
            </div>
            <div className="text-right shrink-0">
              {s.myBestTimeS != null ? (
                <>
                  <div className="tnum text-[14px] font-bold text-primary">{fmtDuration(s.myBestTimeS)}</div>
                  <div className="text-[10px] uppercase text-muted-foreground font-semibold">my best</div>
                </>
              ) : (
                <div className="text-[11px] text-muted-foreground">—</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
