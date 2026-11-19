import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { consumeVerificationToken, issueVerificationToken } from "@/lib/auth/verification";
import { createPasswordResetToken } from "@/lib/db/queries";

/**
 * Live gate for 0052: exercises the application's own token functions against a
 * real database through the bootstrap connection, then proves the tenant runtime
 * role is denied on the bootstrap-only tables.
 *
 * Skipped unless a Preview database is supplied, so the default suite never
 * touches a network.
 */
const serviceUrl = process.env.DATABASE_URL_SERVICE;
const runtimeUrl = process.env.DATABASE_URL_TENANT;
const enabled =
  Boolean(serviceUrl && runtimeUrl) &&
  !/krzfrsaquvmwctsajhlm|bylfizytgayoefuyliix/.test(serviceUrl ?? "");

const svc = enabled ? postgres(serviceUrl!, { max: 1, prepare: false }) : null;
const rt = enabled ? postgres(runtimeUrl!, { max: 1, prepare: false }) : null;

afterAll(async () => {
  await svc?.end({ timeout: 5 });
  await rt?.end({ timeout: 5 });
});

describe.skipIf(!enabled)("bootstrap-only tables after 0052", () => {
  it("issues, consumes and refuses to replay an email verification token", async () => {
    const [user] = await svc!`select id from "User" limit 1`;
    const issued = await issueVerificationToken(user.id);
    expect(issued.token).toBeTruthy();

    const stored = await svc!`select count(*)::int n from "EmailVerificationToken" where "userId" = ${user.id}`;
    expect(stored[0].n).toBeGreaterThan(0);

    expect(await consumeVerificationToken(issued.token)).toMatchObject({ ok: true, userId: user.id });
    expect(await consumeVerificationToken(issued.token)).toMatchObject({ ok: false });

    await svc!`delete from "EmailVerificationToken" where "userId" = ${user.id}`;
  });

  it("issues a password reset token through the app helper", async () => {
    const [user] = await svc!`select id from "User" limit 1`;
    await createPasswordResetToken(user.id, `acceptance-${Date.now()}`);
    const stored = await svc!`select count(*)::int n from "PasswordResetToken" where "userId" = ${user.id}`;
    expect(stored[0].n).toBeGreaterThan(0);
    await svc!`delete from "PasswordResetToken" where "userId" = ${user.id}`;
    const left = await svc!`select count(*)::int n from "PasswordResetToken" where "userId" = ${user.id}`;
    expect(left[0].n).toBe(0);
  });

  it.each([
    "EmailVerificationToken",
    "PasswordResetToken",
    "GuestUsage",
    "SchedulerRun",
    "WebhookEvent",
    "_selfhost_migrations",
  ])("denies the tenant runtime role on %s", async (table) => {
    await expect(rt!.unsafe(`select count(*) from "${table}"`)).rejects.toThrow();
  });

  it("keeps Affiliate readable for the runtime role", async () => {
    const rows = await rt!`select count(*)::int n from "Affiliate"`;
    expect(rows[0].n).toBeGreaterThanOrEqual(0);
  });
});
