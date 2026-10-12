"use client";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, MapPin, Calendar, Check, Plus, ChevronRight, Clock } from "lucide-react";
import { api, ClubDetail } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { ActivityCard, useUnits } from "@/components/app/cards";
import { Avatar, SegmentedTabs, EmptyState, Badge } from "@/components/app/ui";
import { fmtDist, distUnit, relativeDay, timeOfDay, longDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SPORT_LABEL: Record<string, string> = { cycling: "Cycling", running: "Running", triathlon: "Triathlon", multi: "Multi-sport" };

export function ClubScreen({ slug }: { slug: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const [tab, setTab] = useState<"feed" | "members" | "events">("feed");

  const { data, isLoading } = useQuery({
    queryKey: ["club", slug],
    queryFn: () => api.get<ClubDetail>(`clubs/${slug}`),
  });

  const toggleJoin = async () => {
    if (!data) return;
    const wasMember = !!data.myRole;
    try {
      await api.post(`clubs/${slug}/join`, { action: wasMember ? "leave" : "join" });
      qc.invalidateQueries({ queryKey: ["club", slug] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ description: wasMember ? "Left club" : "Joined club" });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Club" />
        <div className="p-4 flex flex-col gap-3"><div className="h-24 rounded-lg bg-muted animate-pulse" /><div className="h-40 rounded-lg bg-muted animate-pulse" /></div>
      </div>
    );
  }
  if (!data) return <div className="flex flex-col"><ScreenHeader title="Club" /><EmptyState icon={Users} title="Club not found" /></div>;

  const { club, members, events, feed, myRole } = data;

  return (
    <div className="flex flex-col min-h-full pb-20">
      <ScreenHeader title={club.name} subtitle={`${club.city}, ${club.country}`} />

      {/* cover */}
      <div className="h-24 relative" style={{ background: club.coverColor }}>
        <span className="absolute left-4 -bottom-6 w-14 h-14 rounded-xl flex items-center justify-center text-white font-extrabold text-[22px] shadow-lg border-4 border-background" style={{ background: club.coverColor }}>
          {club.name[0]}
        </span>
      </div>

      <div className="px-4 pt-8">
        <div className="flex items-center gap-2">
          <h1 className="text-[20px] font-extrabold">{club.name}</h1>
          <Badge tone="muted">{SPORT_LABEL[club.sport]}</Badge>
        </div>
        <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1.5">
          <Users size={12} /> {club.memberCount} members
          <span className="w-1 h-1 rounded-full bg-border" />
          <MapPin size={12} /> {club.city}
        </div>
        {club.description && <p className="text-[13px] text-muted-foreground mt-2.5 leading-relaxed">{club.description}</p>}
        <button
          onClick={toggleJoin}
          className={cn(
            "mt-4 w-full h-12 rounded-lg font-bold text-[15px] active:scale-[0.98] transition-transform",
            myRole ? "bg-muted text-foreground border border-border" : "bg-primary text-primary-foreground"
          )}
        >
          {myRole ? (myRole === "owner" ? "You own this club" : "Leave Club") : "Join Club"}
        </button>
      </div>

      <div className="pt-4">
        <SegmentedTabs
          tabs={[
            { id: "feed", label: "Feed" },
            { id: "members", label: "Members", count: members.length },
            { id: "events", label: "Events", count: events.length },
          ]}
          value={tab}
          onChange={(t) => setTab(t as any)}
        />

        {tab === "feed" && (
          <div className="flex flex-col gap-2.5 px-4 pt-4">
            {feed.length === 0 && <EmptyState icon={Calendar} title="No club activity yet" body="When members record activities, they'll show up here." />}
            {feed.map((a) => <ActivityCard key={a.id} activity={a} />)}
          </div>
        )}

        {tab === "members" && (
          <div>
            <div className="px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">This week&apos;s distance</div>
            {members.map((m, i) => (
              <button key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-border active:bg-muted text-left w-full" onClick={() => nav.push({ k: "profile", id: m.id })}>
                <span className="tnum w-6 text-[13px] font-bold text-muted-foreground">{i + 1}</span>
                <Avatar athlete={m} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate flex items-center gap-1.5">
                    {m.firstName} {m.lastName}
                    {m.role === "owner" && <Badge tone="muted">Owner</Badge>}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">{m.weekDistanceM > 0 ? `${fmtDist(m.weekDistanceM, units, 1)} ${distUnit(units)} this week` : "No activities this week"}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === "events" && (
          <div className="flex flex-col gap-2.5 px-4 pt-4">
            {events.length === 0 && <EmptyState icon={Calendar} title="No upcoming events" />}
            {events.map((e) => (
              <button key={e.id} className="bg-card border border-border rounded-lg p-4 text-left w-full active:scale-[0.99] transition-transform" onClick={() => nav.push({ k: "event", clubSlug: slug, eventId: e.id })}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground">{new Date(e.startDate).toLocaleDateString("en-US", { month: "short" })}</span>
                    <span className="tnum text-[18px] font-extrabold leading-none">{new Date(e.startDate).getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold truncate">{e.title}</div>
                    <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Clock size={11} /> {timeOfDay(e.startDate)} · {e.durationMin} min
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <Users size={11} /> {e.goingCount} going
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EventScreen({ clubSlug, eventId }: { clubSlug: string; eventId: string }) {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["club", clubSlug],
    queryFn: () => api.get<ClubDetail>(`clubs/${clubSlug}`),
  });
  const event = data?.events.find((e) => e.id === eventId);
  const myStatus = event?.myStatus ?? null;

  const rsvp = async (status: string) => {
    try {
      await api.post(`clubs/${clubSlug}/events/${eventId}/rsvp`, { status });
      qc.invalidateQueries({ queryKey: ["club", clubSlug] });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  if (!event) return <div className="flex flex-col"><ScreenHeader title="Event" /><EmptyState icon={Calendar} title="Event not found" /></div>;

  return (
    <div className="flex flex-col min-h-full pb-20">
      <ScreenHeader title="Club Event" />
      <div className="px-4 pt-4">
        <h1 className="text-[20px] font-extrabold leading-tight">{event.title}</h1>
        <div className="text-[13px] text-muted-foreground mt-2 flex flex-col gap-1.5">
          <span>{longDate(event.startDate)} at {timeOfDay(event.startDate)}</span>
          <span className="flex items-center gap-1.5"><Clock size={13} /> {event.durationMin} minutes</span>
          {event.meetingSpot && <span className="flex items-center gap-1.5"><MapPin size={13} /> {event.meetingSpot}</span>}
        </div>
        {event.description && <p className="text-[13.5px] leading-relaxed mt-3">{event.description}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => rsvp(myStatus === "going" ? "none" : "going")}
            className={cn("flex-1 h-12 rounded-lg font-bold text-[14.5px] active:scale-[0.98] transition-transform", myStatus === "going" ? "bg-primary text-primary-foreground" : "border-2 border-primary text-primary")}
          >
            {myStatus === "going" ? "You're going" : "Join event"}
          </button>
          <button
            onClick={() => rsvp(myStatus === "interested" ? "none" : "interested")}
            className={cn("flex-1 h-12 rounded-lg font-bold text-[14.5px] border-2 transition-colors", myStatus === "interested" ? "border-primary text-primary" : "border-border text-muted-foreground")}
          >
            Interested
          </button>
        </div>

        <div className="mt-6">
          <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {event.goingCount} going
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {event.going.filter((g) => g.status === "going").map((g) => (
              <button key={g.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 w-full text-left active:bg-muted" onClick={() => nav.push({ k: "profile", id: g.id })}>
                <Avatar athlete={g} size={38} />
                <span className="text-[14px] font-semibold">{g.firstName} {g.lastName}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
