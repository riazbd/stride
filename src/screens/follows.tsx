"use client";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { AthleteRow } from "@/components/app/cards";
import { EmptyState, SegmentedTabs } from "@/components/app/ui";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function FollowsScreen({ id, which }: { id: string; which: "following" | "followers" }) {
  const nav = useNav();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState(which);

  const { data } = useQuery({
    queryKey: ["follows", id, tab],
    queryFn: () => api.get<{ people: any[] }>(`athletes/${id}/${tab}`),
  });

  const follow = async (personId: string, currently: boolean) => {
    try {
      await api.post(`athletes/${personId}/follow`, { on: !currently });
      qc.invalidateQueries({ queryKey: ["follows", id] });
      if (!currently) toast({ description: "Following" });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Connections" />
      <SegmentedTabs
        tabs={[
          { id: "following", label: "Following", count: data && tab === "following" ? data.people.length : undefined },
          { id: "followers", label: "Followers", count: data && tab === "followers" ? data.people.length : undefined },
        ]}
        value={tab}
        onChange={(t) => setTab(t as any)}
      />
      <div className="flex flex-col">
        {data?.people.length === 0 && <EmptyState icon={Users} title={tab === "following" ? "Not following anyone yet" : "No followers yet"} />}
        {data?.people.map((p: any) => (
          <AthleteRow
            key={p.id}
            athlete={p}
            sub={p.bio ?? (p.city ? `${p.city}${p.country ? ", " + p.country : ""}` : "STRIDE athlete")}
            right={
              !p.isMe ? (
                <button
                  onClick={(e) => { e.stopPropagation(); follow(p.id, p.isFollowing); }}
                  className={cn(
                    "px-3.5 h-8 rounded-md text-[12px] font-bold shrink-0 transition-colors",
                    p.isFollowing ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  )}
                >
                  {p.isFollowing ? "Following" : "Follow"}
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide px-2">You</span>
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
