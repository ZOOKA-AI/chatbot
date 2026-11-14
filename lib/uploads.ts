/**
 * Helpers for the chat upload route, kept framework-free so they can be unit
 * tested without a Next.js runtime.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Largest image returned inline as a data URL when Blob storage refuses it. */
export const INLINE_FALLBACK_MAX_BYTES = 128 * 1024;

/**
 * Only PNG and JPEG: the chat API (`app/(chat)/api/chat/schema.ts`) accepts
 * exactly these two media types, so anything else would upload and then fail.
 */
export type DetectedImage = {
  contentType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Identifies an image by its magic bytes. Returns null for anything else. */
export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  return null;
}

/**
 * Produces a storage-safe file name: no directories, no traversal, only a
 * conservative character set, bounded length, and the extension that matches
 * the detected content (never the one the browser claimed).
 */
export function safeUploadName(original: string, extension: string) {
  const base = (original.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "image"}.${extension}`;
}

export type UploadErrorCode =
  | "unauthorized"
  | "bad_request"
  | "missing"
  | "too_large"
  | "unsupported_type"
  | "storage_unavailable";

const MESSAGES: Record<UploadErrorCode, { ar: string; en: string }> = {
  unauthorized: {
    ar: "سجّل الدخول أولاً لرفع الملفات.",
    en: "Sign in to upload files.",
  },
  bad_request: {
    ar: "تعذّر قراءة الملف المرفوع.",
    en: "The uploaded file could not be read.",
  },
  missing: { ar: "لم يتم اختيار ملف.", en: "No file was selected." },
  too_large: {
    ar: "حجم الصورة أكبر من 5 ميجابايت.",
    en: "The image is larger than 5 MB.",
  },
  unsupported_type: {
    ar: "المرفقات المدعومة حاليًا: صور PNG وJPEG فقط.",
    en: "Supported attachments right now: PNG and JPEG images only.",
  },
  storage_unavailable: {
    ar: "التخزين غير متاح الآن. جرّب صورة أصغر من 128 كيلوبايت أو أعد المحاولة لاحقًا.",
    en: "Storage is unavailable right now. Try an image under 128 KB or retry later.",
  },
};

export function uploadErrorMessage(code: UploadErrorCode, request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const lang = /(?:^|;\s*)zooka_lang=en(?:;|$)/.test(cookie) ? "en" : "ar";
  return MESSAGES[code][lang];
}
