"use client";
import React from "react";
import { ScreenHeader } from "@/components/app/shell";
import { useUI } from "@/lib/nav";
import { Heart, Zap, Map, Trophy, Users } from "lucide-react";
import { StrideMark, StrideWordmark } from "@/components/app/brand";

export function AboutScreen() {
  const me = useUI((s) => s.me);
  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="About" />
      <div className="px-6 pt-8 flex flex-col items-center text-center">
        <StrideMark size={60} className="mb-2" />
        <StrideWordmark height={21} className="mt-1" />
        <div className="text-[11px] text-muted-foreground mt-2 tracking-[0.14em] uppercase">Version 1.0.0</div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.32em] text-muted-foreground mt-5">Built for the long run</div>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed mt-5 max-w-[300px]">
          The social network for athletes. Track your runs, rides and everything between — then share the sweat with people who get it.
        </p>
        <div className="w-full max-w-[300px] mt-8 flex flex-col gap-3">
          {[
            { icon: Map, text: "GPS recording with live maps, auto-pause and splits" },
            { icon: Trophy, text: "Segments with real leaderboards and KOM hunting" },
            { icon: Users, text: "Clubs, challenges and a feed full of kudos" },
            { icon: Zap, text: "Fitness & freshness analytics that guide your training" },
          ].map((f, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-3.5 flex items-center gap-3 text-left">
              <f.icon size={18} className="text-primary shrink-0" />
              <span className="text-[12.5px] leading-snug">{f.text}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground mt-8">
          Made with <Heart size={12} className="text-primary" fill="currentColor" /> for athletes everywhere
        </div>
      </div>
    </div>
  );
}
