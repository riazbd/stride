"use client";
import React from "react";
import { sportOf } from "@/lib/sports";
import { cn } from "@/lib/utils";
import {
  Footprints, Mountain, Bike, Waves, Snowflake, Zap, PersonStanding, Activity as ActivityIcon,
  Dumbbell, Flower2, CircleDot, Trophy, Sailboat, MonitorPlay,
} from "lucide-react";

const ICONS: Record<string, any> = {
  Footprints, Mountain, Bike, Waves, Snowflake, Zap, PersonStanding, Activity: ActivityIcon,
  Dumbbell, Flower2, CircleDot, Trophy, Sailboat, MonitorPlay,
};

export function SportIcon({ sport, size = 16, className }: { sport: string; size?: number; className?: string }) {
  const def = sportOf(sport);
  const Icon = ICONS[def.icon] ?? ActivityIcon;
  return <Icon size={size} className={className} strokeWidth={2.2} aria-label={def.label} />;
}

export function Avatar({
  athlete, size = 40, className, onClick, ring,
}: {
  athlete: { firstName: string; lastName: string; avatarColor: string } | null | undefined;
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  ring?: boolean;
}) {
  const initials = athlete ? (athlete.firstName?.[0] ?? "") + (athlete.lastName?.[0] ?? "") : "?";
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "shrink-0 select-none flex items-center justify-center rounded-full font-semibold text-white tracking-wide",
        ring && "ring-2 ring-background",
        onClick && "cursor-pointer active:scale-95 transition-transform",
        className
      )}
      style={{
        width: size, height: size, backgroundColor: athlete?.avatarColor ?? "#85858c",
        fontSize: Math.max(10, size * 0.38),
      }}
      aria-label={athlete ? `${athlete.firstName} ${athlete.lastName}` : "Athlete"}
    >
      {initials.toUpperCase()}
    </div>
  );
}

export function StatBlock({
  label, value, sub, className, accent,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("tnum text-[17px] leading-tight font-semibold truncate", accent && "text-primary")}>{value}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export function Badge({
  children, tone = "default", className,
}: { children: React.ReactNode; tone?: "default" | "primary" | "trophy" | "achievement" | "muted"; className?: string }) {
  const tones = {
    default: "bg-muted text-foreground",
    primary: "bg-primary text-primary-foreground",
    trophy: "bg-trophy/15 text-trophy",
    achievement: "bg-achievement/10 text-achievement",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon, title, body, action,
}: { icon: any; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon size={26} className="text-muted-foreground" />
      </div>
      <div className="font-semibold text-[15px]">{title}</div>
      {body && <div className="text-muted-foreground text-[13px] mt-1 max-w-[260px] leading-snug">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-2">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">{children}</h2>
      {right}
    </div>
  );
}

// Segmented control (Strava-style underline tabs)
export function SegmentedTabs({
  tabs, value, onChange, className,
}: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={cn("flex border-b border-border bg-background", className)}>
      <div className="flex overflow-x-auto no-scrollbar w-full">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex-1 min-w-fit whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold transition-colors",
              value === t.id ? "text-foreground" : "text-muted-foreground"
            )}
            aria-pressed={value === t.id}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-muted-foreground font-normal">{t.count}</span>}
            {value === t.id && <span className="absolute inset-x-3 bottom-0 h-[2.5px] bg-primary rounded-full" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ListRow({
  left, title, sub, right, onClick, className, chevron,
}: {
  left?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode;
  onClick?: () => void; className?: string; chevron?: boolean;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left",
        onClick && "active:bg-muted transition-colors",
        className
      )}
    >
      {left}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-tight truncate">{title}</div>
        {sub && <div className="text-[12px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
      </div>
      {right}
      {chevron && (
        <svg width="7" height="12" viewBox="0 0 7 12" className="text-muted-foreground/60 shrink-0">
          <path d="M1 1L6 6L1 11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      )}
    </Comp>
  );
}
