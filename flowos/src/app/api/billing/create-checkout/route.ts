import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (orgRole !== "org:admin") {
    return NextResponse.json(
      { error: "Solo admins pueden cambiar el plan" },
      { status: 403 },
    );
  }

  const { priceId } = await req.json();
  if (!priceId) {
    return NextResponse.json({ error: "priceId required" }, { status: 400 });
  }

  const stripe = getStripe();
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });

  let customerId = org.publicMetadata?.stripeCustomerId as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      metadata: { clerkOrgId: orgId },
    });
    customerId = customer.id;
    await client.organizations.updateOrganization(orgId, {
      publicMetadata: {
        ...org.publicMetadata,
        stripeCustomerId: customerId,
      },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/billing?success=true`,
    cancel_url: `${baseUrl}/dashboard/billing?canceled=true`,
    metadata: { clerkOrgId: orgId, clerkUserId: userId },
    subscription_data: {
      metadata: { clerkOrgId: orgId },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
