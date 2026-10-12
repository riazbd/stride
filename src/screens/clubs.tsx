"use client";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, MapPin, Calendar, Search, Check } from "lucide-react";
import { api, ClubSummary } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { SegmentedTabs, EmptyState, Badge } from "@/components/app/ui";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { relativeDay, timeOfDay, agoLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChallengesScreen } from "@/screens/challenges";

const SPORT_LABEL: Record<string, string> = {
  cycling: "Cycling", running: "Running", triathlon: "Triathlon", multi: "Multi-sport",
};

export function ClubsScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"mine" | "discover" | "challenges">("mine");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [sport, setSport] = useState("cycling");
  const [city, setCity] = useState("");

  const mine = useQuery({
    queryKey: ["clubs", "mine"],
    queryFn: () => api.get<{ clubs: ClubSummary[] }>("clubs?mine=1"),
  });
  const discover = useQuery({
    queryKey: ["clubs", "discover"],
    queryFn: () => api.get<{ clubs: (ClubSummary & { isMember: boolean })[] }>("clubs"),
  });

  const join = async (slug: string) => {
    try {
      await api.post(`clubs/${slug}/join`, { action: "join" });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ description: "Joined club" });
    } catch (e: any) {
      toast({ description: e.message ?? "Could not join" });
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    try {
      const res = await api.post<{ club: { slug: string } }>("clubs", { name, description: desc, sport, city });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ description: "Club created" });
      setCreating(false);
      nav.push({ k: "club", slug: res.club.slug });
    } catch (e: any) {
      toast({ description: e.message ?? "Could not create" });
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Groups"
        back={false}
        right={
          <button onClick={() => setCreating(true)} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="Create club">
            <Plus size={21} />
          </button>
        }
      />
      {creating ? (
        <div className="px-4 pt-4 flex flex-col gap-3 pb-24">
          <div className="text-[16px] font-bold">Create a club</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Club name" className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
          <div className="flex gap-2">
            {["cycling", "running", "triathlon", "multi"].map((s) => (
              <button key={s} onClick={() => setSport(s)} className={cn("flex-1 h-10 rounded-lg border text-[12px] font-bold", sport === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground")}>
                {SPORT_LABEL[s]}
              </button>
            ))}
          </div>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
          <div className="flex gap-3">
            <button onClick={() => setCreating(false)} className="flex-1 h-12 rounded-lg border border-border font-bold text-[14px]">Cancel</button>
            <button onClick={create} className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold text-[14px]">Create</button>
          </div>
        </div>
      ) : (
        <>
          <SegmentedTabs
            tabs={[
              { id: "mine", label: "My Clubs", count: mine.data?.clubs.length },
              { id: "discover", label: "Discover" },
              { id: "challenges", label: "Challenges" },
            ]}
            value={tab}
            onChange={(t) => setTab(t as any)}
          />
          {tab === "challenges" ? (
            <ChallengesScreen embedded />
          ) : tab === "mine" ? (
            <div className="flex flex-col">
              {mine.isLoading && [0, 1, 2].map((i) => <div key={i} className="m-4 h-20 rounded-lg bg-muted animate-pulse" />)}
              {!mine.isLoading && mine.data?.clubs.length === 0 && (
                <EmptyState icon={Users} title="No clubs yet" body="Join a club to see its feed, members and group events." />
              )}
              {mine.data?.clubs.map((c) => (
                <button key={c.id} onClick={() => nav.push({ k: "club", slug: c.slug })} className="flex items-center gap-3 px-4 py-3.5 border-b border-border active:bg-muted text-left w-full">
                  <span className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-extrabold text-[17px] shrink-0" style={{ background: c.coverColor }}>
                    {c.name[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold truncate">{c.name}</div>
                    <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Users size={11} /> {c.memberCount} members
                      {c.nextEvent && <><span className="w-1 h-1 rounded-full bg-border" /><Calendar size={11} /> {relativeDay(c.nextEvent.startDate)}</>}
                    </div>
                  </div>
                  {c.role === "owner" && <Badge tone="primary">Owner</Badge>}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {discover.data?.clubs.filter((c) => !c.isMember).map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
                  <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => nav.push({ k: "club", slug: c.slug })}>
                    <span className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-extrabold text-[17px] shrink-0" style={{ background: c.coverColor }}>
                      {c.name[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-bold truncate">{c.name}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">{SPORT_LABEL[c.sport]} · {c.city} · {c.memberCount} members</div>
                    </div>
                  </button>
                  <button onClick={() => join(c.slug)} className="px-3.5 h-8 rounded-md bg-primary/10 text-primary text-[12px] font-bold flex items-center gap-1 shrink-0">
                    <Plus size={13} /> Join
                  </button>
                </div>
              ))}
              {discover.data?.clubs.filter((c) => c.isMember).map((c) => (
                <button key={c.id} onClick={() => nav.push({ k: "club", slug: c.slug })} className="flex items-center gap-3 px-4 py-3.5 border-b border-border text-left w-full opacity-60">
                  <span className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-extrabold text-[17px] shrink-0" style={{ background: c.coverColor }}>
                    {c.name[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold truncate">{c.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{SPORT_LABEL[c.sport]} · {c.city}</div>
                  </div>
                  <span className="flex items-center gap-1 text-[12px] font-bold text-achievement"><Check size={13} /> Joined</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
