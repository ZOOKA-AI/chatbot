import { describe, expect, it } from "vitest";
import { evaluateToolCall, shouldAutoShutdown } from "../../../lib/agent/policy";
import { TOOL_REGISTRY, toolRequiresApproval } from "../../../lib/agent/registry";
import { redact } from "../../../lib/agent/audit";
import type { AgentPolicyRule, ToolKey } from "../../../lib/agent/types";

const basePolicy = (over: Partial<AgentPolicyRule> = {}): AgentPolicyRule => ({
  organizationId: "11111111-1111-1111-1111-111111111111",
  agentKey: "master",
  allowTools: Object.keys(TOOL_REGISTRY) as ToolKey[],
  denyTools: [],
  maxDailySpendAed: 100,
  maxMonthlySpendAed: 500,
  requiresApproval: [],
  enabled: true,
  ...over,
});

describe("Policy Engine — قرار حتمي", () => {
  it("kill switch يمنع أي أداة حتى المسموحة", () => {
    const d = evaluateToolCall({ tool: "web.search", policy: basePolicy(), spend: { spentTodayAed: 0, spentMonthAed: 0 }, killSwitchOn: true });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("kill_switch_on");
  });

  it("سياسة معطلة تمنع", () => {
    const d = evaluateToolCall({ tool: "web.search", policy: basePolicy({ enabled: false }), spend: { spentTodayAed: 0, spentMonthAed: 0 }, killSwitchOn: false });
    expect(d.reason).toBe("policy_disabled");
  });

  it("أداة في denyTools تمنع حتى لو كانت مسموحة", () => {
    const d = evaluateToolCall({ tool: "web.search", policy: basePolicy({ denyTools: ["web.search"] }), spend: { spentTodayAed: 0, spentMonthAed: 0 }, killSwitchOn: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("tool_denied");
  });

  it("أداة غير معلنة في allowTools تمنع", () => {
    const d = evaluateToolCall({ tool: "ads.execute_change", policy: basePolicy({ allowTools: ["web.search"] }), spend: { spentTodayAed: 0, spentMonthAed: 0 }, killSwitchOn: false });
    expect(d.reason).toBe("tool_not_allowed");
  });

  it("السقف الشهري يمنع قبل اليومي", () => {
    const d = evaluateToolCall({ tool: "web.search", policy: basePolicy(), spend: { spentTodayAed: 0, spentMonthAed: 500 }, killSwitchOn: false });
    expect(d.reason).toBe("monthly_cap_reached");
  });

  it("السقف اليومي يمنع", () => {
    const d = evaluateToolCall({ tool: "web.search", policy: basePolicy(), spend: { spentTodayAed: 100, spentMonthAed: 100 }, killSwitchOn: false });
    expect(d.reason).toBe("daily_cap_reached");
  });

  it("أداة حساسة تحتاج موافقة", () => {
    const d = evaluateToolCall({ tool: "ads.execute_change", policy: basePolicy(), spend: { spentTodayAed: 0, spentMonthAed: 0 }, killSwitchOn: false });
    expect(d.allowed).toBe(true);
    expect(d.needsApproval).toBe(true);
  });

  it("أداة قراءة تمر بلا موافقة", () => {
    const d = evaluateToolCall({ tool: "web.search", policy: basePolicy(), spend: { spentTodayAed: 0, spentMonthAed: 0 }, killSwitchOn: false });
    expect(d).toEqual({ allowed: true, reason: "allowed", needsApproval: false });
  });

  it("كل أداة كتابة/نشر/صرف تحتاج موافقة افتراضيًا", () => {
    for (const k of ["integration.write", "ads.execute_change", "comms.email_send", "publish.social"] as ToolKey[]) {
      expect(toolRequiresApproval(k)).toBe(true);
    }
    expect(toolRequiresApproval("unknown.tool" as ToolKey)).toBe(true);
  });
});

describe("Auto shutdown", () => {
  it("يُغلق بعد 3 إخفاقات متتالية", () => {
    expect(shouldAutoShutdown({ consecutiveFailures: 3, spentTodayAed: 0, maxDailySpendAed: 100 })).toBe(true);
    expect(shouldAutoShutdown({ consecutiveFailures: 2, spentTodayAed: 0, maxDailySpendAed: 100 })).toBe(false);
  });
  it("يُغلق عند تجاوز السقف اليومي", () => {
    expect(shouldAutoShutdown({ consecutiveFailures: 0, spentTodayAed: 101, maxDailySpendAed: 100 })).toBe(true);
  });
});

describe("Audit redaction", () => {
  it("يحجب المفاتيح الحساسة متداخلة", () => {
    const out = redact({ provider: "google", accessToken: "secret-value", nested: { apiKey: "k", ok: "keep" } }) as any;
    expect(out.accessToken).toBe("[redacted]");
    expect(out.nested.apiKey).toBe("[redacted]");
    expect(out.nested.ok).toBe("keep");
  });
});
