import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getGrowthFunnel } = vi.hoisted(() => ({ getGrowthFunnel: vi.fn() }));
vi.mock("@/lib/growth/funnel", () => ({ getGrowthFunnel }));

import { POST } from "@/app/api/integrations/n8n/growth/report/route";
import { buildGrowthReport, parseReportDays } from "@/lib/growth/report";

const funnel = {
  days: 30,
  rows: [
    { source: "linkedin", signups: 10, activated: 4, activeLast7d: 2 },
    { source: "unknown", signups: 20, activated: 9, activeLast7d: 1 },
    { source: "youtube", signups: 5, activated: 0, activeLast7d: 0 },
  ],
  totals: { signups: 35, activated: 13, activeLast7d: 3, unattributedSignups: 20, unknownSignupDate: 7 },
};

function call(headers: Record<string, string> = {}, body?: string) {
  return POST(
    new Request("https://zooka-ai.com/api/integrations/n8n/growth/report", {
      method: "POST",
      headers,
      body,
    })
  );
}

describe("buildGrowthReport", () => {
  it("adds rates, ignores unknown for the best channel, and states what it cannot measure", () => {
    const report = buildGrowthReport(funnel, new Date("2026-11-22T00:00:00Z"));
    expect(report.channels[0].activationRate).toBe(0.4);
    expect(report.channels[2].activationRate).toBe(0);
    expect(report.totals.activationRate).toBe(0.371);
    expect(report.bestChannel).toBe("linkedin");
    expect(report.notMeasured.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toMatch(/userId|email/i);
  });

  it("uses null, not 0, when there are no signups", () => {
    const report = buildGrowthReport({
      days: 7,
      rows: [],
      totals: { signups: 0, activated: 0, activeLast7d: 0, unattributedSignups: 0, unknownSignupDate: 0 },
    });
    expect(report.totals.activationRate).toBeNull();
    expect(report.bestChannel).toBeNull();
  });
});

describe("parseReportDays", () => {
  it("defaults to 30 and accepts 1..365", () => {
    expect(parseReportDays(null)).toBe(30);
    expect(parseReportDays({})).toBe(30);
    expect(parseReportDays({ days: 7 })).toBe(7);
  });
  it("refuses anything else", () => {
    for (const bad of [{ days: 0 }, { days: 366 }, { days: 1.5 }, { days: "7" }, [], "x"]) {
      expect(parseReportDays(bad)).toBeNull();
    }
  });
});

describe("POST /api/integrations/n8n/growth/report", () => {
  beforeEach(() => {
    getGrowthFunnel.mockResolvedValue(funnel);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    getGrowthFunnel.mockReset();
  });

  it("500 when the server has no report secret", async () => {
    vi.stubEnv("N8N_GROWTH_REPORT_SECRET", "");
    const response = await call({ "x-n8n-secret": "anything" });
    expect(response.status).toBe(500);
  });

  it("401 on a missing, wrong or prefix secret, without reading the database", async () => {
    vi.stubEnv("N8N_GROWTH_REPORT_SECRET", "report-secret-value");
    const attempts: Record<string, string>[] = [{}, { "x-n8n-secret": "wrong" }, { "x-n8n-secret": "report-secret" }];
    for (const headers of attempts) {
      expect((await call(headers)).status).toBe(401);
    }
    expect(getGrowthFunnel).not.toHaveBeenCalled();
  });

  it("does not accept the publishing secret", async () => {
    vi.stubEnv("N8N_GROWTH_REPORT_SECRET", "report-secret-value");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "publish-secret-value");
    expect((await call({ "x-n8n-secret": "publish-secret-value" })).status).toBe(401);
  });

  it("400 on a malformed body or out-of-range days", async () => {
    vi.stubEnv("N8N_GROWTH_REPORT_SECRET", "report-secret-value");
    const auth = { "x-n8n-secret": "report-secret-value" };
    expect((await call(auth, "{nope")).status).toBe(400);
    expect((await call(auth, JSON.stringify({ days: 999 }))).status).toBe(400);
  });

  it("200 with the aggregate report", async () => {
    vi.stubEnv("N8N_GROWTH_REPORT_SECRET", "report-secret-value");
    const response = await call({ "x-n8n-secret": "report-secret-value" }, JSON.stringify({ days: 14 }));
    expect(response.status).toBe(200);
    expect(getGrowthFunnel).toHaveBeenCalledWith(14);
    const body = (await response.json()) as { bestChannel: string; channels: unknown[] };
    expect(body.bestChannel).toBe("linkedin");
    expect(body.channels).toHaveLength(3);
  });

  it("503 when the database is unreachable", async () => {
    vi.stubEnv("N8N_GROWTH_REPORT_SECRET", "report-secret-value");
    getGrowthFunnel.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const response = await call({ "x-n8n-secret": "report-secret-value" });
    expect(response.status).toBe(503);
  });
});
