import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminOverviewPage from "@/app/(chat)/admin/page";
import { getCommandOverview } from "@/lib/admin/overview";
import { adminPageContext } from "@/lib/admin/page-guard";
import { getPlatformOverview } from "@/lib/admin/platform-overview";

vi.mock("@/lib/admin/overview", () => ({ getCommandOverview: vi.fn() }));
vi.mock("@/lib/admin/platform-overview", () => ({ getPlatformOverview: vi.fn() }));
vi.mock("@/lib/admin/page-guard", () => ({
  adminPageContext: vi.fn(),
  AdminDenied: () => "Access denied",
}));

const admin = {
  lang: "en",
  organizationId: "workspace-1",
  platformRole: "admin",
  role: "member",
  userId: "user-1",
} as const;

function overview(label: string) {
  return {
    metrics: [
      { key: label, labelEn: label, labelAr: label, state: "ok" as const, value: 5, source: "test" },
    ],
    tables: [],
  };
}

async function streamOverview() {
  const page = await AdminOverviewPage();
  let html = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      html += chunk.toString();
      callback();
    },
  });
  const finished = new Promise<string>((resolve, reject) => {
    output.on("finish", () => resolve(html));
    output.on("error", reject);
  });
  const stream = renderToPipeableStream(page, {
    onShellReady: () => stream.pipe(output),
    onShellError: (error) => output.destroy(error as Error),
  });
  return { finished, html: () => html, abort: stream.abort };
}

describe("admin overview rendering", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("streams workspace data before a stuck platform aggregate times out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(adminPageContext).mockResolvedValue(admin);
    vi.mocked(getPlatformOverview).mockReturnValue(new Promise(() => {}));
    vi.mocked(getCommandOverview).mockResolvedValue(overview("Workspace members"));

    const stream = await streamOverview();
    try {
      await vi.waitFor(() => expect(stream.html()).toContain("Workspace members"));
      expect(stream.html()).toContain("Loading");
      expect(stream.html()).not.toContain("unavailable right now");
      await vi.advanceTimersByTimeAsync(8000);
      expect(await stream.finished).toContain("unavailable right now");
      expect(stream.html()).toContain('href="/admin"');
      expect(getCommandOverview).toHaveBeenCalledWith(admin.organizationId);
    } finally {
      stream.abort();
    }
  });

  it("renders platform data and a retry state when the workspace aggregate rejects", async () => {
    vi.mocked(adminPageContext).mockResolvedValue(admin);
    vi.mocked(getPlatformOverview).mockResolvedValue(overview("Total users"));
    vi.mocked(getCommandOverview).mockRejectedValue(new Error("internal database error"));

    const { finished } = await streamOverview();
    const html = await finished;
    expect(html).toContain("Total users");
    expect(html).toContain("unavailable right now");
    expect(html).not.toContain("internal database error");
    expect(getPlatformOverview).toHaveBeenCalledWith(admin.platformRole);
  });

  it("does not start either aggregate when access is denied", async () => {
    vi.mocked(adminPageContext).mockResolvedValue(null);

    const { finished } = await streamOverview();
    expect(await finished).toContain("Access denied");
    expect(getPlatformOverview).not.toHaveBeenCalled();
    expect(getCommandOverview).not.toHaveBeenCalled();
  });
});
