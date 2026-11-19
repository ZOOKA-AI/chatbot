import "server-only";

/**
 * The Business Launch Agent's plan, built from a brief.
 *
 * Deliberately not an LLM call. A launch plan is a sequence of concrete, ordered steps with
 * known owners and known gates; generating it from a model would make the same brief produce
 * a different plan each time and would let the agent promise steps the platform cannot do.
 * This module produces the plan deterministically, and marks every step with whether it is
 * executable today, needs the customer, or needs a purchase decision.
 *
 * Nothing here invents a capability. A step whose provider is not connected is planned as
 * `needs_customer`, not as something the agent will do on its own.
 */

export type LaunchBrief = {
  businessName: string;
  industry: string;
  city: string;
  country: string;
  languages: Array<"ar" | "en">;
  /** The domain the customer wants, without a scheme. Optional: the plan can start from a search. */
  desiredDomain?: string;
  services?: string[];
  phone?: string;
  email?: string;
  /** Platforms the customer says they already own. Planned as "connect", never "create". */
  existingAccounts?: string[];
};

export type StepOwner = "agent" | "customer" | "approval";

export type LaunchStep = {
  id: string;
  title: string;
  detail: string;
  owner: StepOwner;
  /** Why the customer or an approval is required, when they are. */
  gate?: string;
  dependsOn: string[];
};

export type LaunchPlan = {
  brief: LaunchBrief;
  steps: LaunchStep[];
  /** Steps that cannot start until a purchase or a connection exists. Never executed silently. */
  blockedOnApproval: string[];
  /** Steps the platform has no connected provider for, stated rather than promised. */
  needsCustomerAction: string[];
};

const SLUG_STRIP = /[^a-z0-9-]/g;

