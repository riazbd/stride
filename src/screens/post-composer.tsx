"use client";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Globe2, Users, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, useUI } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar } from "@/components/app/ui";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function PostComposerScreen() {
  const nav = useNav();
  const me = useUI((s) => s.me);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await api.post("posts", { text: text.trim() });
      qc.invalidateQueries({ queryKey: ["feed"] });
      toast({ description: "Posted" });
      nav.pop();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not post" });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="New Post"
        right={
          <button
            onClick={post}
            disabled={posting || !text.trim()}
            className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-40"
          >
            {posting ? <Loader2 size={15} className="animate-spin" /> : null} Post
          </button>
        }
      />
      <div className="flex gap-3 px-4 pt-4">
        <Avatar athlete={me} size={42} />
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Share your training with the STRIDE community…"
          className="min-h-[140px] border-0 bg-transparent px-0 text-[15px] focus-visible:ring-0 resize-none leading-relaxed"
        />
      </div>
      <div className="mt-auto px-4 pb-24">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-muted/60 rounded-lg px-3.5 py-2.5">
          <Globe2 size={14} />
          Your post is visible to everyone on STRIDE
        </div>
        <div className="tnum text-right text-[11px] text-muted-foreground mt-2">{2000 - text.length}</div>
      </div>
    </div>
  );
}
