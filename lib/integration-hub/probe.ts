export const probeUrls: Record<string, string> = {
  github: "https://api.github.com/user",
  vercel: "https://api.vercel.com/v2/user",
  x: "https://api.x.com/2/users/me",
  google_drive:
    "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=kind",
  gmail: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
  google_calendar:
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=kind",
};
export interface ProbeResult {
  state: "VERIFIED" | "ERROR" | "EXPIRED";
  code: string;
}
/** Fixed URLs only, no redirects, no arbitrary-host tokens, no raw errors/account data. */
export async function probeCredential(
  provider: string,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<ProbeResult> {
  if (!Object.hasOwn(probeUrls, provider)) {
    return { state: "ERROR", code: "UNSUPPORTED_TEST" };
  }
  try {
    const response = await fetcher(probeUrls[provider], {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "ZOOKA-Integration-Health",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) {
      return { state: "EXPIRED", code: "AUTH_REJECTED" };
    }
    if (!response.ok) {
      return {
        state: "ERROR",
        code:
          response.status === 403
            ? "PERMISSION_DENIED"
            : response.status === 429
              ? "PROVIDER_RATE_LIMIT"
              : "PROVIDER_ERROR",
      };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { state: "ERROR", code: "INVALID_RESPONSE" };
    }
    const value = body as Record<string, unknown>;
    const valid =
      provider === "github"
        ? typeof value.login === "string" && typeof value.id === "number"
        : provider === "vercel"
          ? Boolean(
              value.user && typeof value.user === "object" && "id" in value.user
            )
          : provider === "x"
            ? Boolean(
                value.data &&
                  typeof value.data === "object" &&
                  "id" in value.data
              )
            : provider === "gmail"
              ? typeof value.emailAddress === "string"
              : provider === "google_drive"
                ? value.kind === "drive#fileList"
                : value.kind === "calendar#events";
    return valid
      ? { state: "VERIFIED", code: "READ_OK" }
      : { state: "ERROR", code: "INVALID_RESPONSE" };
  } catch {
    return { state: "ERROR", code: "PROVIDER_UNREACHABLE" };
  }
}
