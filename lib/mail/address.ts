/**
 * The address rules for ZOOKA Mail.
 *
 * Everything here is pure: no database, no session, no clock. That is
 * deliberate, because the reservation path is where a mistake becomes a
 * security problem (someone else's identity) and pure code can be tested to
 * exhaustion.
 *
 * The database is still the authority on uniqueness. This module only decides
 * whether a name is *allowed*; lib/mail/reserve.ts decides whether it is free,
 * and the unique index decides who wins a race.
 */

export const MAIL_DOMAIN = "zooka-ai.com";

/** Short enough to type, long enough to matter, and inside the RFC local part limit of 64. */
export const MIN_LOCAL_PART_LENGTH = 3;
export const MAX_LOCAL_PART_LENGTH = 32;

/**
 * Names that belong to the platform, not to a customer.
 *
 * Two reasons a name is here: it receives operational mail (postmaster, abuse),
 * or it is the name a person would trust without checking (security, billing,
 * support, admin). Handing any of them to a user would make a convincing
 * phishing address that carries our own domain, so the list is deny-by-default
 * for anything that reads like an authority.
 */
export const RESERVED_LOCAL_PARTS: ReadonlySet<string> = new Set([
  // RFC 2142 and delivery plumbing
  "postmaster", "hostmaster", "webmaster", "abuse", "security", "noc", "root",
  "mailer-daemon", "mailerdaemon", "daemon", "nobody", "bounce", "bounces",
  "mail", "email", "smtp", "imap", "pop", "pop3", "mx", "dns", "ns", "ns1", "ns2",
  // authority-sounding roles
  "admin", "administrator", "sysadmin", "superuser", "owner", "founder", "ceo",
  "cto", "coo", "cfo", "office", "management", "team", "staff",
  "support", "help", "helpdesk", "servicedesk", "contact", "hello", "hi",
  "info", "information", "enquiries", "inquiries", "sales", "marketing",
  "billing", "accounts", "accounting", "finance", "invoices", "payments",
  "pay", "wallet", "stripe", "refunds", "legal", "privacy", "compliance",
  "dpo", "gdpr", "terms", "trust", "safety", "fraud", "risk",
  "hr", "jobs", "careers", "recruiting", "press", "media", "news", "newsletter",
  // system and product surfaces
  "api", "app", "apps", "system", "systems", "ops", "devops", "status",
  "alerts", "notifications", "notify", "noreply", "no-reply", "donotreply",
  "do-not-reply", "webhook", "webhooks", "auth", "login", "signup", "signin",
  "register", "verify", "verification", "password", "reset", "recover",
  "sso", "oauth", "sessions", "tokens", "keys", "cdn", "static", "assets",
  "files", "uploads", "download", "downloads", "docs", "documentation", "blog",
  "store", "shop", "checkout", "cart", "orders", "go", "link", "links", "url",
  "git", "github", "gitlab", "npm", "dev", "developer", "developers", "staging",
  "sandbox", "test", "testing", "demo", "example", "zooka", "zookaai", "zooka-ai",
  "zookamail", "mailer", "postbox", "inbox", "outbox", "sent", "drafts", "archive",
]);

export type AddressProblem =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "leading_or_trailing_separator"
  | "repeated_separator"
  | "reserved"
  | "domain_not_allowed";

export type AddressCheck =
  | { ok: true; localPart: string; address: string }
  | { ok: false; reason: AddressProblem };

/**
 * Lower case and trim only. Deliberately no transliteration and no
 * de-duplication of confusable characters: silently turning "аdmin" (Cyrillic
 * а) into "admin" would hide an attempt, and mapping one name onto another is
 * how two people end up believing they own the same address.
 */
export function normalizeLocalPart(raw: string): string {
  return raw.trim().toLowerCase();
}

export function fullAddress(localPart: string): string {
  return `${normalizeLocalPart(localPart)}@${MAIL_DOMAIN}`;
}

/**
 * Accepts a full address only when its domain is ours, then applies the same
 * rules. Used by anything that takes an address from a user, so
 * "someone@elsewhere.com" can never be mistaken for a mailbox we host.
 */
export function checkAddress(input: string): AddressCheck {
  const value = input.trim().toLowerCase();
  if (!value) return { ok: false, reason: "empty" };

  const at = value.lastIndexOf("@");
  if (at >= 0) {
    const domain = value.slice(at + 1);
    if (domain !== MAIL_DOMAIN) return { ok: false, reason: "domain_not_allowed" };
    return checkLocalPart(value.slice(0, at));
  }
  return checkLocalPart(value);
}

export function checkLocalPart(raw: string): AddressCheck {
  const localPart = normalizeLocalPart(raw);
  if (!localPart) return { ok: false, reason: "empty" };
  if (localPart.length < MIN_LOCAL_PART_LENGTH) return { ok: false, reason: "too_short" };
  if (localPart.length > MAX_LOCAL_PART_LENGTH) return { ok: false, reason: "too_long" };

  // Letters, digits, dot, underscore and hyphen only. No plus addressing, no
  // quoted local parts: each of those has a second meaning in some mail system,
  // and one meaning is enough for an address people will read out loud.
  if (!/^[a-z0-9._-]+$/.test(localPart)) {
    return { ok: false, reason: "invalid_characters" };
  }
  if (/^[._-]|[._-]$/.test(localPart)) {
    return { ok: false, reason: "leading_or_trailing_separator" };
  }
  if (/[._-]{2}/.test(localPart)) {
    return { ok: false, reason: "repeated_separator" };
  }
  if (RESERVED_LOCAL_PARTS.has(localPart)) {
    return { ok: false, reason: "reserved" };
  }

  return { ok: true, localPart, address: `${localPart}@${MAIL_DOMAIN}` };
}

export function isReserved(localPart: string): boolean {
  return RESERVED_LOCAL_PARTS.has(normalizeLocalPart(localPart));
}

/**
 * For logs and audit rows: keeps the shape of the address, drops the identity.
 * "helmy@zooka-ai.com" becomes "h***@zooka-ai.com".
 */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}
