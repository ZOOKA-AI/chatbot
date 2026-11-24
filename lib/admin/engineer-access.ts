/**
 * Pure rules for issuing an engineer's access, so the CLI script and the tests
 * agree on the exact SQL and payloads that reach production.
 *
 * The database side is deliberately narrow: one login role, read-only, created
 * or rotated by name. Every statement is built from a name and a password that
 * passed `validate*` first, because DDL cannot take bound parameters and a
 * password smuggled into a literal would be an injection point.
 */

const ROLE_NAME = /^[a-z][a-z0-9_]{2,30}$/;
const SAFE_PASSWORD = /^[A-Za-z0-9]{24,64}$/;
const RESERVED = new Set([
  "postgres",
  "anon",
  "authenticated",
  "service_role",
  "supabase_admin",
]);

export function validateReadOnlyRoleName(name: string): boolean {
  return ROLE_NAME.test(name) && !name.startsWith("pg_") && !RESERVED.has(name);
}

/**
 * Passwords are generated here, never typed, and the generator only produces
 * letters and digits. A value outside that alphabet is refused rather than
 * escaped, so nothing can break out of the quoted literal below.
 */
export function validateReadOnlyPassword(password: string): boolean {
  return SAFE_PASSWORD.test(password);
}

export function createOrRotateReadOnlyRole(
  role: string,
  password: string,
  exists: boolean
): string[] {
  if (!validateReadOnlyRoleName(role))
    throw new Error(`invalid role name: ${role}`);
  if (!validateReadOnlyPassword(password))
    throw new Error("password must be 24-64 letters or digits");

  const statements = [
    exists
      ? `alter role ${role} with login password '${password}'`
      : `create role ${role} with login password '${password}' nosuperuser nocreatedb nocreaterole bypassrls`,
    `grant connect on database postgres to ${role}`,
    `grant usage on schema public to ${role}`,
    `grant select on all tables in schema public to ${role}`,
    `grant select on all sequences in schema public to ${role}`,
    `alter default privileges in schema public grant select on tables to ${role}`,
    `revoke create on schema public from ${role}`,
    `revoke insert, update, delete, truncate on all tables in schema public from ${role}`,
  ];
  return statements;
}

export function revokeReadOnlyRole(role: string): string[] {
  if (!validateReadOnlyRoleName(role))
    throw new Error(`invalid role name: ${role}`);
  return [
    `revoke all on all tables in schema public from ${role}`,
    `revoke all on all sequences in schema public from ${role}`,
    `revoke usage on schema public from ${role}`,
    `revoke connect on database postgres from ${role}`,
    `drop role if exists ${role}`,
  ];
}

/** Vercel access tokens take an epoch-milliseconds expiry, not a duration. */
export function vercelTokenBody(
  name: string,
  expiresAtMs: number
): { name: string; expiresAt: number } {
  if (!name.trim()) throw new Error("token name is required");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())
    throw new Error("expiresAt must be in the future");
  return { name: name.trim().slice(0, 64), expiresAt: Math.floor(expiresAtMs) };
}

export function deployKeyBody(args: {
  title: string;
  publicKey: string;
  readOnly: boolean;
}): {
  title: string;
  key: string;
  read_only: boolean;
} {
  const key = args.publicKey.trim();
  if (!/^ssh-(ed25519|rsa) AAAA[0-9A-Za-z+/]+=*\s*\S*$/.test(key)) {
    throw new Error("publicKey must be a single ssh-ed25519 or ssh-rsa line");
  }
  if (!args.title.trim()) throw new Error("title is required");
  return {
    title: args.title.trim().slice(0, 80),
    key,
    read_only: args.readOnly,
  };
}
