"use client";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Footprints, Bike, Check, Trash2, Loader2, Pencil } from "lucide-react";
import { api, GearItem } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { ScreenHeader } from "@/components/app/shell";
import { useUnits } from "@/components/app/cards";
import { EmptyState } from "@/components/app/ui";
import { fmtDist, distUnit } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function GearScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const units = useUnits();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [type, setType] = useState("shoes");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["me", "gear"],
    queryFn: () => api.get<{ gear: GearItem[] }>("me/gear"),
  });

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post("me/gear", { name, brand: brand || undefined, type });
      qc.invalidateQueries({ queryKey: ["me", "gear"] });
      setAdding(false);
      setName("");
      setBrand("");
      toast({ description: "Gear added" });
    } catch (e: any) {
      toast({ description: e.message ?? "Failed" });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    await api.patch(`me/gear/${editing}`, { name: editName.trim() });
    qc.invalidateQueries({ queryKey: ["me", "gear"] });
    setEditing(null);
    toast({ description: "Gear updated" });
  };

  const del = async (id: string) => {
    await api.del(`me/gear/${id}`);
    qc.invalidateQueries({ queryKey: ["me", "gear"] });
    toast({ description: "Gear deleted" });
  };

  const gear = data?.gear ?? [];
  const active = gear.filter((g) => !g.retired);
  const retired = gear.filter((g) => g.retired);

  return (
    <div className="flex flex-col min-h-full pb-24">
      <ScreenHeader
        title="Gear"
        right={
          <button onClick={() => setAdding(!adding)} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted" aria-label="Add gear">
            <Plus size={20} />
          </button>
        }
      />
      {adding && (
        <div className="px-4 pt-4">
          <div className="bg-card border border-primary/30 rounded-lg p-4 flex flex-col gap-3">
            <div className="text-[13px] font-bold">Add gear</div>
            <div className="flex gap-2">
              {["shoes", "bike", "other"].map((t) => (
                <button key={t} onClick={() => setType(t)} className={cn("flex-1 h-10 rounded-lg border text-[12.5px] font-bold capitalize", type === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground")}>
                  {t === "shoes" ? "Shoes" : t === "bike" ? "Bike" : "Other"}
                </button>
              ))}
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "bike" ? "Trek Domane AL 4" : "Brooks Ghost 15"} className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)" className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary" />
            <div className="flex gap-3">
              <button onClick={() => setAdding(false)} className="flex-1 h-11 rounded-lg border border-border font-bold text-[14px]">Cancel</button>
              <button onClick={add} disabled={saving || !name.trim()} className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-40">
                {saving && <Loader2 size={15} className="animate-spin" />} Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col px-4 pt-4 gap-2.5">
        {isLoading && [0, 1].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        {!isLoading && active.length === 0 && <EmptyState icon={Footprints} title="No gear yet" body="Add your shoes and bikes to track their mileage automatically." />}
        {active.map((g) => (
          <div key={g.id} className="bg-card border border-border rounded-lg p-4">
            {editing === g.id ? (
              <div className="flex gap-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-10 bg-muted/60 border-0" autoFocus />
                <button onClick={saveEdit} className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Check size={16} /></button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className={cn("w-10 h-10 rounded-lg flex items-center justify-center", g.type === "bike" ? "bg-muted text-foreground" : "bg-primary/10 text-primary")}>
                    {g.type === "bike" ? <Bike size={19} /> : <Footprints size={19} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-bold truncate">{g.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{g.brand ?? g.type}</div>
                  </div>
                  <span className="tnum text-[15px] font-bold text-primary">{fmtDist(g.distanceM, units, 0)}</span>
                  <span className="text-[10px] text-muted-foreground font-bold">{distUnit(units)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  {g.isDefault && <span className="text-[10.5px] font-bold text-achievement uppercase tracking-wide flex items-center gap-1"><Check size={11} /> Default {g.type}</span>}
                  <div className="flex-1" />
                  <button onClick={() => { setEditing(g.id); setEditName(g.name); }} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted" aria-label="Rename"><Pencil size={14} /></button>
                  <button
                    onClick={async () => { await api.patch(`me/gear/${g.id}`, { isDefault: true }); qc.invalidateQueries({ queryKey: ["me", "gear"] }); }}
                    className={cn("px-2.5 h-8 rounded-md text-[11px] font-bold", g.isDefault ? "text-muted-foreground" : "text-primary bg-primary/10")}
                  >
                    {g.isDefault ? "Default" : "Make default"}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted" aria-label="Delete gear"><Trash2 size={14} /></button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-[320px]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {g.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Activities already logged with this gear keep their history.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => del(g.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}
          </div>
        ))}

        {retired.length > 0 && (
          <>
            <div className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground pt-2">Retired</div>
            {retired.map((g) => (
              <div key={g.id} className="bg-muted/40 border border-border rounded-lg p-4 flex items-center gap-3 opacity-70">
                <span className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-muted", g.type === "bike" ? "text-foreground" : "text-primary")}>
                  {g.type === "bike" ? <Bike size={19} /> : <Footprints size={19} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold truncate">{g.name}</div>
                  <div className="tnum text-[11.5px] text-muted-foreground">{fmtDist(g.distanceM, units, 0)} {distUnit(units)} lifetime</div>
                </div>
                <button onClick={async () => { await api.patch(`me/gear/${g.id}`, { retired: false }); qc.invalidateQueries({ queryKey: ["me", "gear"] }); }} className="text-[12px] font-bold text-primary">
                  Restore
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
