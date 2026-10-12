"use client";
import React, { useState } from "react";
import { useUI, useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#fc4c02", "#2c7f8f", "#404046", "#b0486a", "#3d7a4f", "#7a5c9e", "#5a6472", "#c29238", "#8a6d3b", "#4a7a9e"];

export function EditProfileScreen() {
  const me = useUI((s) => s.me);
  const refreshMe = useUI((s) => s.refreshMe);
  const nav = useNav();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: me?.firstName ?? "",
    lastName: me?.lastName ?? "",
    bio: me?.bio ?? "",
    city: me?.city ?? "",
    country: me?.country ?? "",
    weightKg: me?.weightKg?.toString() ?? "",
    heightCm: me?.heightCm?.toString() ?? "",
    sex: me?.sex ?? "",
  });
  const [avatarColor, setAvatarColor] = useState(me?.avatarColor ?? "#fc4c02");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("me/settings", {
        ...form,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        sex: form.sex === "M" || form.sex === "F" ? form.sex : null,
        avatarColor,
      });
      await refreshMe();
      toast({ description: "Profile updated" });
      nav.pop();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Edit Profile"
        right={
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold active:scale-95 transition-transform">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>
        }
        onBack={() => nav.pop()}
      />
      <div className="px-4 pt-6 flex flex-col items-center">
        <Avatar athlete={{ firstName: form.firstName || "A", lastName: form.lastName, avatarColor }} size={92} />
        <div className="flex gap-2.5 mt-4 flex-wrap justify-center max-w-[280px]">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setAvatarColor(c)}
              className={cn("w-8 h-8 rounded-full border-2 transition-transform", avatarColor === c ? "border-foreground scale-110" : "border-transparent")}
              style={{ background: c }}
              aria-label={`Avatar color ${c}`}
            />
          ))}
        </div>
      </div>
      <div className="px-4 pt-6 flex flex-col gap-4 pb-24">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" /></Field>
          <Field label="Last name"><Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" /></Field>
        </div>
        <Field label="Bio"><Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} maxLength={300} placeholder="Tell the community about yourself" className="min-h-[76px] bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary resize-none" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><Input value={form.city} onChange={(e) => set("city", e.target.value)} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" /></Field>
          <Field label="Country"><Input value={form.country} onChange={(e) => set("country", e.target.value)} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sex">
            <div className="flex gap-1.5 mt-1">
              {["M", "F"].map((s) => (
                <button key={s} onClick={() => set("sex", form.sex === s ? "" : s)} className={cn("flex-1 h-11 rounded-lg text-[13px] font-bold border", form.sex === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground")}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Weight (kg)"><Input inputMode="decimal" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary tnum" /></Field>
          <Field label="Height (cm)"><Input inputMode="numeric" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary tnum" /></Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
