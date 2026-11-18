import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Route and page modules carry the "server-only" guard. Tests import them
      // directly, outside a Next server, so the guard would abort the import.
      "server-only": fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    // `tests/integration` holds suites that need a real Chromium and a disposable database. They
    // self-skip (and say why) when DATABASE_URL is absent, so a CI runner without either still gets
    // an honest "skipped" rather than a red build or a fake pass.
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // One PostgreSQL database, many suites, and several of them deliberately mutate
    // global state: `execution-worker.test.ts` revokes grants to prove the tenant role
    // is denied, and the scheduler and approval suites delete rows from `SchedulerRun`.
    // Run concurrently, those files fail each other — a health check reading
    // `AgentExecution` during a revoke gets "permission denied", and a count asserted
    // mid-delete comes back zero. Neither symptom was a defect in the code under test,
    // and both were intermittent, which is the worst kind of green to chase.
    //
    // Files therefore run one at a time once the database suites are enabled. It costs
    // wall-clock time and buys a suite whose failures mean something. Without a
    // database the tests are pure and stay parallel.
    fileParallelism: !process.env.ZOOKA_TEST_PG_ADMIN,
    // The database suites build a whole schema inside PGlite: migration pairs run
    // up/down/up, and a filing cabinet of approval tests writes and re-reads real rows.
    // On a loaded machine those exceed vitest's 5s default and fail as "Test timed out"
    // while passing in isolation — a time budget, not a broken assertion. 20s leaves the
    // assertion semantics untouched and stops the suite going red for the machine's mood.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
