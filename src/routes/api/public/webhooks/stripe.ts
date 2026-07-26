import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

// Public webhook endpoint. NO auth middleware, NO body parsing before signature verify.
// URL: https://<host>/api/public/webhooks/stripe

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!signature || !secret) {
          return new Response("Missing signature or webhook secret.", { status: 400 });
        }

        const rawBody = await request.text();

        const { getStripe, Stripe: StripeNS } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            secret,
            undefined,
            StripeNS.createSubtleCryptoProvider(),
          );
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed", err);
          return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency
        const { error: dupErr } = await supabaseAdmin
          .from("stripe_events")
          .insert({ id: event.id, type: event.type });
        if (dupErr) {
          // Duplicate → already processed
          return new Response("ok", { status: 200 });
        }

        try {
          await handleEvent(event, supabaseAdmin, stripe);
        } catch (err) {
          console.error(`[stripe-webhook] handler error for ${event.type}`, err);
          // Return 500 so Stripe retries; remove idempotency row so retry can process.
          await supabaseAdmin.from("stripe_events").delete().eq("id", event.id);
          return new Response("handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

type SB = Awaited<ReturnType<typeof getAdmin>>;
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function handleEvent(event: Stripe.Event, sb: SB, stripe: Stripe) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.metadata?.user_id as string | undefined) ?? null;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      if (userId && customerId) {
        await sb
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              status: "incomplete",
              plan_id: (session.metadata?.plan_id as string | undefined) ?? null,
            },
            { onConflict: "user_id" },
          );
      }
      // Fetch full subscription to sync details (customer.subscription.created will also fire).
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(sb, sub);
      }
      // Increment coupon usage if used
      const couponCode = (session.metadata?.coupon_code as string | undefined)?.trim().toUpperCase();
      if (couponCode) {
        const { data: c } = await sb.from("coupons").select("id, redemptions").eq("code", couponCode).maybeSingle();
        if (c) {
          await sb.from("coupons").update({ redemptions: (c.redemptions ?? 0) + 1 }).eq("id", c.id);
        }
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sb, sub);
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(sb, sub);
      if (userId) {
        await sb
          .from("subscriptions")
          .update({
            status: "canceled",
            cancel_at_period_end: false,
            stripe_subscription_id: sub.id,
          })
          .eq("user_id", userId);
      }
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      if (subId) {
        await sb.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", subId);
      } else if (customerId) {
        await sb.from("subscriptions").update({ status: "past_due" }).eq("stripe_customer_id", customerId);
      }
      return;
    }

    default:
      // Ignore unhandled event types.
      return;
  }
}

async function syncSubscription(sb: SB, sub: Stripe.Subscription) {
  const userId = await resolveUserId(sb, sub);
  if (!userId) {
    console.warn("[stripe-webhook] no user for subscription", sub.id);
    return;
  }
  const priceId = sub.items.data[0]?.price?.id ?? null;
  let planId: string | null = (sub.metadata?.plan_id as string | undefined) ?? null;
  if (!planId && priceId) {
    const { data: planByMonth } = await sb
      .from("plans")
      .select("id")
      .eq("stripe_price_month_id", priceId)
      .maybeSingle();
    if (planByMonth?.id) planId = planByMonth.id;
    else {
      const { data: planByYear } = await sb
        .from("plans")
        .select("id")
        .eq("stripe_price_year_id", priceId)
        .maybeSingle();
      if (planByYear?.id) planId = planByYear.id;
    }
  }

  const status = mapStripeStatus(sub.status);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      current_period_ends_at: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    },
    { onConflict: "user_id" },
  );
}

function mapStripeStatus(s: Stripe.Subscription.Status):
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid"
  | "expired" {
  switch (s) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return s;
    case "incomplete_expired":
      return "expired";
    default:
      return "canceled";
  }
}

async function resolveUserId(sb: SB, sub: Stripe.Subscription): Promise<string | null> {
  const metaUser = (sub.metadata?.user_id as string | undefined) ?? null;
  if (metaUser) return metaUser;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!customerId) return null;
  const { data } = await sb
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}
