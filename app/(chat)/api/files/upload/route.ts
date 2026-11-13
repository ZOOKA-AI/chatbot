import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  detectImageType,
  INLINE_FALLBACK_MAX_BYTES,
  MAX_UPLOAD_BYTES,
  safeUploadName,
  uploadErrorMessage,
} from "@/lib/uploads";

/**
 * Chat image upload.
 *
 * Security:
 * - Only signed-in workspace members may upload.
 * - The file type is decided from the file's own bytes (magic numbers), never
 *   from the browser-supplied MIME type or extension.
 * - The stored name is sanitised (no path separators, no traversal) and the
 *   blob gets a random suffix so one upload can never overwrite another.
 *
 * Reliability: the workspace Blob store is private, so a public `put` can be
 * refused. When that happens a small image is returned inline as a data URL
 * (never made public) so the chat keeps working; larger images get a clear,
 * localised error instead of a silent failure.
 */
export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { error: uploadErrorMessage("unauthorized", request) },
      { status: 401 }
    );
  }

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const value = formData.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json(
      { error: uploadErrorMessage("bad_request", request) },
      { status: 400 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json(
      { error: uploadErrorMessage("missing", request) },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: uploadErrorMessage("too_large", request) },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) {
    return NextResponse.json(
      { error: uploadErrorMessage("unsupported_type", request) },
      { status: 415 }
    );
  }

  const name = safeUploadName(file.name, detected.extension);
  const pathname = `${context.organizationId}/${context.user.id}/${name}`;

  try {
    const blob = await put(pathname, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: true,
      contentType: detected.contentType,
    });
    return NextResponse.json({
      url: blob.url,
      pathname: name,
      contentType: detected.contentType,
    });
  } catch (error) {
    console.error("[upload] blob put failed", {
      reason: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message.slice(0, 200) : undefined,
    });
  }

  if (bytes.byteLength <= INLINE_FALLBACK_MAX_BYTES) {
    return NextResponse.json({
      url: `data:${detected.contentType};base64,${Buffer.from(bytes).toString("base64")}`,
      pathname: name,
      contentType: detected.contentType,
    });
  }

  return NextResponse.json(
    { error: uploadErrorMessage("storage_unavailable", request) },
    { status: 503 }
  );
}
