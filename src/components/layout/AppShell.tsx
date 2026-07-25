import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, User2, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSession, useAccess } from "@/lib/useSession";

const NAV = [
  { to: "/app", label: "Slicer", Icon: Home },
  { to: "/conta", label: "Conta", Icon: User2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { user } = useSession();
  const { data: access } = useAccess(user);
  const items = [...NAV, ...(access?.is_admin ? [{ to: "/admin", label: "Admin", Icon: Shield }] : [])];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar text-sidebar-foreground md:block">
        <div className="flex h-16 items-center gap-2 px-6 border-b">
          <div className="h-8 w-8 rounded-xl bg-primary grid place-items-center text-primary-foreground font-display text-sm">
            S
          </div>
          <span className="font-display text-lg tracking-tight">SlicerAI</span>
        </div>
        <nav className="p-3 space-y-1">
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
      </aside>

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
