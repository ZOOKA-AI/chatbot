/**
 * Detect recognizable provider credentials, rather than guessing from entropy.
 * The values returned by this module must never be logged.
 */
const patterns: Array<[string, RegExp]> = [
  ["GITHUB_TOKEN", /(?:gh[po]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["VERCEL_TOKEN", /vcp_[A-Za-z0-9_-]{20,}/g],
  ["SUPABASE_TOKEN", /sbp_[A-Za-z0-9_-]{20,}/g],
  ["ANTHROPIC_KEY", /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ["STRIPE_KEY", /(?:sk|rk)_live_[A-Za-z0-9]{20,}/g],
  ["OPENAI_KEY", /sk-[A-Za-z0-9_-]{20,}/g],
  ["GROQ_KEY", /gsk_[A-Za-z0-9]{20,}/g],
  ["GEMINI_KEY", /AIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g],
  ["TELEGRAM_TOKEN", /[0-9]{5,15}:[A-Za-z0-9_-]{30,}/g],
  ["JWT", /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
];

export type DetectedSecret = { value: string; kind: string; start: number; end: number };

export function detectChatSecrets(text: string): DetectedSecret[] {
  const found: DetectedSecret[] = [];
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      found.push({ kind, value: match[0], start: match.index, end: match.index + match[0].length });
    }
  }
  // Longer matches win: e.g. an Anthropic key is also an OpenAI-shaped key.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  let end = -1;
  return found.filter((match) => {
    if (match.start < end) return false;
    end = match.end;
    return true;
  });
}

type Message = { parts: unknown[] };
type SaveSecret = (kind: string, value: string) => Promise<string>;

/**
 * Inspect every string in message parts, including tool inputs/outputs, and
 * concatenate text parts for detection so a credential split across parts
 * cannot bypass the detector. Never mutate the caller's messages.
 */
export async function redactChatMessages<T extends Message>(
  messages: T[],
  saveSecret: SaveSecret,
): Promise<T[]> {
  const copies = structuredClone(messages);
  const found = new Map<string, string>();
  const add = (text: string) => {
    for (const match of detectChatSecrets(text)) {
      found.set(match.value, match.kind);
      if (found.size > 100) throw new Error("unsafe chat input");
    }
  };
  const inspect = (value: unknown, isUrl = false) => {
    if (typeof value === "string") {
      if (isUrl && /^data:/i.test(value)) {
        // Inspect encoded image bytes too; altering a credential inside an image
        // would corrupt it, so refuse that request rather than forwarding it.
        const image = /^data:image\/(?:png|jpeg)(;base64)?,(.*)$/is.exec(value);
        if (!image) throw new Error("unsafe chat input");
        const bytes = image[1]
          ? Buffer.from(image[2], "base64").toString("latin1")
          : image[2].replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
              String.fromCharCode(Number.parseInt(hex, 16)),
            );
        if (detectChatSecrets(bytes).length) {
          throw new Error("unsafe chat input");
        }
      } else {
        add(value);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) inspect(item);
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (detectChatSecrets(key).length || /^\s*data:/i.test(key)) {
          throw new Error("unsafe chat input");
        }
        inspect(item, key === "url");
      }
    }
  };
  for (const message of copies) {
    inspect(message.parts);
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"))
      .map((part) => part.text).join("");
    add(text);
  }

  const replacements = new Map<string, string>();
  for (const [value, kind] of found) {
    replacements.set(value, `🔒 $${await saveSecret(kind, value)}`);
  }

  const replace = (value: string) => {
    for (const [secret, replacement] of [...replacements].sort((a, b) => b[0].length - a[0].length)) {
      value = value.split(secret).join(replacement);
    }
    return value;
  };
  const transform = (value: unknown, isUrl = false): unknown => {
    if (typeof value === "string") return isUrl && /^data:/i.test(value) ? value : replace(value);
    if (Array.isArray(value)) return value.map((item) => transform(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transform(item, key === "url")]));
    }
    return value;
  };

  return copies.map((message) => {
    const textParts = message.parts.filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"));
    const combined = textParts.map((part) => part.text).join("");
    const matches = detectChatSecrets(combined);
    let offset = 0;
    for (const part of textParts) {
      const start = offset;
      const end = start + part.text.length;
      let cursor = start;
      let text = "";
      for (const match of matches) {
        if (match.end <= start || match.start >= end) continue;
        const from = Math.max(start, match.start);
        text += combined.slice(cursor, from);
        if (match.start >= start) text += replacements.get(match.value);
        cursor = Math.min(end, match.end);
      }
      text += combined.slice(cursor, end);
      part.text = text;
      offset = end;
    }
    return { ...message, parts: transform(message.parts) as unknown[] };
  });
}
