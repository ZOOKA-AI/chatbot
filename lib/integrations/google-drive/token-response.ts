import { z } from "zod";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

export const GOOGLE_GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

/** Send-only Gmail scope: lets the workspace agent compose mail as the user. */
export const GOOGLE_GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";

/**
 * Calendar events only, not the whole calendar list: enough for the agent to
 * read the day and create an appointment without touching sharing settings.
 */
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

/** Scopes the workspace Google connection may request. */
export const GOOGLE_READ_SCOPES = [
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_GMAIL_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
  GOOGLE_CALENDAR_SCOPE,
];

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
  const unauthorizedScope = scopes.find(
    (scope) => !GOOGLE_READ_SCOPES.includes(scope)
  );
  if (
    scopes.length === 0 ||
    unauthorizedScope ||
    !scopes.includes(GOOGLE_DRIVE_SCOPE) ||
    (parsed.token_type && parsed.token_type.toLowerCase() !== "bearer")
  ) {
    throw new Error("Google read-only access was not granted");
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
