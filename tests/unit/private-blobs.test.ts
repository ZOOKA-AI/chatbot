import { beforeEach, describe, expect, it, vi } from "vitest";

const { context, get, put } = vi.hoisted(() => ({
  context: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: context }));
vi.mock("@vercel/blob", () => ({ get, put }));

import { postRequestBodySchema } from "@/app/(chat)/api/chat/schema";
import { GET } from "@/app/(chat)/api/files/[...pathname]/route";
import { POST } from "@/app/(chat)/api/files/upload/route";
import { resolvePrivateImageMessages } from "@/lib/ai/private-image-messages";
import {
  blobPathToUrl,
  blobUrlToPath,
  isWorkspaceBlobPath,
} from "@/lib/blob-path";
import type { ChatMessage } from "@/lib/types";
import { INLINE_FALLBACK_MAX_BYTES } from "@/lib/uploads";

const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
const result = () => ({
  statusCode: 200,
  stream: new Response(imageBytes).body,
  blob: { etag: '"abc"', contentType: "image/png", size: imageBytes.length },
});
const params = (pathname: string[]) => ({
  params: Promise.resolve({ pathname }),
});

beforeEach(() => {
  vi.resetAllMocks();
  context.mockResolvedValue({ organizationId: "org", user: { id: "user" } });
  get.mockImplementation(result);
  put.mockResolvedValue({ pathname: "org/user/صورة-random.png" });
});

describe("workspace blob paths", () => {
  it("requires an exact organization segment and safe path segments", () => {
    expect(isWorkspaceBlobPath("org/user/image.png", "org")).toBe(true);
    for (const path of [
      "org-other/user/image.png",
      "org",
      "org/",
      "/org/a",
      "org/../other",
      "org/./a",
      "org//a",
      "org/a\\b",
      "org/%2e%2e/a",
    ]) {
      expect(isWorkspaceBlobPath(path, "org"), path).toBe(false);
    }
    expect(isWorkspaceBlobPath("org/user/image.png", "")).toBe(false);
  });

  it("round trips encoded filenames without accepting encoded separators", () => {
    const path = "org/user/صورة-random.png";
    expect(blobUrlToPath(blobPathToUrl(path))).toBe(path);
    expect(() => blobUrlToPath("/api/files/org%2Fother/a")).toThrow();
    expect(() => blobUrlToPath("/api/files/org/%zz")).toThrow();
  });
});

describe("private blob route", () => {
  it("requires authentication and denies other workspaces before reading", async () => {
    context.mockResolvedValueOnce(null);
    expect(
      (await GET(new Request("https://example.test"), params(["org", "a"])))
        .status
    ).toBe(401);
    expect(
      (
        await GET(
          new Request("https://example.test"),
          params(["org-other", "a"])
        )
      ).status
    ).toBe(404);
    expect(
      (
        await GET(
          new Request("https://example.test"),
          params(["org", "../other"])
        )
      ).status
    ).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("streams a private blob with security headers and handles not found", async () => {
    const response = await GET(
      new Request("https://example.test"),
      params(["org", "user", "a.png"])
    );
    expect(get).toHaveBeenCalledWith("org/user/a.png", {
      access: "private",
      ifNoneMatch: undefined,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("etag")).toBe('"abc"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes);
    get.mockResolvedValueOnce(null);
    expect(
      (
        await GET(
          new Request("https://example.test"),
          params(["org", "missing"])
        )
      ).status
    ).toBe(404);
  });

  it("forwards the conditional ETag and returns a bodyless 304", async () => {
    get.mockResolvedValueOnce({
      statusCode: 304,
      stream: null,
      blob: { etag: '"abc"' },
    });
    const request = new Request("https://example.test", {
      headers: { "If-None-Match": '"abc"' },
    });
    const response = await GET(request, params(["org", "user", "a.png"]));
    expect(get).toHaveBeenCalledWith("org/user/a.png", {
      access: "private",
      ifNoneMatch: '"abc"',
    });
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"abc"');
    expect(await response.text()).toBe("");
  });
});

describe("private uploads", () => {
  const upload = (bytes: Uint8Array) => {
    const form = new FormData();
    form.set("file", new File([bytes], "image.png", { type: "image/png" }));
    return POST(
      new Request("https://example.test/api/files/upload", {
        method: "POST",
        body: form,
      })
    );
  };

  it("writes privately and returns a route URL", async () => {
    const response = await upload(imageBytes);
    expect(put.mock.calls[0][2]).toMatchObject({
      access: "private",
      addRandomSuffix: true,
    });
    expect((await response.json()).url).toBe(
      blobPathToUrl("org/user/صورة-random.png")
    );
  });

  it("falls back only for tiny images", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    put.mockRejectedValue(new Error("unavailable"));
    expect((await (await upload(imageBytes)).json()).url).toMatch(
      /^data:image\/png;base64,/
    );
    const large = new Uint8Array(INLINE_FALLBACK_MAX_BYTES + 1);
    large.set(imageBytes);
    expect((await upload(large)).status).toBe(503);
    vi.restoreAllMocks();
  });
});

describe("private images in model messages", () => {
  const message = (url: string) =>
    ({
      id: "id",
      role: "user",
      parts: [{ type: "file", url, mediaType: "image/png" }],
    }) as ChatMessage;

  it("resolves authorized images for the model without changing persisted messages", async () => {
    const original = message("/api/files/org/user/a.png");
    const [resolved] = await resolvePrivateImageMessages([original], "org");
    expect(resolved.parts[0]).toMatchObject({
      url: `data:image/png;base64,${Buffer.from(imageBytes).toString("base64")}`,
    });
    expect(original.parts[0]).toMatchObject({
      url: "/api/files/org/user/a.png",
    });
    expect(get).toHaveBeenCalledWith("org/user/a.png", { access: "private" });
  });

  it("rejects cross-workspace, missing and non-image blobs", async () => {
    await expect(
      resolvePrivateImageMessages(
        [message("/api/files/other/user/a.png")],
        "org"
      )
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValueOnce(null);
    await expect(
      resolvePrivateImageMessages([message("/api/files/org/user/a.png")], "org")
    ).rejects.toThrow();
    get.mockResolvedValueOnce({
      ...result(),
      blob: { ...result().blob, contentType: "text/html" },
    });
    await expect(
      resolvePrivateImageMessages([message("/api/files/org/user/a.png")], "org")
    ).rejects.toThrow();
  });

  it("accepts private route URLs in the chat schema", () => {
    const parsed = postRequestBodySchema.safeParse({
      id: "60fd4832-bd11-499f-b09f-7c761a2b51e8",
      message: {
        id: "60fd4832-bd11-499f-b09f-7c761a2b51e8",
        role: "user",
        parts: [
          {
            type: "file",
            name: "a.png",
            mediaType: "image/png",
            url: "/api/files/org/user/a.png",
          },
        ],
      },
      selectedChatModel: "test",
      selectedVisibilityType: "private",
    });
    expect(parsed.success).toBe(true);
  });
});
