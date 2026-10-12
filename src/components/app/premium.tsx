"use client";
import React from "react";
import { Lock, Sparkles, Check, ChevronRight } from "lucide-react";
import { useUI, useNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Premium status hook — the single source of truth for gating.
export function usePremium(): boolean {
  return !!useUI((s) => s.me?.premium);
}

// Premium badge shown next to gated features (Strava-style).
export function ProBadge({ className }: { className?: string }) {
  return (
    <span className={cn("text-[9.5px] font-extrabold text-primary uppercase tracking-[0.08em]", className)}>
      Pro
    </span>
  );
}

// Card overlay for a locked premium section. Tapping opens the paywall.
export function PremiumGate({
  title,
  body,
  feature,
  compact,
  className,
}: {
  title: string;
  body: string;
  feature?: string;
  compact?: boolean;
  className?: string;
}) {
  const nav = useNav();
  return (
    <button
      onClick={() => nav.push({ k: "premium", feature })}
      className={cn(
        "w-full rounded-lg border border-primary/30 bg-primary/[0.04] flex items-center gap-3.5 px-4 text-left active:bg-primary/[0.08] transition-colors",
        compact ? "py-3.5" : "py-4",
        className
      )}
    >
      <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Lock size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[14px] font-bold text-primary truncate">{title}</span>
        </span>
        <span className="block text-[12px] text-muted-foreground leading-snug mt-0.5">{body}</span>
      </span>
      <ChevronRight size={16} className="text-primary shrink-0" />
    </button>
  );
}

// Inline upsell row (used under truncated leaderboards etc.)
export function UnlockRow({ label, feature }: { label: string; feature?: string }) {
  const nav = useNav();
  return (
    <button
      onClick={() => nav.push({ k: "premium", feature })}
      className="flex items-center justify-center gap-2 w-full py-3.5 border-t border-border active:bg-muted"
    >
      <Sparkles size={14} className="text-primary" />
      <span className="text-[13px] font-bold text-primary">{label}</span>
      <ChevronRight size={14} className="text-primary" />
    </button>
  );
}

// Small feature line for the paywall list
export function FeatureLine({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3.5 py-3">
      <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-bold">{title}</div>
        <div className="text-[12.5px] text-muted-foreground leading-snug mt-0.5">{body}</div>
      </div>
    </div>
  );
}

export { Check };
