import { createSign } from "node:crypto";

/**
 * Server-only traffic snapshot for the growth admin page.
 *
 * Data sources: Google Analytics 4 (Data API) and Google Search Console
 * (Search Analytics API). Both are called with a service account, so nothing
 * here depends on a signed-in end user.
 *
 * Honest-by-construction: when the service account is not configured the
 * snapshot reports `configured: false` and the UI shows a setup notice instead
 * of numbers. No value is ever estimated, cached from a previous build or
 * invented.
 *
 * Required environment (production):
 *   GOOGLE_GROWTH_SA_JSON  service account JSON, single line
 *   GA4_PROPERTY_ID        numeric GA4 property id, e.g. 563695686
 *   GSC_SITE               Search Console property, default sc-domain:zooka-ai.com
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

export type ChannelRow = { label: string; sessions: number };
export type PageRow = { path: string; views: number };
export type QueryRow = { query: string; clicks: number; impressions: number; position: number };

export type TrafficSnapshot = {
  configured: boolean;
  reason?: string;
  generatedAt?: string;
  ga4?: {
    sessions: number;
    users: number;
    views: number;
    channels: ChannelRow[];
    pages: PageRow[];
  };
  gsc?: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    queries: QueryRow[];
  };
  error?: string;
};

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_GROWTH_SA_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function base64url(input: string | Buffer): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = base64url(signer.sign(sa.private_key as string));
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`service_account_token_failed_${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("service_account_token_missing");
  }
  return payload.access_token;
}

type Ga4Response = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

async function ga4Report(
  token: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<Ga4Response> {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Chart data can be five minutes old; it is never used for billing or auth.
      next: { revalidate: 300 },
    },
  );

  if (!response.ok) {
    throw new Error(`ga4_report_failed_${response.status}`);
  }
  return (await response.json()) as Ga4Response;
}

type GscResponse = {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
};

async function gscQuery(
  token: string,
  site: string,
  startDate: string,
  endDate: string,
  extra: Record<string, unknown>,
): Promise<GscResponse> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ startDate, endDate, ...extra }),
      next: { revalidate: 300 },
    },
  );

  if (!response.ok) {
    throw new Error(`gsc_query_failed_${response.status}`);
  }
  return (await response.json()) as GscResponse;
}

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export async function getTrafficSnapshot(): Promise<TrafficSnapshot> {
  const sa = readServiceAccount();
  const propertyId = process.env.GA4_PROPERTY_ID;
  const site = process.env.GSC_SITE ?? "sc-domain:zooka-ai.com";

  if (!sa || !propertyId) {
    return {
      configured: false,
      reason: !sa ? "missing_service_account" : "missing_property_id",
    };
  }

  const generatedAt = new Date().toISOString();

  try {
    const token = await getAccessToken(sa);

    const [totals, channels, pages] = await Promise.all([
      ga4Report(token, propertyId, {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
        ],
      }),
      ga4Report(token, propertyId, {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [{ name: "sessions" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5,
      }),
      ga4Report(token, propertyId, {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [{ name: "screenPageViews" }],
        dimensions: [{ name: "pagePath" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5,
      }),
    ]);

    const totalValues = totals.rows?.[0]?.metricValues ?? [];
    const numberOf = (index: number) => Number(totalValues[index]?.value ?? 0);

    const snapshot: TrafficSnapshot = {
      configured: true,
      generatedAt,
      ga4: {
        sessions: numberOf(0),
        users: numberOf(1),
        views: numberOf(2),
        channels: (channels.rows ?? []).map((row) => ({
          label: row.dimensionValues?.[0]?.value ?? "",
          sessions: Number(row.metricValues?.[0]?.value ?? 0),
        })),
        pages: (pages.rows ?? []).map((row) => ({
          path: row.dimensionValues?.[0]?.value ?? "",
          views: Number(row.metricValues?.[0]?.value ?? 0),
        })),
      },
    };

    try {
      const [queryTotals, queryRows] = await Promise.all([
        gscQuery(token, site, isoDate(-27), isoDate(-1), { dimensions: ["date"], rowLimit: 1 }),
        gscQuery(token, site, isoDate(-27), isoDate(-1), {
          dimensions: ["query"],
          rowLimit: 5,
        }),
      ]);

      // Search Console has no aggregate endpoint: sum the daily rows.
      const daily = await gscQuery(token, site, isoDate(-27), isoDate(-1), {
        dimensions: ["date"],
        rowLimit: 100,
      });
      const clicks = (daily.rows ?? []).reduce((sum, row) => sum + (row.clicks ?? 0), 0);
      const impressions = (daily.rows ?? []).reduce(
        (sum, row) => sum + (row.impressions ?? 0),
        0,
      );

      snapshot.gsc = {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position:
          queryTotals.rows && queryTotals.rows.length > 0
            ? Number(queryTotals.rows[0].position ?? 0)
            : 0,
        queries: (queryRows.rows ?? []).map((row) => ({
          query: row.keys?.[0] ?? "",
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          position: row.position ?? 0,
        })),
      };
    } catch (searchError) {
      // Analytics and Search Console are independent: one failing must not hide
      // the other. The notice is surfaced, never replaced with zeros.
      snapshot.error =
        searchError instanceof Error ? searchError.message : "gsc_query_failed";
    }

    return snapshot;
  } catch (error) {
    return {
      configured: true,
      generatedAt,
      reason: error instanceof Error ? error.message : "traffic_snapshot_failed",
    };
  }
}
