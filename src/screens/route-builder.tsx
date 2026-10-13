"use client";
import React, { useCallback, useRef, useState } from "react";
import { Undo2, Check, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { MapView } from "@/components/app/MapView";
import { useUnits } from "@/components/app/cards";
import { fmtDist, distUnit } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { sportOf, RECORD_SPORTS } from "@/lib/sports";
import { SportIcon } from "@/components/app/ui";
import { PremiumGate, usePremium } from "@/components/app/premium";

const SPORT_SPEED: Record<string, number> = { run: 3.2, walk: 1.4, ride: 6.5, gravel: 5.8 };

// OSRM servers with pedestrian and bicycle profiles (FOSSGIS, same as openstreetmap.org's
// directions) — car routing would avoid footpaths and obey one-way streets. Self-host
// osrm-backend and point these at it for production traffic.
const ROUTERS = {
  foot: process.env.NEXT_PUBLIC_OSRM_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot",
  bike: process.env.NEXT_PUBLIC_OSRM_BIKE_URL ?? "https://routing.openstreetmap.de/routed-bike",
};
const routerFor = (sport: string) => (["run", "walk", "hike", "trail_run"].includes(sport) ? ROUTERS.foot : ROUTERS.bike);

async function routeVia(wp: [number, number][], sport: string): Promise<{ coords: [number, number][]; distance: number } | null> {
  const coordStr = wp.map((w) => `${w[0].toFixed(6)},${w[1].toFixed(6)}`).join(";");
  // the path segment is the OSRM API's profile slot; these servers serve one profile each
  const res = await fetch(`${routerFor(sport)}/route/v1/driving/${coordStr}?overview=full&geometries=geojson`);
  const json = await res.json();
  if (json.code !== "Ok") return null;
  return { coords: json.routes[0].geometry.coordinates, distance: json.routes[0].distance };
}

export function RouteBuilderScreen() {
  const nav = useNav();
  const units = useUnits();
  const { toast } = useToast();
  const premium = usePremium();
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [snapped, setSnapped] = useState<[number, number][]>([]);
  const [distance, setDistance] = useState(0);
  const [routing, setRouting] = useState(false);
  const [sport, setSport] = useState("ride");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showName, setShowName] = useState(false);
  const lastRequest = useRef(0);

  const onMapClick = useCallback(async (lng: number, lat: number) => {
    const wp = [...waypoints, [lng, lat] as [number, number]];
    setWaypoints(wp);
    if (wp.length < 2) return;
    const reqId = ++lastRequest.current;
    setRouting(true);
    try {
      const route = await routeVia(wp, sport);
      if (reqId !== lastRequest.current) return;
      if (route) {
        setSnapped(route.coords);
        setDistance(route.distance);
      } else {
        toast({ description: "Could not route between those points" });
        setWaypoints(waypoints);
      }
    } catch {
      if (reqId === lastRequest.current) toast({ description: "Routing service unavailable" });
    } finally {
      if (reqId === lastRequest.current) setRouting(false);
    }
  }, [waypoints, sport, toast]);

  const undo = () => {
    const wp = waypoints.slice(0, -1);
    setWaypoints(wp);
    if (wp.length < 2) {
      setSnapped([]);
      setDistance(0);
      return;
    }
    reroute(wp, sport);
  };

  const reroute = async (wp: [number, number][], forSport: string) => {
    if (wp.length < 2) return;
    const reqId = ++lastRequest.current;
    setRouting(true);
    try {
      const route = await routeVia(wp, forSport);
      if (reqId !== lastRequest.current) return;
      if (route) {
        setSnapped(route.coords);
        setDistance(route.distance);
      }
    } catch { /* keep old */ } finally {
      if (reqId === lastRequest.current) setRouting(false);
    }
  };

  // switching between foot and bike changes which paths are allowed
  const changeSport = (s: string) => {
    setSport(s);
    if (routerFor(s) !== routerFor(sport)) reroute(waypoints, s);
  };

  const save = async () => {
    if (snapped.length < 2 || !name.trim()) return;
    setSaving(true);
    try {
      const est = Math.round(distance / (SPORT_SPEED[sport] ?? 5));
      await api.post("routes", {
        name: name.trim(),
        sport,
        points: snapped.map((p) => [p[0], p[1], 0]),
        distanceM: distance,
        elevationM: 0,
        estimatedTimeS: est,
      });
      toast({ description: "Route saved" });
      nav.reset("maps", { k: "maps" });
      nav.push({ k: "routes" }, "maps");
    } catch (e: any) {
      toast({ description: e.message ?? "Could not save route" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {!premium ? (
        <div className="flex-1 flex flex-col justify-center px-4">
          <PremiumGate
            title="Route Builder"
            body="Plan runs and rides on real roads — tap waypoints and STRIDE snaps them to a routable path with live distance."
            feature="routeBuilder"
          />
          <div className="mt-3 bg-card border border-border rounded-lg p-4 opacity-50 select-none" aria-hidden>
            <div className="h-[200px] rounded bg-muted/60" />
          </div>
          <button onClick={() => nav.pop()} className="mt-3 h-11 rounded-lg border border-border font-bold text-[14px]">
            Back
          </button>
        </div>
      ) : (
      <>
      <div className="relative flex-1 min-h-0">
        <MapView
          lines={snapped.length > 1 ? [{ id: "draft", coordinates: snapped, color: "#fc4c02", width: 5 }] : undefined}
          markers={waypoints.map((w, i) => ({ lng: w[0], lat: w[1], kind: "waypoint" as const, label: String(i + 1) }))}
          height="100%"
          fitTo="none"
          onClick={onMapClick}
        />
        <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
          <button onClick={() => nav.pop()} className="w-9 h-9 rounded-full bg-background/95 backdrop-blur border border-border flex items-center justify-center shadow-sm" aria-label="Cancel">
            <X size={19} />
          </button>
          <div className="flex-1 h-9 rounded-full bg-background/95 backdrop-blur border border-border flex items-center justify-center shadow-sm">
            <span className="text-[12px] font-bold">
              {routing ? "Routing…" : waypoints.length ? `${waypoints.length} point${waypoints.length > 1 ? "s" : ""}` : "Tap the map to start"}
            </span>
          </div>
          <button
            onClick={undo}
            disabled={!waypoints.length}
            className="w-9 h-9 rounded-full bg-background/95 backdrop-blur border border-border flex items-center justify-center shadow-sm disabled:opacity-40"
            aria-label="Undo point"
          >
            <Undo2 size={17} />
          </button>
        </div>
      </div>

      {/* bottom panel */}
      <div className="shrink-0 bg-background border-t border-border px-4 pt-3 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          {["ride", "run", "walk", "gravel"].map((s) => (
            <button
              key={s}
              onClick={() => changeSport(s)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-9 rounded-lg border text-[12.5px] font-semibold shrink-0 transition-colors",
                sport === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
              )}
            >
              <SportIcon sport={s} size={14} />
              {sportOf(s).label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 mb-3">
          <div>
            <div className="tnum text-[22px] font-extrabold leading-none">{fmtDist(distance, units, 1)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mt-1">{distUnit(units)}</div>
          </div>
          <div>
            <div className="tnum text-[22px] font-extrabold leading-none">
              {distance ? Math.round(distance / (SPORT_SPEED[sport] ?? 5) / 60) : 0}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mt-1">min est</div>
          </div>
          {routing && <Loader2 size={20} className="animate-spin text-primary ml-auto" />}
        </div>
        {!showName ? (
          <button
            onClick={() => snapped.length > 1 && setShowName(true)}
            disabled={snapped.length < 2}
            className="w-full h-13 py-3.5 rounded-lg bg-primary text-primary-foreground font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            Save Route
          </button>
        ) : (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Route name"
              maxLength={60}
              className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary"
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) save(); }}
            />
            <button onClick={save} disabled={saving || !name.trim()} className="w-14 h-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40" aria-label="Confirm save">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={19} />}
            </button>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
