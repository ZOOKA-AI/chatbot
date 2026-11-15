/**
 * Kill switch: مستويان — مساحة عمل، وتشغيل فردي.
 * مالك المنصة يملك المفتاح العام، والوكيل يستطيع إيقاف نفسه عند شذوذ فقط (لا يستطيع إعادة التشغيل).
 */
export type KillScope = { organizationId: string; runId?: string };

export interface KillSwitchStore {
  isOn(scope: KillScope): Promise<boolean>;
  turnOn(scope: KillScope, by: string, reason: string): Promise<void>;
}

export function describeKillSwitch(scope: KillScope): string {
  return scope.runId ? `run:${scope.runId}` : `org:${scope.organizationId}`;
}
