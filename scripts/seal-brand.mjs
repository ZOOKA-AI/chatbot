#!/usr/bin/env node
/**
 * Seals the legal/personal identity block so the public repository never holds
 * it in plaintext. Ciphertext lives in lib/brand-sealed.json; the AES-256-GCM
 * key stays in the deployment environment (BRAND_SEAL_KEY). next.config.ts
 * decrypts at build time and injects the values into the app.
 *
 *   node scripts/seal-brand.mjs seal identity.json
 *   node scripts/seal-brand.mjs unseal
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../lib/brand-sealed.json", import.meta.url);
const key = Buffer.from(process.env.BRAND_SEAL_KEY ?? "", "base64");
if (key.length !== 32) {
  console.error("BRAND_SEAL_KEY must be 32 base64-encoded bytes");
  process.exit(1);
}

const mode = process.argv[2] ?? "unseal";
if (mode === "seal") {
  const source = process.argv[3];
  if (!source) {
    console.error("usage: seal <identity.json>");
    process.exit(1);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(readFileSync(source)),
    cipher.final(),
  ]);
  writeFileSync(
    FILE,
    `${JSON.stringify({
      v: 1,
      alg: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    })}\n`,
  );
  console.log("sealed ->", FILE.pathname);
} else {
  const sealed = JSON.parse(readFileSync(FILE, "utf8"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  process.stdout.write(
    Buffer.concat([
      decipher.update(Buffer.from(sealed.data, "base64")),
      decipher.final(),
    ]),
  );
}
