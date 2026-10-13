"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api, FitnessPoint } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { FitnessChart, ChartLegend } from "@/components/app/charts";
import { PremiumGate, usePremium } from "@/components/app/premium";
import { cn } from "@/lib/utils";

export function FitnessScreen({ id }: { id: string }) {
  const nav = useNav();
  const premium = usePremium();
  const { data } = useQuery({
    queryKey: ["fitness", id],
    queryFn: () => api.get<{ series: FitnessPoint[]; current: FitnessPoint | null; measuredShare: number }>(`athletes/${id}/fitness`),
    enabled: !!id,
  });

  if (!data) return <div className="flex flex-col"><ScreenHeader title="Fitness & Freshness" /><div className="p-4"><div className="h-48 rounded-lg bg-muted animate-pulse" /></div></div>;

  const { series, current } = data;
  const form = current?.form ?? 0;
  const formState = form > 5 ? { label: "Fresh", tone: "text-achievement", icon: TrendingUp, desc: "You're rested and ready to perform." }
    : form < -15 ? { label: "Very fatigued", tone: "text-destructive", icon: TrendingDown, desc: "Consider a recovery day or easy session." }
    : form < -5 ? { label: "Optimal training", tone: "text-primary", icon: TrendingUp, desc: "Productive stress — fitness is building." }
    : { label: "Neutral", tone: "text-muted-foreground", icon: Minus, desc: "Balanced form — steady state." };
  const FormIcon = formState.icon;

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Fitness & Freshness" />

      {!premium ? (
        <div className="px-4 pt-4 flex flex-col gap-3">
          <PremiumGate
            title="Fitness & Freshness"
            body="Fitness, fatigue and form from your training load — see when you're ready to perform."
            feature="fitness"
          />
          <div className="bg-card border border-border rounded-lg px-4 py-4 opacity-50 select-none" aria-hidden>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Last 90 days</h3>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wide">
                <HeartPulse size={13} /> Pro
              </span>
            </div>
            <div className="h-[180px] rounded bg-muted/60" />
          </div>
        </div>
      ) : (
      <>
      {/* current state */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Last 90 days</h3>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wide">
              <HeartPulse size={13} /> Pro
            </span>
          </div>
          <FitnessChart series={series} height={180} />
          {data.measuredShare < 0.5 && (
            <p className="text-[11.5px] text-muted-foreground leading-snug mt-2">
              Most of these activities had no heart-rate sensor, so their load comes from your effort rating or an
              estimate for the sport. Rate each activity, or wear a strap, to make this more accurate.
            </p>
          )}
          <ChartLegend
            items={[
              { color: "var(--foreground)", label: "Fitness (CTL)" },
              { color: "var(--primary)", label: "Fatigue (ATL)" },
              { color: "var(--muted-foreground)", label: "Form (TSB)", dashed: true },
            ]}
          />
        </div>
      </div>

      {current && (
        <>
          <div className="px-4 pt-4 grid grid-cols-3 gap-2.5">
            <MetricCard label="Fitness" value={current.fitness} hint="42-day avg load" />
            <MetricCard label="Fatigue" value={current.fatigue} hint="7-day avg load" />
            <MetricCard label="Form" value={current.form} hint="fitness − fatigue" tone={formState.tone} />
          </div>
          <div className="px-4 pt-4">
            <div className={cn("bg-card border border-border rounded-lg p-4 flex items-start gap-3", form < -15 && "border-destructive/40")}>
              <FormIcon size={22} className={formState.tone} />
              <div>
                <div className={cn("text-[15px] font-extrabold", formState.tone)}>{formState.label}</div>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1">{formState.desc}</p>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="px-4 pt-4">
        <div className="bg-muted/40 rounded-lg p-4 text-[11.5px] text-muted-foreground leading-relaxed">
          <b>How it works:</b> Fitness is your 42-day rolling training load — it rises slowly with consistent work. Fatigue is your 7-day load and moves quickly. Form is the difference: positive means rested, negative means you&apos;re carrying training stress. Aim for fitness up, form slightly negative during build weeks, and positive before race day.
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg py-3.5 px-3 text-center">
      <div className={cn("tnum text-[22px] font-extrabold leading-none", tone)}>{value}</div>
      <div className="text-[10.5px] font-bold uppercase tracking-wide mt-1.5">{label}</div>
      <div className="text-[9.5px] text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}
