"use client";
import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

// Leaflet is loaded lazily (it requires `window`, so a static import breaks SSR).
let leafletModule: any = null;
let leafletLoading: Promise<any> | null = null;
function getLeaflet(): Promise<any> {
  leafletLoading ??= import("leaflet").then((m) => {
    leafletModule = m.default ?? m;
    return leafletModule;
  });
  return leafletLoading;
}

// ESRI Canvas basemaps — minimal gray style (no API key, no watermarks, CORS-friendly).
// ArcGIS tile scheme: /tile/{z}/{y}/{x} — note the y-before-x order.
const LIGHT_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LIGHT_REF = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const DARK_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const DARK_REF = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const ATTRIB = "Esri, HERE, Garmin, FAO, NOAA, USGS";

export interface MapMarker {
  lng: number;
  lat: number;
  kind: "start" | "finish" | "me" | "waypoint" | "segment";
  label?: string;
}

export interface MapLine {
  id: string;
  coordinates: [number, number][];
  color?: string;
  width?: number;
  dashed?: boolean;
}

function pinIcon(L: any, kind: MapMarker["kind"], label?: string): any {
  const html =
    kind === "start"
      ? `<span style="display:block;width:15px;height:15px;border-radius:50%;background:#fc4c02;border:3px solid var(--map-pin-ring,#fff);box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`
      : kind === "finish"
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 21V4" stroke="var(--map-pin-fg,#242427)" stroke-width="2.4" stroke-linecap="round"/><path d="M5 4h13l-2.5 4L18 12H5" fill="#fc4c02" stroke="var(--map-pin-fg,#242427)" stroke-width="1.6" stroke-linejoin="round"/></svg>`
        : kind === "me"
          ? `<span style="display:block;position:relative;width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,#fc4c02 28%,transparent);border:2px solid #fc4c02;box-shadow:0 0 0 3px color-mix(in srgb,#fc4c02 22%,transparent)"><span style="position:absolute;inset:0;margin:auto;width:9px;height:9px;border-radius:50%;background:#fc4c02;border:2px solid #fff"></span></span>`
          : kind === "segment"
            ? `<span style="display:block;width:12px;height:12px;border-radius:50%;background:#fc4c02;border:2.5px solid var(--map-pin-ring,#fff);box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>`
            : `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--map-pin-fg,#242427);color:#fff;font:600 10px/1 Inter,sans-serif">${label ?? ""}</span>`;
  return L.divIcon({
    html,
    className: "stride-pin",
    iconSize: kind === "waypoint" ? [20, 18] : [16, 16],
    iconAnchor: kind === "waypoint" ? [10, 9] : [8, 8],
  });
}

export function MapView({
  lines, markers, height = 220, fitTo = "lines", interactive = true, follow, className, onClick, onReady, liveMarker,
}: {
  lines?: MapLine[];
  markers?: MapMarker[];
  height?: number | string;
  fitTo?: "lines" | "none";
  interactive?: boolean;
  follow?: { lng: number; lat: number } | null;
  className?: string;
  onClick?: (lng: number, lat: number) => void;
  onReady?: (map: L.Map) => void;
  liveMarker?: { lng: number; lat: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const refTileRef = useRef<L.TileLayer | null>(null);
  const lineLayers = useRef<Map<string, L.Polyline>>(new Map());
  const markerLayers = useRef<Map<string, L.Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const onClickRef = useRef(onClick);

  // keep the click handler fresh without re-binding the map listener
  useEffect(() => {
    onClickRef.current = onClick;
  });

  // init once (async leaflet load)
  useEffect(() => {
    let cancelled = false;
    getLeaflet().then((L) => {
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, {
        attributionControl: true,
        zoomControl: false,
        dragging: interactive,
        touchZoom: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: false,
        keyboard: false,
        zoomSnap: 0.5,
      });
      map.attributionControl.setPrefix(false);
      map.setView([23.788, 90.408], 12);
      mapRef.current = map;
      (mapRef.current as any).__L = L;
      onReady?.(map);
      map.on("click", (e: L.LeafletMouseEvent) => onClickRef.current?.(e.latlng.lng, e.latlng.lat));
      setReady(true);
    }).catch((e) => console.error("[MAP] leaflet load failed", e));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      lineLayers.current = new Map();
      markerLayers.current = new Map();
    };
     
  }, []);

  // tiles follow theme (base + reference labels)
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const L = (map as any).__L;
    if (!map || !L) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    if (refTileRef.current) {
      map.removeLayer(refTileRef.current);
      refTileRef.current = null;
    }
    const isDark = resolvedTheme === "dark";
    tileRef.current = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, {
      attribution: ATTRIB,
      maxZoom: 20,
      maxNativeZoom: 16,
      className: isDark ? "" : "stride-light-tiles",
    }).addTo(map);
    refTileRef.current = L.tileLayer(isDark ? DARK_REF : LIGHT_REF, {
      maxZoom: 20,
      maxNativeZoom: 16,
      className: isDark ? "" : "stride-light-tiles",
    }).addTo(map);
  }, [ready, resolvedTheme]);

  // lines
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const L = (map as any).__L;
    if (!map || !L) return;
    const wanted = new Set<string>();
    for (const line of lines ?? []) {
      wanted.add(line.id);
      const latlngs = line.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      const existing = lineLayers.current.get(line.id);
      if (existing) {
        existing.setLatLngs(latlngs);
        existing.setStyle({ color: line.color ?? "#fc4c02", weight: line.width ?? 4, opacity: 1 });
      } else {
        const created: L.Polyline = L.polyline(latlngs, {
          color: line.color ?? "#fc4c02",
          weight: line.width ?? 4,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round",
          dashArray: line.dashed ? "6 6" : undefined,
          interactive: false,
        }).addTo(map);
        lineLayers.current.set(line.id, created);
      }
    }
    for (const [id, layer] of lineLayers.current) {
      if (!wanted.has(id)) {
        map.removeLayer(layer);
        lineLayers.current.delete(id);
      }
    }
    if (fitTo === "lines" && (lines ?? []).some((l) => l.coordinates.length > 1)) {
      const all = (lines ?? []).flatMap((l) => l.coordinates);
      const bounds = L.latLngBounds(all.map(([lng, lat]) => [lat, lng] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15.5, animate: false });
    }
  }, [ready, lines, fitTo]);

  // markers
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const L = (map as any).__L;
    if (!map || !L) return;
    const wanted = new Set<string>();
    (markers ?? []).forEach((m, i) => {
      const id = `${m.kind}:${m.lng.toFixed(6)},${m.lat.toFixed(6)}:${i}`;
      wanted.add(id);
      if (!markerLayers.current.has(id)) {
        const marker = L.marker([m.lat, m.lng], {
          icon: pinIcon(L, m.kind, m.label),
          interactive: false,
          keyboard: false,
          zIndexOffset: m.kind === "me" ? 1000 : 0,
        }).addTo(map);
        markerLayers.current.set(id, marker);
      }
    });
    for (const [id, layer] of markerLayers.current) {
      if (!wanted.has(id)) {
        map.removeLayer(layer);
        markerLayers.current.delete(id);
      }
    }
  }, [ready, markers]);

  // follow mode
  useEffect(() => {
    const map = mapRef.current;
    if (map && follow) map.panTo([follow.lat, follow.lng], { animate: true, duration: 0.6 });
  }, [follow?.lat, follow?.lng, ready]);

  // live marker (activity playback) — one marker, updated by setLatLng
  const liveRef = useRef<L.Marker | null>(null);
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const L = (map as any).__L;
    if (!map || !L) return;
    if (!liveMarker) {
      if (liveRef.current) {
        map.removeLayer(liveRef.current);
        liveRef.current = null;
      }
      return;
    }
    if (!liveRef.current) {
      liveRef.current = L.marker([liveMarker.lat, liveMarker.lng], {
        icon: pinIcon(L, "me"),
        interactive: false,
        keyboard: false,
        zIndexOffset: 2000,
      }).addTo(map);
    } else {
      liveRef.current.setLatLng([liveMarker.lat, liveMarker.lng]);
    }
  }, [ready, liveMarker?.lng, liveMarker?.lat]);

  return (
    <div className={cn("relative overflow-hidden bg-elevation shrink-0", className)} style={{ height }} aria-label="Map">
      <div ref={ref} className="absolute inset-0 [&_.leaflet-container]:bg-transparent [&_.leaflet-attribution]:text-[9px] [&_.leaflet-attribution_a]:text-muted-foreground" />
    </div>
  );
}

