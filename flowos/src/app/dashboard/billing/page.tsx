"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { Check, ExternalLink } from "lucide-react";
import { PLAN_LIST, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

export default function BillingPage() {
  const { organization, membership, isLoaded } = useOrganization();
  const [loading, setLoading] = useState<string | null>(null);
  const [interval, setInterval] = useState<"month" | "year">("month");

  const isAdmin = membership?.role === "org:admin";
  const currentPlan =
    (organization?.publicMetadata?.plan as PlanId | undefined) || "free";

  const handleUpgrade = async (planId: PlanId) => {
    if (!isAdmin) return;
    const plan = PLAN_LIST.find((p) => p.id === planId);
    if (!plan) return;
    const priceId =
      interval === "month" ? plan.priceIdMonthly : plan.priceIdYearly;
    if (!priceId) return;

    setLoading(planId);
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setLoading(null);
    }
  };

  const handleManage = async () => {
    setLoading("manage");
    try {
      const res = await fetch("/api/billing/create-portal", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setLoading(null);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-10">
        <span className="section-num">Suscripción</span>
        <h1 className="mt-3 font-display text-5xl leading-tight tracking-tight">
          Billing
        </h1>
        <p className="mt-3 max-w-xl text-base text-[hsl(var(--muted-foreground))]">
          Estás en el plan{" "}
          <strong className="text-[hsl(var(--foreground))]">
            {PLAN_LIST.find((p) => p.id === currentPlan)?.name}
          </strong>
          {!isAdmin && " — solo los admins pueden cambiar el plan."}
        </p>
      </header>

      {currentPlan !== "free" && isAdmin && (
        <section className="mb-10 flex items-center justify-between border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-5">
          <div>
            <h2 className="font-display text-xl">Gestionar suscripción</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Cambiar método de pago, ver facturas, cancelar.
            </p>
          </div>
          <button
            onClick={handleManage}
            disabled={loading === "manage"}
            className="btn-ghost"
          >
            Portal de Stripe
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </section>
      )}

      <div className="rule mb-10" />

      {/* Toggle mes / año */}
      <div className="mb-8 flex items-center gap-3">
        <span className="section-num">Frecuencia</span>
        <div className="flex border border-[hsl(var(--border))]">
          <button
            onClick={() => setInterval("month")}
            className={cn(
              "px-4 py-1.5 text-sm transition-colors",
              interval === "month"
                ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            Mensual
          </button>
          <button
            onClick={() => setInterval("year")}
            className={cn(
              "px-4 py-1.5 text-sm transition-colors",
              interval === "year"
                ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            Anual{" "}
            <span className="ml-1 text-[10px] uppercase tracking-wider opacity-70">
              −17%
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 md:gap-6">
        {PLAN_LIST.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const price =
            interval === "month" ? plan.monthlyPrice : plan.yearlyPrice;
          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-6 border p-8",
                plan.highlight
                  ? "border-[hsl(var(--foreground))] bg-[hsl(var(--card))]"
                  : "border-[hsl(var(--border))]",
                isCurrent && "ring-2 ring-[hsl(var(--flow-moss))]",
              )}
            >
              {isCurrent && (
                <span className="absolute -top-3 left-8 bg-[hsl(var(--flow-moss))] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white">
                  Plan actual
                </span>
              )}
              {plan.highlight && !isCurrent && (
                <span className="absolute -top-3 left-8 bg-[hsl(var(--foreground))] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--background))]">
                  Recomendado
                </span>
              )}
              <header>
                <h3 className="font-display text-3xl">{plan.name}</h3>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {plan.tagline}
                </p>
              </header>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-5xl">
                    ${(price / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    /{interval === "month" ? "mes" : "año"}
                  </span>
                </div>
              </div>
              <ul className="flex flex-1 flex-col gap-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--flow-moss))]"
                      strokeWidth={2.5}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button
                  className="btn-ghost w-full justify-center cursor-default"
                  disabled
                >
                  Plan actual
                </button>
              ) : plan.id === "free" ? (
                <button
                  className="btn-ghost w-full justify-center cursor-default opacity-50"
                  disabled
                >
                  Volver al Free
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={!isAdmin || loading === plan.id}
                  className={cn(
                    plan.highlight
                      ? "btn-ink w-full justify-center"
                      : "btn-ghost w-full justify-center",
                    (!isAdmin || loading === plan.id) &&
                      "opacity-50 cursor-not-allowed",
                  )}
                >
                  {loading === plan.id
                    ? "Redirigiendo..."
                    : `Cambiar a ${plan.name}`}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
