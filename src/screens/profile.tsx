"use client";
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Trophy, BarChart3, CalendarDays, HeartPulse, Footprints, ChevronRight, Map, Target, Share2, Medal, Cog as GearIcon, RotateCw } from "lucide-react";
import { api, AthleteProfile } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar, EmptyState } from "@/components/app/ui";
import { ActivityRow, useUnits } from "@/components/app/cards";
import { GoalRing, WeeklyBars } from "@/components/app/charts";
import { PremiumGate, usePremium } from "@/components/app/premium";
import { fmtDist, distUnit, fmtDuration, fmtElev, relativeDay } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function ProfileScreen({ id }: { id: string }) {
  const nav = useNav();
  const me = useUI((s) => s.me);
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const premium = usePremium();
  const myId = me?.id;
  const targetId = id || myId;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["profile", targetId],
    queryFn: () => api.get<AthleteProfile>(`athletes/${targetId}`),
    enabled: !!targetId,
    retry: 2,
  });

  const goalsQuery = useQuery({
    queryKey: ["me", "goals"],
    queryFn: () => api.get<{ goals: { id: string; metric: string; target: number; period: string; sport: string | null; current: number }[] }>("me/goals"),
    enabled: !id && !!myId,
  });

  const followMut = async () => {
    if (!data) return;
    try {
      await api.post(`athletes/${data.athlete.id}/follow`);
      qc.invalidateQueries({ queryKey: ["profile", targetId] });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  // No session (and not viewing someone else) — a DISABLED query would render
  // skeletons forever; show an actionable state instead.
  if (!id && !targetId) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Profile" back={false} />
        <div className="pt-16">
          <EmptyState
            icon={RotateCw}
            title="Session expired"
            body="Your sign-in didn't stick. Reload to sign in again."
            action={
              <button onClick={() => location.reload()} className="h-11 px-6 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] active:scale-[0.98] transition-transform">
                Reload
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Profile" back={false} />
        <div className="pt-16">
          <EmptyState
            icon={RotateCw}
            title="Couldn't load profile"
            body={error.message ?? "Check your connection and try again."}
            action={
              <button onClick={() => refetch()} className="h-11 px-6 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] active:scale-[0.98] transition-transform">
                Retry
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Profile" back={false} />
        <div className="p-4 flex flex-col gap-3"><div className="h-32 rounded-lg bg-muted animate-pulse" /><div className="h-24 rounded-lg bg-muted animate-pulse" /></div>
      </div>
    );
  }

  const { athlete, stats, clubCount, trophyCount, recentActivities } = data;
  const isMe = athlete.id === myId;
  const goals = goalsQuery.data?.goals ?? [];
  const runGoal = goals.find((g) => g.sport === "run" && g.metric === "distance" && g.period === "weekly");
  const rideGoal = goals.find((g) => g.sport === "ride" && g.metric === "distance" && g.period === "weekly");

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader
        title={isMe ? "You" : `${athlete.firstName} ${athlete.lastName}`}
        back={!isMe}
        right={
          isMe ? (
            <>
              <button onClick={() => nav.push({ k: "settings" })} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="Settings">
                <Settings size={20} />
              </button>
              <button onClick={() => nav.push({ k: "editProfile" })} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="Edit profile">
                <Share2 size={19} />
              </button>
            </>
          ) : undefined
        }
      />

      {/* identity block */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-4">
        <Avatar athlete={athlete} size={84} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[21px] font-extrabold leading-tight truncate">{athlete.firstName} {athlete.lastName}</h1>
            {athlete.premium && <span className="w-2 h-2 rounded-full bg-primary shrink-0" title="Premium" />}
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">{athlete.city}{athlete.country ? `, ${athlete.country}` : ""}</div>
          <div className="flex gap-4 mt-2">
            <button onClick={() => nav.push({ k: "follows", id: athlete.id, which: "following" })} className="text-left">
              <span className="tnum text-[15px] font-bold">{athlete.followingCount ?? 0}</span>
              <span className="text-[11.5px] text-muted-foreground ml-1">Following</span>
            </button>
            <button onClick={() => nav.push({ k: "follows", id: athlete.id, which: "followers" })} className="text-left">
              <span className="tnum text-[15px] font-bold">{athlete.followerCount ?? 0}</span>
              <span className="text-[11.5px] text-muted-foreground ml-1">Followers</span>
            </button>
          </div>
        </div>
      </div>
      {athlete.bio && <p className="px-4 text-[13px] text-muted-foreground leading-relaxed -mt-1">{athlete.bio}</p>}

      {/* follow button */}
      {!isMe && (
        <div className="px-4 pt-3">
          <button
            onClick={followMut}
            className={cn(
              "w-full h-12 rounded-lg font-bold text-[15px] active:scale-[0.98] transition-transform",
              athlete.isFollowing ? "bg-muted text-foreground border border-border" : "bg-primary text-primary-foreground"
            )}
          >
            {athlete.isFollowing ? "Following" : athlete.isFollower ? "Follow back" : "Follow"}
          </button>
        </div>
      )}

      {/* stats strip */}
      <div className="px-4 pt-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-3 border-b border-border">
            <StatCol label="This week" distance={stats.week.distanceM} time={stats.week.movingTimeS} elev={stats.week.elevationM} units={units} />
            <StatCol label="This year" distance={stats.ytd.distanceM} time={stats.ytd.movingTimeS} elev={stats.ytd.elevationM} units={units} border />
            <StatCol label="All time" distance={stats.all.distanceM} time={stats.all.movingTimeS} elev={stats.all.elevationM} units={units} border />
          </div>
          <button onClick={() => nav.push({ k: "stats", id: athlete.id })} className="w-full h-10 flex items-center justify-center gap-1 text-[12px] font-bold text-primary active:bg-muted">
            View detailed stats <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* goals (me only) — weekly rings + monthly/yearly list */}
      {isMe && goals.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Goals</h3>
              <button onClick={() => nav.openSheet({ k: "goalEditor" })} className="text-[12px] font-bold text-primary flex items-center gap-1">
                <Target size={13} /> Edit
              </button>
            </div>
            <div className="flex gap-6">
              {runGoal && (
                <div className="flex items-center gap-3 flex-1">
                  <GoalRing progress={runGoal.current / Math.max(1, runGoal.target)} size={54}>
                    <span className="tnum text-[12px] font-bold">{Math.round((runGoal.current / Math.max(1, runGoal.target)) * 100)}%</span>
                  </GoalRing>
                  <div>
                    <div className="text-[13px] font-bold flex items-center gap-1.5"><Footprints size={13} /> Run</div>
                    <div className="tnum text-[12px] text-muted-foreground">{fmtDist(runGoal.current * (units === "km" ? 1000 : 1609.34), units, 1)} / {fmtDist(runGoal.target * (units === "km" ? 1000 : 1609.34), units, 0)} {distUnit(units)}</div>
                  </div>
                </div>
              )}
              {rideGoal && (
                <div className="flex items-center gap-3 flex-1">
                  <GoalRing progress={rideGoal.current / Math.max(1, rideGoal.target)} size={54} color="#242427">
                    <span className="tnum text-[12px] font-bold">{Math.round((rideGoal.current / Math.max(1, rideGoal.target)) * 100)}%</span>
                  </GoalRing>
                  <div>
                    <div className="text-[13px] font-bold">Ride</div>
                    <div className="tnum text-[12px] text-muted-foreground">{fmtDist(rideGoal.current * (units === "km" ? 1000 : 1609.34), units, 1)} / {fmtDist(rideGoal.target * (units === "km" ? 1000 : 1609.34), units, 0)} {distUnit(units)}</div>
                  </div>
                </div>
              )}
            </div>
            {/* monthly / yearly goals (premium feature) */}
            {goals.filter((g) => g.period !== "weekly").length > 0 && (
              <div className="mt-4 pt-3 border-t border-border flex flex-col gap-2.5">
                {goals.filter((g) => g.period !== "weekly").map((g) => (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {g.metric === "distance" ? <Target size={14} /> : g.metric === "time" ? <BarChart3 size={14} /> : <Map size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold capitalize">{g.period} {g.metric === "distance" ? `${g.sport ?? "all"} distance` : g.metric === "time" ? `${g.sport ?? "all"} time` : `${g.sport ?? "all"} elevation`}</div>
                      <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (g.current / Math.max(1, g.target)) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="tnum text-[11.5px] text-muted-foreground shrink-0 text-right">
                      <span className="font-bold text-foreground">{g.metric === "time" ? `${Math.round(g.current)}h` : g.metric === "elevation" ? `${Math.round(g.current)}m` : `${g.current.toFixed(1)}${distUnit(units)}`}</span>
                      {" / "}{g.metric === "time" ? `${g.target}h` : g.metric === "elevation" ? `${g.target}m` : `${g.target}${distUnit(units)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {goals.length === 0 && (
              <button onClick={() => nav.openSheet({ k: "goalEditor" })} className="w-full py-2.5 text-[13px] font-bold text-primary">Set your first goal</button>
            )}
          </div>
        </div>
      )}

      {isMe && goals.length === 0 && (
        <div className="px-4 pt-4">
          <PremiumGate
            compact
            title="Set bigger goals"
            body="Weekly, monthly and yearly targets for distance, time and elevation."
            feature="goals"
          />
        </div>
      )}

      {/* quick links (me only) */}
      {isMe && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <QuickLink icon={Trophy} label="Trophies & personal records" count={trophyCount} onClick={() => nav.push({ k: "trophies", id: athlete.id })} />
            <QuickLink icon={CalendarDays} label="Training log" premium={!premium} onClick={() => premium ? nav.push({ k: "trainingLog", id: athlete.id }) : nav.push({ k: "premium", feature: "trainingLog" })} />
            <QuickLink icon={HeartPulse} label="Fitness & freshness" premium={!premium} onClick={() => premium ? nav.push({ k: "fitness", id: athlete.id }) : nav.push({ k: "premium", feature: "fitness" })} />
            <QuickLink icon={Medal} label="My segments" onClick={() => nav.push({ k: "segments" })} />
            <QuickLink icon={Map} label="My heatmap" onClick={() => nav.setTab("maps")} />
            <QuickLink icon={GearIcon} label="Gear & equipment" onClick={() => nav.push({ k: "gear" })} />
          </div>
        </div>
      )}

      {!isMe && trophyCount > 0 && (
        <div className="px-4 pt-4">
          <button onClick={() => nav.push({ k: "trophies", id: athlete.id })} className="bg-card border border-border rounded-lg w-full px-4 py-3.5 flex items-center gap-3 active:bg-muted">
            <Trophy size={19} className="text-trophy" />
            <span className="text-[13.5px] font-semibold flex-1 text-left">Trophies & personal records</span>
            <span className="tnum text-[13px] font-bold text-trophy">{trophyCount}</span>
            <ChevronRight size={15} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {/* weekly history mini chart */}
      {stats.weekly?.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-border rounded-lg px-4 py-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Last 12 weeks</h3>
            <WeeklyBars data={stats.weekly} goal={runGoal?.target} units={units} height={100} />
          </div>
        </div>
      )}

      {/* recent activities */}
      <div className="pt-4">
        <div className="px-4 pb-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Recent activities</div>
        {recentActivities.length === 0 ? (
          <EmptyState icon={Footprints} title="No activities yet" body={isMe ? "Hit record to get started." : undefined} />
        ) : (
          <div className="flex flex-col">
            {recentActivities.map((a) => <ActivityRow key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCol({ label, distance, time, elev, units, border }: { label: string; distance: number; time: number; elev: number; units: "km" | "mi"; border?: boolean }) {
  return (
    <div className={cn("py-3 px-2 text-center", border && "border-l border-border")}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className="tnum text-[15px] font-bold leading-tight">{fmtDist(distance, units, 1)}</div>
      <div className="text-[9.5px] text-muted-foreground">{distUnit(units)}</div>
      <div className="tnum text-[12px] font-medium text-muted-foreground mt-1.5">{fmtDuration(time, "compact")}</div>
      <div className="tnum text-[10.5px] text-muted-foreground">{fmtElev(elev, units)} up</div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, count, onClick, premium }: { icon: any; label: string; count?: number; onClick: () => void; premium?: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 active:bg-muted transition-colors w-full text-left">
      <Icon size={19} className="text-muted-foreground" />
      <span className="text-[13.5px] font-semibold flex-1">{label}</span>
      {premium && <span className="text-[10px] font-bold text-primary uppercase tracking-wide">Pro</span>}
      {count !== undefined && count > 0 && <span className="tnum text-[13px] font-bold text-trophy">{count}</span>}
      <ChevronRight size={15} className="text-muted-foreground/60" />
    </button>
  );
}
