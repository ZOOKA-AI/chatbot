import "server-only";

import { generateText } from "ai";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { listAgentMemories, saveAgentMemory } from "@/lib/db/agent-memory";
import { guardedFetch, OutboundBlocked } from "@/lib/studio/outbound-guard";

/**
 * Brand DNA: هوية العلامة مستخرجة من موقعها الفعلي، محفوظة في ذاكرة المساحة،
 * ويعاد استخدامها في كل رد. القراءة من الموقع الحقيقي، لا تخمين.
 */

export type BrandDna = {
  positioning: string;
  voice: string;
  audiences: string[];
  offers: string[];
  proof: string[];
  palette: string[];
  tagline: string;
  avoid: string[];
};

const MEMORY_KEY = "brand.dna";
const MAX_CHARS = 12_000;

function isPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    );
  } catch {
    return false;
  }
}

async function fetchSiteText(url: string): Promise<string> {
  // The typed host is checked above, but the response decides where the request actually lands: a
  // public host answering 302 to 169.254.169.254 or to loopback must be a refusal, not a request
  // made from inside the network. guardedFetch assesses every hop (CodeQL js/request-forgery).
  let response: Response;
  try {
    response = await guardedFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZookaBrandDna/1.0)" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof OutboundBlocked) {
      throw new Error(`site_blocked:${error.reason}`);
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(`site_${response.status}`);
  }
  const html = await response.text();
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, MAX_CHARS);
}

function parseDna(raw: string): BrandDna | null {
  const withoutFence = raw
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1)) as Partial<BrandDna>;
    const asList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").slice(0, 8)
        : [];
    return {
      audiences: asList(parsed.audiences),
      avoid: asList(parsed.avoid),
      offers: asList(parsed.offers),
      palette: asList(parsed.palette),
      positioning: typeof parsed.positioning === "string" ? parsed.positioning : "",
      proof: asList(parsed.proof),
      tagline: typeof parsed.tagline === "string" ? parsed.tagline : "",
      voice: typeof parsed.voice === "string" ? parsed.voice : "",
    };
  } catch {
    return null;
  }
}

export async function generateBrandDna({
  organizationId,
  userId,
  url,
}: {
  organizationId: string;
  userId: string;
  url: string;
}): Promise<BrandDna> {
  if (!isPublicUrl(url)) {
    throw new Error("invalid_url");
  }
  const siteText = await fetchSiteText(url);
  if (siteText.length < 300) {
    throw new Error("site_too_thin");
  }

  const { text } = await generateText({
    maxOutputTokens: 1200,
    model: getLanguageModel(DEFAULT_CHAT_MODEL),
    prompt: `نص موقع العلامة:\n"""${siteText}"""`,
    system: `أنت محلل هوية علامة تجارية خليجية. من نص الموقع فقط، استخرج هوية قابلة لإعادة الاستخدام.
لا تخترع أرقاماً أو شهادات غير مذكورة. إن غاب عنصر فاتركه فارغاً.
أعد JSON فقط بهذا الشكل:
{"positioning":"جملة تموضع واحدة","voice":"وصف نبرة الخطاب في سطر","audiences":["..."],"offers":["..."],"proof":["..."],"palette":["#hex أو وصف لون"],"tagline":"شعار أو جملة جذب من الموقع","avoid":["ما لا يجب أن تقوله العلامة"]}
اكتب القيم بالعربية ما لم تكن المادة إنجليزية بالكامل.`,
    temperature: 0.2,
  });

  const dna = parseDna(text);
  if (!dna) {
    throw new Error("dna_parse_failed");
  }

  await saveAgentMemory({
    importance: 9,
    key: MEMORY_KEY,
    organizationId,
    userId,
    value: JSON.stringify(dna),
  });

  return dna;
}

export async function readBrandDna(
  organizationId: string
): Promise<BrandDna | null> {
  const memories = await listAgentMemories({ limit: 40, organizationId });
  const entry = memories.find((memory) => memory.key === MEMORY_KEY);
  if (!entry) {
    return null;
  }
  try {
    return JSON.parse(entry.value) as BrandDna;
  } catch {
    return null;
  }
}
