import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  admin: vi.fn(),
  posture: vi.fn(),
}));

vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: mocks.workspace }));
vi.mock("@/lib/admin/page-guard", () => ({ adminPageContext: mocks.admin }));
vi.mock("@/lib/security/posture", () => ({
  loadSecurityPosture: mocks.posture,
  stateLabel: (value: string) => value,
}));
vi.mock("@/lib/i18n", () => ({
  getLang: async () => "en",
  dirOf: () => "ltr",
  fontOf: () => undefined,
}));

import WorkspaceSecurityPage from "@/app/(chat)/workspace/security/page";

describe("workspace security page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue(null);
    mocks.posture.mockReturnValue({ rows: [], actions: [], measuredAt: null, release: null });
  });

  test("workspace owners can manage secrets without seeing platform posture", async () => {
    mocks.workspace.mockResolvedValue({ role: "owner", organizationId: "workspace" });
    const html = renderToStaticMarkup(await WorkspaceSecurityPage());
    expect(html).toContain("Add secret");
    expect(mocks.posture).not.toHaveBeenCalled();
  });

  test("members cannot manage secrets or see platform posture", async () => {
    mocks.workspace.mockResolvedValue({ role: "member", organizationId: "workspace" });
    const html = renderToStaticMarkup(await WorkspaceSecurityPage());
    expect(html).not.toContain("Add secret");
    expect(html).toContain("Only workspace owners and admins can manage secrets.");
    expect(mocks.posture).not.toHaveBeenCalled();
  });

  test("platform posture remains available only with its separate grant", async () => {
    mocks.workspace.mockResolvedValue({ role: "admin", organizationId: "workspace" });
    mocks.admin.mockResolvedValue({ userId: "admin" });
    const html = renderToStaticMarkup(await WorkspaceSecurityPage());
    expect(html).toContain("Platform security posture");
    expect(mocks.posture).toHaveBeenCalledOnce();
  });
});
