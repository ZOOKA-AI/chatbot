/** سجل تدقيق بإضافة فقط (append-only) — يطابق جدول AuditLog وtrigger الرفض. */
export type AuditActor = "owner" | "agent" | "system" | "integration";

export interface AuditEntry {
  organizationId: string;
  actor: AuditActor;
  actorRef: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  at: string;
}

const REDACT = /(password|secret|token|api[_-]?key|authorization|bearer)/i;

/** تنقية أي كائن قبل الكتابة: لا أسرار في السجل. */
export function redact<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? "[redacted]" : redact(v);
  }
  return out as T;
}
