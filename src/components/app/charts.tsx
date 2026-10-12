"use client";
import React, { useMemo, useState } from "react";
import { distUnit, Units, fmtDist, fmtElev, fmtPace, MI } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Route thumbnail (SVG mini-map used in feed cards & lists) ────────────────
export function RouteThumb({
  polyline, className, height = 110, showPin = true, dark,
}: { polyline: [number, number][] | null | undefined; className?: string; height?: number; showPin?: boolean; dark?: boolean }) {
  const path = useMemo(() => {
    if (!polyline || polyline.length < 2) return null;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [lng, lat] of polyline) {
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
    const W = 340, H = 150, pad = 16;
    const dx = e - w || 1e-6, dy = n - s || 1e-6;
    const scale = Math.min((W - pad * 2) / dx, (H - pad * 2) / dy);
    const ox = (W - dx * scale) / 2, oy = (H - dy * scale) / 2;
    const pts = polyline.map(([lng, lat]) => [ox + (lng - w) * scale, H - (oy + (lat - s) * scale)] as [number, number]);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return { d, first: pts[0], last: pts[pts.length - 1] };
  }, [polyline]);

  if (!path) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/60", className)} style={{ height }}>
        <span className="text-[11px] text-muted-foreground font-medium tracking-wide px-2">No GPS data</span>
      </div>
    );
  }
  return (
    <div className={cn("overflow-hidden bg-elevation relative", className)} style={{ height }}>
      {/* faint street-grid texture so thumbnails read as maps */}
      <svg viewBox="0 0 340 150" className="absolute inset-0 w-full h-full opacity-[0.35]" aria-hidden>
        <defs>
          <pattern id="thumbgrid" width="34" height="30" patternUnits="userSpaceOnUse">
            <path d="M0 0H34M0 0V30" stroke="var(--border)" strokeWidth="1" fill="none" />
          </pattern>
        </defs>
        <rect width="340" height="150" fill="url(#thumbgrid)" />
      </svg>
      <svg viewBox="0 0 340 150" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d={path.d} fill="none" stroke="var(--primary)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        {showPin && <circle cx={path.first[0]} cy={path.first[1]} r="5" fill={dark ? "#101013" : "#ffffff"} stroke="var(--primary)" strokeWidth="3" />}
      </svg>
    </div>
  );
}

// ── Area/line chart core ─────────────────────────────────────────────────────
interface SeriesPoint { x: number; y: number }

