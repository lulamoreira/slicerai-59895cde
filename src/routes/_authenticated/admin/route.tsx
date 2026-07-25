import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { BarChart3, Users, Package, TicketPercent, Settings } from "lucide-react";
import { useSession, useAccess } from "@/lib/useSession";
import { PageContainer } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SlicerAI" },
      { name: "description", content: "Painel administrativo do SlicerAI." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const TABS: Array<{ to: "/admin" | "/admin/usuarios" | "/admin/planos" | "/admin/cupons" | "/admin/configuracoes"; label: string; Icon: typeof BarChart3; exact?: boolean }> = [
  { to: "/admin", label: "Visão geral", Icon: BarChart3, exact: true },
  { to: "/admin/usuarios", label: "Usuários", Icon: Users },
  { to: "/admin/planos", label: "Planos", Icon: Package },
  { to: "/admin/cupons", label: "Cupons", Icon: TicketPercent },
  { to: "/admin/configuracoes", label: "Configurações", Icon: Settings },
];

function AdminLayout() {
  const nav = useNavigate();
  const { user } = useSession();
  const { data: access, isLoading } = useAccess(user);
  const { pathname } = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    if (!isLoading && access && !access.is_admin) nav({ to: "/app" });
  }, [access, isLoading, nav]);

  if (isLoading || !access) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!access.is_admin) return null;

  return (
    <PageContainer className="max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl">Painel admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie usuários, planos, cupons e configurações do SlicerAI.</p>
      </div>
      <nav className="flex flex-wrap gap-2 mb-6 border-b pb-3">
        {TABS.map(({ to, label, Icon, exact }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </PageContainer>
  );
}
