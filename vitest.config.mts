import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
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
  },
});
