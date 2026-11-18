/**
 * Rules for a password someone is choosing now (sign-up, reset).
 *
 * Sign-in deliberately does not use this: accounts created under the old
 * six-character rule must keep working until their owner changes the password.
 *
 * Kept free of server-only imports so the form can show the same verdict the
 * server will give.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt ignores everything after 72 bytes; refuse rather than truncate silently. */
export const MAX_PASSWORD_BYTES = 72;

/** The most common choices that still meet the length rule. */
const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "password123",
  "qwertyui",
  "qwerty123",
  "iloveyou",
  "11111111",
  "00000000",
  "abcd1234",
  "abc12345",
  "1q2w3e4r",
  "zooka123",
  "zookaai1",
  "admin123",
  "welcome1",
  "letmein1",
  "87654321",
]);

export type PasswordProblem = "too_short" | "too_long" | "too_common";

export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "too_short";
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "too_long";
  }
  const lowered = password.toLowerCase();
  if (COMMON.has(lowered) || /^(.)\1+$/.test(password)) {
    return "too_common";
  }
  return null;
}

/**
 * 0 (unusable) to 4 (strong). Only feeds the meter; acceptance is passwordProblem.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (passwordProblem(password)) {
    return 0;
  }
  let classes = 0;
  if (/[a-z]/.test(password)) {
    classes++;
  }
  if (/[A-Z]/.test(password)) {
    classes++;
  }
  if (/\d/.test(password)) {
    classes++;
  }
  if (/[^A-Za-z0-9]/.test(password)) {
    classes++;
  }
  let score = 1;
  if (password.length >= 12) {
    score++;
  }
  if (classes >= 3) {
    score++;
  }
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) {
    score++;
  }
  return Math.min(score, 4) as 1 | 2 | 3 | 4;
}
