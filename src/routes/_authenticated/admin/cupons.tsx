import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { upsertCoupon, deleteCoupon } from "@/lib/admin.functions";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cupons")({
  component: CouponsPage,
});

type Coupon = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  max_redemptions: number | null;
  redemptions: number;
  valid_until: string | null;
  active: boolean;
};

function CouponsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [toDelete, setToDelete] = useState<Coupon | null>(null);

  const { data: coupons } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Coupon[];
    },
  });

  const upsertFn = useServerFn(upsertCoupon);
  const delFn = useServerFn(deleteCoupon);

  const mUpsert = useMutation({
    mutationFn: (v: Parameters<typeof upsertCoupon>[0]["data"]) => upsertFn({ data: v }),
    onSuccess: () => { toast.success("Cupom salvo"); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Cupom removido"); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); setToDelete(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">Cupons são armazenados aqui. A aplicação em cobrança entra na Fase 3 (Stripe).</p>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-full"><Plus className="h-4 w-4 mr-1" /> Novo cupom</Button>
      </div>

      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_120px_120px_80px_80px] gap-2 px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
          <div>Código</div>
          <div>Tipo</div>
          <div>Valor</div>
          <div>Validade</div>
          <div>Usos</div>
          <div />
        </div>
        {coupons?.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum cupom cadastrado.</div>
        ) : (
          coupons?.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_100px_120px_120px_80px_80px] gap-2 items-center px-4 py-3 border-t text-sm">
              <div>
                <div className="font-mono font-semibold">{c.code}</div>
                <div className="text-xs text-muted-foreground">{c.active ? "ativo" : "inativo"}</div>
              </div>
              <div className="text-xs">{c.kind === "percent" ? "Porcentagem" : "Fixo (R$)"}</div>
              <div className="text-sm font-semibold">{c.kind === "percent" ? `${c.value}%` : `R$ ${(c.value / 100).toFixed(2)}`}</div>
              <div className="text-xs text-muted-foreground">{c.valid_until ? new Date(c.valid_until).toLocaleDateString("pt-BR") : "sem validade"}</div>
              <div className="text-xs">{c.redemptions}{c.max_redemptions ? `/${c.max_redemptions}` : ""}</div>
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="rounded-full" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="rounded-full text-destructive" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))
        )}
      </div>

      <CouponDialog open={open} onOpenChange={setOpen} initial={editing} onSubmit={(v) => mUpsert.mutate(v)} submitting={mUpsert.isPending} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.code} será removido permanentemente.</AlertDialogDescription>
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

function CouponDialog({
  open, onOpenChange, initial, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Coupon | null;
  onSubmit: (v: Parameters<typeof upsertCoupon>[0]["data"]) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    kind: (initial?.kind ?? "percent") as "percent" | "fixed",
    value: (initial?.kind === "fixed" ? (initial?.value ?? 0) / 100 : initial?.value ?? 10).toString(),
    max_redemptions: (initial?.max_redemptions ?? "").toString(),
    valid_until: initial?.valid_until ? initial.valid_until.slice(0, 10) : "",
    active: initial?.active ?? true,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={initial?.id ?? "new"}>
        <DialogHeader><DialogTitle>{initial ? "Editar cupom" : "Novo cupom"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="BEMVINDO10" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as "percent" | "fixed" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Porcentagem (%)</SelectItem>
                  <SelectItem value="fixed">Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor {form.kind === "percent" ? "(%)" : "(R$)"}</Label>
              <Input type="number" step={form.kind === "percent" ? "1" : "0.01"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Limite de usos</Label><Input type="number" placeholder="ilimitado" value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} /></div>
            <div><Label>Válido até</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
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
                kind: form.kind,
                value: form.kind === "percent" ? parseInt(form.value || "0", 10) : Math.round(parseFloat(form.value || "0") * 100),
                max_redemptions: form.max_redemptions ? parseInt(form.max_redemptions, 10) : null,
                valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
                active: form.active,
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
