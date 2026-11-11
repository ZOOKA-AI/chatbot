import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  queries: [] as string[],
  existing: false,
  period: null as Date | null,
}));
vi.mock("postgres", () => ({ default: state.connect }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.queries = [];
  state.existing = false;
  state.period = null;
  vi.stubEnv("DATABASE_URL", "postgres://localhost/new_database");
  vi.stubEnv("POSTGRES_URL", "postgres://localhost/legacy_database");
  const query = Object.assign(
    async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      state.queries.push(text);
      if (text.includes("SELECT 1 FROM token_grants")) {
        return state.existing ? [{ exists: 1 }] : [];
      }
      if (text.includes("SELECT period_start FROM token_wallets")) {
        return state.period ? [{ period_start: state.period }] : [];
      }
      return [];
    },
    { begin: async (run: (tx: unknown) => Promise<unknown>) => run(query) }
  );
  state.connect.mockReturnValue(query);
});
const args = () => ({
  organizationId: "org_one",
  plan: "pro",
  grantKey: "invoice:one",
  periodStart: new Date(1_000_000),
  periodEnd: new Date(2_000_000),
});
test("wallet and app use DATABASE_URL first and grant inside a workspace lock", async () => {
  const { grantTokensForBillingPeriod } = await import(
    "@/lib/db/token-wallets"
  );
  expect(await grantTokensForBillingPeriod(args())).toEqual({
    granted: 1_280_000,
    skipped: null,
  });
  expect(state.connect.mock.calls[0][0]).toBe(
    "postgres://localhost/new_database"
  );
  expect(
    state.queries.findIndex((q) => q.includes("pg_advisory_xact_lock"))
  ).toBeLessThan(
    state.queries.findIndex((q) => q.includes("SELECT 1 FROM token_grants"))
  );
  expect(
    state.queries.some((q) => q.includes("INSERT INTO token_wallets"))
  ).toBe(true);
});
test("a repeated invoice never replenishes the wallet", async () => {
  state.existing = true;
  const { grantTokensForBillingPeriod } = await import(
    "@/lib/db/token-wallets"
  );
  expect((await grantTokensForBillingPeriod(args())).skipped).toBe(
    "already_granted"
  );
  expect(state.queries.some((q) => q.includes("INSERT INTO"))).toBe(false);
});
test("older or same-period invoices cannot replace or replenish a newer wallet", async () => {
  const { grantTokensForBillingPeriod } = await import(
    "@/lib/db/token-wallets"
  );
  for (const period of [new Date(1_000_000), new Date(1_500_000)]) {
    state.period = period;
    expect((await grantTokensForBillingPeriod(args())).skipped).toBe(
      "stale_period"
    );
  }
  expect(state.queries.some((q) => q.includes("INSERT INTO"))).toBe(false);
});
test("missing billing dates fail before any schema or wallet access", async () => {
  const { grantTokensForBillingPeriod } = await import(
    "@/lib/db/token-wallets"
  );
  await expect(
    grantTokensForBillingPeriod({ ...args(), periodStart: null })
  ).rejects.toThrow("billing period");
  expect(state.connect).not.toHaveBeenCalled();
});
