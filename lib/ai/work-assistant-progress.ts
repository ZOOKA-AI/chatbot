import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/lib/types";

function isToolError(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    "error" in output &&
    Boolean(output.error)
  );
}

export function getWorkAssistantProgress({
  messages,
  status,
  lang,
}: {
  messages: ChatMessage[];
  status: UseChatHelpers<ChatMessage>["status"];
  lang: "ar" | "en";
}) {
  const lastUserIndex = messages.reduce(
    (lastIndex, message, index) =>
      message.role === "user" ? index : lastIndex,
    -1
  );
  const currentTurnMessages = messages.slice(
    lastUserIndex >= 0 ? lastUserIndex + 1 : 0
  );
  const toolParts = currentTurnMessages.flatMap((message) =>
    message.parts.filter((part) => part.type.startsWith("tool-"))
  );
  const completedTools = toolParts.filter(
    (part) =>
      "state" in part &&
      part.state === "output-available" &&
      !isToolError(part.output)
  );
  const failedTools = toolParts.filter(
    (part) =>
      ("state" in part &&
        (part.state === "output-error" || part.state === "output-denied")) ||
      ("state" in part &&
        part.state === "output-available" &&
        isToolError(part.output))
  );
  const waitingForApproval = toolParts.some(
    (part) => "state" in part && part.state === "approval-requested"
  );
  const isArabic = lang === "ar";

  if (waitingForApproval) {
    return isArabic
      ? "بانتظار موافقتك قبل متابعة هذه الخطوة."
      : "Waiting for your approval before continuing.";
  }
  if (status === "error") {
    return isArabic
      ? "توقف الطلب قبل اكتماله. قد يظهر جزء من الرد والنتائج أعلاه."
      : "The request stopped before completion. Partial output and results may appear above.";
  }
  if (status === "submitted" || status === "streaming") {
    return isArabic
      ? `جارٍ العمل… نتائج الأدوات المكتملة: ${completedTools.length}، والأخطاء: ${failedTools.length}.`
      : `Working… ${completedTools.length} tool results received; ${failedTools.length} tool errors.`;
  }
  if (completedTools.length === 0 && failedTools.length === 0) {
    return isArabic
      ? "اكتمل الرد دون استخدام أدوات؛ راجع الإجابة بوصفها غير متحققة من مصادر خارجية."
      : "The response is complete. No tools were used, so the answer has not been checked against external sources.";
  }
  return isArabic
    ? `اكتمل الرد. نتائج الأدوات: ${completedTools.length}، والأخطاء: ${failedTools.length}. راجع النتائج الفعلية أعلاه.`
    : `The response is complete. Tool results: ${completedTools.length}; tool errors: ${failedTools.length}. Review the actual results above.`;
}
