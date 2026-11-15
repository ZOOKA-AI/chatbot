/**
 * Integration Hub — تعريف القدرات الحقيقية لكل مزوّد.
 * ملاحظة: قائمة الواجهة العامة تبقى في lib/integrations/providers.ts (INTEGRATION_PROVIDERS).
 * هذا الملف يخصّ محرّك الربط: النطاقات، والقدرات، وما هو غير متاح اليوم صراحةً.
 */
export interface HubProviderSpec {
  id: string;
  label: string;
  scopes: string[];
  capabilities: Array<"read" | "write" | "publish">;
  notes?: string;
}

export const HUB_PROVIDERS: HubProviderSpec[] = [
  { id: "google", label: "Google (Gmail/Drive/Calendar)", scopes: ["gmail.readonly", "gmail.send", "drive.readonly", "calendar.readonly"], capabilities: ["read", "write"] },
  { id: "github", label: "GitHub", scopes: ["repo", "read:user"], capabilities: ["read", "write"] },
  { id: "vercel", label: "Vercel", scopes: ["deployments:read"], capabilities: ["read"] },
  { id: "supabase", label: "Supabase", scopes: ["management:read"], capabilities: ["read"] },
  { id: "instagram", label: "Instagram (Meta)", scopes: ["instagram_content_publish"], capabilities: ["read", "publish"] },
  { id: "tiktok", label: "TikTok", scopes: ["video.upload"], capabilities: ["write"], notes: "مسودات inbox فقط حسب حالة التطبيق" },
  { id: "linkedin", label: "LinkedIn", scopes: ["r_liteprofile"], capabilities: ["read"], notes: "لا نشر: النطاق الكتابي غير ممنوح" },
  { id: "snapchat", label: "Snapchat", scopes: [], capabilities: [], notes: "غير متاح للنشر العضوي (allowlist)" },
];

export function getHubProvider(id: string): HubProviderSpec | undefined {
  return HUB_PROVIDERS.find((p) => p.id === id);
}

/** القدرات المعروضة للمستخدم = الحقيقية فقط، وما لا قدرة له يُعرض «قريبًا». */
export function publicCapabilities(): Array<{ id: string; label: string; can: Array<"read" | "write" | "publish"> }> {
  return HUB_PROVIDERS.map((p) => ({ id: p.id, label: p.label, can: p.capabilities }));
}
