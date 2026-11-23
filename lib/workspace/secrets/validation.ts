import { z } from "zod";

export const secretName = z.string().min(1).max(64).regex(/^[A-Z_][A-Z0-9_]*$/);
const secretValue = z.string().min(1).max(8192);
export const createSecretBody = z.object({ name: secretName, value: secretValue }).strict();
export const rotateSecretBody = z.object({ value: secretValue }).strict();
