import { mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { del, get, put } from "@vercel/blob";

import { StudioError } from "@/lib/studio/errors";

/**
 * Where studio bytes live: private Vercel Blob, the same store chat images use.
 *
 * A serverless function's filesystem is per-instance and disappears on redeploy or cold start, so an
 * asset written there is a row that points at nothing a few hours later. Every studio asset is
 * therefore persisted to Blob, and the row records `blob:<pathname>`.
 *
 * ffmpeg, Piper and rembg still need real files to work on. They get a scratch directory created by
 * `withScratch`, which is removed when the operation ends, success or failure. Scratch is a working
 * copy, never the asset: `assertDurableStoragePath` refuses to record any path that is not a Blob
 * pathname, so a local path can no longer reach the database.
 */

export const BLOB_SCHEME = "blob:";

export type StorageErrorCode =
  | "storage_not_configured"
  | "local_storage_forbidden"
  | "asset_bytes_missing"
  | "storage_failed";

function fail(code: StorageErrorCode, detail: string | null = null): never {
  throw new StudioError(code, detail);
}

export function isBlobStoragePath(storagePath: string): boolean {
  return storagePath.startsWith(BLOB_SCHEME) && storagePath.length > BLOB_SCHEME.length;
}

export function blobPathname(storagePath: string): string {
  if (!isBlobStoragePath(storagePath)) fail("local_storage_forbidden", storagePath);
  return storagePath.slice(BLOB_SCHEME.length);
}

/** The pathname a studio asset is written under; the organisation prefix keeps tenants apart. */
export function studioBlobPathname(organizationId: string, assetId: string, extension: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(organizationId)) fail("storage_failed", "invalid organization id");
  if (!/^[A-Za-z0-9-]+$/.test(assetId)) fail("storage_failed", "invalid asset id");
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  if (!/^\.[a-z0-9]{2,5}$/.test(ext)) fail("storage_failed", "invalid extension");
  return `${organizationId}/studio-media/${assetId}${ext}`;
}

/**
 * The guard. Called before any studio row is inserted: only a Blob pathname may be recorded.
 * A filesystem path (absolute, relative, or `/tmp/...`) is refused outright.
 */
export function assertDurableStoragePath(storagePath: string): string {
  if (!isBlobStoragePath(storagePath)) fail("local_storage_forbidden", storagePath);
  return storagePath;
}

/** Refuses up front, before any work is done, when there is nowhere durable to put the result. */
export function assertDurableStorageConfigured(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) fail("storage_not_configured");
}

export async function persistBytes(input: {
  organizationId: string;
  assetId: string;
  extension: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  assertDurableStorageConfigured();
  const pathname = studioBlobPathname(input.organizationId, input.assetId, input.extension);
  try {
    const stored = await put(pathname, input.bytes, {
      access: "private",
      contentType: input.mimeType,
      addRandomSuffix: true,
    });
    return assertDurableStoragePath(`${BLOB_SCHEME}${stored.pathname}`);
  } catch (error) {
    if (error instanceof StudioError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    fail("storage_failed", message.slice(0, 300));
  }
}

/** Persists a file that a tool wrote into scratch, and reports its size. */
export async function persistFile(input: {
  organizationId: string;
  assetId: string;
  extension: string;
  mimeType: string;
  path: string;
}): Promise<{ storagePath: string; bytes: number }> {
  const bytes = await readFile(input.path);
  const storagePath = await persistBytes({ ...input, bytes });
  return { storagePath, bytes: bytes.length };
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Reads an asset's bytes back. Blob rows are read from Blob. Rows written before this change carry a
 * local path; those are read if the file still happens to exist, and reported missing otherwise, so the
 * caller can answer honestly instead of serving a 500.
 */
export async function readStoredBytes(storagePath: string): Promise<Buffer> {
  if (isBlobStoragePath(storagePath)) {
    const result = await get(blobPathname(storagePath), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      fail("asset_bytes_missing", storagePath);
    }
    return streamToBuffer(result.stream);
  }
  try {
    return await readFile(storagePath);
  } catch {
    fail("asset_bytes_missing", storagePath);
  }
}

export async function deleteStoredBytes(storagePath: string): Promise<void> {
  if (isBlobStoragePath(storagePath)) {
    await del(blobPathname(storagePath)).catch(() => undefined);
    return;
  }
  // A legacy row: remove the stale file if this instance still has it.
  await unlink(storagePath).catch(() => undefined);
}

/**
 * A working directory for engines that need files. It is always removed afterwards; nothing in it is
 * ever recorded as an asset (the guard above enforces that).
 */
export async function withScratch<T>(work: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "zooka-studio-scratch-"));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Copies a stored asset into scratch so a local engine can read it. Returns the scratch path. */
export async function materialize(storagePath: string, directory: string, name: string): Promise<string> {
  const bytes = await readStoredBytes(storagePath);
  const extension = storagePath.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? "";
  const path = join(directory, `${name}${extension}`);
  await writeFile(path, bytes);
  return path;
}

export async function scratchFileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}
