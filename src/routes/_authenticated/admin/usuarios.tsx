import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreVertical, Loader2 } from "lucide-react";
import { useSession } from "@/lib/useSession";
import {
  listAdminUsers,
  updateUserRole,
  extendTrial,
  setSubscriptionStatus,
  deleteUser,
} from "@/lib/admin.functions";

const _useServerFn = useServerFn;

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsersPage,
});

type Row = Awaited<ReturnType<typeof listAdminUsers>>[number];

function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useSession();
  const fetchUsers = _useServerFn(listAdminUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers() as unknown as Promise<Row[]>,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      const status = u.subscription?.status ?? "none";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (u.email ?? "").toLowerCase().includes(q) || (u.full_name ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, roleFilter, statusFilter, search]);

  const roleFn = _useServerFn(updateUserRole);
  const extFn = _useServerFn(extendTrial);
  const subFn = _useServerFn(setSubscriptionStatus);
  const delFn = _useServerFn(deleteUser);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const mRole = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "user" }) => roleFn({ data: v }),
    onSuccess: () => { toast.success("Papel atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mExt = useMutation({
    mutationFn: (v: { userId: string; days: number }) => extFn({ data: v }),
    onSuccess: () => { toast.success("Trial estendido"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mSub = useMutation({
    mutationFn: (v: { userId: string; status: "active" | "canceled"; days?: number }) => subFn({ data: v }),
    onSuccess: () => { toast.success("Assinatura atualizada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: (v: { userId: string }) => delFn({ data: v }),
    onSuccess: () => { toast.success("Usuário excluído"); invalidate(); setToDelete(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="Buscar por email ou nome"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs rounded-full"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[160px] rounded-full"><SelectValue placeholder="Papel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] rounded-full"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="trialing">Em trial</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="past_due">Atrasado</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="none">Sem assinatura</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_140px_120px_48px] gap-2 px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
          <div>Usuário</div>
          <div>Papel</div>
          <div>Status</div>
          <div>Cadastro</div>
          <div />
        </div>
        {isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
        ) : (
          filtered.map((u) => <UserRow key={u.id} u={u} isMe={u.id === me?.id}
            onRole={(role) => mRole.mutate({ userId: u.id, role })}
            onExtend={(days) => mExt.mutate({ userId: u.id, days })}
            onActivate={() => mSub.mutate({ userId: u.id, status: "active", days: 30 })}
            onCancel={() => mSub.mutate({ userId: u.id, status: "canceled" })}
            onDelete={() => setToDelete(u)}
            busy={mRole.isPending || mExt.isPending || mSub.isPending}
          />)
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.email} será removido permanentemente, junto com sua assinatura. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && mDel.mutate({ userId: toDelete.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="top-right" richColors />
    </div>
  );
}

function daysLeft(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function UserRow({
  u, isMe, onRole, onExtend, onActivate, onCancel, onDelete, busy,
}: {
  u: Row; isMe: boolean;
  onRole: (r: "admin" | "user") => void;
  onExtend: (days: number) => void;
  onActivate: () => void;
  onCancel: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const status = u.subscription?.status ?? "none";
  const trial = u.subscription?.trial_ends_at ? daysLeft(u.subscription.trial_ends_at) : null;
  const isOwner = u.role === "owner";
  return (
    <div className="grid grid-cols-[1fr_120px_140px_120px_48px] gap-2 items-center px-4 py-3 border-t text-sm">
      <div className="min-w-0">
        <div className="font-semibold truncate">{u.full_name || "—"}</div>
        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
      </div>
      <div>
        <Badge variant={isOwner ? "default" : u.role === "admin" ? "secondary" : "outline"} className="rounded-full">
          {u.role}
        </Badge>
      </div>
      <div className="text-xs">
        <div className="font-semibold">{status}</div>
        {status === "trialing" && trial !== null && <div className="text-muted-foreground">{trial}d restantes</div>}
      </div>
      <div className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</div>
      <div className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={busy || isOwner || isMe} className="rounded-full">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Papel</DropdownMenuLabel>
            {u.role === "admin" ? (
              <DropdownMenuItem onClick={() => onRole("user")}>Rebaixar para usuário</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onRole("admin")}>Promover a admin</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Trial</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onExtend(7)}>+7 dias</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExtend(14)}>+14 dias</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExtend(30)}>+30 dias</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Assinatura</DropdownMenuLabel>
            <DropdownMenuItem onClick={onActivate}>Ativar por 30 dias</DropdownMenuItem>
            <DropdownMenuItem onClick={onCancel}>Cancelar acesso</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>Excluir usuário</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
