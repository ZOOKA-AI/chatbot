import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const encoded = process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new Error("WORKSPACE_SECRETS_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== encoded) {
    throw new Error("WORKSPACE_SECRETS_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return decoded;
}

function aad(organizationId: string, name: string): Buffer {
  return Buffer.from(JSON.stringify(["workspace-secret", organizationId, name]));
}

export function encryptWorkspaceSecret(value: string, organizationId: string, name: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(organizationId, name));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptWorkspaceSecret(value: string, organizationId: string, name: string): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid workspace secret envelope");
  const [, ivString, tagString, ciphertextString] = parts;
  const iv = Buffer.from(ivString, "base64");
  const tag = Buffer.from(tagString, "base64");
  const ciphertext = Buffer.from(ciphertextString, "base64");
  if (iv.length !== 12 || tag.length !== 16 || iv.toString("base64") !== ivString ||
      tag.toString("base64") !== tagString || ciphertext.toString("base64") !== ciphertextString) {
    throw new Error("Invalid workspace secret envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(aad(organizationId, name));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
