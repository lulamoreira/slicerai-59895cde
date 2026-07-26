import { Link, useRouterState } from "@tanstack/react-router";
import { Home, User2, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSession, useAccess, type AccessInfo } from "@/lib/useSession";
import type { User } from "@supabase/supabase-js";

const NAV = [
  { to: "/app", label: "Slicer", Icon: Home },
  { to: "/conta", label: "Conta", Icon: User2 },
];

function displayName(user: User | null) {
  if (!user) return "Visitante";
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name || meta?.name || user.email?.split("@")[0] || "Você";
}

function statusInfo(access: AccessInfo | undefined): { label: string; tone: string } {
  if (!access) return { label: "Carregando…", tone: "bg-muted text-muted-foreground" };
  if (access.is_owner) return { label: "Owner", tone: "bg-primary text-primary-foreground" };
  if (access.is_admin) return { label: "Admin", tone: "bg-primary text-primary-foreground" };
  const plan = access.plan_name ? ` · ${access.plan_name}` : "";
  switch (access.status) {
    case "trialing":
      return { label: `Trial${plan}`, tone: "bg-primary/15 text-primary" };
    case "active":
      return { label: `Ativo${plan}`, tone: "bg-primary/15 text-primary" };
    case "past_due":
      return { label: "Pagamento pendente", tone: "bg-destructive/15 text-destructive" };
    case "canceled":
      return { label: "Cancelado", tone: "bg-destructive/15 text-destructive" };
    case "expired":
      return { label: "Expirado", tone: "bg-destructive/15 text-destructive" };
    default:
      return { label: "Sem plano", tone: "bg-muted text-muted-foreground" };
  }
}

function UserBadge({
  user,
  access,
  variant,
}: {
  user: User | null;
  access: AccessInfo | undefined;
  variant: "sidebar" | "topbar";
}) {
  const name = displayName(user);
  const { label, tone } = statusInfo(access);
  const initial = name.charAt(0).toUpperCase();
  return (
    <Link
      to="/conta"
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-card px-3 py-2 hover:bg-accent transition-colors",
        variant === "sidebar" ? "w-full" : "min-w-0",
      )}
      aria-label={`Conta de ${name}`}
    >
      <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center font-display text-sm">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold leading-tight">{name}</div>
        <span
          className={cn(
            "mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            tone,
          )}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { user } = useSession();
  const { data: access } = useAccess(user);
  const items = [...NAV, ...(access?.is_admin ? [{ to: "/admin", label: "Admin", Icon: Shield }] : [])];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 px-6 border-b">
          <div className="h-8 w-8 rounded-xl bg-primary grid place-items-center text-primary-foreground font-display text-sm">
            S
          </div>
          <span className="font-display text-lg tracking-tight">SlicerAI</span>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {items.map(({ to, label, Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <UserBadge user={user} access={access} variant="sidebar" />
        </div>
      </aside>

      {/* Mobile top bar with user + status */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 backdrop-blur px-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary grid place-items-center text-primary-foreground font-display text-sm">
            S
          </div>
          <span className="font-display text-base tracking-tight">SlicerAI</span>
        </div>
        <div className="ml-auto min-w-0 max-w-[65%]">
          <UserBadge user={user} access={access} variant="topbar" />
        </div>
      </header>

      {/* Content */}
      <main className="md:pl-64 pb-20 md:pb-8">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-card md:hidden">
        <div className="grid grid-cols-3">
          {items.map(({ to, label, Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-semibold",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-3xl px-4 py-6 md:py-10", className)}>{children}</div>;
}
