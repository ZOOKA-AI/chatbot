import "server-only";

import { generateText, type UIMessage } from "ai";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import { getTextFromMessage } from "@/lib/utils";

// Internal server helper: callers must redact the message before invoking it.
export async function generateChatTitle(message: UIMessage) {
  const { text } = await generateText({
    model: getTitleModel(),
    system: titlePrompt,
    prompt: getTextFromMessage(message),
  });
  return text.replace(/^[#*"\s]+/, "").replace(/["]+$/, "").trim();
}
