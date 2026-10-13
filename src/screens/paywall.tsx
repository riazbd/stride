"use client";
import React from "react";
import { Trophy, TrendingUp, Route, HeartPulse, Mountain, Target, CalendarDays, Sparkles } from "lucide-react";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { FeatureLine } from "@/components/app/premium";

// STRIDE is in a free beta: everything below is unlocked for everyone (the
// server decides, see src/server/entitlement.ts). Paid plans in Taka through
// bKash and Nagad come after the beta; nothing can be bought here today.

const FEATURES = [
  { icon: Trophy, title: "Full segment leaderboards", body: "Every public effort, the Following filter and the most frequent athletes on each segment." },
  { icon: HeartPulse, title: "Heart-rate zone analysis", body: "Time in each of 5 zones on activities recorded with a heart-rate sensor." },
  { icon: Mountain, title: "Grade-adjusted pace", body: "Your flat-equivalent pace on every hill and trail run." },
  { icon: TrendingUp, title: "Fitness & Freshness", body: "Fitness, fatigue and form from your training load over time." },
  { icon: CalendarDays, title: "Training log", body: "A calendar of everything you've done, month by month." },
  { icon: Route, title: "Route builder", body: "Plan runs and rides on real roads." },
  { icon: Target, title: "Custom goals", body: "Weekly, monthly and yearly goals for distance, time and elevation." },
];

export function PaywallScreen({ feature: _feature }: { feature?: string }) {
  const nav = useNav();
  const unlocked = useUI((s) => !!s.me?.premium);

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="STRIDE beta" />
      <div className="px-4 pt-2">
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-1.5 text-primary text-[11px] font-extrabold uppercase tracking-[0.14em] mb-2">
            <Sparkles size={13} /> Free beta
          </div>
          <h1 className="text-[26px] font-extrabold leading-tight">Everything is free<br />during the beta</h1>
          <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-[300px] mx-auto">
            {unlocked
              ? "Every feature below is already on for you. Paid plans will come later, priced in Taka, and we'll tell you well before anything changes."
              : "Sign in to use every feature below. Paid plans will come later, priced in Taka."}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-2 divide-y divide-border">
          {FEATURES.map((f) => <FeatureLine key={f.title} icon={f.icon} title={f.title} body={f.body} />)}
        </div>

        <button
          onClick={() => nav.pop()}
          className="mt-4 w-full h-[52px] rounded-lg bg-primary text-primary-foreground font-extrabold text-[16px] active:scale-[0.98] transition-transform"
        >
          Back to training
        </button>
      </div>
    </div>
  );
}
