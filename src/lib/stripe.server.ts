// Server-only Stripe client factory. Never import from client-reachable modules
// at module scope — always dynamic-import inside handler bodies.
import Stripe from "stripe";

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada no servidor.");
  _stripe = new Stripe(key, {
    // Pin to a known API version. Cast to satisfy the SDK's literal type.
    apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

export { Stripe };
