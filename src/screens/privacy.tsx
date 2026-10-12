"use client";
import React, { useState } from "react";
import { MapPin, Eye, HeartPulse, Check, Loader2 } from "lucide-react";
import { useUI, useNav } from "@/lib/nav";
import { api } from "@/lib/api";
import { ScreenHeader } from "@/components/app/shell";
import { ListRow } from "@/components/app/ui";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const RADII = [
  { m: 0, label: "Off", sub: "Show your exact start & finish" },
  { m: 200, label: "200 m", sub: "Recommended for city running" },
  { m: 250, label: "250 m" },
  { m: 500, label: "500 m" },
  { m: 750, label: "750 m" },
  { m: 1000, label: "1 km" },
];

const VISIBILITIES = [
  { id: "everyone", label: "Everyone", sub: "Public — anyone on STRIDE" },
  { id: "followers", label: "Followers", sub: "Only athletes you approve" },
  { id: "only_me", label: "Only you", sub: "Private activities" },
];

export function PrivacyScreen() {
  const me = useUI((s) => s.me);
  const refreshMe = useUI((s) => s.refreshMe);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [radius, setRadius] = useState(me?.privacyRadiusM ?? 0);
  const [visibility, setVisibility] = useState(me?.defaultVisibility ?? "everyone");
  const [maxHr, setMaxHr] = useState(String(me?.maxHr ?? ""));

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.patch("me/settings", patch);
      await refreshMe();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Privacy Controls" />
      <div className="px-4 pt-4 flex flex-col gap-2.5">
        {/* privacy zones */}
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1.5">
            <MapPin size={12} /> Privacy zones
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Hide the start and finish of your activities from other athletes. Your maps get trimmed
                by this radius around both endpoints — you always see your own full routes.
              </p>
            </div>
            {RADII.map((r) => (
              <button
                key={r.m}
                onClick={() => { setRadius(r.m); save({ privacyRadiusM: r.m }); }}
                className="flex items-center gap-3 px-4 py-3 border-t border-border w-full text-left active:bg-muted"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {radius === r.m && <Check size={15} className="text-primary" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[14px] font-semibold block">{r.label}</span>
                  {r.sub && <span className="text-[11.5px] text-muted-foreground">{r.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* default visibility */}
        <div className="pt-1">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1.5">
            <Eye size={12} /> Default activity visibility
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {VISIBILITIES.map((v) => (
              <button
                key={v.id}
                onClick={() => { setVisibility(v.id); save({ defaultVisibility: v.id }); }}
                className="flex items-center gap-3 px-4 py-3 border-t border-border first:border-t-0 w-full text-left active:bg-muted"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {visibility === v.id && <Check size={15} className="text-primary" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[14px] font-semibold block">{v.label}</span>
                  <span className="text-[11.5px] text-muted-foreground">{v.sub}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground px-1 pt-1.5">
            You can override this on any activity when you save it.
          </p>
        </div>

        {/* max heart rate */}
        <div className="pt-1">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1.5">
            <HeartPulse size={12} /> Max heart rate
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[14px] font-semibold">Used for heart-rate zone analysis</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">Premium zones are computed from this value. Default 190 bpm.</div>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={maxHr}
              onChange={(e) => setMaxHr(e.target.value)}
              onBlur={() => {
                const v = parseInt(maxHr, 10);
                if (v >= 120 && v <= 230) save({ maxHr: v });
                else if (maxHr !== "") { setMaxHr(String(me?.maxHr ?? "")); toast({ description: "Max HR must be 120–230" }); }
              }}
              placeholder="190"
              className={cn("tnum w-20 h-11 text-center text-[17px] font-bold rounded-lg bg-muted/60 border-0 outline-none focus:ring-2 focus:ring-primary")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
