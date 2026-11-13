import { describe, expect, it } from "vitest";
import {
  detectImageType,
  safeUploadName,
  uploadErrorMessage,
} from "@/lib/uploads";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

describe("detectImageType", () => {
  it("recognises real image signatures", () => {
    expect(detectImageType(png)?.contentType).toBe("image/png");
    expect(detectImageType(jpeg)?.contentType).toBe("image/jpeg");
    // WebP is not accepted by the chat API, so it must be refused here too.
    expect(detectImageType(webp)).toBeNull();
  });

  it("rejects files that only claim to be images", () => {
    expect(detectImageType(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("a,b\n1,2"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("safeUploadName", () => {
  it("strips directories and traversal", () => {
    expect(safeUploadName("../../etc/passwd", "png")).toBe("passwd.png");
    expect(safeUploadName("..\\..\\win.ini", "jpg")).toBe("win.jpg");
  });

  it("uses the detected extension, not the claimed one", () => {
    expect(safeUploadName("photo.html", "png")).toBe("photo.png");
  });

  it("keeps Arabic names and falls back when empty", () => {
    expect(safeUploadName("فاتورة نوفمبر.png", "png")).toBe("فاتورة-نوفمبر.png");
    expect(safeUploadName("", "png")).toBe("image.png");
  });
});

describe("uploadErrorMessage", () => {
  it("answers in Arabic by default and English when chosen", () => {
    const ar = new Request("https://x.test");
    const en = new Request("https://x.test", {
      headers: { cookie: "a=1; zooka_lang=en" },
    });
    expect(uploadErrorMessage("too_large", ar)).toContain("ميجابايت");
    expect(uploadErrorMessage("too_large", en)).toContain("MB");
  });
});
