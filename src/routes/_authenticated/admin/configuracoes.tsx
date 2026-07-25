import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { updateAppSettings } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ trial_days: 7, app_name: "SlicerAI", trial_welcome_message: "" });

  useEffect(() => {
    if (data) setForm({
      trial_days: data.trial_days,
      app_name: data.app_name,
      trial_welcome_message: data.trial_welcome_message,
    });
  }, [data]);

  const updateFn = useServerFn(updateAppSettings);
  const mUpdate = useMutation({
    mutationFn: (v: typeof form) => updateFn({ data: v }),
    onSuccess: () => { toast.success("Configurações salvas"); qc.invalidateQueries({ queryKey: ["app-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl">
      <div className="rounded-3xl border bg-card p-6 space-y-4">
        <div>
          <Label>Nome do app</Label>
          <Input value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
        </div>
        <div>
          <Label>Dias de trial para novos cadastros</Label>
          <Input type="number" min={0} value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: parseInt(e.target.value || "0", 10) })} />
          <p className="text-xs text-muted-foreground mt-1">Aplicado a novos usuários. Assinantes existentes não são afetados.</p>
        </div>
        <div>
          <Label>Mensagem de boas-vindas do trial</Label>
          <Textarea rows={3} value={form.trial_welcome_message} onChange={(e) => setForm({ ...form, trial_welcome_message: e.target.value })} />
        </div>
        <Button className="rounded-full" disabled={mUpdate.isPending} onClick={() => mUpdate.mutate(form)}>Salvar</Button>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
