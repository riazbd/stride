"use client";
import React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ThumbsUp, MessageCircle, MoreHorizontal, MapPin, ChevronRight } from "lucide-react";
import { api, Activity, PostItem, Athlete } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { useToast } from "@/hooks/use-toast";
import { Avatar, SportIcon, Badge, StatBlock } from "./ui";
import { RouteThumb } from "./charts";
import { fmtDist, distUnit, fmtDuration, fmtPace, fmtElev, paceOf, speedOf, Units, relativeDay, timeOfDay, agoLabel } from "@/lib/format";
import { sportOf } from "@/lib/sports";
import { cn } from "@/lib/utils";

export function useUnits(): Units {
  return (useUI((s) => s.me)?.units as Units) ?? "km";
}

export function ActivityStatsRow({ a, className, compact }: { a: Activity; className?: string; compact?: boolean }) {
  const units = useUnits();
  const def = sportOf(a.sport);
  const paceMode = def.paceMode;
  return (
    <div className={cn("flex", compact ? "gap-4" : "gap-5", className)}>
      <StatBlock label="Distance" value={fmtDist(a.distanceM, units)} accent />
      <StatBlock label="Time" value={fmtDuration(a.movingTimeS)} accent />
      {paceMode === "pace" ? (
        <StatBlock label="Pace" value={fmtPace(paceOf(a.distanceM, a.movingTimeS, units))} sub={`/${distUnit(units)}`} accent />
      ) : paceMode === "speed" ? (
        <StatBlock label="Speed" value={speedOf(a.distanceM, a.movingTimeS, units).toFixed(1)} sub={units === "km" ? "km/h" : "mph"} accent />
      ) : null}
      <StatBlock label="Elev" value={fmtElev(a.elevationM, units)} accent />
    </div>
  );
}

// Optimistic kudos: the same activity or post can sit in many caches at once
// (feed pages, a profile, a club, its own detail screen), so walk every cached
// query and update each copy carrying this id.
function markKudos(qc: QueryClient, id: string, has: boolean) {
  const patch = (v: any): any => {
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => {
        const y = patch(x);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    if (!v || typeof v !== "object") return v;
    if (v.id === id && typeof v.hasKudos === "boolean") {
      if (v.hasKudos === has) return v;
      return { ...v, hasKudos: has, kudosCount: Math.max(0, (v.kudosCount ?? 0) + (has ? 1 : -1)) };
    }
    let changed = false;
    const out: any = {};
    for (const k of Object.keys(v)) {
      out[k] = patch(v[k]);
      if (out[k] !== v[k]) changed = true;
    }
    return changed ? out : v;
  };
  for (const q of qc.getQueryCache().getAll()) {
    if (q.state.data !== undefined) qc.setQueryData(q.queryKey, patch(q.state.data));
  }
}

export function ActivityCard({ activity: a, showDescription = true }: { activity: Activity; showDescription?: boolean }) {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const def = sportOf(a.sport);

  const kudosMut = useMutation({
    mutationFn: () => api.post(`activities/${a.id}/kudos`, { on: true }),
    onMutate: () => markKudos(qc, a.id, true),
    onError: () => {
      markKudos(qc, a.id, false);
      toast({ description: "Couldn't give kudos — try again" });
    },
  });

  const openComments = () => nav.openSheet({ k: "commentBox", target: { activityId: a.id } });

  return (
    <article className="bg-card border border-border rounded-lg overflow-hidden">
      {/* header */}
      <button
        className="flex w-full items-center gap-2.5 px-3.5 pt-3.5 pb-3 text-left"
        onClick={() => nav.push({ k: "profile", id: a.athlete.id })}
      >
        <Avatar athlete={a.athlete} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold leading-tight truncate">{a.athlete.firstName} {a.athlete.lastName}</span>
            {a.athlete.premium && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-label="Premium" />}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span>{relativeDay(a.startDate)} at {timeOfDay(a.startDate)}</span>
          </div>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); nav.push({ k: "activity", id: a.id }); }}
          className="text-muted-foreground p-1.5 -mr-1.5 rounded-md active:bg-muted"
          aria-label="Activity options"
        >
          <MoreHorizontal size={20} />
        </span>
      </button>

      {/* title */}
      <button className="w-full px-3.5 pb-2.5 text-left" onClick={() => nav.push({ k: "activity", id: a.id })}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <SportIcon sport={a.sport} size={15} className="text-foreground" />
          <span className="text-[15px] font-bold leading-snug">{a.title ?? `${def.label}`}</span>
          {a.achievementCount > 0 && (
            <Badge tone="trophy">
              <span className="text-[9px]">🏆</span> {a.achievementCount}
            </Badge>
          )}
        </div>
        {a.description && showDescription && (
          <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-2 leading-snug">{a.description}</p>
        )}
      </button>

      {/* map + stats */}
      <button className="w-full block text-left" onClick={() => nav.push({ k: "activity", id: a.id })}>
        {a.polyline && a.polyline.length > 1 && !a.isTrainer && <RouteThumb polyline={a.polyline} height={128} />}
        <div className="px-3.5 py-3">
          <ActivityStatsRow a={a} />
        </div>
      </button>

      {/* footer */}
      <div className="flex items-center border-t border-border px-2 h-11">
        <button
          onClick={() => !a.hasKudos && kudosMut.mutate()}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-full active:scale-95 transition-transform",
            a.hasKudos ? "text-primary" : "text-muted-foreground"
          )}
          aria-label={a.hasKudos ? "Kudos given" : "Give kudos"}
          disabled={a.hasKudos}
        >
          <ThumbsUp size={17} fill={a.hasKudos ? "currentColor" : "none"} />
          <span className="tnum text-[13px] font-medium">{a.kudosCount > 0 ? a.kudosCount : ""}</span>
        </button>
        <button
          onClick={openComments}
          className="flex items-center gap-1.5 px-2.5 h-full text-muted-foreground active:scale-95 transition-transform"
          aria-label="Comments"
        >
          <MessageCircle size={17} />
          <span className="tnum text-[13px] font-medium">{a.commentCount > 0 ? a.commentCount : ""}</span>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => nav.push({ k: "activity", id: a.id })}
          className="text-[11px] font-bold uppercase tracking-wider text-primary px-2.5 h-full flex items-center gap-0.5"
        >
          {def.paceMode === "time" ? "View" : "Details"}
          <ChevronRight size={13} />
        </button>
      </div>
    </article>
  );
}

