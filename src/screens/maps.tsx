"use client";
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Layers, Plus, Route as RouteIcon, Flame } from "lucide-react";
import { api, SegmentSummary, RouteItem } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { SegmentedTabs, SportIcon, EmptyState } from "@/components/app/ui";
import { MapView } from "@/components/app/MapView";
import { RouteThumb } from "@/components/app/charts";
import { useUnits } from "@/components/app/cards";
import { fmtDist, distUnit, fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MapsScreen() {
  const [tab, setTab] = useState<"heatmap" | "segments" | "routes">("heatmap");
  const nav = useNav();
  const me = useUI((s) => s.me);

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Maps"
        back={false}
        right={
          <button onClick={() => nav.push({ k: "search" })} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="Search">
            <Search size={21} />
          </button>
        }
      />
      <SegmentedTabs
        tabs={[
          { id: "heatmap", label: "My Heatmap" },
          { id: "segments", label: "Segments" },
          { id: "routes", label: "Routes" },
        ]}
        value={tab}
        onChange={(t) => setTab(t as any)}
      />
      {tab === "heatmap" && <HeatmapTab athleteId={me?.id} />}
      {tab === "segments" && <SegmentsTab />}
      {tab === "routes" && <RoutesTab />}
    </div>
  );
}

function HeatmapTab({ athleteId }: { athleteId?: string }) {
  const units = useUnits();
  const [filter, setFilter] = useState<"all" | "run" | "ride">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["heatmap", athleteId],
    queryFn: () => api.get<{ polylines: [number, number][][] }>(`athletes/${athleteId}/heatmap`),
    enabled: !!athleteId,
  });

  const lines = useMemo(() => {
    if (!data?.polylines) return [];
    return data.polylines.map((p, i) => ({ id: `h${i}`, coordinates: p, color: filter === "ride" ? "#242427" : "#fc4c02", width: 2.5 }));
  }, [data, filter]);

  if (isLoading) return <div className="p-4"><div className="h-[340px] rounded-lg bg-muted animate-pulse" /></div>;
  const total = data?.polylines.length ?? 0;

  return (
    <div>
      <div className="flex gap-2 px-4 pt-3 pb-3">
        {(["all", "run", "ride"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3.5 h-8 rounded-full text-[12px] font-bold border transition-colors capitalize",
              filter === f ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
            )}
          >
            {f === "all" ? "All sports" : f}
          </button>
        ))}
      </div>
      <MapView
        lines={lines.length ? lines : undefined}
        height={420}
        markers={[]}
      />
      <div className="px-4 pt-4 pb-24">
        {total === 0 ? (
          <EmptyState icon={Flame} title="No heat yet" body="Record GPS activities to light up your personal heatmap." />
        ) : (
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <Flame size={20} className="text-primary" />
            <div className="flex-1">
              <div className="text-[13.5px] font-bold">{total} tracked activities</div>
              <div className="text-[12px] text-muted-foreground">Every route you&apos;ve recorded, on one map</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentsTab() {
  const nav = useNav();
  const units = useUnits();
  const { data } = useQuery({
    queryKey: ["segments", ""],
    queryFn: () => api.get<{ segments: SegmentSummary[] }>("segments"),
  });
  const segments = data?.segments ?? [];
  const lines = segments.slice(0, 20).map((s, i) => ({ id: `s${i}`, coordinates: s.points, color: s.sport === "run" ? "#fc4c02" : "#242427", width: 4 }));
  const markers = segments.slice(0, 20).map((s) => ({ lng: s.startLng, lat: s.startLat, kind: "segment" as const }));

  return (
    <div className="pb-24">
      <MapView lines={lines.length ? lines : undefined} markers={markers.length ? markers : undefined} height={280} />
      <button onClick={() => nav.push({ k: "segments" })} className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border active:bg-muted">
        <span className="flex items-center gap-2.5 text-[14px] font-bold">
          <Layers size={17} className="text-primary" /> Segment explorer
        </span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>
      {segments.slice(0, 10).map((s) => (
        <button
          key={s.id}
          className="flex items-center gap-3 px-4 py-3 border-b border-border active:bg-muted text-left w-full"
          onClick={() => nav.push({ k: "segment", slug: s.slug })}
        >
          <span className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", s.sport === "run" ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
            <SportIcon sport={s.sport} size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold truncate">{s.name}</div>
            <div className="text-[11.5px] text-muted-foreground">{s.city} · {(s.distanceM / 1000).toFixed(1)} km</div>
          </div>
          <ChevronRight size={15} className="text-muted-foreground/60" />
        </button>
      ))}
    </div>
  );
}

function RoutesTab() {
  const nav = useNav();
  const units = useUnits();
  const { data } = useQuery({
    queryKey: ["routes"],
    queryFn: () => api.get<{ mine: RouteItem[]; suggested: RouteItem[] }>("routes"),
  });
  return (
    <div className="pb-24">
      <div className="px-4 pt-3">
        <button
          onClick={() => nav.push({ k: "routeBuilder" })}
          className="w-full h-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-[13.5px] font-bold text-muted-foreground active:bg-muted"
        >
          <Plus size={17} /> Create a route
        </button>
      </div>
      {data?.mine?.length === 0 && data?.suggested?.length === 0 && (
        <EmptyState icon={RouteIcon} title="No routes yet" body="Plan your next adventure with the route builder." />
      )}
      {data?.mine && data.mine.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">My routes</div>
          <div className="flex flex-col gap-2.5 px-4">
            {data.mine.map((r) => <RouteCard key={r.id} route={r} units={units} />)}
          </div>
        </>
      )}
      {data?.suggested && data.suggested.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-2 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Suggested routes</div>
          <div className="flex flex-col gap-2.5 px-4">
            {data.suggested.map((r) => <RouteCard key={r.id} route={r} units={units} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function RouteCard({ route: r, units }: { route: RouteItem; units: "km" | "mi" }) {
  const nav = useNav();
  return (
    <button
      className="bg-card border border-border rounded-lg overflow-hidden text-left w-full active:scale-[0.99] transition-transform"
      onClick={() => nav.push({ k: "route", id: r.id })}
    >
      <RouteThumb polyline={r.points} height={100} />
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <SportIcon sport={r.sport} size={14} />
          <span className="text-[14.5px] font-bold truncate flex-1">{r.name}</span>
        </div>
        <div className="tnum text-[12px] text-muted-foreground mt-1 flex gap-3">
          <span>{fmtDist(r.distanceM, units, 1)} {distUnit(units)}</span>
          {r.estimatedTimeS ? <span>{fmtDuration(r.estimatedTimeS, "compact")}</span> : null}
          <span className="ml-auto">{r.creator ? `${r.creator.firstName} ${r.creator.lastName}` : "You"}</span>
        </div>
      </div>
    </button>
  );
}
