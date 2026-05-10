import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { planFromPriceId, type PlanId } from "@/lib/plans";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 },
    );
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return NextResponse.json(
      { error: `Webhook Error: ${msg}` },
      { status: 400 },
    );
  }

  const client = await clerkClient();

  async function setPlanForOrg(orgId: string, plan: PlanId, subId?: string | null) {
    const org = await client.organizations.getOrganization({
      organizationId: orgId,
    });
    await client.organizations.updateOrganization(orgId, {
      publicMetadata: {
        ...org.publicMetadata,
        plan,
        stripeSubscriptionId: subId ?? null,
      },
    });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.clerkOrgId;
      if (orgId && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : "free";
        await setPlanForOrg(orgId, plan, sub.id);
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.clerkOrgId;
      if (orgId) {
        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : "free";
        await setPlanForOrg(orgId, plan, sub.id);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.clerkOrgId;
      if (orgId) {
        await setPlanForOrg(orgId, "free", null);
      }
      break;
    }

    default:
      // No-op para los demás eventos
      break;
  }

  return NextResponse.json({ received: true });
}
