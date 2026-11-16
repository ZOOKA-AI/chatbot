import { expect, test } from "@playwright/test";

/**
 * Acceptance suites must never turn "no credentials" into a green run.
 *
 * By default a suite without credentials skips, so a developer can run the file
 * locally without secrets. With ZOOKA_ACCEPTANCE_REQUIRED=1 a missing pair is a
 * hard failure: that is how an acceptance run is gated in CI or in a release
 * check, and it makes SKIP unusable as evidence of success.
 */
export function requireAcceptanceCredentials(
  pairs: { name: string; email: string; password: string }[]
) {
  const missing = pairs
    .filter((pair) => !pair.email || !pair.password)
    .map((pair) => pair.name);

  test(`acceptance credentials present${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`, () => {
    const required = process.env.ZOOKA_ACCEPTANCE_REQUIRED === "1";
    if (required && missing.length > 0) {
      expect(
        missing,
        "ZOOKA_ACCEPTANCE_REQUIRED=1 but credentials are missing: a skipped suite is not a passed suite"
      ).toEqual([]);
    }
    test.skip(
      missing.length > 0,
      `missing ${missing.join(", ")}; set ZOOKA_ACCEPTANCE_REQUIRED=1 to turn this into a failure`
    );
  });
}
