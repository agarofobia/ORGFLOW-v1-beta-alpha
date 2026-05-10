import Stripe from "stripe";

// Se inicializa solo cuando se necesita, así no falla durante el build
// si la env var todavía no está configurada en Vercel.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-12-15.clover" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return _stripe;
}
