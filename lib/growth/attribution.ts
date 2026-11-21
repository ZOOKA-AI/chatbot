/**
 * First-touch attribution.
 *
 * The funnel is currently unmeasurable: the "User" table records no signup time
 * and no source, so "which channel brings people who actually use the product"
 * cannot be answered from the database at all. This module captures the channel
 * on the visitor's first landing and carries it into the account row, so the
 * question becomes answerable for every signup from here on.
 *
 * First touch wins: a visitor who arrives from an AI assistant, leaves, and
 * returns through a direct visit is still credited to the assistant. Overwriting
 * on every visit would credit whichever channel happened to be last, which is
 * the wrong question for growth decisions.
 *
 * Values are trimmed to the column width and stripped of anything that is not
 * printable ASCII, so a hostile query string cannot grow a row or corrupt a
 * report.
 */
export const ATTRIBUTION_COOKIE = "zk_attr";
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export interface Attribution {
  source: string;
  medium: string;
  campaign: string | null;
  referrer: string | null;
}

const MAX_FIELD = 64;
const MAX_REFERRER = 190;

function clean(value: string | null | undefined, max: number): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, max);
  return trimmed === "" ? null : trimmed;
}

/**
 * Reads the channel out of a landing URL and its referrer. Returns null when the
 * visit carries no usable signal, so a plain internal navigation never sets a
 * cookie and never claims a channel.
 */
export function parseAttribution(
  url: URL,
  referrer: string | null | undefined
): Attribution | null {
  const source = clean(url.searchParams.get("utm_source"), MAX_FIELD);
  const medium = clean(url.searchParams.get("utm_medium"), MAX_FIELD);
  const campaign = clean(url.searchParams.get("utm_campaign"), MAX_FIELD);

  if (source) {
    return {
      source,
      medium: medium ?? "referral",
      campaign,
      referrer: clean(referrer, MAX_REFERRER),
    };
  }

  // A direct visit with no referrer is not a channel worth recording.
  const rawReferrer = clean(referrer, MAX_REFERRER);
  if (!rawReferrer) {
    return null;
  }

  let host: string;
  try {
    host = new URL(rawReferrer).hostname.toLowerCase();
  } catch {
    return null;
  }

  // Internal navigation is not an acquisition source.
  //
  // The comparison is exact or dot-prefixed on purpose. A bare endsWith("zooka-ai.com")
  // also matches "evilzooka-ai.com", which would let any attacker-registered domain
  // pass as our own and drop its traffic out of every channel report.
  if (isInternalHost(host)) {
    return null;
  }

  return {
    source: clean(host, MAX_FIELD) ?? "referral",
    medium: "referral",
    campaign,
    referrer: rawReferrer,
  };
}

const INTERNAL_HOSTS = ["zooka-ai.com", "localhost"];

/**
 * Is this host one of ours?
 *
 * Exact match, or a real subdomain of ours. "www.zooka-ai.com" is internal;
 * "evilzooka-ai.com" is not, even though the string ends with our domain.
 */
export function isInternalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return INTERNAL_HOSTS.some(
    (internal) =>
      normalized === internal || normalized.endsWith(`.${internal}`)
  );
}

export function serializeAttribution(value: Attribution): string {
  return JSON.stringify(value);
}

export function deserializeAttribution(
  raw: string | null | undefined
): Attribution | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    const source = clean(parsed.source, MAX_FIELD);
    if (!source) {
      return null;
    }
    return {
      source,
      medium: clean(parsed.medium, MAX_FIELD) ?? "referral",
      campaign: clean(parsed.campaign, MAX_FIELD),
      referrer: clean(parsed.referrer, MAX_REFERRER),
    };
  } catch {
    return null;
  }
}
