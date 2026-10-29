import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  decryptGoogleDriveTokens,
  encryptGoogleDriveTokens,
  isGoogleDriveEncryptionKeyValid,
} from "@/lib/integrations/google-drive/crypto";
import {
  createGoogleDriveCodeChallenge,
  createGoogleDriveCodeVerifier,
  createGoogleDriveOAuthState,
  verifyGoogleDriveOAuthState,
} from "@/lib/integrations/google-drive/oauth-state";
import {
  GOOGLE_DRIVE_SCOPE,
  parseGoogleDriveTokens,
} from "@/lib/integrations/google-drive/token-response";

test("Google Drive tokens are encrypted and authenticated", () => {
  const key = randomBytes(32).toString("base64");
  const tokens = JSON.stringify({
    accessToken: "access",
    refreshToken: "refresh",
  });
  const encrypted = encryptGoogleDriveTokens(tokens, key);

  expect(encrypted).not.toContain("access");
  expect(encrypted).not.toContain("refresh");
  expect(decryptGoogleDriveTokens(encrypted, key)).toBe(tokens);
  expect(() =>
    decryptGoogleDriveTokens(encrypted, randomBytes(32).toString("base64"))
  ).toThrow();
  const [version, nonce, tag, ciphertext] = encrypted.split(".");
  const changedCiphertext = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
  expect(() =>
    decryptGoogleDriveTokens(
      [version, nonce, tag, changedCiphertext].join("."),
      key
    )
  ).toThrow();
});

test("Google Drive OAuth state is signed and bound to the workspace", () => {
  const organizationId = "c57a2f6d-27c4-4d9d-9f4f-26d5902e750a";
  const secret = randomBytes(32).toString("base64");
  const { nonce, cookie } = createGoogleDriveOAuthState(
    organizationId,
    "245d4f42-4792-4c89-a868-aa5652e04fa9",
    secret
  );

  expect(verifyGoogleDriveOAuthState(nonce, cookie, secret)).toEqual({
    organizationId,
    userId: "245d4f42-4792-4c89-a868-aa5652e04fa9",
  });
  expect(verifyGoogleDriveOAuthState(`${nonce}x`, cookie, secret)).toBeNull();
  expect(
    verifyGoogleDriveOAuthState(
      nonce,
      cookie,
      randomBytes(32).toString("base64")
    )
  ).toBeNull();
});

test("Google Drive OAuth uses S256 PKCE and rejects malformed encryption keys", () => {
  const verifier = createGoogleDriveCodeVerifier();
  expect(createGoogleDriveCodeChallenge(verifier)).toBe(
    createHash("sha256").update(verifier).digest("base64url")
  );
  expect(
    isGoogleDriveEncryptionKeyValid(randomBytes(32).toString("base64"))
  ).toBe(true);
  expect(isGoogleDriveEncryptionKeyValid("not-a-key")).toBe(false);
});

test("Google Drive OAuth accepts only read-only bearer tokens", () => {
  const tokenResponse = {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    scope: GOOGLE_DRIVE_SCOPE,
    token_type: "Bearer",
  };

  expect(parseGoogleDriveTokens(tokenResponse)).toMatchObject({
    accessToken: "access",
    refreshToken: "refresh",
    scope: GOOGLE_DRIVE_SCOPE,
  });
  expect(() =>
    parseGoogleDriveTokens({
      ...tokenResponse,
      scope: "https://www.googleapis.com/auth/drive",
    })
  ).toThrow();
  expect(() =>
    parseGoogleDriveTokens({
      ...tokenResponse,
      refresh_token: undefined,
    })
  ).toThrow();
});
