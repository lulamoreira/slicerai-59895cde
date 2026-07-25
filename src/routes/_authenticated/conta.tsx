import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useAccess } from "@/lib/useSession";
import { PageContainer } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "Sua conta — SlicerAI" },
      { name: "description", content: "Gerencie sua conta, tema e assinatura no SlicerAI." },
      { property: "og:title", content: "Sua conta — SlicerAI" },
      { property: "og:description", content: "Gerenciamento de conta." },
    ],
  }),
  component: ContaPage,
});

function ContaPage() {
  const nav = useNavigate();
  const { user } = useSession();
  const { data: access } = useAccess(user);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  }

  return (
    <PageContainer>
      <h1 className="font-display text-3xl mb-6">Sua conta</h1>

      <section className="rounded-3xl border bg-card p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground grid place-items-center font-display text-lg">
            {(profile?.full_name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{profile?.full_name ?? user?.email}</div>
            <div className="text-sm text-muted-foreground">{user?.email}</div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 mb-6">
        <h2 className="font-display text-xl mb-3">Assinatura</h2>
        <div className="text-sm">
          <div>Plano: <span className="font-semibold">{access?.plan_name ?? "—"}</span></div>
          <div>Status: <span className="font-semibold">{access?.status}</span></div>
          {access?.trial_ends_at && (
            <div>Trial termina em: <span className="font-semibold">{format(new Date(access.trial_ends_at), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span></div>
          )}
          {access?.current_period_ends_at && (
            <div>Próxima renovação: <span className="font-semibold">{format(new Date(access.current_period_ends_at), "dd 'de' MMMM", { locale: ptBR })}</span></div>
          )}
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          <Button className="rounded-full" variant="outline" onClick={() => nav({ to: "/planos" })}>Ver planos</Button>
          <Button className="rounded-full" variant="secondary" disabled title="Disponível após integração Stripe">
            Gerenciar assinatura
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 mb-6">
        <h2 className="font-display text-xl mb-3">Tema</h2>
        <ThemeToggle />
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-xl mb-3">Sessão</h2>
        <Button variant="destructive" className="rounded-full" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </section>
    </PageContainer>
  );
}
