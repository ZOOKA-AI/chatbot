import { generateId } from "ai";
import { genSaltSync, hashSync } from "bcrypt-ts";

export function generateHashedPassword(password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  return hash;
}

// The value is thrown away: this exists so a login for an unknown address still
// runs a bcrypt comparison and cannot be told apart by timing. No secret is
// generated here, so the source of the string does not need to be a CSPRNG.
// codeql[js/insecure-randomness]
export function generateDummyPassword() {
  const password = generateId();
  const hashedPassword = generateHashedPassword(password);

  return hashedPassword;
}
