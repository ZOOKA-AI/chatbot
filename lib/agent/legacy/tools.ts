import { saveAgentMemory } from "@/lib/db/agent-memory";
import type { LegacyToolResult } from "./types";

/**
 * أدوات المسار التجريبي. الذاكرة هنا هي نفس جدول agent_memory الحقيقي
 * (lib/db/agent-memory.ts) لا نسخة سوبابيس موازية.
 */

type ToolContext = {
  userId: string;
  organizationId: string;
};

export async function legacyWebSearch(
  query: string
): Promise<LegacyToolResult> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  try {
    if (tavilyKey) {
      const response = await fetch("https://api.tavily.com/search", {
        body: JSON.stringify({
          api_key: tavilyKey,
          max_results: 5,
          search_depth: "basic",
          query,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        return { error: `tavily_${response.status}`, success: false };
      }
      const data = (await response.json()) as {
        results?: { content?: string; title?: string; url?: string }[];
      };
      return {
        data: {
          query,
          results: (data.results ?? []).map((item) => ({
            snippet: item.content ?? "",
            title: item.title ?? "",
            url: item.url ?? "",
          })),
        },
        success: true,
      };
    }

    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; ZookaAgent/1.0)" } }
    );
    if (!response.ok) {
      return { error: `ddg_${response.status}`, success: false };
    }
    const html = await response.text();
    const pattern =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const results: { snippet: string; title: string; url: string }[] = [];
    let match = pattern.exec(html);
    while (match && results.length < 5) {
      results.push({
        snippet: match[3].replace(/<[^>]+>/g, "").trim(),
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        url: match[1],
      });
      match = pattern.exec(html);
    }
    return { data: { query, results }, success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "search_failed",
      success: false,
    };
  }
}

export async function legacySaveMemory({
  context,
  key,
  value,
}: {
  context: ToolContext;
  key: string;
  value: string;
}): Promise<LegacyToolResult> {
  try {
    await saveAgentMemory({
      key,
      organizationId: context.organizationId,
      userId: context.userId,
      value,
    });
    return { data: { key, saved: true }, success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "memory_failed",
      success: false,
    };
  }
}

export function describeLegacyTools(): string {
  return [
    "web_search: {\"name\":\"web_search\",\"args\":{\"query\":\"...\"}}",
    "save_memory: {\"name\":\"save_memory\",\"args\":{\"key\":\"...\",\"value\":\"...\"}}",
  ].join("\n");
}