function NiceBounds(vals: number[]): [number, number] {
  const min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

export interface ChartSeries {
  points: SeriesPoint[];
  color: string;
  fill?: string;
  width?: number;
  dashed?: boolean;
  label?: string;
}

export function LineAreaChart({
  series, height = 130, yLabel, yFormatter, xFormatter, yTicks = 3, highlightLabel, onHover,
}: {
  series: ChartSeries[];
  height?: number;
  yLabel?: string;
  yFormatter?: (v: number) => string;
  xFormatter?: (v: number) => string;
  yTicks?: number;
  highlightLabel?: { x: number; text: string };
  onHover?: (x: number | null) => void;
}) {
  const W = 360, H = 160;
  const padL = 6, padR = 6, padT = 16, padB = 18;
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const [yMinRaw, yMaxRaw] = NiceBounds(ys);
  const yPad = (yMaxRaw - yMinRaw) * 0.08;
  const [yMin, yMax] = [yMinRaw - yPad, yMaxRaw + yPad];
  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
  const sy = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const [hoverX, setHoverX] = useState<number | null>(null);
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const xVal = xMin + frac * (xMax - xMin);
    setHoverX(xVal);
    onHover?.(xVal);
  };

  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) / yTicks) * i);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height }}
        className="w-full touch-pan-y"
        onMouseMove={handleMove}
        onMouseLeave={() => { setHoverX(null); onHover?.(null); }}
      >
        {yTickVals.slice(1, -1).map((v, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        {series.map((s, si) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
          const areaD = `${d} L${sx(s.points[s.points.length - 1].x).toFixed(1)},${H - padB} L${sx(s.points[0].x).toFixed(1)},${H - padB} Z`;
          return (
            <g key={si}>
              {s.fill && <path d={areaD} fill={s.fill} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 5" : undefined} />
            </g>
          );
        })}
        {hoverX !== null && (
          <g>
            <line x1={sx(hoverX)} x2={sx(hoverX)} y1={padT} y2={H - padB} stroke="var(--muted-foreground)" strokeWidth="1" />
          </g>
        )}
        {xFormatter && (
          <text x={padL} y={H - 5} fontSize="9" fill="var(--muted-foreground)">{xFormatter(xMin)}</text>
        )}
        {xFormatter && (
          <text x={W - padR} y={H - 5} fontSize="9" fill="var(--muted-foreground)" textAnchor="end">{xFormatter(xMax)}</text>
        )}
        {yLabel && yFormatter && (
          <text x={padL + 2} y={padT - 5} fontSize="9" fill="var(--muted-foreground)" fontWeight="600">
            {yLabel} · {yFormatter(yMaxRaw)}
          </text>
        )}
      </svg>
      {highlightLabel && hoverX === null && (
        <div className="absolute top-0 left-1 text-[10px] text-muted-foreground font-medium pointer-events-none">{highlightLabel.text}</div>
      )}
    </div>
  );
}

// ── Elevation + Pace analysis charts ────────────────────────────────────────
export function AnalysisChart({
  series, kind, units, height,
}: {
  series: { t: number; d: number; ele: number; pace: number | null; hr: number; gap: number | null }[];
  kind: "elevation" | "pace" | "hr" | "gap";
  units: Units;
  height?: number;
}) {
  const chart = useMemo(() => {
    if (!series.length) return null;
    if (kind === "elevation") {
      return {
        series: [{ points: series.map((p) => ({ x: p.d, y: p.ele })), color: "var(--chart-1)", fill: "color-mix(in srgb, var(--primary) 14%, transparent)", width: 2 }],
        yLabel: "Elev",
        yFormatter: (v: number) => fmtElev(v, units),
        xFormatter: (v: number) => `${fmtDist(v, units, 1)} ${distUnit(units)}`,
      };
    }
    if (kind === "pace") {
      const pts = series.filter((p) => p.pace != null).map((p) => ({ x: p.d, y: p.pace! }));
      if (!pts.length) return null;
      // invert pace (lower = faster = better) → chart shows like Strava (lower dips)
      return {
        series: [{ points: pts, color: "var(--chart-1)", width: 2 }],
        yLabel: "Pace",
        yFormatter: (v: number) => `${fmtPace(v)} /${distUnit(units)}`,
        xFormatter: (v: number) => `${fmtDist(v, units, 1)} ${distUnit(units)}`,
      };
    }
    if (kind === "gap") {
      const pts = series.filter((p) => p.gap != null).map((p) => ({ x: p.d, y: p.gap! }));
      if (!pts.length) return null;
      return {
        series: [{ points: pts, color: "#242427", width: 2 }],
        yLabel: "GAP",
        yFormatter: (v: number) => `${fmtPace(v)} /${distUnit(units)}`,
        xFormatter: (v: number) => `${fmtDist(v, units, 1)} ${distUnit(units)}`,
      };
    }
    return {
      series: [{ points: series.map((p) => ({ x: p.d, y: p.hr })), color: "#d5302a", width: 2 }],
      yLabel: "HR",
      yFormatter: (v: number) => `${Math.round(v)} bpm`,
      xFormatter: (v: number) => `${fmtDist(v, units, 1)} ${distUnit(units)}`,
    };
  }, [series, kind, units]);

  if (!chart) return <div className="h-[130px] flex items-center justify-center text-[12px] text-muted-foreground">No data</div>;
  return <LineAreaChart series={chart.series} height={height ?? 130} yLabel={chart.yLabel} yFormatter={chart.yFormatter} xFormatter={chart.xFormatter} />;
}

// ── Splits bar chart ─────────────────────────────────────────────────────────
export function SplitsChart({
  splits, units, height = 110, metric = "pace",
}: {
  splits: { index: number; distanceM: number; timeS: number; paceZone: number }[];
  units: Units;
  height?: number;
  metric?: "pace" | "hr";
}) {
  const data = useMemo(() => {
    if (!splits.length) return null;
    const vals = splits.map((s) => (metric === "pace" ? s.timeS / Math.max(1, s.distanceM / 1000) : s.index));
    const paces = splits.map((s) => s.timeS / Math.max(1, s.distanceM / 1000));
    const minP = Math.min(...paces), maxP = Math.max(...paces);
    return { vals, paces, minP, maxP };
  }, [splits, metric]);
  if (!data) return null;
  const maxZone = Math.max(...splits.map((s) => Math.abs(s.paceZone)), 1);
  const W = 360, H = 150, padB = 16;
  const bw = (W - 4) / splits.length;
  const barW = Math.max(6, bw - 6);
  const shade = (zone: number) => {
    // Strava pace zone shading: faster = darker orange
    const t = Math.abs(zone) / maxZone;
    if (zone > 0) return `color-mix(in srgb, var(--primary) ${55 + t * 40}%, var(--muted))`;
    return `color-mix(in srgb, var(--muted-foreground) ${20 + t * 25}%, var(--muted))`;
  };
  const yScale = (pace: number) => {
    const p = (data.maxP - pace) / (data.maxP - data.minP || 1);
    return padB + p * (H - padB - 26);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full">
      {splits.map((s, i) => {
        const pace = s.timeS / Math.max(1, s.distanceM / 1000);
        const y = yScale(Math.min(data.maxP, Math.max(data.minP, pace)));
        return (
          <g key={i}>
            <rect
              x={2 + i * bw + (bw - barW) / 2} y={y}
              width={barW} height={H - padB - y}
              rx={Math.min(3, barW / 3)}
              fill={shade(s.paceZone)}
            />
          </g>
        );
      })}
      <text x={2} y={H - 4} fontSize="9" fill="var(--muted-foreground)">1</text>
      <text x={W - 2} y={H - 4} fontSize="9" fill="var(--muted-foreground)" textAnchor="end">{splits.length}</text>
      <text x={2} y={12} fontSize="9" fill="var(--muted-foreground)" fontWeight="600">
        {fmtPace(data.minP)} fastest
      </text>
    </svg>
  );
}

// ── Weekly bar chart with goal line ──────────────────────────────────────────
export function WeeklyBars({
  data, goal, units, height = 120, onBarClick,
}: {
  data: { weekStart: string; distanceM: number }[];
  goal?: number;
  units: Units;
  height?: number;
  onBarClick?: (i: number) => void;
}) {
  if (!data.length) return null;
  const W = 360, H = 160, padB = 18, padT = 24;
  const vals = data.map((d) => d.distanceM / 1000);
  const maxV = Math.max(...vals, goal ?? 0, 1) * 1.15;
  const bw = (W - 8) / data.length;
  const barW = Math.min(26, bw - 8);
  const goalY = goal ? padT + (1 - goal / maxV) * (H - padT - padB) : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full">
        {goalY !== null && (
          <line x1={4} x2={W - 4} y1={goalY} y2={goalY} stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="6 4" opacity={0.7} />
        )}
        {data.map((d, i) => {
          const v = vals[i];
          const y = padT + (1 - v / maxV) * (H - padT - padB);
          return (
            <g key={i} onClick={() => onBarClick?.(i)} className={onBarClick ? "cursor-pointer" : undefined}>
              <rect
                x={4 + i * bw + (bw - barW) / 2} y={y}
                width={barW} height={Math.max(2, H - padB - y)}
                rx={3}
                fill={goal && v >= goal ? "var(--primary)" : "color-mix(in srgb, var(--primary) 32%, var(--muted))"}
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute top-0 right-1 text-[10px] text-muted-foreground font-medium">
        {goal ? `Goal ${goal} ${distUnit(units)}` : ""}
      </div>
    </div>
  );
}

// ── Goal ring ────────────────────────────────────────────────────────────────
export function GoalRing({
  progress, size = 64, stroke = 7, color, children,
}: { progress: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color ?? "var(--primary)"} strokeWidth={stroke}
          strokeDasharray={`${c * p} ${c}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ── Fitness & Freshness chart ────────────────────────────────────────────────
export function FitnessChart({
  series, height = 170,
}: { series: { date: string; fitness: number; fatigue: number; form: number }[]; height?: number }) {
  if (series.length < 2) return null;
  const W = 360, H = 170, padL = 8, padR = 8, padT = 14, padB = 16;
  const xs = series.map((_, i) => i);
  const ys = series.flatMap((s) => [s.fitness, s.fatigue, s.form]);
  const [yMin, yMax] = NiceBounds(ys);
  const sx = (i: number) => padL + (i / (series.length - 1)) * (W - padL - padR);
  const sy = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);
  const mk = (get: (s: any) => number) => series.map((s, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(get(s)).toFixed(1)}`).join(" ");
  const todayX = sx(series.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full">
      <line x1={padL} x2={W - padR} y1={sy(0)} y2={sy(0)} stroke="var(--border)" strokeWidth="1" />
      <path d={mk((s: any) => s.fitness)} fill="none" stroke="var(--foreground)" strokeWidth="2.4" />
      <path d={mk((s: any) => s.fatigue)} fill="none" stroke="var(--primary)" strokeWidth="2" />
      <path d={mk((s: any) => s.form)} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.6" strokeDasharray="4 4" />
      <line x1={todayX} x2={todayX} y1={padT} y2={H - padB} stroke="var(--muted-foreground)" strokeWidth="1" opacity={0.5} />
      <circle cx={todayX} cy={sy(series[series.length - 1].fitness)} r="3.5" fill="var(--foreground)" />
      <circle cx={todayX} cy={sy(series[series.length - 1].fatigue)} r="3.5" fill="var(--primary)" />
      <text x={padL} y={H - 4} fontSize="9" fill="var(--muted-foreground)">
        {new Date(series[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </text>
      <text x={W - padR} y={H - 4} fontSize="9" fill="var(--muted-foreground)" textAnchor="end">Today</text>
    </svg>
  );
}

// ── Legend row for charts ────────────────────────────────────────────────────
export function ChartLegend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="inline-block w-4 h-[2.5px] rounded-full"
            style={{ background: it.dashed ? "repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 8px)" : "none", backgroundColor: it.dashed ? undefined : it.color, color: it.color }}
          />
          {it.label}
        </div>
      ))}
    </div>
  );
}
