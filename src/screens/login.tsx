"use client";
import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { StrideMark, StrideWordmark } from "@/components/app/brand";

export function LoginGate({ onAuthed }: { onAuthed: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  return (
    <div className="h-full flex flex-col bg-background overflow-y-auto no-scrollbar">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 min-h-[520px]">
        <StrideMark size={64} className="mb-3" />
        <StrideWordmark height={23} className="mb-2" />
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.32em] text-muted-foreground mb-8">
          Built for the long run
        </div>
        {mode === "login" ? <LoginForm onAuthed={onAuthed} onSignup={() => setMode("signup")} /> : <SignupForm onAuthed={onAuthed} onLogin={() => setMode("login")} />}
      </div>
      <div className="px-6 pb-8 text-center text-[11px] text-muted-foreground">
        By joining you agree to train hard and give kudos generously.
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-12 rounded-lg bg-primary text-primary-foreground font-bold text-[15px] tracking-wide active:scale-[0.98] transition-transform disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

function LoginForm({ onAuthed, onSignup }: { onAuthed: () => Promise<void>; onSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: async (body: { email: string; password: string }) => api.post("auth/login", body),
    onSuccess: async () => {
      try {
        await onAuthed();
        toast({ description: "Welcome back" });
      } catch (e: any) {
        setError(e?.message ?? "Sign-in failed");
      }
    },
    onError: (e: any) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mut.mutate({ email, password });
  };

  return (
    <form onSubmit={submit} className="w-full max-w-[340px] flex flex-col gap-3.5">
      <div>
        <Label htmlFor="email" className="text-[12px] font-semibold text-muted-foreground">Email</Label>
        <Input
          id="email" type="email" inputMode="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <Label htmlFor="password" className="text-[12px] font-semibold text-muted-foreground">Password</Label>
        <Input
          id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="••••••••"
        />
      </div>
      {error && <div className="text-[12.5px] text-destructive px-1">{error}</div>}
      <PrimaryButton onClick={() => {}} disabled={mut.isPending}>
        {mut.isPending ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Sign In"}
      </PrimaryButton>
      <button type="button" onClick={onSignup} className="text-[13px] text-primary font-semibold py-2">
        New to STRIDE? Create an account
      </button>
      <div className="relative my-1">
        <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-3 text-[11px] text-muted-foreground uppercase tracking-wider">or try the demo</span></div>
      </div>
      <button
        type="button"
        onClick={() => { setEmail("alex@striden.app"); setPassword("stridedemo"); mut.mutate({ email: "alex@striden.app", password: "stridedemo" }); }}
        className="w-full h-11 rounded-lg border-2 border-primary/70 text-primary font-bold text-[14px] active:scale-[0.98] transition-transform"
      >
        Sign in as Alex (demo)
      </button>
    </form>
  );
}

function SignupForm({ onAuthed, onLogin }: { onAuthed: () => Promise<void>; onLogin: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", city: "", country: "", sex: "", weightKg: "", units: "km" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () =>
      api.post("auth/signup", {
        ...form,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
      }),
    onSuccess: async () => {
      try {
        await onAuthed();
      } catch (e: any) {
        setError(e?.message ?? "Sign-up failed");
      }
    },
    onError: (e: any) => setError(e.message),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(null); mut.mutate(); }}
      className="w-full max-w-[340px] flex flex-col gap-3.5"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">First name</Label>
          <Input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">Last name</Label>
          <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
      </div>
      <div>
        <Label className="text-[12px] font-semibold text-muted-foreground">Email</Label>
        <Input required type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
      </div>
      <div>
        <Label className="text-[12px] font-semibold text-muted-foreground">Password (8+ characters)</Label>
        <Input required type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">City</Label>
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Dhaka" className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">Country</Label>
          <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Bangladesh" className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">Sex</Label>
          <div className="flex gap-1.5 mt-1.5">
            {["M", "F", "—"].map((s) => (
              <button
                key={s} type="button" onClick={() => set("sex", s === "—" ? "" : s)}
                className={cn(
                  "flex-1 h-12 rounded-lg text-[13px] font-bold border transition-colors",
                  (form.sex === s || (s === "—" && !form.sex)) ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">Weight (kg)</Label>
          <Input inputMode="decimal" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} placeholder="68" className="h-12 mt-1.5 text-[15px] bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <Label className="text-[12px] font-semibold text-muted-foreground">Units</Label>
          <div className="flex gap-1.5 mt-1.5">
            {["km", "mi"].map((u) => (
              <button
                key={u} type="button" onClick={() => set("units", u)}
                className={cn(
                  "flex-1 h-12 rounded-lg text-[13px] font-bold border transition-colors",
                  form.units === u ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="text-[12.5px] text-destructive px-1">{error}</div>}
      <PrimaryButton disabled={mut.isPending}>
        {mut.isPending ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Create Account"}
      </PrimaryButton>
      <button type="button" onClick={onLogin} className="text-[13px] text-primary font-semibold py-2">
        Already have an account? Sign in
      </button>
    </form>
  );
}
