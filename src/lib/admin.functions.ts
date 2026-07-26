import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AdminCtx = { supabase: SupabaseClient<Database>; userId: string };
async function assertAdmin(context: AdminCtx) {
  const { data, error } = await context.supabase.rpc("is_admin_or_owner", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: acesso apenas para administradores.");
}


// -------- Users --------

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: subs, error: sErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("subscriptions").select("user_id, status, trial_ends_at, current_period_ends_at, plan_id"),
    ]);
    if (pErr || rErr || sErr) throw new Error(pErr?.message ?? rErr?.message ?? sErr?.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as string);
      rolesByUser.set(r.user_id, arr);
    }
    const subByUser = new Map<string, (typeof subs)[number]>();
    for (const s of subs ?? []) subByUser.set(s.user_id, s);

    return (profiles ?? []).map((p) => {
      const rs = rolesByUser.get(p.id) ?? [];
      const role = rs.includes("owner") ? "owner" : rs.includes("admin") ? "admin" : "user";
      const sub = subByUser.get(p.id) ?? null;
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        created_at: p.created_at,
        role,
        subscription: sub
          ? {
              status: sub.status,
              trial_ends_at: sub.trial_ends_at,
              current_period_ends_at: sub.current_period_ends_at,
              plan_id: sub.plan_id,
            }
          : null,
      };
    });
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: "admin" | "user" }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode alterar seu próprio papel.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Never touch owner
    const { data: existing } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if ((existing ?? []).some((r) => r.role === "owner")) throw new Error("O papel de owner não pode ser modificado.");

    // Wipe non-owner roles, then insert new one (except plain 'user' means: no admin role)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).neq("role", "owner");
    if (data.role === "admin") {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: "admin" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: "user" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const extendTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; days: number }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("subscriptions").select("*").eq("user_id", data.userId).maybeSingle();
    const base = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
    if (base.getTime() < Date.now()) base.setTime(Date.now());
    base.setDate(base.getDate() + data.days);
    const payload = {
      user_id: data.userId,
      status: "trialing" as const,
      trial_ends_at: base.toISOString(),
      plan_id: sub?.plan_id ?? null,
    };
    const { error } = await supabaseAdmin.from("subscriptions").upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true, trial_ends_at: payload.trial_ends_at };
  });

export const setSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; status: "active" | "canceled"; days?: number }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("subscriptions").select("*").eq("user_id", data.userId).maybeSingle();
    const patch: { user_id: string; status: "active" | "canceled"; plan_id: string | null; current_period_ends_at?: string } = {
      user_id: data.userId,
      status: data.status,
      plan_id: sub?.plan_id ?? null,
    };
    if (data.status === "active") {
      const end = new Date();
      end.setDate(end.getDate() + (data.days ?? 30));
      patch.current_period_ends_at = end.toISOString();
    }
    const { error } = await supabaseAdmin.from("subscriptions").upsert(patch, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if ((roles ?? []).some((r) => r.role === "owner")) throw new Error("O owner não pode ser excluído.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Plans --------

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id?: string;
    code: string;
    name: string;
    description?: string | null;
    price_month_cents: number;
    price_year_cents: number;
    features: string[];
    trial_days: number;
    active: boolean;
    sort_order: number;
    stripe_price_month_id?: string | null;
    stripe_price_year_id?: string | null;
  }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      price_month_cents: data.price_month_cents,
      price_year_cents: data.price_year_cents,
      features: data.features,
      trial_days: data.trial_days,
      active: data.active,
      sort_order: data.sort_order,
      stripe_price_month_id: data.stripe_price_month_id?.trim() || null,
      stripe_price_year_id: data.stripe_price_year_id?.trim() || null,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("plans").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("plans").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Coupons --------

export const upsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id?: string;
    code: string;
    kind: "percent" | "fixed";
    value: number;
    max_redemptions?: number | null;
    valid_until?: string | null;
    active: boolean;
  }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();

    // Sync to Stripe (best-effort — if key not configured, still persist locally).
    let stripe_coupon_id: string | null = null;
    try {
      const { getStripe } = await import("./stripe.server");
      const stripe = getStripe();
      // Load existing to reuse coupon id when possible.
      let existing: { stripe_coupon_id: string | null } | null = null;
      if (data.id) {
        const { data: cur } = await supabaseAdmin
          .from("coupons")
          .select("stripe_coupon_id")
          .eq("id", data.id)
          .maybeSingle();
        existing = cur;
      }
      // Archive previous stripe coupon if any (Stripe coupons are largely immutable).
      if (existing?.stripe_coupon_id) {
        try {
          await stripe.coupons.del(existing.stripe_coupon_id);
        } catch (e) {
          console.warn("[coupon] failed to delete previous stripe coupon", e);
        }
      }
      if (data.active) {
        const created = await stripe.coupons.create({
          duration: "once",
          ...(data.kind === "percent"
            ? { percent_off: data.value }
            : { amount_off: data.value, currency: "brl" }),
          name: code,
          max_redemptions: data.max_redemptions ?? undefined,
          redeem_by: data.valid_until ? Math.floor(new Date(data.valid_until).getTime() / 1000) : undefined,
          metadata: { code },
        });
        stripe_coupon_id = created.id;
      }
    } catch (e) {
      console.warn("[coupon] stripe sync skipped/failed", (e as Error).message);
    }

    const row = {
      code,
      kind: data.kind,
      value: data.value,
      max_redemptions: data.max_redemptions ?? null,
      valid_until: data.valid_until ?? null,
      active: data.active,
      stripe_coupon_id,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("coupons").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("coupons").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await supabaseAdmin
      .from("coupons")
      .select("stripe_coupon_id")
      .eq("id", data.id)
      .maybeSingle();
    if (cur?.stripe_coupon_id) {
      try {
        const { getStripe } = await import("./stripe.server");
        await getStripe().coupons.del(cur.stripe_coupon_id);
      } catch (e) {
        console.warn("[coupon] delete stripe coupon failed", (e as Error).message);
      }
    }
    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- App settings --------

export const updateAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { trial_days: number; app_name: string; trial_welcome_message: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({
        trial_days: data.trial_days,
        app_name: data.app_name,
        trial_welcome_message: data.trial_welcome_message,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
