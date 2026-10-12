"use client";
import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp, MessageCircle, UserPlus, Users, CalendarCheck, Flag, Bell, Sparkles } from "lucide-react";
import { api, NotificationItem } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar, EmptyState } from "@/components/app/ui";
import { agoLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const NOTIF_ICON: Record<string, any> = {
  kudos: ThumbsUp, comment: MessageCircle, comment_reply: MessageCircle,
  follow: UserPlus, club_join: Users, event: CalendarCheck, challenge_milestone: Flag,
  segment_record: Flag, welcome: Sparkles,
};

export function NotificationsScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const setUnread = useUI((s) => s.setUnread);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: NotificationItem[]; unreadCount: number }>("me/notifications"),
  });

  useEffect(() => {
    if (data) {
      setUnread(data.unreadCount);
      if (data.unreadCount > 0) {
        api.post("me/notifications/read", {}).then(() => {
          setUnread(0);
        }).catch(() => {});
      }
    }
  }, [data]);

  const open = (n: NotificationItem) => {
    if (n.activityId) nav.push({ k: "activity", id: n.activityId });
    else if (n.clubId) nav.push({ k: "clubs" });
    else if (n.challengeId) nav.push({ k: "challenges" });
    else if (n.actor) nav.push({ k: "profile", id: n.actor.id });
  };

  const notifs = data?.notifications ?? [];

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Notifications" />
      {notifs.length === 0 && <EmptyState icon={Bell} title="No notifications" body="Kudos, comments, follows and challenge updates will land here." />}
      <div className="flex flex-col">
        {notifs.map((n) => {
          const Icon = NOTIF_ICON[n.type] ?? Bell;
          const label =
            n.type === "kudos" ? "gave kudos" :
            n.type === "comment" ? "commented" :
            n.type === "follow" ? "started following you" :
            n.type === "club_join" ? "" :
            null;
          return (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={cn("flex items-center gap-3 px-4 py-3.5 border-b border-border text-left w-full active:bg-muted", !n.read && "bg-primary/[0.04]")}
            >
              <div className="relative shrink-0">
                <Avatar athlete={n.actor} size={42} />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
                  <Icon size={10} />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-snug">
                  {n.actor && <b>{n.actor.firstName} {n.actor.lastName} </b>}
                  <span className="text-muted-foreground">{n.text ?? label ?? ""}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{agoLabel(n.createdAt)} ago</div>
              </div>
              {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
