import {
  describeLegacyTools,
  legacySaveMemory,
  legacyWebSearch,
} from "./tools";
import { callLegacyProvider } from "./model";
import type { LegacyMessage, RunAgentResult } from "./types";

/**
 * دورة ReAct تجريبية (tool tags بدل tool calling أصلي).
 *
 * مهم: هذا الملف **غير موصول** بمسار الشات. المسار الحقيقي هو
 * app/(chat)/api/chat/route.ts مع AI SDK وأداة saveMemory.
 * استُبقي هنا كأساس للمقارنة والاختبار، ولا يقرأ بيانات مستخدم من تلقاء نفسه.
 */

const BASE_PROMPT = `أنت وكيل تنفيذي. نفّذ بدل الشرح، واحفظ ما تتعلمه عند الحاجة.
لو احتجت أداة، أجب حصراً بهذا الشكل ثم توقف:
<tool>{"name":"...","args":{...}}</tool>
الأدوات المتاحة:
${describeLegacyTools()}`;

const TOOL_TAG = /<tool>\s*([\s\S]*?)\s*<\/tool>/;

function parseToolCall(content: string): {
  name: string;
  args: Record<string, unknown>;
} | null {
  const match = content.match(TOOL_TAG);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[1]) as {
      name?: string;
      args?: Record<string, unknown>;
    };
    if (!parsed.name) {
      return null;
    }
    return { args: parsed.args ?? {}, name: parsed.name };
  } catch {
    return null;
  }
}

export async function runLegacyAgent({
  context,
  userMessage,
  history = [],
  maxIterations = 4,
}: {
  context: { organizationId: string; userId: string };
  userMessage: string;
  history?: LegacyMessage[];
  maxIterations?: number;
}): Promise<RunAgentResult> {
  const messages: LegacyMessage[] = [
    { content: BASE_PROMPT, role: "system" },
    ...history.slice(-8),
    { content: userMessage, role: "user" },
  ];
  const toolsUsed: string[] = [];

  for (let step = 0; step < maxIterations; step += 1) {
    const reply = await callLegacyProvider(messages);
    const call = parseToolCall(reply.content);

    if (!call) {
      return {
        content: reply.content.replace(TOOL_TAG, "").trim(),
        model: reply.model,
        stoppedByLimit: false,
        toolsUsed,
      };
    }

    toolsUsed.push(call.name);
    let result: unknown = { error: "unknown_tool", success: false };

    if (call.name === "web_search") {
      result = await legacyWebSearch(String(call.args.query ?? ""));
    } else if (call.name === "save_memory") {
      result = await legacySaveMemory({
        context,
        key: String(call.args.key ?? ""),
        value: String(call.args.value ?? ""),
      });
    }

    messages.push({ content: reply.content, role: "assistant" });
    messages.push({ content: JSON.stringify(result), role: "tool" });
  }

  return {
    content: "استنفدت الخطوات المتاحة دون إجابة نهائية.",
    model: "limit",
    stoppedByLimit: true,
    toolsUsed,
  };
}
