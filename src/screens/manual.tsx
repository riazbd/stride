"use client";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { SportIcon } from "@/components/app/ui";
import { useUnits } from "@/components/app/cards";
import { sportOf, RECORD_SPORTS } from "@/lib/sports";
import { Input } from "@/components/ui/input";
import { distToMeters, elevToMeters, elevUnit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function ManualActivityScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const [sport, setSport] = useState("run");
  const [distance, setDistance] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [elevation, setElevation] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  // start from the athlete's chosen default, never silently public
  const defaultVisibility = useUI((s) => s.me?.defaultVisibility) ?? "everyone";
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [perceived, setPerceived] = useState<number | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      api.post<{ activity: { id: string } }>("activities", {
        sport,
        title: title.trim() || `${sportOf(sport).label}`,
        startDate: new Date(`${date}T${time}:00`).toISOString(),
        manual: true,
        distanceM: distToMeters(parseFloat(distance) || 0, units),
        movingTimeS: (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0),
        elapsedTimeS: (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0),
        elevationM: elevToMeters(parseFloat(elevation) || 0, units),
        visibility,
        perceivedEffort: perceived,
        tzOffsetMin: -new Date().getTimezoneOffset(),
        deviceName: "Manual entry",
      }),
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast({ description: "Activity saved" });
      nav.reset("home", { k: "feed" });
      nav.push({ k: "activity", id: res.activity.id });
    },
    onError: (e: any) => toast({ description: e.message ?? "Could not save" }),
  });

  const totalSeconds = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0);

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Manual Entry"
        right={
          <button
            onClick={() => {
              if (!totalSeconds && !parseFloat(distance)) {
                toast({ description: "Add a duration or distance first" });
                return;
              }
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold active:scale-95 transition-transform"
          >
            {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>
        }
      />
      <div className="px-4 pt-4 flex flex-col gap-3 pb-24">
        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Sport</div>
          <div className="flex gap-2 flex-wrap">
            {RECORD_SPORTS.slice(0, 16).map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-9 rounded-lg border text-[12.5px] font-semibold transition-colors",
                  sport === s ? "border-primary bg-primary/5 text-primary" : "border-border"
                )}
              >
                <SportIcon sport={s} size={15} />
                {sportOf(s).label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Distance</div>
          <div className="flex items-center gap-3">
            <Input
              type="number" inputMode="decimal" min="0" step="0.1"
              value={distance} onChange={(e) => setDistance(e.target.value)}
              placeholder="0.0" className="h-12 text-[20px] font-bold border-0 bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary tnum"
            />
            <span className="text-[14px] font-bold text-muted-foreground">{units === "km" ? "km" : "mi"}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Duration</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: hours, set: setHours, label: "hrs", max: "24" },
              { v: minutes, set: setMinutes, label: "min", max: "59" },
              { v: seconds, set: setSeconds, label: "sec", max: "59" },
            ].map((f) => (
              <div key={f.label}>
                <Input
                  type="number" inputMode="numeric" min="0" max={f.max}
                  value={f.v} onChange={(e) => f.set(e.target.value)}
                  placeholder="0" className="h-12 text-center text-[20px] font-bold border-0 bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary tnum"
                />
                <div className="text-[10px] uppercase text-muted-foreground text-center mt-1 font-semibold">{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Elevation gain</div>
          <div className="flex items-center gap-3">
            <Input
              type="number" inputMode="numeric" min="0"
              value={elevation} onChange={(e) => setElevation(e.target.value)}
              placeholder="0" className="h-12 text-[20px] font-bold border-0 bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary tnum"
            />
            <span className="text-[14px] font-bold text-muted-foreground">{elevUnit(units)}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">When</div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="h-11 text-[14px] border-0 bg-muted/60" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 text-[14px] border-0 bg-muted/60" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Title</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${sportOf(sport).label}`} className="h-11 text-[15px] border-0 bg-muted/60" maxLength={80} />
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">How hard was it?</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setPerceived(perceived === n ? null : n)}
                className={cn(
                  "flex-1 h-10 rounded-md text-[13px] font-bold border transition-colors",
                  perceived === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Who can see it?</div>
          {[
            { id: "everyone", label: "Everyone" },
            { id: "followers", label: "Followers" },
            { id: "only_me", label: "Only you" },
          ].map((v) => (
            <button key={v.id} onClick={() => setVisibility(v.id)} className={cn("flex items-center gap-2.5 py-2.5 w-full text-left", visibility === v.id && "text-primary")}>
              <span className="w-4">{visibility === v.id && <Check size={15} />}</span>
              <span className="text-[13.5px] font-semibold">{v.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
