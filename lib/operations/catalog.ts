export const workflow = [
  "INSPECT",
  "PLAN",
  "IMPLEMENT",
  "TEST",
  "REVIEW",
  "APPROVE",
  "DEPLOY",
  "VERIFY",
] as const;
export const agentRoles = [
  [
    "MASTER",
    "Planning and coordination",
    "Plan approved work and escalate blocked dependencies.",
  ],
  [
    "CTO",
    "Architecture",
    "Review architecture, boundaries and deployment risks.",
  ],
  [
    "DEVELOPER",
    "Source changes",
    "Prepare reviewed branch changes, never arbitrary production execution.",
  ],
  [
    "AI RESEARCH",
    "Research",
    "Evaluate official model documentation and evidence.",
  ],
  [
    "INTEGRATION",
    "Connectors",
    "Review authorization and test minimal provider operations.",
  ],
  [
    "CREATIVE",
    "Media",
    "Prepare designs; paid generation needs explicit consent and budget.",
  ],
  [
    "MARKETING",
    "Marketing",
    "Draft campaigns; outbound actions require owner approval.",
  ],
  [
    "SEO",
    "Search visibility",
    "Review metadata and crawl evidence, not invented rankings.",
  ],
  [
    "SECURITY",
    "Security",
    "Review tenant isolation and least privilege; escalate unknowns.",
  ],
  [
    "BUSINESS",
    "Business operations",
    "Inspect authorized billing evidence; no payment mutations.",
  ],
  [
    "QA",
    "Verification",
    "Record actual test results and distinguish unverified behavior.",
  ],
] as const;
export const commandIds = [
  "/status",
  "/analyze",
  "/plan",
  "/build",
  "/fix",
  "/test",
  "/integrations",
  "/discover",
  "/creative",
  "/image",
  "/video",
  "/publish",
  "/seo",
  "/analytics",
  "/security",
  "/cost",
  "/report",
  "/rollback",
] as const;
export type CommandId = (typeof commandIds)[number];
export const readCommands = new Set<string>([
  "/status",
  "/report",
  "/cost",
  "/integrations",
]);
const descriptions: Record<CommandId, string> = {
  "/status": "Read current workspace evidence; unknown is not healthy.",
  "/report":
    "Create a dated on-demand operational report and record its result.",
  "/cost":
    "Read plan and usage evidence. Actual provider cost remains unknown.",
  "/integrations":
    "Read stored provider verification; never probe automatically.",
  "/analyze": "Project-wide analysis needs reviewed repository access.",
  "/plan": "Planning automation is not wired to an executor here.",
  "/build":
    "Builds require an isolated reviewed worker, not arbitrary shell execution.",
  "/fix": "Source fixes require tests and branch review.",
  "/test": "Tests require isolated fixtures and an approved worker.",
  "/discover": "Service discovery needs official-source evidence and review.",
  "/creative": "Open the actual design editor.",
  "/image": "Open generation settings; no paid request is auto-submitted.",
  "/video": "Video engine contract and acceptance remain required.",
  "/publish": "Publishing needs tenant-specific authorization and approval.",
  "/seo": "Live crawl/ranking collection is not implemented here.",
  "/analytics":
    "Metrics need a verified reporting connector; a tracking tag is insufficient.",
  "/security":
    "A security-audit worker is not implemented; no certification is implied.",
  "/rollback":
    "Restoration requires target inspection and explicit owner approval.",
};
export const commands = commandIds.map((id) => ({
  id,
  description: descriptions[id],
  mode: readCommands.has(id)
    ? ("READ_ONLY" as const)
    : id === "/creative" || id === "/image"
      ? ("OPEN_EXISTING" as const)
      : ("NOT_IMPLEMENTED" as const),
  href:
    id === "/creative"
      ? "/creative"
      : id === "/image"
        ? "/creative#image-generation"
        : null,
}));
export function reportPriorities(input: {
  billingAvailable: boolean;
  integrationsAvailable: boolean;
  failedChecks: number;
}) {
  const priorities: string[] = [];
  if (!input.billingAvailable) {
    priorities.push(
      "Restore and verify the intended workspace database/billing read; do not switch databases blindly."
    );
  }
  if (!input.integrationsAvailable) {
    priorities.push(
      "Review the IntegrationCheck migration and credential metadata read before running provider probes."
    );
  }
  if (input.failedChecks) {
    priorities.push(
      "Review failed/expired provider evidence; reconnect only with account-owner consent."
    );
  }
  priorities.push(
    "Verify a signed-in staging account and tenant isolation before production acceptance.",
    "Record actual provider usage/cost before enabling paid automation.",
    "Review the next implementation stage; do not treat role definitions as deployed agents."
  );
  return priorities.slice(0, 3);
}
