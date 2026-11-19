import { mkdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
const dir = "app/composer-layout-check";
if (existsSync(dir))
  throw new Error(
    "Local fixture route already exists; remove it after inspecting local work.",
  );
mkdirSync(dir);
try {
  writeFileSync(
    `${dir}/page.tsx`,
    'export { default } from "@/tests/layout/composer-fixture";\n',
  );
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "tests/e2e/composer-layout.test.ts",
      "--reporter=line",
      "--workers=1",
    ],
    { stdio: "inherit", env: { ...process.env, COMPOSER_LAYOUT_TEST: "1" } },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
