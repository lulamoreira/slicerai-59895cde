import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useAccess } from "@/lib/useSession";
import { PageContainer } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SlicerAI" },
      { name: "description", content: "Painel administrativo do SlicerAI." },
      { property: "og:title", content: "Admin — SlicerAI" },
      { property: "og:description", content: "Painel administrativo." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const nav = useNavigate();
  const { user } = useSession();
  const { data: access, isLoading } = useAccess(user);

  useEffect(() => {
    if (!isLoading && access && !access.is_admin) nav({ to: "/app" });
  }, [access, isLoading, nav]);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    enabled: !!access?.is_admin,
    queryFn: async () => {
      const [users, subs, trialing, active] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "trialing"),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
      ]);
      return {
        users: users.count ?? 0,
        subs: subs.count ?? 0,
        trialing: trialing.count ?? 0,
        active: active.count ?? 0,
      };
    },
  });

  if (!access?.is_admin) return null;

  return (
    <PageContainer>
      <h1 className="font-display text-3xl mb-6">Painel admin</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Usuários" value={stats?.users ?? 0} />
        <StatCard label="Assinaturas" value={stats?.subs ?? 0} />
        <StatCard label="Em trial" value={stats?.trialing ?? 0} />
        <StatCard label="Ativos" value={stats?.active ?? 0} />
      </div>
      <div className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">Fase 2 pendente</p>
        <p>Gestão completa de usuários, planos e cupons será entregue quando você aprovar seguir para as fases 2 e 3 (Admin completo + Stripe guiado).</p>
      </div>
    </PageContainer>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-3xl mt-1">{value}</div>
    </div>
  );
}
