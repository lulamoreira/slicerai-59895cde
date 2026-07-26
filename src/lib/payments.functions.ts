import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server functions: checkout + billing portal. Bearer token attached automatically
// by attachSupabaseAuth middleware in src/start.ts.

type CheckoutInput = {
  plan_id: string;
  billing?: "month" | "year";
  coupon_code?: string | null;
  origin: string; // e.g. window.location.origin
};

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CheckoutInput) => {
    if (!data?.plan_id) throw new Error("plan_id é obrigatório.");
    if (!data?.origin || !/^https?:\/\//.test(data.origin)) throw new Error("origin inválido.");
    return {
      plan_id: data.plan_id,
      billing: data.billing === "year" ? "year" : "month",
      coupon_code: (data.coupon_code ?? "").trim().toUpperCase() || null,
      origin: data.origin.replace(/\/+$/, ""),
    } as Required<Omit<CheckoutInput, "coupon_code">> & { coupon_code: string | null };
  })
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    // Plan
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id, name, code, stripe_price_month_id, stripe_price_year_id, active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan || !plan.active) throw new Error("Plano não disponível.");
    const priceId = data.billing === "year" ? plan.stripe_price_year_id : plan.stripe_price_month_id;
    if (!priceId) {
      throw new Error(
        `Plano "${plan.name}" ainda não tem stripe_price_${data.billing}_id configurado. Peça a um administrador para preencher em Admin → Planos.`,
      );
    }

    // Profile (email) + existing subscription (customer)
    const [{ data: profile }, { data: subRow }] = await Promise.all([
      supabaseAdmin.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle(),
      supabaseAdmin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    // Ensure customer
    let customerId = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { user_id: context.userId },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          { user_id: context.userId, stripe_customer_id: customerId, status: "none", plan_id: plan.id },
          { onConflict: "user_id" },
        );
    }

    // Validate coupon server-side (never trust client discount)
    let discounts: { coupon: string }[] | undefined;
    if (data.coupon_code) {
      const { data: coupon } = await supabaseAdmin
        .from("coupons")
        .select("code, active, valid_until, max_redemptions, redemptions, stripe_coupon_id")
        .eq("code", data.coupon_code)
        .maybeSingle();
      const nowOk = !coupon?.valid_until || new Date(coupon.valid_until).getTime() > Date.now();
      const usesOk = !coupon?.max_redemptions || (coupon.redemptions ?? 0) < coupon.max_redemptions;
      if (coupon?.active && nowOk && usesOk && coupon.stripe_coupon_id) {
        discounts = [{ coupon: coupon.stripe_coupon_id }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${data.origin}/app?checkout=success`,
      cancel_url: `${data.origin}/planos?checkout=cancel`,
      allow_promotion_codes: !discounts,
      discounts,
      subscription_data: {
        metadata: {
          user_id: context.userId,
          plan_id: plan.id,
          coupon_code: data.coupon_code ?? "",
        },
      },
      metadata: {
        user_id: context.userId,
        plan_id: plan.id,
        coupon_code: data.coupon_code ?? "",
      },
    });

    if (!session.url) throw new Error("Stripe não retornou URL de checkout.");
    return { url: session.url };
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string }) => {
    if (!data?.origin || !/^https?:\/\//.test(data.origin)) throw new Error("origin inválido.");
    return { origin: data.origin.replace(/\/+$/, "") };
  })
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      throw new Error("Você ainda não tem uma assinatura ativa. Assine um plano primeiro.");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${data.origin}/conta`,
    });
    return { url: session.url };
  });
