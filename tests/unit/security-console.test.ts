import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { changeSecret, fetchSecretNames, secretDetectionSetting, SecurityConsole } from "@/components/security-console";

afterEach(() => vi.unstubAllGlobals());

describe("workspace security console", () => {
  test("localizes controls and denies management to members", () => {
    const english = renderToStaticMarkup(createElement(SecurityConsole, { canManage: true, lang: "en" }));
    const arabic = renderToStaticMarkup(createElement(SecurityConsole, { canManage: false, lang: "ar" }));
    expect(english).toContain("Workspace secrets");
    expect(english).toContain("Add secret");
    expect(arabic).toContain("أسرار مساحة العمل");
    expect(arabic).toContain("يمكن لمالك مساحة العمل");
    expect(arabic).not.toContain("إضافة سر");
  });

  test("loads only names and rejects malformed lists", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ secrets: [{ name: "API_KEY", value: "not retained", updatedAt: "today" }] }))
      .mockResolvedValueOnce(Response.json({ secrets: [{}] }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchSecretNames()).toEqual([{ name: "API_KEY" }]);
    expect(fetch).toHaveBeenCalledWith("/api/workspace/secrets", { cache: "no-store" });
    await expect(fetchSecretNames()).rejects.toThrow("invalid response");
  });

  test("sends the correct write-only payloads and encodes names", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const value = ["fake", "value"].join("-");
    await changeSecret("POST", "API_KEY", value);
    await changeSecret("PATCH", "A/B", value);
    await changeSecret("DELETE", "A/B");
    expect(fetch.mock.calls[0][0]).toBe("/api/workspace/secrets");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: "API_KEY", value });
    expect(fetch.mock.calls[1][0]).toBe("/api/workspace/secrets/A%2FB");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ value });
    expect(fetch.mock.calls[2][1]).toEqual({ method: "DELETE", cache: "no-store" });
  });

  test("does not expose response bodies in errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive server detail", { status: 403 })));
    await expect(changeSecret("DELETE", "API_KEY")).rejects.toThrow("403");
    await expect(fetchSecretNames()).rejects.toThrow("403");
  });

  test("reads and updates the workspace detection setting", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ enabled: true }))
      .mockResolvedValueOnce(Response.json({ enabled: false }))
      .mockResolvedValueOnce(Response.json({ enabled: "false" }));
    vi.stubGlobal("fetch", fetch);
    expect(await secretDetectionSetting()).toBe(true);
    expect(await secretDetectionSetting(false)).toBe(false);
    expect(fetch.mock.calls[0]).toEqual(["/api/workspace/secrets/settings", { cache: "no-store" }]);
    expect(fetch.mock.calls[1]).toEqual(["/api/workspace/secrets/settings", {
      cache: "no-store",
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    }]);
    await expect(secretDetectionSetting()).rejects.toThrow("invalid response");
  });
});
