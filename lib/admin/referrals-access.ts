/**
 * Who may read the referral and affiliate report.
 *
 * The report is platform-wide by design: it aggregates every partner code and
 * every referral event, so there is no organisation to scope it to. What it
 * needs instead is an administrator gate, and this module is that gate so the
 * decision can be tested without rendering a server component.
 *
 * Two credentials open it, deliberately:
 *  - a signed-in session whose email is on the administrator list, and
 *  - the backup token in the query string, for cron and manual recovery.
 */

export const DEFAULT_ADMIN_EMAILS = [
  "zookaalmrzwq@gmail.com",
  "solas.test@zooka-ai.com",
  "helmyharoon8@gmail.com",
];

export type ReferralsAccessInput = {
  sessionEmail?: string | null;
  key?: string | null;
  adminEmailsEnv?: string | null;
  backupToken?: string | null;
};

export type ReferralsAccess = {
  allowed: boolean;
  reason: "admin_session" | "backup_key" | "no_session" | "not_admin" | "bad_key";
};

export function adminEmailList(adminEmailsEnv?: string | null): string[] {
  const source = adminEmailsEnv?.trim() ? adminEmailsEnv : DEFAULT_ADMIN_EMAILS.join(",");
  return source
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function referralsAccess(input: ReferralsAccessInput): ReferralsAccess {
  const backupToken = input.backupToken?.trim();
  if (backupToken && input.key && input.key === backupToken) {
    return { allowed: true, reason: "backup_key" };
  }

  const email = input.sessionEmail?.trim().toLowerCase();
  if (!email) {
    return { allowed: false, reason: input.key ? "bad_key" : "no_session" };
  }

  const admins = adminEmailList(input.adminEmailsEnv);
  if (admins.includes(email)) {
    return { allowed: true, reason: "admin_session" };
  }

  return { allowed: false, reason: "not_admin" };
}
