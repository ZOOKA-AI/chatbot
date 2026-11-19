export const MAX_RECORDING_MS = 180_000;
export const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
export function recordingMime(supported: (mime: string) => boolean) {
  return (
    [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ].find(supported) ?? ""
  );
}
export function mediaError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "لم يُسمح بالمشاركة. اختر الشاشة وامنح الإذن بنفسك؛ لم يبدأ التسجيل.";
  if (name === "NotFoundError")
    return "لم يعثر المتصفح على مصدر قابل للمشاركة.";
  if (name === "NotReadableError")
    return "المصدر غير قابل للقراءة أو مستخدم من برنامج آخر.";
  return "تعذّر بدء التسجيل. تأكد من HTTPS ودعم المتصفح وأعد المحاولة.";
}
export const AGENT_DRAFT_KEY = "zooka-agent-draft-v1";
export function makeAgentBrief(goal: string, context: string, output: string) {
  return [
    "الهدف:",
    goal.trim(),
    "",
    "السياق:",
    context.trim() || "سأضيف السياق عند الحاجة.",
    "",
    "المخرج المطلوب:",
    output.trim(),
    "",
    "ابدأ بخطة قصيرة. ميّز المعلومات المؤكدة عن الافتراضات. لا تدّع تنفيذ أداة غير متصلة. اطلب موافقتي قبل النشر أو الإرسال أو الحذف أو أي عملية مالية. عند غياب الصلاحيات اعرض الخطوة اللازمة بدلاً من اختلاق نتيجة.",
  ].join("\n");
}
export function parseAgentDraft(
  raw: string | null,
  now = Date.now(),
): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return typeof p.text === "string" &&
      p.text.trim() &&
      p.text.length <= 6000 &&
      typeof p.at === "number" &&
      p.at <= now &&
      now - p.at < 3_600_000
      ? p.text
      : null;
  } catch {
    return null;
  }
}
