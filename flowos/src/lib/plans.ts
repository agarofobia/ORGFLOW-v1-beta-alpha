// Source of truth para los planes de FlowOS.
// Los priceId vienen de los productos creados en Stripe.

export type PlanId = "free" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number; // cents
  yearlyPrice: number; // cents
  priceIdMonthly: string | null;
  priceIdYearly: string | null;
  features: string[];
  limits: {
    members: number | "unlimited";
    projects: number | "unlimited";
    storage: string;
  };
  highlight?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Para arrancar",
    description: "Probá todos los módulos con tu equipo más cercano.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    priceIdMonthly: null,
    priceIdYearly: null,
    features: [
      "Hasta 5 miembros",
      "1 organización",
      "Org chart con canvas infinito",
      "Tareas y proyectos básicos",
      "500 MB de almacenamiento",
    ],
    limits: { members: 5, projects: 3, storage: "500 MB" },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Para equipos en crecimiento",
    description: "Todo lo de Free, más miembros, módulos sin límite e integraciones.",
    monthlyPrice: 1900,
    yearlyPrice: 19000,
    priceIdMonthly: "price_1TRDSOFkE5k2nxDeNfMvPC2w",
    priceIdYearly: "price_1TRDSUFkE5k2nxDerTpfylTY",
    features: [
      "Hasta 25 miembros",
      "Proyectos ilimitados",
      "Wiki con block editor",
      "CRM con pipelines",
      "Integraciones (Slack, Google, etc.)",
      "Soporte prioritario por email",
      "10 GB de almacenamiento",
    ],
    limits: { members: 25, projects: "unlimited", storage: "10 GB" },
    highlight: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Para empresas establecidas",
    description: "Para organizaciones que necesitan escala, controles avanzados y compliance.",
    monthlyPrice: 9900,
    yearlyPrice: 99000,
    priceIdMonthly: "price_1TRDSgFkE5k2nxDeVJVBKG8m",
    priceIdYearly: "price_1TRDSlFkE5k2nxDeaAdv0YBy",
    features: [
      "Miembros ilimitados",
      "SSO / SAML",
      "Audit logs",
      "SLA con 99.9% uptime",
      "Soporte dedicado por Slack",
      "Onboarding personalizado",
      "Almacenamiento ilimitado",
    ],
    limits: { members: "unlimited", projects: "unlimited", storage: "Ilimitado" },
  },
};

export const PLAN_LIST = Object.values(PLANS);

/**
 * Resuelve el plan a partir del priceId de Stripe.
 * Útil en webhooks para saber qué plan compró el usuario.
 */
export function planFromPriceId(priceId: string): PlanId {
  for (const plan of PLAN_LIST) {
    if (plan.priceIdMonthly === priceId || plan.priceIdYearly === priceId) {
      return plan.id;
    }
  }
  return "free";
}