export function PostCard({ post: p }: { post: PostItem }) {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const kudosMut = useMutation({
    mutationFn: () => api.post(`posts/${p.id}/kudos`, { on: true }),
    onMutate: () => markKudos(qc, p.id, true),
    onError: () => {
      markKudos(qc, p.id, false);
      toast({ description: "Couldn't give kudos — try again" });
    },
  });
  return (
    <article className="bg-card border border-border rounded-lg overflow-hidden">
      <button className="flex w-full items-center gap-2.5 px-3.5 pt-3.5 pb-2.5 text-left" onClick={() => nav.push({ k: "profile", id: p.athlete.id })}>
        <Avatar athlete={p.athlete} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold leading-tight truncate">{p.athlete.firstName} {p.athlete.lastName}</span>
            {p.athlete.premium && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">{agoLabel(p.createdAt)} ago · Post</div>
        </div>
      </button>
      <button className="w-full text-left px-3.5 pb-3" onClick={() => nav.openSheet({ k: "commentBox", target: { postId: p.id } })}>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{p.text}</p>
        {p.photo && <img src={p.photo} alt="" className="mt-2 rounded-md w-full object-cover max-h-64" />}
      </button>
      <div className="flex items-center border-t border-border px-2 h-11">
        <button
          onClick={() => !p.hasKudos && kudosMut.mutate()}
          className={cn("flex items-center gap-1.5 px-2.5 h-full", p.hasKudos ? "text-primary" : "text-muted-foreground")}
          aria-label="Kudos"
        >
          <ThumbsUp size={17} fill={p.hasKudos ? "currentColor" : "none"} />
          <span className="tnum text-[13px] font-medium">{p.kudosCount > 0 ? p.kudosCount : ""}</span>
        </button>
        <button
          onClick={() => nav.openSheet({ k: "commentBox", target: { postId: p.id } })}
          className="flex items-center gap-1.5 px-2.5 h-full text-muted-foreground"
          aria-label="Comments"
        >
          <MessageCircle size={17} />
          <span className="tnum text-[13px] font-medium">{p.commentCount > 0 ? p.commentCount : ""}</span>
        </button>
      </div>
    </article>
  );
}

// Compact row for lists (profile, club, search results)
export function ActivityRow({ a, onClick }: { a: Activity; onClick?: () => void }) {
  const units = useUnits();
  const nav = useNav();
  const def = sportOf(a.sport);
  const pace = def.paceMode === "pace" ? fmtPace(paceOf(a.distanceM, a.movingTimeS, units)) : null;
  return (
    <button
      onClick={onClick ?? (() => nav.push({ k: "activity", id: a.id }))}
      className="flex w-full items-center gap-3 px-4 py-3 active:bg-muted transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
        <SportIcon sport={a.sport} size={18} className="text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold truncate">{a.title ?? def.label}</span>
          {a.achievementCount > 0 && <Badge tone="trophy" className="translate-y-px"><span className="text-[9px]">🏆</span></Badge>}
        </div>
        <div className="tnum text-[12px] text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>{relativeDay(a.startDate)} · {timeOfDay(a.startDate)}</span>
          <span>{fmtDist(a.distanceM, units)} {distUnit(units)}</span>
          <span>{fmtDuration(a.movingTimeS)}</span>
          {pace && <span className="hidden xs:inline">{pace} /{distUnit(units)}</span>}
        </div>
      </div>
      <svg width="7" height="12" viewBox="0 0 7 12" className="text-muted-foreground/50 shrink-0">
        <path d="M1 1L6 6L1 11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function AthleteRow({
  athlete, right, onClick, sub,
}: { athlete: Athlete; right?: React.ReactNode; onClick?: () => void; sub?: React.ReactNode }) {
  const nav = useNav();
  return (
    <button
      onClick={onClick ?? (() => nav.push({ k: "profile", id: athlete.id }))}
      className="flex w-full items-center gap-3 px-4 py-2.5 active:bg-muted transition-colors text-left"
    >
      <Avatar athlete={athlete} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold truncate">{athlete.firstName} {athlete.lastName}</span>
          {athlete.premium && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
        </div>
        <div className="text-[12px] text-muted-foreground truncate mt-0.5">
          {sub ?? (athlete.city ? `${athlete.city}${athlete.country ? ", " + athlete.country : ""}` : "STRIDE athlete")}
        </div>
      </div>
      {right}
    </button>
  );
}