// Convenience: activity route map
export function ActivityMap({
  polyline, segmentHighlight, height = 230, hidePins, interactive = true, onMapClick,
}: {
  polyline: [number, number][] | null;
  segmentHighlight?: [number, number][];
  height?: number;
  hidePins?: boolean;
  interactive?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
}) {
  const lines: MapLine[] = [];
  if (segmentHighlight && segmentHighlight.length > 1 && polyline && polyline.length > 1) {
    lines.push({ id: "base", coordinates: polyline, color: "#c8c8cd", width: 3 });
    lines.push({ id: "seg", coordinates: segmentHighlight, color: "#242427", width: 5 });
  } else if (polyline && polyline.length > 1) {
    lines.push({ id: "route", coordinates: polyline, color: "#fc4c02", width: 4 });
  }
  const markers: MapMarker[] = [];
  if (!hidePins && polyline && polyline.length > 1) {
    markers.push({ lng: polyline[0][0], lat: polyline[0][1], kind: "start" });
    const last = polyline[polyline.length - 1];
    const isLoop = Math.abs(last[0] - polyline[0][0]) < 0.001 && Math.abs(last[1] - polyline[0][1]) < 0.001;
    if (!isLoop) markers.push({ lng: last[0], lat: last[1], kind: "finish" });
  }
  if (segmentHighlight && segmentHighlight.length > 1) {
    markers.push({ lng: segmentHighlight[0][0], lat: segmentHighlight[0][1], kind: "segment" });
    markers.push({ lng: segmentHighlight[segmentHighlight.length - 1][0], lat: segmentHighlight[segmentHighlight.length - 1][1], kind: "finish" });
  }
  return (
    <MapView
      lines={lines.length ? lines : undefined}
      markers={markers.length ? markers : undefined}
      height={height}
      interactive={interactive}
      onClick={onMapClick}
    />
  );
}
