import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export type AccessInfo = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired" | "none";
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  plan_name: string | null;
  active: boolean;
  is_admin: boolean;
  is_owner: boolean;
};

export function useAccess(user: User | null | undefined) {
  return useQuery<AccessInfo>({
    queryKey: ["access", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: sub }, { data: roles }] = await Promise.all([
        supabase.from("subscriptions").select("status, trial_ends_at, current_period_ends_at, plans(name)").eq("user_id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);
      const roleList = (roles ?? []).map((r) => r.role);
      const is_owner = roleList.includes("owner");
      const is_admin = is_owner || roleList.includes("admin");
      const now = Date.now();
      const trialing = sub?.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > now;
      const activeSub = sub?.status === "active" && (!sub.current_period_ends_at || new Date(sub.current_period_ends_at).getTime() > now);
      return {
        status: (sub?.status ?? "none") as AccessInfo["status"],
        trial_ends_at: sub?.trial_ends_at ?? null,
        current_period_ends_at: sub?.current_period_ends_at ?? null,
        plan_name: (sub as { plans?: { name?: string } } | null)?.plans?.name ?? null,
        active: Boolean(trialing || activeSub || is_admin),
        is_admin,
        is_owner,
      };
    },
  });
}
