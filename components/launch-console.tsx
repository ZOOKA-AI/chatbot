"use client";

import { useCallback, useEffect, useState } from "react";

type Step = {
  id: string;
  title: string;
  detail: string;
  owner: "agent" | "customer" | "approval";
  state: "PLANNED" | "READY" | "BLOCKED" | "AWAITING_APPROVAL" | "COMPLETED";
  gate?: string;
  dependsOn: string[];
};

type Plan = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  steps: Step[];
  brief: { businessName: string; industry: string; city: string; country: string };
};

const STATE_LABEL: Record<Step["state"], string> = {
  READY: "Ready to start",
  PLANNED: "Planned",
  AWAITING_APPROVAL: "Needs your approval",
  BLOCKED: "Needs you",
  COMPLETED: "Completed",
};

const STATE_STYLE: Record<Step["state"], string> = {
  READY: "bg-emerald-50 text-emerald-800",
  PLANNED: "bg-neutral-100 text-neutral-700",
  AWAITING_APPROVAL: "bg-amber-50 text-amber-800",
  BLOCKED: "bg-rose-50 text-rose-800",
  COMPLETED: "bg-emerald-100 text-emerald-900",
};

/**
 * Launch plans as the server stores them.
 *
 * There is no control here that marks a step complete, because the API has no such route
 * from a customer: completion comes from work that actually ran. The dashboard's job is to
 * show which steps are ready, which need an approval, and which need the customer.
 */
export function LaunchConsole({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("Dubai");
  const [country, setCountry] = useState("AE");
  const [services, setServices] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agents/launch", { cache: "no-store" });
      if (!response.ok) throw new Error(`list failed (${response.status})`);
      const body = await response.json();
      setPlans(body.plans ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "could not load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const response = await fetch("/api/agents/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: {
            businessName,
            industry,
            city,
            country,
            languages: ["en"],
            services: services
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.reason ?? body.error ?? "could not create the plan");
        return;
      }
      setOpenId(body.plan.id);
      setError(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const open = plans.find((plan) => plan.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">New launch plan</h2>
          <div className="flex flex-col gap-2">
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Business name"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Industry, e.g. cleaning services"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="w-32 rounded border px-3 py-2 text-sm"
                placeholder="City"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
              <input
                className="w-24 rounded border px-3 py-2 text-sm"
                placeholder="Country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
            </div>
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Services, comma separated"
              value={services}
              onChange={(event) => setServices(event.target.value)}
            />
            <button
              type="button"
              onClick={create}
              disabled={busy || businessName.length < 2 || industry.length < 2}
              className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Create plan
            </button>
            <p className="text-xs opacity-70">
              Creating a plan does not launch anything. It lists what the platform will do, what needs your approval, and
              what only you can do.
            </p>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Launch plans ({plans.length})</h2>
        {loading ? <p className="text-sm">Loading…</p> : null}
        {!loading && plans.length === 0 ? <p className="text-sm">No launch plans yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {plans.map((plan) => (
            <li key={plan.id} className="rounded border p-3 text-sm">
              <button type="button" onClick={() => setOpenId(openId === plan.id ? null : plan.id)} className="text-left">
                <span className="font-medium">{plan.title}</span>
                <span className="ml-2 text-xs opacity-60">{plan.status.replace("_", " ")}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open ? (
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold">{open.title}</h2>
          <p className="mb-3 text-xs opacity-70">
            {open.brief.industry} · {open.brief.city}, {open.brief.country} · plan {open.status}
          </p>
          <ol className="flex flex-col gap-2">
            {open.steps.map((step, index) => (
              <li key={step.id} className="rounded border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {index + 1}. {step.title}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLE[step.state]}`}>{STATE_LABEL[step.state]}</span>
                </div>
                <p className="mt-1 text-xs opacity-80">{step.detail}</p>
                {step.gate ? <p className="mt-1 text-xs text-amber-800">{step.gate}</p> : null}
                {step.dependsOn.length > 0 ? (
                  <p className="mt-1 text-xs opacity-60">After: {step.dependsOn.join(", ")}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
