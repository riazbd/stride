"use client";
import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp, Trash2, Pencil, Share2, Flag, Loader2, Send, Check, Target, Lock, FileDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { api, Activity } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { Avatar, EmptyState } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { distUnit, elevUnit, metersToDist, distToMeters, metersToElev, elevToMeters, type Units } from "@/lib/format";

// goals are stored in SI (metres, seconds); the editor speaks the athlete's units
function goalToInput(metric: string, si: number, units: Units): number {
  if (metric === "time") return Math.round((si / 3600) * 10) / 10;
  if (metric === "elevation") return Math.round(metersToElev(si, units));
  return Math.round(metersToDist(si, units) * 10) / 10;
}
function inputToGoal(metric: string, v: number, units: Units): number {
  if (metric === "time") return Math.round(v * 3600);
  if (metric === "elevation") return Math.round(elevToMeters(v, units));
  return Math.round(distToMeters(v, units));
}

export function SheetShell({ children, title }: { children: React.ReactNode; title: string }) {
  const nav = useNav();
  return (
    <Drawer open onOpenChange={(o) => { if (!o) nav.closeSheet(); }} shouldScaleBackground={false} setBackgroundColorOnScale={false}>
      <DrawerContent className="max-w-[430px] mx-auto rounded-t-2xl">
        <div className="mx-auto w-9 h-1 rounded-full bg-border mb-1" />
        <DrawerHeader className="pb-1 pt-2">
          <DrawerTitle className="text-[15px] font-bold text-center">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 max-h-[62dvh] overflow-y-auto no-scrollbar">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function KudosListSheet({ activityId }: { activityId: string }) {
  const { data } = useQuery({
    queryKey: ["activity", activityId],
    queryFn: () => api.get<{ activity: Activity }>(`activities/${activityId}`),
  });
  const kudos = data?.activity.kudos ?? [];
  const nav = useNav();
  return (
    <SheetShell title={`${data?.activity.kudosCount ?? 0} kudos`}>
      {kudos.length === 0 ? (
        <EmptyState icon={ThumbsUp} title="No kudos yet" body="Be the first to give kudos on this activity." />
      ) : (
        <div className="flex flex-col">
          {kudos.map((k) => (
            <button key={k.id} onClick={() => { nav.closeSheet(); nav.push({ k: "profile", id: k.id }); }} className="flex items-center gap-3 py-2.5 text-left active:bg-muted rounded-md px-2 -mx-2">
              <Avatar athlete={k} size={42} />
              <span className="text-[14.5px] font-semibold">{k.firstName} {k.lastName}</span>
              <ThumbsUp size={15} className="ml-auto text-primary" fill="currentColor" />
            </button>
          ))}
        </div>
      )}
    </SheetShell>
  );
}

export function CommentBoxSheet({ target }: { target: { activityId: string } | { postId: string } }) {
  const isActivity = "activityId" in target;
  const id = isActivity ? target.activityId : target.postId;
  const qc = useQueryClient();
  const nav = useNav();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => api.get<{ comments: any[] }>(`${isActivity ? "activities" : "posts"}/${id}/comments`),
  });

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 350);
  }, []);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      await api.post(`${isActivity ? "activities" : "posts"}/${id}/comments`, { text: t });
      setText("");
      qc.invalidateQueries({ queryKey: ["comments", id] });
      qc.invalidateQueries({ queryKey: ["activity", id] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (e: any) {
      toast({ description: e.message ?? "Could not post comment" });
    } finally {
      setSending(false);
    }
  };

  return (
    <SheetShell title="Comments">
      <div className="flex flex-col gap-3">
        {data?.comments?.length === 0 && <div className="text-center text-[13px] text-muted-foreground py-4">No comments yet.</div>}
        {data?.comments?.map((c: any) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar athlete={c.athlete} size={34} />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">{c.athlete.firstName} {c.athlete.lastName}</div>
              <p className="text-[13.5px] leading-snug mt-0.5 break-words">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 bg-background pt-3 flex gap-2 items-center">
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Add a comment…"
          maxLength={500}
          className="h-11 rounded-full bg-muted/70 border-0 focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-40"
          aria-label="Send comment"
        >
          {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </div>
    </SheetShell>
  );
}

const REPORT_REASONS = [
  { id: "spam", label: "Spam or advertising" },
  { id: "fake", label: "Fake or impossible activity (e.g. recorded in a car)" },
  { id: "harassment", label: "Harassment or hate" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "privacy", label: "Shows someone's private information" },
  { id: "other", label: "Something else" },
];

// Sends a report to the moderation queue (POST /api/reports)
export function ReportForm({ targetType, targetId, onDone }: { targetType: string; targetId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!reason) return;
    setSending(true);
    try {
      await api.post("reports", { targetType, targetId, reason, details: details.trim() || undefined });
      toast({ description: "Thanks — our team will review this report." });
      onDone();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not send the report" });
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {REPORT_REASONS.map((r) => (
          <button key={r.id} onClick={() => setReason(r.id)} className={cn("flex items-center gap-2.5 py-2.5 w-full text-left", reason === r.id && "text-primary")}>
            <span className="w-4 shrink-0">{reason === r.id && <Check size={15} />}</span>
            <span className="text-[13.5px] font-semibold">{r.label}</span>
          </button>
        ))}
      </div>
      <Textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        placeholder="Anything we should know? (optional)"
        className="min-h-[70px] bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary resize-none"
      />
      <button
        onClick={send}
        disabled={!reason || sending}
        className="h-11 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {sending && <Loader2 size={15} className="animate-spin" />} Send report
      </button>
    </div>
  );
}

export function ActivityOptionsSheet({ activityId }: { activityId: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["activity", activityId],
    queryFn: () => api.get<{ activity: Activity }>(`activities/${activityId}`),
  });
  const a = data?.activity;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("everyone");
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (a) {
      setTitle(a.title ?? "");
      setDescription(a.description ?? "");
      setVisibility(a.visibility);
    }
  }, [a?.id]);

  if (!a) return <SheetShell title="Options"><div className="h-20" /></SheetShell>;
  const me = useUI.getState().me;

  const del = async () => {
    try {
      await api.del(`activities/${activityId}`);
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast({ description: "Activity deleted" });
      nav.closeSheet();
      nav.popToTop();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not delete" });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`activities/${activityId}`, { title: title.trim() || null, description: description.trim() || null, visibility });
      qc.invalidateQueries({ queryKey: ["activity", activityId] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      toast({ description: "Activity updated" });
      nav.closeSheet();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not update" });
    } finally {
      setSaving(false);
    }
  };

  const mine = a && me ? a.athlete.id === me.id : false;

  if (reporting) {
    return (
      <SheetShell title="Report activity">
        <ReportForm targetType="activity" targetId={activityId} onDone={() => nav.closeSheet()} />
      </SheetShell>
    );
  }

  return (
    <SheetShell title={editing ? "Edit Activity" : "Activity Options"}>
      {!editing ? (
        <div className="flex flex-col">
          {mine && (
            <>
              <SheetAction icon={Pencil} label="Edit activity" onClick={() => setEditing(true)} />
              <SheetAction icon={Trash2} label="Delete activity" danger onClick={del} />
              <SheetAction
                icon={FileDown}
                label="Export GPX file"
                onClick={() => {
                  window.location.assign(`/api/activities/${activityId}/gpx`);
                  toast({ description: "GPX file downloading…" });
                  nav.closeSheet();
                }}
              />
            </>
          )}
          <SheetAction
            icon={Share2}
            label="Share…"
            onClick={async () => {
              const url = window.location.href;
              try {
                if (navigator.share) {
                  await navigator.share({ title: a.title ?? "STRIDE Activity", text: `${a.title ?? "Activity"} — ${(a.distanceM / 1000).toFixed(1)} km`, url });
                } else {
                  await navigator.clipboard.writeText(url);
                  toast({ description: "Link copied to clipboard" });
                }
              } catch { /* dismissed */ }
              nav.closeSheet();
            }}
          />
          {!mine && <SheetAction icon={Flag} label="Report activity" onClick={() => setReporting(true)} />}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
          </div>
          <div>
            <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="mt-1.5 min-h-[80px] bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary resize-none" />
          </div>
          <div>
            <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Visibility</label>
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
          <div className="flex gap-3">
            <button onClick={() => setEditing(false)} className="flex-1 h-11 rounded-lg border border-border font-bold text-[14px]">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] flex items-center justify-center gap-1.5">
              {saving && <Loader2 size={15} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}

function SheetAction({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex items-center gap-3.5 py-3.5 px-2 rounded-lg active:bg-muted text-left w-full", danger && "text-destructive")}
    >
      <Icon size={19} />
      <span className="text-[14.5px] font-semibold">{label}</span>
    </button>
  );
}

export function GoalEditorSheet() {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const premium = useUI((s) => !!s.me?.premium);
  const units = (useUI((s) => s.me?.units) ?? "km") as Units;
  const [period, setPeriod] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [metric, setMetric] = useState<"distance" | "time" | "elevation">("distance");
  const [sport, setSport] = useState<"all" | "run" | "ride">("all");
  const [target, setTarget] = useState("40");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("me/goals").then((res: any) => {
      const g = res.goals?.find((g: any) => g.metric === metric && g.period === period && (g.sport ?? "all") === sport);
      if (g) setTarget(String(goalToInput(metric, g.target, units)));
      else setTarget(defaultTarget(period, metric));
      setLoaded(true);
    }).catch(() => { setTarget(defaultTarget(period, metric)); setLoaded(true); });
     
  }, [period, metric, sport, units]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("me/goals", { metric, period, sport: sport === "all" ? null : sport, target: inputToGoal(metric, parseFloat(target) || 0, units) });
      qc.invalidateQueries({ queryKey: ["me", "goals"] });
      qc.invalidateQueries({ queryKey: ["feed", "summary"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast({ description: "Goal saved" });
      nav.closeSheet();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not save goal" });
    } finally {
      setSaving(false);
    }
  };

  const metricLabel = metric === "distance" ? "Distance" : metric === "time" ? "Time" : "Elevation";
  const metricUnit = metric === "distance" ? distUnit(units) : metric === "time" ? "hours" : elevUnit(units);

  return (
    <SheetShell title="Edit Goal">
      <div className="flex flex-col gap-4">
        {/* period */}
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Period</div>
          <div className="bg-card border border-border rounded-lg overflow-hidden flex">
            {(["weekly", "monthly", "yearly"] as const).map((p) => {
              const locked = p !== "weekly" && !premium;
              return (
                <button
                  key={p}
                  onClick={() => (locked ? nav.push({ k: "premium", feature: "goals" }) : setPeriod(p))}
                  className={cn(
                    "flex-1 h-12 flex items-center justify-center gap-1.5 text-[13.5px] font-bold capitalize transition-colors relative",
                    period === p && !locked ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  {p}
                  {locked && <Lock size={12} className="text-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* metric */}
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Metric</div>
          <div className="bg-card border border-border rounded-lg overflow-hidden flex">
            {(["distance", "time", "elevation"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "flex-1 h-12 flex items-center justify-center gap-1.5 text-[13.5px] font-bold capitalize transition-colors",
                  metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {m === "distance" ? "Distance" : m === "time" ? "Time" : "Elevation"}
              </button>
            ))}
          </div>
        </div>

        {/* sport */}
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Sport</div>
          <div className="bg-card border border-border rounded-lg overflow-hidden flex">
            {(["all", "run", "ride"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={cn(
                  "flex-1 h-12 flex items-center justify-center text-[13.5px] font-bold transition-colors",
                  sport === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {s === "all" ? "All sports" : s === "run" ? "Run" : "Ride"}
              </button>
            ))}
          </div>
        </div>

        {/* target */}
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0"><Target size={19} /></span>
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">{period === "weekly" ? "Every week" : period === "monthly" ? "Every month" : "This year"} — {metricLabel.toLowerCase()}</div>
            <div className="text-[11.5px] text-muted-foreground">{sport === "all" ? "All sports" : sport === "run" ? "Runs" : "Rides"} · {metricUnit}</div>
          </div>
          <Input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="w-24 h-11 text-center text-[18px] font-bold border-0 bg-muted/60 tnum" />
        </div>

        <button onClick={save} disabled={saving || !loaded} className="h-12 rounded-lg bg-primary text-primary-foreground font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          {saving && <Loader2 size={16} className="animate-spin" />} Save Goal
        </button>
        <p className="text-[11.5px] text-muted-foreground text-center leading-relaxed">
          Saving with 0 removes the goal.
        </p>
      </div>
    </SheetShell>
  );
}

function defaultTarget(period: string, metric: string): string {
  if (metric === "time") return period === "weekly" ? "5" : period === "monthly" ? "20" : "250";
  if (metric === "elevation") return period === "weekly" ? "200" : period === "monthly" ? "1000" : "8000";
  return period === "weekly" ? "40" : period === "monthly" ? "150" : "1200";
}
