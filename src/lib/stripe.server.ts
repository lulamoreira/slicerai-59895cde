// Server-only Stripe client factory. Never import from client-reachable modules
// at module scope — always dynamic-import inside handler bodies.
import Stripe from "stripe";

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada no servidor.");
  _stripe = new Stripe(key, {
    apiVersion: "2024-06-20",
    // Required on Cloudflare Workers — the default Node HTTP client is not available.
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

export { Stripe };
