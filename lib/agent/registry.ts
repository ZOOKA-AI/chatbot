import type { ToolSpec, ToolKey } from "./types";

/**
 * سجل الأدوات: كل أداة معلنة هنا فقط. لا استدعاء خارج السجل.
 * requiresApproval = true يعني لا تنفيذ بدون سجل موافقة صريح.
 */
export const TOOL_REGISTRY: Record<ToolKey, ToolSpec> = {
  "web.search": { key: "web.search", description: "بحث ويب للقراءة فقط", requiresApproval: false, maxCostUsdPerCall: 0, scopes: [] },
  "web.fetch": { key: "web.fetch", description: "جلب صفحة عامة", requiresApproval: false, maxCostUsdPerCall: 0, scopes: [] },
  "media.generate_image": { key: "media.generate_image", description: "توليد صورة إلى مكتبة الأصول", requiresApproval: false, maxCostUsdPerCall: 0.05, scopes: [] },
  "media.render_video": { key: "media.render_video", description: "تركيب فيديو من مقاطع حقيقية عبر ffmpeg", requiresApproval: false, maxCostUsdPerCall: 0, scopes: [] },
  "storage.upload": { key: "storage.upload", description: "رفع أصل إلى التخزين", requiresApproval: false, maxCostUsdPerCall: 0, scopes: [] },
  "db.query_readonly": { key: "db.query_readonly", description: "استعلام قراءة فقط", requiresApproval: false, maxCostUsdPerCall: 0, scopes: [] },
  "integration.read": { key: "integration.read", description: "قراءة من مزوّد مربوط", requiresApproval: false, maxCostUsdPerCall: 0, scopes: ["read"] },
  "integration.write": { key: "integration.write", description: "كتابة إلى مزوّد مربوط", requiresApproval: true, maxCostUsdPerCall: 0, scopes: ["write"] },
  "ads.read": { key: "ads.read", description: "قراءة أداء الحملات", requiresApproval: false, maxCostUsdPerCall: 0, scopes: ["ads_read"] },
  "ads.propose_change": { key: "ads.propose_change", description: "اقتراح تعديل حملة بلا تنفيذ", requiresApproval: false, maxCostUsdPerCall: 0, scopes: ["ads_read"] },
  "ads.execute_change": { key: "ads.execute_change", description: "تنفيذ تعديل حملة معتمد", requiresApproval: true, maxCostUsdPerCall: 0, scopes: ["ads_manage"] },
  "comms.email_send": { key: "comms.email_send", description: "إرسال بريد", requiresApproval: true, maxCostUsdPerCall: 0, scopes: ["mail_send"] },
  "publish.social": { key: "publish.social", description: "نشر على قناة اجتماعية", requiresApproval: true, maxCostUsdPerCall: 0, scopes: ["publish"] },
};

export function getTool(key: string): ToolSpec | undefined {
  return (TOOL_REGISTRY as Record<string, ToolSpec>)[key];
}

export function toolRequiresApproval(key: ToolKey): boolean {
  return TOOL_REGISTRY[key]?.requiresApproval ?? true; // الافتراضي: يحتاج موافقة
}
