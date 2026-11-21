/**
 * Media rules for the TikTok inbox upload.
 *
 * TikTok accepts much larger files than we will ever send from a request
 * handler, so the product cap below is ours, stated openly: it keeps one upload
 * inside a single serverless invocation and prevents a user from streaming
 * gigabytes through our runtime. The chunk plan follows the documented
 * constraint: 5MB–64MB chunks, and a final chunk that carries the remainder.
 */

export const TIKTOK_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const TIKTOK_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const TIKTOK_DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;

export const TIKTOK_ALLOWED_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export type TiktokMediaProblem =
  | "empty_file"
  | "file_too_large"
  | "unsupported_type";

export interface TiktokMediaCheck {
  ok: boolean;
  problem?: TiktokMediaProblem;
  detail?: string;
}

export function checkTiktokMedia(input: {
  size: number;
  mime: string;
}): TiktokMediaCheck {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, problem: "empty_file", detail: "The file is empty." };
  }
  if (input.size > TIKTOK_MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      problem: "file_too_large",
      detail: `Our per-upload cap is ${Math.round(
        TIKTOK_MAX_UPLOAD_BYTES / (1024 * 1024)
      )}MB.`,
    };
  }
  if (!(TIKTOK_ALLOWED_MIME as readonly string[]).includes(input.mime)) {
    return {
      ok: false,
      problem: "unsupported_type",
      detail: "TikTok accepts mp4, mov or webm video here.",
    };
  }
  return { ok: true };
}

export interface TiktokChunkPlan {
  chunkSize: number;
  totalChunkCount: number;
}

export function planTiktokChunks(
  size: number,
  preferredChunkSize: number = TIKTOK_DEFAULT_CHUNK_BYTES
): TiktokChunkPlan {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("size must be a positive number of bytes");
  }
  if (size <= TIKTOK_MIN_CHUNK_BYTES) {
    return { chunkSize: size, totalChunkCount: 1 };
  }
  const chunkSize = Math.min(
    Math.max(preferredChunkSize, TIKTOK_MIN_CHUNK_BYTES),
    TIKTOK_MAX_CHUNK_BYTES
  );
  return { chunkSize, totalChunkCount: Math.ceil(size / chunkSize) };
}

/** Byte ranges in the exact order they must be sent. */
export function tiktokChunkRanges(
  size: number,
  plan: TiktokChunkPlan
): Array<{ start: number; end: number; length: number }> {
  const ranges: Array<{ start: number; end: number; length: number }> = [];
  let start = 0;
  while (start < size) {
    const end = Math.min(start + plan.chunkSize, size) - 1;
    ranges.push({ start, end, length: end - start + 1 });
    start = end + 1;
  }
  if (ranges.length !== plan.totalChunkCount) {
    throw new Error("chunk plan does not match the byte ranges");
  }
  return ranges;
}

export function contentRangeHeader(
  range: { start: number; end: number },
  totalBytes: number
): string {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    throw new Error("totalBytes must be a positive number of bytes");
  }
  if (range.start < 0 || range.end < range.start || range.end >= totalBytes) {
    throw new Error("chunk range falls outside the file");
  }
  // The final segment is the TOTAL size of the file, not the size of this
  // chunk. Sending the chunk length made every multi-chunk upload announce a
  // smaller file than it was actually sending.
  return `bytes ${range.start}-${range.end}/${totalBytes}`;
}