export function domainCandidates(brief: LaunchBrief): string[] {
  const base = brief.businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(SLUG_STRIP, "")
    .slice(0, 40)
    .replace(/^-|-$/g, "");

  if (!base) return [];

  const tlds = [".com", ".ae", ".com.ae", ".net"];
  const candidates = tlds.map((tld) => `${base}${tld}`);
  // The city is a real differentiator for a local service business, and a second option
  // that is usually still free beats a single taken name.
  const withCity = `${base}-${brief.city.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  if (withCity.length < 60) candidates.push(`${withCity}.com`);
  return [...new Set(candidates)];
}

/**
 * The ordered plan. Steps are added by capability, not by wish: each one names what actually
 * performs it, and a provider that is not connected produces a customer step with the reason.
 */
export function buildLaunchPlan(brief: LaunchBrief, options: { connectedProviders?: string[] } = {}): LaunchPlan {
  const connected = new Set(options.connectedProviders ?? []);
  const steps: LaunchStep[] = [];
  const blockedOnApproval: string[] = [];
  const needsCustomerAction: string[] = [];

  const add = (step: LaunchStep) => {
    steps.push(step);
    if (step.owner === "approval") blockedOnApproval.push(step.id);
    if (step.owner === "customer") needsCustomerAction.push(step.id);
    return step.id;
  };

  const brand = add({
    id: "brand",
    title: `Brand identity for ${brief.businessName}`,
    detail:
      "Name options, a one-line positioning statement, and the approved palette applied to a logo mark. Generated as files in the workspace, not as promises.",
    owner: "agent",
    dependsOn: [],
  });

  const domainSearch = add({
    id: "domain-search",
    title: "Check domain availability",
    detail: `Search ${domainCandidates(brief).slice(0, 4).join(", ")} and report which are registrable, with the price for each extension.`,
    owner: "agent",
    dependsOn: [brand],
  });

  const domainBuy = add({
    id: "domain-purchase",
    title: "Register the chosen domain",
    detail:
      "Purchases the domain the customer selected, using the customer's own payment method, after confirming registrant details and the exact total.",
    owner: "approval",
    gate:
      "A domain is a real charge on a real card. The agent shows the domain, the registrant details and the total, and stops until the customer approves. No purchase runs on approval given for anything else.",
    dependsOn: [domainSearch],
  });

  const dns = add({
    id: "dns",
    title: "Configure DNS",
    detail: "Points the domain at the website, and adds the mail records the email plan produced.",
    owner: connected.has("namecheap") || connected.has("cloudflare") ? "agent" : "customer",
    gate: connected.has("namecheap") || connected.has("cloudflare")
      ? undefined
      : "No registrar API is connected in this workspace, so DNS changes need the customer to apply them at the registrar. The exact records are prepared for them.",
    dependsOn: [domainBuy],
  });

  const site = add({
    id: "website",
    title: "Build the website",
    detail:
      "Bilingual (Arabic and English) responsive site with the service pages the brief names, contact form, WhatsApp link, analytics, sitemap, robots.txt and structured data. Previewed before anything is published.",
    owner: "agent",
    dependsOn: [brand],
  });

  const publish = add({
    id: "publish",
    title: "Publish the website to the domain",
    detail: "Deploys the approved preview to the customer's domain and verifies SSL and the live pages.",
    owner: "approval",
    gate: "Publishing makes the site publicly visible on the customer's domain, so the customer approves the preview first.",
    dependsOn: [site, dns],
  });

  const email = add({
    id: "email",
    title: `Business email (info@, support@)`,
    detail:
      "Mailbox plan with MX, SPF and DKIM values prepared for the chosen provider, plus a signature template. Mailbox creation itself is done in the provider's console.",
    owner: "customer",
    gate:
      "Mailbox creation requires the provider's own identity verification, so the customer completes it. The agent prepares every DNS record and verifies them afterwards.",
    dependsOn: [domainBuy],
  });

  const socials = (brief.existingAccounts ?? []).length > 0
    ? add({
        id: "social-connect",
        title: "Connect existing social accounts",
        detail: `Authorised connection for: ${(brief.existingAccounts ?? []).join(", ")}. Ownership is verified by reading the profile back, not assumed.`,
        owner: "agent",
        dependsOn: [brand],
      })
    : add({
        id: "social-create",
        title: "Open social accounts",
        detail:
          "The agent opens the official sign-up flow in the live browser and completes what it may; the customer completes any CAPTCHA, OTP or identity check themselves.",
        owner: "customer",
        gate: "Account creation is protected by the platform's own checks. The agent never bypasses them, and records what was actually verified.",
        dependsOn: [brand],
      });

  const content = add({
    id: "content",
    title: "First content batch",
    detail:
      "Service descriptions, ten social posts with Arabic and English copy, and two articles targeting the brief's services and city.",
    owner: "agent",
    dependsOn: [brand, site],
  });

  const seo = add({
    id: "seo",
    title: "Search setup",
    detail:
      "Sitemap submitted, Search Console verified, structured data validated against the live pages. Reports coverage as reported by the provider; no ranking is promised.",
    owner: connected.has("google_search_console") ? "agent" : "customer",
    gate: connected.has("google_search_console")
      ? undefined
      : "Search Console needs the customer to authorise the property, which requires their Google account.",
    dependsOn: [publish],
  });

  const schedule = add({
    id: "schedule",
    title: "Recurring publishing schedule",
    detail: "A schedule on the existing scheduler, in the customer's timezone, that produces and queues content on the cadence they choose.",
    owner: "agent",
    dependsOn: [content],
  });

  add({
    id: "ads",
    title: "Advertising launch",
    detail: "Campaign structure, audience and budget proposal, launched only after the customer sets a spend limit.",
    owner: "approval",
    gate: "Advertising spends the customer's money with a third party. Campaign creation is an approval step with an explicit budget.",
    dependsOn: [seo, content],
  });

  return {
    brief,
    steps,
    blockedOnApproval,
    needsCustomerAction: needsCustomerAction,
  };
}

/**
 * Whether a step may proceed without asking.
 *
 * The default is no: an unlisted step that spends money or publishes publicly must not run
 * because a caller forgot to enumerate it.
 */
export function stepNeedsOwner(step: LaunchStep): boolean {
  return step.owner !== "agent";
}

/**
 * The order in which steps can actually start, respecting dependencies.
 *
 * A step is startable when every dependency has already been placed in the order. Steps
 * whose dependency can never be satisfied are excluded rather than run out of order.
 */
export function startableOrder(plan: LaunchPlan): string[] {
  const placed = new Set<string>();
  const order: string[] = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const step of plan.steps) {
      if (placed.has(step.id)) continue;
      if (!step.dependsOn.every((dep) => placed.has(dep))) continue;
      placed.add(step.id);
      order.push(step.id);
      progressed = true;
    }
  }

  return order;
}
