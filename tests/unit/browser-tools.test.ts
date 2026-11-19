import { beforeEach, describe, expect, it, vi } from "vitest";

import * as sessions from "@/lib/browser/sessions";
import { createBrowserTools } from "@/lib/ai/tools/browser";

/**
 * The tool wrappers, without a database or a browser.
 *
 * These cover the part that is mine to get right: which session is reused, when the agent is
 * refused, that every step lands in the timeline, and that a screenshot comes back as a piece of
 * evidence rather than a base64 blob. The browser itself is covered by the live runtime test.
 */

const live = {
  id: "sess-1",
  ownerId: "user-1",
  status: "ready",
  controlHolder: "agent",
  expiresAt: new Date(Date.now() + 10 * 60_000),
  currentUrl: "https://example.com",
  currentTitle: "Example",
};

const runtime = {
  has: vi.fn(() => true),
  engine: vi.fn(() => "local_chromium"),
  navigate: vi.fn(async () => ({ ok: true as const, url: "https://example.com", title: "Example", status: 200 })),
  read: vi.fn(async () => ({ ok: true as const, url: "https://example.com", title: "Example", text: "hello" })),
  click: vi.fn(async () => ({ ok: true as const })),
  type: vi.fn(async () => ({ ok: true as const })),
  scroll: vi.fn(async () => ({ ok: true as const })),
  screenshot: vi.fn(async () => ({ ok: true as const, path: "/tmp/x.png", bytes: 2048, url: "https://example.com", title: "Example" })),
};

vi.mock("@/lib/browser/runtime", () => ({ browserRuntime: () => runtime }));
vi.mock("@/lib/browser/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/browser/sessions")>("@/lib/browser/sessions");
  return {
    ...actual,
    listSessions: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    controlSession: vi.fn(),
    appendEvent: vi.fn(),
    recordEvidence: vi.fn(),
  };
});

const mocked = vi.mocked(sessions);

/** AI SDK types mark execute as optional; these tools always have one. */
const run = (name: keyof ReturnType<typeof createBrowserTools>, input: unknown) =>
  (tools[name].execute as unknown as (i: unknown, o: never) => Promise<Record<string, unknown>>)(
    input,
    {} as never
  );
const tools = createBrowserTools({ organizationId: "org-1", userId: "user-1" });

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listSessions.mockResolvedValue([live as never]);
  mocked.getSession.mockResolvedValue(live as never);
  mocked.createSession.mockResolvedValue({ ...live, status: "created" } as never);
  mocked.appendEvent.mockResolvedValue({} as never);
  mocked.recordEvidence.mockResolvedValue({ id: "ev-1" } as never);
});

describe("browser tools", () => {
  it("reuses a live session instead of opening another browser", async () => {
    const result = await run("browserNavigate", { url: "https://example.com" });
    expect(result).toMatchObject({ ok: true, sessionId: "sess-1" });
    expect(mocked.createSession).not.toHaveBeenCalled();
    expect(runtime.navigate).toHaveBeenCalledWith("sess-1", "org-1", "https://example.com");
    expect(mocked.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1", kind: "navigate", organizationId: "org-1" })
    );
  });

  it("opens and starts a session when none is live", async () => {
    mocked.listSessions.mockResolvedValue([] as never);
    mocked.getSession.mockResolvedValue({ ...live, id: "sess-new" } as never);
    const result = await run("browserNavigate", { url: "https://example.com" });
    expect(mocked.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", ownerId: "user-1" })
    );
    expect(mocked.controlSession).toHaveBeenCalledWith(
      expect.objectContaining({ action: "start" })
    );
    expect(result).toMatchObject({ ok: true, sessionId: "sess-new" });
  });

  it("refuses to act while a person holds control", async () => {
    mocked.listSessions.mockResolvedValue([{ ...live, controlHolder: "human" } as never]);
    const result = await run("browserClick", { selector: "#buy" });
    expect(result).toMatchObject({ ok: false, reason: "human_has_control" });
    expect(runtime.click).not.toHaveBeenCalled();
    expect(mocked.appendEvent).not.toHaveBeenCalled();
  });

  it("stores a screenshot as evidence and returns its session URL", async () => {
    const result = await run("browserScreenshot", { label: "checkout" });
    expect(result).toMatchObject({ ok: true, bytes: 2048 });
    expect(String((result as { evidenceUrl: string }).evidenceUrl)).toBe(
      "/api/workspace/browser/sessions/sess-1/evidence/ev-1"
    );
    expect(mocked.recordEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1", label: "checkout", bytes: 2048 })
    );
  });

  it("returns the browser state without opening anything", async () => {
    const result = await run("browserStatus", {});
    expect(result).toMatchObject({ ok: true, open: true, sessionId: "sess-1", engine: "local_chromium" });
    expect(runtime.navigate).not.toHaveBeenCalled();
  });
});
