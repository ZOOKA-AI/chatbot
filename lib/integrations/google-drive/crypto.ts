import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey(value: string) {
  const encoded = value.replace(/\s/g, "");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("Google Drive token encryption key must be 32-byte base64");
  }
  return key;
}

export function isGoogleDriveEncryptionKeyValid(value?: string) {
  if (!value) {
    return false;
  }
  try {
    getEncryptionKey(value);
    return true;
  } catch {
    return false;
  }
}

export function encryptGoogleDriveTokens(value: string, keyValue: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getEncryptionKey(keyValue),
    nonce
  );
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptGoogleDriveTokens(value: string, keyValue: string) {
  const [version, nonce, tag, ciphertext, ...extra] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext || extra.length > 0) {
    throw new Error("Invalid encrypted Google Drive tokens");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(keyValue),
    Buffer.from(nonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
