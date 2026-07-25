import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, subs, trialing, active, plans, coupons] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "trialing"),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("plans").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("coupons").select("*", { count: "exact", head: true }).eq("active", true),
      ]);
      return {
        users: users.count ?? 0,
        subs: subs.count ?? 0,
        trialing: trialing.count ?? 0,
        active: active.count ?? 0,
        plans: plans.count ?? 0,
        coupons: coupons.count ?? 0,
      };
    },
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <StatCard label="Usuários" value={stats?.users ?? 0} />
      <StatCard label="Assinaturas" value={stats?.subs ?? 0} />
      <StatCard label="Em trial" value={stats?.trialing ?? 0} />
      <StatCard label="Ativos" value={stats?.active ?? 0} />
      <StatCard label="Planos ativos" value={stats?.plans ?? 0} />
      <StatCard label="Cupons ativos" value={stats?.coupons ?? 0} />
    </div>
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
