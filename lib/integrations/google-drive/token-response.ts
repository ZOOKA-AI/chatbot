import { z } from "zod";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().finite(),
  scope: z.string().min(1),
});

export type GoogleDriveTokens = z.infer<typeof tokensSchema>;

export function isRevokedGoogleDriveGrant(errorCode: unknown) {
  return errorCode === "invalid_grant";
}

export function parseGoogleDriveTokens(
  value: unknown,
  previousRefreshToken?: string
) {
  const parsed = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().min(1).optional(),
      expires_in: z.number().positive(),
      scope: z.string().optional(),
      token_type: z.string().optional(),
    })
    .parse(value);
  const scopes = (parsed.scope ?? GOOGLE_DRIVE_SCOPE).split(/\s+/);
  if (
    scopes.length !== 1 ||
    scopes[0] !== GOOGLE_DRIVE_SCOPE ||
    (parsed.token_type && parsed.token_type.toLowerCase() !== "bearer")
  ) {
    throw new Error("Google Drive read-only access was not granted");
  }
  const refreshToken = parsed.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token");
  }
  return tokensSchema.parse({
    accessToken: parsed.access_token,
    refreshToken,
    expiresAt: Date.now() + parsed.expires_in * 1000,
    scope: scopes.join(" "),
  });
}
