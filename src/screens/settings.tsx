"use client";
import React, { useState } from "react";
import { useTheme } from "next-themes";
import { Ruler, Globe, ShieldCheck, Palette, LogOut, Info, ChevronRight, Watch, Crown, KeyRound, Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNav, useUI } from "@/lib/nav";
import { api } from "@/lib/api";
import { useSensors } from "@/lib/sensors";
import { ScreenHeader } from "@/components/app/shell";
import { ListRow } from "@/components/app/ui";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { SheetShell } from "@/screens/sheets";
import { Input } from "@/components/ui/input";

export function SettingsScreen() {
  const nav = useNav();
  const me = useUI((s) => s.me);
  const setMe = useUI((s) => s.setMe);
  const refreshMe = useUI((s) => s.refreshMe);
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [units, setUnits] = useState<"km" | "mi">((me?.units as "km" | "mi") ?? "km");
  const [pwSheet, setPwSheet] = useState(false);
  const [delSheet, setDelSheet] = useState(false);
  // only the connection statuses — avoids re-rendering settings on every heartbeat
  const sensorState = useSensors((s) => `${s.hrm.status}/${s.csc.status}`);

  const patch = async (body: any) => {
    try {
      await api.patch("me/settings", body);
      await refreshMe();
      toast({ description: "Settings updated" });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    }
  };

  const logout = async () => {
    await api.post("auth/logout");
    setMe(null);
    window.location.reload();
  };

  const themePref = me?.theme ?? "system";

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader title="Settings" />
      <div className="px-4 pt-4 flex flex-col gap-2.5">
        {/* premium */}
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">Subscription</div>
          <button
            onClick={() => nav.push({ k: "premium" })}
            className={cn(
              "w-full rounded-lg border px-4 py-3.5 flex items-center gap-3.5 text-left active:bg-muted transition-colors",
              me?.premium ? "border-primary/40 bg-primary/[0.05]" : "border-border bg-card"
            )}
          >
            <span className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", me?.premium ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
              <Crown size={19} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="text-[14.5px] font-bold flex items-center gap-1.5">
                Free beta
              </span>
              <span className="block text-[12px] text-muted-foreground mt-0.5 truncate">
                Every feature is unlocked while STRIDE is in beta
              </span>
            </span>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </button>
        </div>

        {/* units */}
        <Section title="Measurement">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex">
              {(["km", "mi"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => { setUnits(u); patch({ units: u }); }}
                  className={cn("flex-1 h-12 flex items-center justify-center gap-1.5 text-[14px] font-bold transition-colors", units === u ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  <Ruler size={15} /> {u === "km" ? "Kilometers" : "Miles"}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* theme */}
        <Section title="Appearance">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex">
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTheme(t === "system" ? "system" : t); patch({ theme: t }); }}
                  className={cn("flex-1 h-12 flex items-center justify-center gap-1.5 text-[13.5px] font-bold capitalize transition-colors", themePref === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {t === "system" ? <Watch size={15} /> : <Palette size={15} />} {t}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* account */}
        <Section title="Account">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <ListRow left={<Globe size={18} className="text-muted-foreground" />} title="Edit profile" sub={me ? `${me.firstName} ${me.lastName} · ${me.city ?? "—"}` : ""} onClick={() => nav.push({ k: "editProfile" })} chevron />
            <div className="h-px bg-border ml-14" />
            <ListRow left={<ShieldCheck size={18} className="text-muted-foreground" />} title="Privacy controls" sub="Privacy zones, visibility, max HR" onClick={() => nav.push({ k: "privacy" })} chevron />
            <div className="h-px bg-border ml-14" />
            <ListRow left={<KeyRound size={18} className="text-muted-foreground" />} title="Change password" onClick={() => setPwSheet(true)} chevron />
          </div>
        </Section>

        {/* apps */}
        <Section title="Apps & services">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <ListRow
              left={<Watch size={18} className="text-muted-foreground" />}
              title="Connected devices"
              sub={
                <span className="flex items-center gap-1.5">
                  {sensorState.includes("connected") && <span className="w-1.5 h-1.5 rounded-full bg-achievement" />}
                  {sensorState.includes("connected")
                    ? "Sensors connected — manage them"
                    : "Bluetooth HR straps · speed & cadence · file import"}
                </span>
              }
              chevron
              onClick={() => nav.push({ k: "devices" })}
            />
          </div>
        </Section>

        {/* about */}
        <Section title="About">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <ListRow left={<Info size={18} className="text-muted-foreground" />} title="About STRIDE" sub="Version 1.0.0" chevron onClick={() => nav.push({ k: "about" })} />
          </div>
        </Section>

        {/* logout */}
        <div className="pt-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full h-12 rounded-lg bg-card border border-border text-destructive font-bold text-[14.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                <LogOut size={17} /> Log Out
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[320px]">
              <AlertDialogHeader>
                <AlertDialogTitle>Log out of STRIDE?</AlertDialogTitle>
                <AlertDialogDescription>You can log back in anytime. Your activities and settings stay safe.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={logout}>Log out</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* delete account */}
        <div className="pt-1">
          <button onClick={() => setDelSheet(true)} className="w-full py-3 text-[12.5px] font-semibold text-muted-foreground flex items-center justify-center gap-1.5 active:text-destructive transition-colors">
            <Trash2 size={13} /> Delete account
          </button>
        </div>

        <div className="text-center text-[11px] text-muted-foreground pt-3">
          STRIDE · Built for athletes, by athletes
        </div>
      </div>

      {pwSheet && <ChangePasswordSheet onClose={() => setPwSheet(false)} />}
      {delSheet && <DeleteAccountSheet onClose={() => setDelSheet(false)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (next.length < 8) return toast({ description: "New password must be at least 8 characters" });
    if (next !== confirm) return toast({ description: "Passwords don't match" });
    setSaving(true);
    try {
      await api.post("me/password", { current, next });
      toast({ description: "Password updated" });
      onClose();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not update password" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell title="Change Password">
      <div className="flex flex-col gap-3.5">
        <div>
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Current password</label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">New password</label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Confirm new password</label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <button onClick={save} disabled={saving || !current || !next} className="h-12 rounded-lg bg-primary text-primary-foreground font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40">
          {saving && <Loader2 size={16} className="animate-spin" />} Update Password
        </button>
      </div>
    </SheetShell>
  );
}

function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const ready = password.length > 0 && confirmText === "DELETE";

  const del = async () => {
    setDeleting(true);
    try {
      await api.post("me/delete", { password });
      await api.post("auth/logout").catch(() => {});
      window.location.reload();
    } catch (e: any) {
      toast({ description: e.message ?? "Could not delete account" });
      setDeleting(false);
    }
  };

  return (
    <SheetShell title="Delete Account">
      <div className="flex flex-col gap-3.5">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          This permanently deletes your profile, all activities, segments, gear and settings.
          This cannot be undone.
        </p>
        <div>
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Password</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Type DELETE to confirm</label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="mt-1.5 h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <button onClick={del} disabled={!ready || deleting} className="h-12 rounded-lg bg-destructive text-white font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40">
          {deleting && <Loader2 size={16} className="animate-spin" />} Delete My Account
        </button>
        <button onClick={onClose} className="h-11 rounded-lg border border-border font-bold text-[14px]">Cancel</button>
      </div>
    </SheetShell>
  );
}
