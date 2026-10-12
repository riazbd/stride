"use client";
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, Route, HeartPulse, Mountain, Target, CalendarDays, Zap, Check, Loader2, Sparkles, Crown } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { FeatureLine } from "@/components/app/premium";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Trophy, title: "Full segment leaderboards", body: "Every effort, every rank — not just the top 10. Plus Local Legends and the Following filter." },
  { icon: HeartPulse, title: "Heart-rate zone analysis", body: "Time in all 5 zones on every activity with a heart rate you train in." },
  { icon: Mountain, title: "Grade-adjusted pace", body: "See your true flat-equivalent pace on every hill and trail run." },
  { icon: TrendingUp, title: "Fitness & Freshness", body: "Fitness, fatigue and form charts that track your training load over time." },
  { icon: CalendarDays, title: "Training log", body: "A full calendar of everything you've done, month by month." },
  { icon: Route, title: "Route builder", body: "Plan runs and rides on real roads with turn-by-turn distance." },
  { icon: Target, title: "Custom goals", body: "Monthly and yearly goals for distance, time and elevation — per sport." },
  { icon: Zap, title: "Relative Effort insights", body: "Weekly effort trends that show when to push and when to rest." },
];

const FEATURE_TITLES: Record<string, string> = {
  leaderboard: "the full segment leaderboard",
  following: "the Following leaderboard",
  legends: "Local Legends",
  fitness: "Fitness & Freshness",
  trainingLog: "the training log",
  routeBuilder: "the route builder",
  gap: "grade-adjusted pace",
  hrZones: "heart-rate zones",
  goals: "custom goals",
};

export function PaywallScreen({ feature }: { feature?: string }) {
  const nav = useNav();
  const me = useUI((s) => s.me);
  const refreshMe = useUI((s) => s.refreshMe);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");
  const [buying, setBuying] = useState(false);
  const [done, setDone] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const subscribe = async () => {
    setBuying(true);
    try {
      await api.post("me/premium", { action: "subscribe", plan });
      await refreshMe();
      qc.invalidateQueries(); // premium-gated data refetches with full access
      setDone(true);
    } catch (e: any) {
      toast({ description: e.message ?? "Could not complete purchase" });
    } finally {
      setBuying(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.post("me/premium", { action: "cancel" });
      await refreshMe();
      qc.invalidateQueries();
      toast({ description: "Subscription cancelled — premium features locked" });
    } catch (e: any) {
      toast({ description: e.message ?? "Could not cancel" });
    } finally {
      setCancelling(false);
    }
  };

  const alreadyPremium = !!me?.premium;

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="STRIDE Premium" />
      {done || alreadyPremium ? (
        <motion.div
          className="flex-1 flex flex-col items-center justify-center px-8 text-center"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
        >
          <span className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5">
            <Crown size={34} />
          </span>
          <h1 className="text-[24px] font-extrabold">You're Premium</h1>
          <p className="text-[13.5px] text-muted-foreground mt-2 leading-relaxed max-w-[260px]">
            {alreadyPremium && !done
              ? `Your ${me?.premiumPlan === "yearly" ? "yearly" : "monthly"} plan is active. Every STRIDE feature is unlocked.`
              : "Welcome to STRIDE Premium. Every feature is now unlocked — leaderboards, analysis, goals and more."}
          </p>
          <button
            onClick={() => nav.pop()}
            className="mt-8 h-12 px-8 rounded-lg bg-primary text-primary-foreground font-bold text-[15px] active:scale-[0.98] transition-transform"
          >
            Start training
          </button>
          {alreadyPremium && !done && (
            <button
              onClick={cancel}
              disabled={cancelling}
              className="mt-4 text-[12.5px] font-semibold text-muted-foreground underline underline-offset-2 active:text-destructive transition-colors"
            >
              {cancelling ? "Cancelling…" : "Cancel subscription"}
            </button>
          )}
        </motion.div>
      ) : (
        <div className="px-4 pt-2">
          {/* header */}
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-1.5 text-primary text-[11px] font-extrabold uppercase tracking-[0.14em] mb-2">
              <Sparkles size={13} /> Subscription
            </div>
            <h1 className="text-[26px] font-extrabold leading-tight">Get more from<br />every mile</h1>
            {feature && FEATURE_TITLES[feature] && (
              <p className="text-[13px] text-muted-foreground mt-2">
                Unlock {FEATURE_TITLES[feature]} and everything else below.
              </p>
            )}
          </div>

          {/* feature list */}
          <div className="bg-card border border-border rounded-lg px-4 py-2 divide-y divide-border">
            {FEATURES.map((f) => <FeatureLine key={f.title} icon={f.icon} title={f.title} body={f.body} />)}
          </div>

          {/* plan picker */}
          <div className="pt-4 flex flex-col gap-2.5">
            <button
              onClick={() => setPlan("yearly")}
              className={cn(
                "relative rounded-lg border-2 px-4 py-3.5 flex items-center gap-3 text-left transition-colors",
                plan === "yearly" ? "border-primary bg-primary/[0.04]" : "border-border bg-card"
              )}
            >
              <span className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", plan === "yearly" ? "border-primary" : "border-muted-foreground/40")}>
                {plan === "yearly" && <Check size={12} className="text-primary" strokeWidth={3.5} />}
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-bold">Yearly</span>
                  <span className="text-[10px] font-extrabold bg-achievement/15 text-achievement px-1.5 py-0.5 rounded uppercase tracking-wide">Save 45%</span>
                </span>
                <span className="block text-[12px] text-muted-foreground mt-0.5">$47.99 per year</span>
              </span>
              <span className="tnum text-[15px] font-extrabold">$4.00<span className="text-[11px] font-semibold text-muted-foreground">/mo</span></span>
            </button>
            <button
              onClick={() => setPlan("monthly")}
              className={cn(
                "rounded-lg border-2 px-4 py-3.5 flex items-center gap-3 text-left transition-colors",
                plan === "monthly" ? "border-primary bg-primary/[0.04]" : "border-border bg-card"
              )}
            >
              <span className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", plan === "monthly" ? "border-primary" : "border-muted-foreground/40")}>
                {plan === "monthly" && <Check size={12} className="text-primary" strokeWidth={3.5} />}
              </span>
              <span className="flex-1">
                <span className="text-[15px] font-bold">Monthly</span>
                <span className="block text-[12px] text-muted-foreground mt-0.5">Cancel anytime</span>
              </span>
              <span className="tnum text-[15px] font-extrabold">$7.99<span className="text-[11px] font-semibold text-muted-foreground">/mo</span></span>
            </button>
          </div>

          {/* buy */}
          <button
            onClick={subscribe}
            disabled={buying}
            className="mt-4 w-full h-[52px] rounded-lg bg-primary text-primary-foreground font-extrabold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {buying ? <Loader2 size={18} className="animate-spin" /> : null}
            {buying ? "Processing…" : `Get Premium — ${plan === "yearly" ? "$47.99/yr" : "$7.99/mo"}`}
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-3 leading-relaxed">
            This is a demo build — no real payment is processed.<br />Subscribing instantly unlocks every premium feature.
          </p>
        </div>
      )}
    </div>
  );
}
