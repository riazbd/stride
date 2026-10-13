"use client";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { useRecorder } from "@/lib/recorder";
import { useSensors } from "@/lib/sensors";
import { ScreenHeader } from "@/components/app/shell";
import { RouteThumb } from "@/components/app/charts";
import { SportIcon, SegmentedTabs } from "@/components/app/ui";
import { useUnits } from "@/components/app/cards";
import { sportOf, RECORD_SPORTS } from "@/lib/sports";
import { fmtDist, distUnit, fmtDuration, fmtPace, fmtElev, paceOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const VISIBILITY = [
  { id: "everyone", label: "Everyone", desc: "Public on STRIDE" },
  { id: "followers", label: "Followers", desc: "Only your followers" },
  { id: "only_me", label: "Only you", desc: "Private activity" },
];

function defaultTitle(): string {
  const h = new Date().getHours();
  if (h < 10) return "Morning";
  if (h < 12) return "Late Morning";
  if (h < 15) return "Lunch";
  if (h < 18) return "Afternoon";
  return "Evening";
}

export function SaveActivityScreen() {
  const rec = useRecorder();
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const hrm = useSensors((s) => s.hrm);
  const draft = rec.finishedDraft;
  const def = sportOf(draft?.sport ?? "run");
  const [sport, setSport] = useState(draft?.sport ?? "run");
  const [title, setTitle] = useState(`${defaultTitle()} ${def.label}`);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("everyone");
  const [gearId, setGearId] = useState<string | null>(null);
  const [isCommute, setIsCommute] = useState(false);
  const [perceived, setPerceived] = useState<number | null>(null);

  const gear = useQuerySafe("me/gear");

  const saveMut = useMutation({
    mutationFn: () =>
      api.post<{ activity: { id: string } }>("activities", {
        sport,
        title: title.trim() || null,
        description: description.trim() || null,
        startDate: draft?.startDate,
        track: draft?.points,
        movingTimeS: draft?.movingTimeS,
        elapsedTimeS: draft?.elapsedTimeS,
        distanceM: draft?.distanceM,
        elevationM: draft?.elevationM,
        splits: draft?.splits,
        laps: draft?.laps,
        visibility,
        gearId,
        isCommute,
        perceivedEffort: perceived,
        tzOffsetMin: -new Date().getTimezoneOffset(),
        avgHr: draft?.avgHr ?? null,
        maxHr: draft?.maxHr ?? null,
        hrSeries: draft?.hrSeries ?? null,
        deviceName: draft?.hrSeries ? `STRIDE App${hrm.name ? ` + ${hrm.name}` : " + HR strap"}` : "STRIDE App",
      }),
    onSuccess: async (res) => {
      rec.discard();
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ description: "Activity saved" });
      nav.reset("home", { k: "feed" });
      nav.push({ k: "activity", id: res.activity.id });
    },
    onError: (e: any) => toast({ description: e.message ?? "Could not save activity" }),
  });

  if (!draft) {
    return (
      <div className="flex flex-col min-h-full">
        <ScreenHeader title="Save Activity" />
        <div className="p-6 text-center text-muted-foreground text-[13px]">Nothing recorded.</div>
      </div>
    );
  }

  const polyline = draft.points.map((p) => [p[0], p[1]] as [number, number]);
  const paceMode = sportOf(sport).paceMode;

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Save Activity"
        right={
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold active:scale-95 transition-transform"
          >
            {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>
        }
      />

      <div className="px-4 pt-4 flex flex-col gap-3 pb-24">
        {/* summary card */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {polyline.length > 1 && <RouteThumb polyline={polyline} height={130} />}
          <div className="px-4 py-3.5 flex">
            <div className="flex-1">
              <div className="tnum text-[24px] font-extrabold leading-none text-primary">{fmtDist(draft.distanceM, units, 2)}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">Distance ({distUnit(units)})</div>
            </div>
            <StatMini label="Time" value={fmtDuration(draft.movingTimeS)} />
            {paceMode === "pace" ? (
              <StatMini label="Pace" value={fmtPace(paceOf(draft.distanceM, draft.movingTimeS, units))} />
            ) : (
              <StatMini label="Speed" value={((draft.distanceM / Math.max(1, draft.movingTimeS)) * 3.6).toFixed(1)} />
            )}
            <StatMini label="Elev" value={fmtElev(draft.elevationM, units)} />
          </div>
        </div>

        {/* title */}
        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="mt-1 h-11 text-[15px] border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        </div>

        {/* description */}
        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="How did it go?"
            className="mt-1 min-h-[70px] text-[14px] border-0 bg-transparent px-0 focus-visible:ring-0 resize-none"
          />
        </div>

        {/* sport */}
        <Card label="Sport">
          <div className="flex gap-2 flex-wrap">
            {RECORD_SPORTS.slice(0, 12).map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-9 rounded-lg border text-[12.5px] font-semibold transition-colors",
                  sport === s ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
                )}
              >
                <SportIcon sport={s} size={15} />
                {sportOf(s).label}
              </button>
            ))}
          </div>
        </Card>

        {/* perceived effort */}
        <Card label="How hard was it?">
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
        </Card>

        {/* gear */}
        {gear?.gear?.length > 0 && (
          <Card label="Gear">
            <div className="flex flex-col">
              <button onClick={() => setGearId(null)} className={cn("flex items-center gap-2.5 py-2.5 text-left", !gearId && "text-primary")}>
                <span className="w-4 flex justify-center">{!gearId && <Check size={15} />}</span>
                <span className="text-[13.5px] font-medium">No gear</span>
              </button>
              {gear.gear.filter((g: any) => !g.retired && (g.type === (sport === "ride" || sport === "gravel" || sport === "mtb" || sport === "ebike" ? "bike" : sport === "run" || sport === "trail_run" || sport === "walk" || sport === "hike" ? "shoes" : g.type))).map((g: any) => (
                <button key={g.id} onClick={() => setGearId(g.id === gearId ? null : g.id)} className={cn("flex items-center gap-2.5 py-2.5 text-left", gearId === g.id && "text-primary")}>
                  <span className="w-4 flex justify-center">{gearId === g.id && <Check size={15} />}</span>
                  <span className="text-[13.5px] font-medium">{g.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">{fmtDist(g.distanceM, units, 0)} {distUnit(units)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* visibility */}
        <Card label="Who can see it?">
          <div className="flex flex-col gap-1">
            {VISIBILITY.map((v) => (
              <button key={v.id} onClick={() => setVisibility(v.id)} className={cn("flex items-center gap-2.5 py-2.5 text-left", visibility === v.id && "text-primary")}>
                <span className="w-4 flex justify-center">{visibility === v.id && <Check size={15} />}</span>
                <span className="flex-1">
                  <span className="text-[13.5px] font-semibold block">{v.label}</span>
                  <span className="text-[11.5px] text-muted-foreground">{v.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* commute */}
        <button onClick={() => setIsCommute(!isCommute)} className="bg-card border border-border rounded-lg px-4 py-3.5 flex items-center gap-3 text-left">
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">Commute</div>
            <div className="text-[11.5px] text-muted-foreground">Tag as a commute ride</div>
          </div>
          <span className={cn("w-11 h-6 rounded-full relative transition-colors", isCommute ? "bg-primary" : "bg-muted")}>
            <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", isCommute ? "left-[22px]" : "left-0.5")} />
          </span>
        </button>
      </div>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3.5">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-[72px]">
      <div className="tnum text-[15px] font-bold leading-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function useQuerySafe(path: string) {
  const [data, setData] = useState<any>(null);
  React.useEffect(() => {
    api.get(path).then(setData).catch(() => {});
  }, [path]);
  return data;
}
