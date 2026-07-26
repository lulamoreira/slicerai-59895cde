import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { upsertPlan, deletePlan } from "@/lib/admin.functions";
import { Pencil, Plus, Trash2, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/planos")({
  component: PlansPage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_month_cents: number;
  price_year_cents: number;
  features: string[];
  trial_days: number;
  active: boolean;
  sort_order: number;
  stripe_price_month_id: string | null;
  stripe_price_year_id: string | null;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PlansPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  const { data: plans } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const upsertFn = useServerFn(upsertPlan);
  const delFn = useServerFn(deletePlan);

  const mUpsert = useMutation({
    mutationFn: (v: Parameters<typeof upsertPlan>[0]["data"]) => upsertFn({ data: v }),
    onSuccess: () => { toast.success("Plano salvo"); qc.invalidateQueries({ queryKey: ["admin-plans"] }); qc.invalidateQueries({ queryKey: ["plans"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Plano removido"); qc.invalidateQueries({ queryKey: ["admin-plans"] }); qc.invalidateQueries({ queryKey: ["plans"] }); setToDelete(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(p: Plan) { setEditing(p); setOpen(true); }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} className="rounded-full"><Plus className="h-4 w-4 mr-1" /> Novo plano</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans?.map((p) => (
          <div key={p.id} className="rounded-3xl border bg-card p-5 relative">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs uppercase text-muted-foreground">{p.code} · ordem {p.sort_order}</div>
                <div className="font-display text-2xl">{p.name}</div>
                <div className="text-sm text-muted-foreground">{formatBRL(p.price_month_cents)}/mês · {formatBRL(p.price_year_cents)}/ano</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="rounded-full" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="rounded-full text-destructive" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {(p.features ?? []).map((f) => (
                <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {f}</li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${p.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{p.active ? "ativo" : "inativo"}</span>
              <span className="rounded-full px-2 py-0.5 bg-muted text-muted-foreground">trial {p.trial_days}d</span>
            </div>
          </div>
        ))}
      </div>

      <PlanDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSubmit={(v) => mUpsert.mutate(v)}
        submitting={mUpsert.isPending}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.name} será removido. Assinaturas existentes referenciando este plano ficarão sem plano.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => toDelete && mDel.mutate(toDelete.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="top-right" richColors />
    </div>
  );
}

function PlanDialog({
  open, onOpenChange, initial, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Plan | null;
  onSubmit: (v: Parameters<typeof upsertPlan>[0]["data"]) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price_month_reais: ((initial?.price_month_cents ?? 0) / 100).toString(),
    price_year_reais: ((initial?.price_year_cents ?? 0) / 100).toString(),
    features: (initial?.features ?? []).join("\n"),
    trial_days: (initial?.trial_days ?? 7).toString(),
    active: initial?.active ?? true,
    sort_order: (initial?.sort_order ?? 0).toString(),
    stripe_price_month_id: initial?.stripe_price_month_id ?? "",
    stripe_price_year_id: initial?.stripe_price_year_id ?? "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><span /></DialogTrigger>
      <DialogContent key={initial?.id ?? "new"}>
        <DialogHeader><DialogTitle>{initial ? "Editar plano" : "Novo plano"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="pro" /></div>
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" /></div>
          </div>
          <div><Label>Descrição</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Preço mensal (R$)</Label><Input type="number" step="0.01" value={form.price_month_reais} onChange={(e) => setForm({ ...form, price_month_reais: e.target.value })} /></div>
            <div><Label>Preço anual (R$)</Label><Input type="number" step="0.01" value={form.price_year_reais} onChange={(e) => setForm({ ...form, price_year_reais: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stripe price ID (mensal)</Label>
              <Input value={form.stripe_price_month_id} onChange={(e) => setForm({ ...form, stripe_price_month_id: e.target.value })} placeholder="price_..." />
            </div>
            <div>
              <Label>Stripe price ID (anual)</Label>
              <Input value={form.stripe_price_year_id} onChange={(e) => setForm({ ...form, stripe_price_year_id: e.target.value })} placeholder="price_..." />
            </div>
          </div>
          <div><Label>Features (uma por linha)</Label><Textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Trial (dias)</Label><Input type="number" value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: e.target.value })} /></div>
            <div><Label>Ordem</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Ativo</Label></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={submitting}
            onClick={() =>
              onSubmit({
                id: initial?.id,
                code: form.code.trim(),
                name: form.name.trim(),
                description: form.description.trim() || null,
                price_month_cents: Math.round(parseFloat(form.price_month_reais || "0") * 100),
                price_year_cents: Math.round(parseFloat(form.price_year_reais || "0") * 100),
                features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
                trial_days: parseInt(form.trial_days || "0", 10),
                active: form.active,
                sort_order: parseInt(form.sort_order || "0", 10),
                stripe_price_month_id: form.stripe_price_month_id.trim() || null,
                stripe_price_year_id: form.stripe_price_year_id.trim() || null,
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
