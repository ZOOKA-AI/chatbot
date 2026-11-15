/** ربط الحسابات: القاعدة تحمل مرجعًا فقط، والقيمة السرية في مخزن مشفّر. */
export type ConnectionStatus = "connected" | "expired" | "revoked" | "error";

export interface ConnectionRecord {
  id: string;
  organizationId: string;
  provider: string;
  accountRef: string;
  scopes: string[];
  secretRef: string; // مرجع فقط — لا توكن خام
  status: ConnectionStatus;
  lastCheckedAt: string | null;
  expiresAt: string | null;
}

export function isUsable(c: ConnectionRecord): boolean {
  return c.status === "connected" && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now());
}
