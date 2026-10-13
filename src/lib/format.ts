// Formatting helpers — all display units resolved client-side using athlete preference.

export type Units = "km" | "mi";
export const MI = 1609.344;

export function fmtDist(meters: number, units: Units, digits = 2): string {
  const v = units === "km" ? meters / 1000 : meters / MI;
  return `${v.toFixed(v >= 100 ? 1 : digits)}`;
}
export function distUnit(units: Units): string {
  return units === "km" ? "km" : "mi";
}

// The server stores SI (metres, seconds). These convert what the athlete types
// in their own units, and back for showing it in an input.
export function distToMeters(value: number, units: Units): number {
  return value * (units === "km" ? 1000 : MI);
}
export function metersToDist(meters: number, units: Units): number {
  return meters / (units === "km" ? 1000 : MI);
}
export const FT = 0.3048;
export function elevUnit(units: Units): string {
  return units === "km" ? "m" : "ft";
}
export function elevToMeters(value: number, units: Units): number {
  return units === "km" ? value : value * FT;
}
export function metersToElev(meters: number, units: Units): number {
  return units === "km" ? meters : meters / FT;
}
export function fmtDistFull(meters: number, units: Units): string {
  return `${fmtDist(meters, units)} ${distUnit(units)}`;
}

export function fmtDuration(seconds: number, style: "clock" | "compact" = "clock"): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (style === "clock") {
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtElev(meters: number, units: Units): string {
  const v = units === "km" ? meters : meters * 3.28084;
  return `${Math.round(v).toLocaleString()} ${units === "km" ? "m" : "ft"}`;
}

// pace = sec per km or sec per mile
export function fmtPace(secPerUnit: number, showUnit = true): string {
  if (!isFinite(secPerUnit) || secPerUnit <= 0) return showUnit ? "--:-- /km" : "--:--";
  const s = Math.round(secPerUnit);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}${showUnit ? "" : ""}`;
}

export function paceOf(meters: number, seconds: number, units: Units): number {
  // returns seconds per chosen unit
  if (meters <= 0 || seconds <= 0) return 0;
  const unit = units === "km" ? 1000 : MI;
  return seconds / (meters / unit);
}

export function speedOf(meters: number, seconds: number, units: Units): number {
  // km/h or mph
  if (seconds <= 0) return 0;
  const kmh = (meters / seconds) * 3.6;
  return units === "km" ? kmh : kmh / 1.609344;
}

export function fmtSpeed(kmh: number, units: Units): string {
  return `${kmh.toFixed(1)}`;
}

export function relativeDay(d: Date | string, now = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 14) return "Last week";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function longDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function timeOfDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function monthYear(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function agoLabel(d: Date | string, now = new Date()): string {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const diff = Math.max(0, now.getTime() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dday = Math.floor(h / 24);
  if (dday < 7) return `${dday}d`;
  return `${Math.floor(dday / 7)}w`;
}

// ISO week key "2026-W41" starting Monday
export function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay() || 7; // Mon=1..Sun=7
  date.setDate(date.getDate() - (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
