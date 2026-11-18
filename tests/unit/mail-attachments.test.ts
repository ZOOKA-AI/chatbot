import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  checkAttachment,
  checkAttachmentList,
  hasBlockedExtension,
  sanitizeFilename,
} from "@/lib/mail/attachments";

const pdf = { filename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 1024 };

describe("attachment policy", () => {
  it("accepts an ordinary document", () => {
    expect(checkAttachment(pdf)).toEqual({
      ok: true,
      filename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });
  });

  it("refuses executables and installers", () => {
    for (const name of ["setup.exe", "run.bat", "script.ps1", "app.apk", "x.jar", "lib.dll"]) {
      const result = checkAttachment({ filename: name, contentType: "application/pdf", sizeBytes: 10 });
      expect(result).toEqual({ ok: false, reason: "blocked_extension" });
    }
  });

  it("refuses a blocked extension hidden behind a safe one", () => {
    expect(hasBlockedExtension("invoice.pdf.exe")).toBe(true);
    expect(checkAttachment({ filename: "invoice.pdf.exe", contentType: "application/pdf", sizeBytes: 10 })).toEqual({
      ok: false,
      reason: "blocked_extension",
    });
  });

  it("refuses macro-enabled Office formats", () => {
    const result = checkAttachment({
      filename: "report.docm",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 10,
    });
    expect(result).toEqual({ ok: false, reason: "blocked_extension" });
  });

  it("refuses a type that is not on the allowlist", () => {
    expect(
      checkAttachment({ filename: "page.html", contentType: "text/html", sizeBytes: 10 })
    ).toEqual({ ok: false, reason: "blocked_content_type" });
  });

  it("refuses oversize files and an oversize batch", () => {
    expect(
      checkAttachment({ ...pdf, sizeBytes: MAX_ATTACHMENT_BYTES + 1 })
    ).toEqual({ ok: false, reason: "too_large" });
    expect(checkAttachment({ ...pdf, sizeBytes: 0 })).toEqual({ ok: false, reason: "too_large" });

    const eleven = Array.from({ length: 11 }, (_, index) => ({ ...pdf, filename: `f${index}.pdf` }));
    const batch = checkAttachmentList(eleven);
    expect(batch.ok).toBe(false);
    if (!batch.ok) expect(batch.reason).toBe("too_many");
  });

  it("refuses a filename that had to be rewritten to be safe", () => {
    const rtl = "invoice\u202Efdp.exe";
    expect(sanitizeFilename(rtl)).toBe("invoicefdp.exe");
    const result = checkAttachment({ filename: rtl, contentType: "application/pdf", sizeBytes: 10 });
    expect(result.ok).toBe(false);

    const traversal = checkAttachment({
      filename: "../../etc/passwd.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
    expect(traversal.ok).toBe(false);
  });

  it("accepts a clean batch and keeps order", () => {
    const batch = checkAttachmentList([pdf, { filename: "a.png", contentType: "image/png", sizeBytes: 10 }]);
    expect(batch.ok).toBe(true);
    if (batch.ok) expect(batch.accepted.map((entry) => entry.filename)).toEqual(["invoice.pdf", "a.png"]);
  });
});
