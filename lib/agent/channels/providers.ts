/**
 * The channels a workspace can use to talk to its own agent.
 *
 * A channel is a link between one external sender (a Telegram chat, a WhatsApp
 * number, a Slack channel) and one workspace. The credential never lives on the
 * row: the row stores the name of a workspace secret, so rotating a token is a
 * vault change and never a database change.
 */
export const CHANNEL_PROVIDERS = ["telegram", "whatsapp", "slack"] as const;

export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export const CHANNEL_LABELS: Record<ChannelProvider, { ar: string; en: string }> = {
  telegram: { ar: "تلجرام", en: "Telegram" },
  whatsapp: { ar: "واتساب", en: "WhatsApp" },
  slack: { ar: "سلاك", en: "Slack" },
};

/** What the JSON inside the workspace secret must contain for each provider. */
export const CHANNEL_CREDENTIAL_FIELDS: Record<ChannelProvider, string[]> = {
  telegram: ["token"],
  whatsapp: ["token", "phoneNumberId"],
  slack: ["token"],
};

export function isChannelProvider(value: string): value is ChannelProvider {
  return (CHANNEL_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Telegram chat ids are numeric (groups are negative), WhatsApp numbers are
 * E.164 digits, Slack ids are upper-case alphanumeric. Normalising here keeps
 * one sender from being stored twice because of spaces or a leading "+".
 */
export function normalizeExternalId(provider: ChannelProvider, raw: string): string {
  const trimmed = raw.trim();
  if (provider === "whatsapp") {
    return trimmed.replace(/[\s()+-]/g, "");
  }
  if (provider === "slack") {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

export function isValidExternalId(provider: ChannelProvider, id: string): boolean {
  if (provider === "telegram") {
    return /^-?\d{4,20}$/.test(id);
  }
  if (provider === "whatsapp") {
    return /^\d{8,15}$/.test(id);
  }
  return /^[A-Z0-9]{4,32}$/.test(id);
}

export type ChannelCredentials = {
  token: string;
  phoneNumberId?: string;
};

/** Reads the JSON stored in the vault and rejects anything incomplete. */
export function parseChannelCredentials(provider: ChannelProvider, raw: string): ChannelCredentials | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  for (const field of CHANNEL_CREDENTIAL_FIELDS[provider]) {
    const value = record[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }
  }
  const token = String(record.token).trim();
  const phoneNumberId = typeof record.phoneNumberId === "string" ? record.phoneNumberId.trim() : undefined;
  return { token, phoneNumberId };
}
