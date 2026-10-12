"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Route as RouteIcon, Plus, Mountain, Clock, Pencil, Trash2 } from "lucide-react";
import { api, RouteItem } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { MapView } from "@/components/app/MapView";
import { RouteThumb } from "@/components/app/charts";
import { useUnits } from "@/components/app/cards";
import { fmtDist, distUnit, fmtDuration, fmtElev } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function RoutesScreen() {
  const nav = useNav();
  const units = useUnits();
  const { data } = useQuery({
    queryKey: ["routes"],
    queryFn: () => api.get<{ mine: RouteItem[]; suggested: RouteItem[] }>("routes"),
  });
  return (
    <div className="flex flex-col min-h-full pb-20">
      <ScreenHeader
        title="Routes"
        right={
          <button onClick={() => nav.push({ k: "routeBuilder" })} className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-muted text-[12.5px] font-bold active:scale-95 transition-transform">
            <Plus size={15} /> New
          </button>
        }
      />
      <div className="flex flex-col gap-2.5 px-4 pt-4">
        {data?.mine?.length === 0 && data?.suggested?.length === 0 && (
          <div className="text-center text-muted-foreground text-[13px] py-10">No routes yet. Create one from the Maps tab.</div>
        )}
        {data?.mine?.map((r) => <RouteRow key={r.id} r={r} units={units} />)}
        {data?.suggested && data.suggested.length > 0 && (
          <>
            <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground pt-2">Suggested</div>
            {data.suggested.map((r) => <RouteRow key={r.id} r={r} units={units} />)}
          </>
        )}
      </div>
    </div>
  );
}

function RouteRow({ r, units }: { r: RouteItem; units: "km" | "mi" }) {
  const nav = useNav();
  return (
    <button className="bg-card border border-border rounded-lg overflow-hidden text-left w-full active:scale-[0.99] transition-transform" onClick={() => nav.push({ k: "route", id: r.id })}>
      <RouteThumb polyline={r.points} height={96} />
      <div className="px-3.5 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-bold truncate">{r.name}</div>
          <div className="tnum text-[12px] text-muted-foreground">{fmtDist(r.distanceM, units, 1)} {distUnit(units)} · {fmtElev(r.elevationM, units)}</div>
        </div>
      </div>
    </button>
  );
}

export function RouteScreen({ id }: { id: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["routes"],
    queryFn: () => api.get<{ mine: RouteItem[]; suggested: RouteItem[] }>("routes"),
  });
  const route = [...(data?.mine ?? []), ...(data?.suggested ?? [])].find((r) => r.id === id);

  if (!route) {
    return <div className="flex flex-col"><ScreenHeader title="Route" /><div className="p-6 text-muted-foreground text-[13px]">Route not found.</div></div>;
  }

  const del = async () => {
    try {
      await api.del(`routes/${route.id}`);
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast({ description: "Route deleted" });
      nav.pop();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not delete" });
    }
  };

  const estSpeed = route.sport === "run" ? 3.2 : route.sport === "walk" ? 1.4 : 6.5;
  const estTime = route.estimatedTimeS ?? Math.round(route.distanceM / estSpeed);

  return (
    <div className="flex flex-col min-h-full pb-20">
      <ScreenHeader
        title={route.name}
        right={
          route.isMine ? (
            <button onClick={del} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted text-muted-foreground" aria-label="Delete route">
              <Trash2 size={19} />
            </button>
          ) : undefined
        }
      />
      <MapView lines={[{ id: "route", coordinates: route.points, color: "#fc4c02", width: 4.5 }]} height={300} />
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg px-4 py-4 grid grid-cols-3">
          <Stat label="Distance" value={fmtDist(route.distanceM, units, 1)} sub={distUnit(units)} />
          <Stat label="Elevation" value={fmtElev(route.elevationM, units)} />
          <Stat label="Est. time" value={fmtDuration(estTime, "compact")} />
        </div>
        {route.description && <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">{route.description}</p>}
        {route.creator && !route.isMine && (
          <button className="mt-3 flex items-center gap-2.5 w-full text-left active:bg-muted rounded-lg p-2" onClick={() => nav.push({ k: "profile", id: route.creator!.id })}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-[13px]" style={{ background: route.creator.avatarColor }}>
              {route.creator.firstName[0]}{route.creator.lastName[0]}
            </span>
            <span className="text-[13.5px] font-semibold">Created by {route.creator.firstName} {route.creator.lastName}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="tnum text-[19px] font-bold leading-none flex items-baseline gap-1 text-primary">
        {value}{sub && <span className="text-[11px] font-semibold text-muted-foreground">{sub}</span>}
      </div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}
