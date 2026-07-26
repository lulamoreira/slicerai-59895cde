import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useAccess } from "@/lib/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { createCheckoutSession } from "@/lib/payments.functions";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos — SlicerAI" },
      { name: "description", content: "Escolha seu plano SlicerAI: trial grátis de 7 dias e assinatura Pro." },
      { property: "og:title", content: "Planos — SlicerAI" },
      { property: "og:description", content: "Trial grátis e planos SlicerAI Pro." },
    ],
  }),
    meta: [
      { title: "Planos — SlicerAI" },
      { name: "description", content: "Escolha seu plano SlicerAI: trial grátis de 7 dias e assinatura Pro." },
      { property: "og:title", content: "Planos — SlicerAI" },
      { property: "og:description", content: "Trial grátis e planos SlicerAI Pro." },
    ],
  }),
  component: PlanosPage,
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PlanosPage() {
  const { user } = useSession();
  const { data: access } = useAccess(user);

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await supabase.from("plans").select("*").eq("active", true).order("sort_order")).data ?? [],
  });

  function assinar() {
    toast.info("Cobrança em breve", { description: "A integração com Stripe é ativada na Fase 3." });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-display">S</div>
            <span className="font-display text-lg">SlicerAI</span>
          </Link>
          {user ? (
            <Link to="/app" className="text-sm font-semibold text-primary">Ir para o app</Link>
          ) : (
            <Link to="/auth" className="text-sm font-semibold text-primary">Entrar</Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 md:py-16">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl md:text-5xl">Escolha seu plano</h1>
          <p className="mt-3 text-muted-foreground">Trial grátis de 7 dias com acesso completo. Sem cartão para começar.</p>
          {access && !access.active && (
            <div className="mt-4 inline-flex rounded-full bg-destructive/10 text-destructive px-4 py-1.5 text-sm font-semibold">
              Seu acesso expirou. Assine para continuar.
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2 max-w-2xl mx-auto">
          <div className="rounded-3xl border bg-card p-6">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Grátis</div>
            <div className="font-display text-3xl mt-1">Trial</div>
            <div className="text-sm text-muted-foreground mt-1">7 dias com acesso completo</div>
            <ul className="mt-6 space-y-2 text-sm">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Todas as funcionalidades</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Sem cartão de crédito</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Cancele quando quiser</li>
            </ul>
            {!user && (
              <Link to="/auth" className="mt-6 block">
                <Button className="w-full rounded-full h-11">Começar trial</Button>
              </Link>
            )}
          </div>

          {plans?.map((p) => (
            <div key={p.id} className="rounded-3xl border-2 border-primary bg-card p-6 relative">
              <div className="absolute -top-3 left-6 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold">
                Recomendado
              </div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">{p.name}</div>
              <div className="font-display text-3xl mt-1">{formatBRL(p.price_month_cents)}<span className="text-base text-muted-foreground font-sans">/mês</span></div>
              <div className="text-sm text-muted-foreground mt-1">ou {formatBRL(p.price_year_cents)}/ano</div>
              <ul className="mt-6 space-y-2 text-sm">
                {(p.features as string[]).map((f) => (
                  <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {f}</li>
                ))}
              </ul>
              <Button className="w-full rounded-full h-11 mt-6" onClick={assinar}>Assinar</Button>
            </div>
          ))}
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}
