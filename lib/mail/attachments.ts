/**
 * Attachment policy.
 *
 * A file that arrives by mail is the single most common way malware reaches a
 * person, and the recipient is the least suspicious reader there is: it was
 * addressed to them. So the allowlist is by type, not by "not obviously bad",
 * and the decision is made on the file's own name and declared type before
 * anything is stored.
 *
 * Nothing here touches bytes: the check is a policy gate that runs first, and
 * storage is a later, separate step that is not activated in this build.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_FILENAME_LENGTH = 200;

export const ALLOWED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/**
 * Extensions that execute, install, or are shortcuts to something that does.
 * Macro-enabled Office formats are here too: they open as a document and run as
 * a program, which is exactly the confusion this list exists to prevent.
 */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "com", "bat", "cmd", "msi", "msp", "scr", "pif", "cpl", "dll", "sys",
  "vbs", "vbe", "vb", "js", "jse", "wsf", "wsh", "hta", "ps1", "ps1xml", "psm1",
  "jar", "class", "sh", "bash", "zsh", "py", "pyc", "rb", "pl", "php", "asp",
  "aspx", "jsp", "cgi", "reg", "inf", "lnk", "url", "scf", "iso", "img", "vhd",
  "apk", "app", "dmg", "pkg", "deb", "rpm", "docm", "dotm", "xlsm", "xltm",
  "pptm", "potm", "xlam", "bin", "run", "action", "workflow",
]);

export type AttachmentProblem =
  | "missing_filename"
  | "filename_too_long"
  | "unsafe_filename"
  | "blocked_extension"
  | "blocked_content_type"
  | "too_large"
  | "too_many";

export type AttachmentCheck =
  | { ok: true; filename: string; contentType: string; sizeBytes: number }
  | { ok: false; reason: AttachmentProblem };

/**
 * Keeps the readable name and removes everything that has a second meaning in a
 * filesystem or a shell: paths, control characters, leading dots, and the
 * right-to-left override that makes "invoice\u202Efdp.exe" look like a PDF.
 */
export function sanitizeFilename(raw: string): string {
  const withoutControls = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\\/]+/g, "_")
    .trim();
  const base = withoutControls.replace(/^\.+/, "");
  return base.slice(0, MAX_FILENAME_LENGTH);
}

export function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** True when any dot-separated segment is a blocked extension: "a.pdf.exe" counts. */
export function hasBlockedExtension(filename: string): boolean {
  const segments = filename.toLowerCase().split(".").slice(1);
  return segments.some((segment) => BLOCKED_EXTENSIONS.has(segment.trim()));
}

export function checkAttachment(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  existingCount?: number;
}): AttachmentCheck {
  const filename = sanitizeFilename(input.filename);
  const contentType = String(input.contentType ?? "").trim().toLowerCase();

  if (!filename) return { ok: false, reason: "missing_filename" };
  if (String(input.filename ?? "").length > MAX_FILENAME_LENGTH) {
    return { ok: false, reason: "filename_too_long" };
  }
  if (filename !== String(input.filename ?? "").trim().replace(/^\.+/, "")) {
    // The name had to be changed to be safe; refuse rather than rename silently,
    // because a renamed attachment is not the file the sender named.
    return { ok: false, reason: "unsafe_filename" };
  }
  if (hasBlockedExtension(filename)) return { ok: false, reason: "blocked_extension" };
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return { ok: false, reason: "blocked_content_type" };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: "too_large" };
  }
  if (input.sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "too_large" };
  if ((input.existingCount ?? 0) >= MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, reason: "too_many" };
  }

  return { ok: true, filename, contentType, sizeBytes: Math.floor(input.sizeBytes) };
}

export function checkAttachmentList(
  items: Array<{ filename: string; contentType: string; sizeBytes: number }>
): { ok: true; accepted: Array<{ filename: string; contentType: string; sizeBytes: number }> } | { ok: false; reason: AttachmentProblem; index: number } {
  const accepted: Array<{ filename: string; contentType: string; sizeBytes: number }> = [];
  for (let index = 0; index < items.length; index += 1) {
    const result = checkAttachment({ ...items[index], existingCount: accepted.length });
    if (!result.ok) return { ok: false, reason: result.reason, index };
    accepted.push({
      filename: result.filename,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
    });
  }
  return { ok: true, accepted };
}
