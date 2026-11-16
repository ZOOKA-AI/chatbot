import "server-only";

import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

import type { PlatformConfig } from "./config";

/**
 * Object storage behind one interface, because the biggest vendor lock in this codebase
 * was not a database: it was `@vercel/blob` sitting in the read path of files, images and
 * media callbacks. A self-hosted install must be able to keep those bytes on a disk it
 * owns, in MinIO, or in any S3-compatible store.
 *
 * Keys are tenant-prefixed by callers (`org/<id>/...`), and the local driver refuses any
 * key that escapes its root, because a storage key arriving from a request is untrusted
 * input like any other.
 */

export type StoredObject = { key: string; size: number; contentType: string; url: string };

export type StorageDriver = {
  name: string;
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
  url(key: string): string;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  pdf: "application/pdf",
  json: "application/json",
  txt: "text/plain",
};

export function contentTypeForKey(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/** Rejects absolute paths, `..` segments and NUL bytes. */
export function assertSafeKey(key: string): string {
  if (!key || key.includes("\0")) throw new Error("storage key is empty or contains a NUL byte");
  // Checked before normalisation on purpose: `org/1/../../secret` normalises cleanly to
  // `secret`, which is exactly the traversal this must refuse.
  const segments = key.split(/[/\\]/);
  if (segments.includes("..")) {
    throw new Error(`storage key escapes its root: ${key}`);
  }
  const normalised = normalize(key).replace(/^([/\\])+/, "");
  if (normalised.startsWith("..")) {
    throw new Error(`storage key escapes its root: ${key}`);
  }
  return normalised.split(sep).join("/");
}

export function localDriver(config: PlatformConfig): StorageDriver {
  const root = resolve(config.storage.localDir);
  const base = config.storage.publicBaseUrl ?? `${config.publicUrl.replace(/\/$/, "")}/api/files`;

  const pathFor = (key: string) => {
    const safe = assertSafeKey(key);
    const full = resolve(join(root, safe));
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error(`storage key escapes its root: ${key}`);
    }
    return { full, safe };
  };

  return {
    name: "local",
    async put(key, body, contentType) {
      const { full, safe } = pathFor(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, body);
      return { key: safe, size: body.byteLength, contentType, url: `${base}/${safe}` };
    },
    async get(key) {
      const { full, safe } = pathFor(key);
      try {
        const body = await readFile(full);
        return { body: new Uint8Array(body), contentType: contentTypeForKey(safe) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      const { full } = pathFor(key);
      await rm(full, { force: true });
    },
    url(key) {
      return `${base}/${assertSafeKey(key)}`;
    },
  };
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * AWS Signature Version 4 for a single PUT/GET/DELETE.
 *
 * Implemented here rather than pulled in as a dependency: the whole point of this exercise
 * is a node_modules a self-hoster can audit, and the signing algorithm is 30 lines of
 * documented arithmetic. Only the headers this client actually sends are signed.
 */
export function signS3Request(input: {
  method: "PUT" | "GET" | "DELETE" | "HEAD";
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  contentType?: string;
  now?: Date;
  /** Injectable for tests; real signing uses `new Date()`. */
  service?: string;
}): { headers: Record<string, string>; canonicalRequest: string; signature: string } {
  const url = new URL(input.url);
  const now = input.now ?? new Date();
  const amzDate = `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const service = input.service ?? "s3";

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.contentType) headers["content-type"] = input.contentType;

  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalUri = url.pathname || "/";

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    signature,
    canonicalRequest,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

export function s3Driver(config: PlatformConfig, fetchImpl: typeof fetch = fetch): StorageDriver {
  const s3 = config.storage.s3;
  if (!s3) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");

  const objectUrl = (key: string) => {
    const safe = assertSafeKey(key);
    if (s3.endpoint) {
      const base = s3.endpoint.replace(/\/$/, "");
      return s3.forcePathStyle ? `${base}/${s3.bucket}/${safe}` : `${base.replace("://", `://${s3.bucket}.`)}/${safe}`;
    }
    return `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${safe}`;
  };

  const signedFetch = async (method: "PUT" | "GET" | "DELETE", key: string, body?: Uint8Array, contentType?: string) => {
    const url = objectUrl(key);
    const payloadHash = createHash("sha256").update(body ?? new Uint8Array()).digest("hex");
    const { headers } = signS3Request({
      method,
      url,
      region: s3.region,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      payloadHash,
      contentType,
    });
    return fetchImpl(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
  };

  return {
    name: "s3",
    async put(key, body, contentType) {
      const safe = assertSafeKey(key);
      const response = await signedFetch("PUT", safe, body, contentType);
      if (!response.ok) throw new Error(`s3 put failed: ${response.status} ${await response.text()}`);
      return { key: safe, size: body.byteLength, contentType, url: objectUrl(safe) };
    },
    async get(key) {
      const safe = assertSafeKey(key);
      const response = await signedFetch("GET", safe);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`s3 get failed: ${response.status}`);
      return { body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? contentTypeForKey(safe) };
    },
    async delete(key) {
      const safe = assertSafeKey(key);
      const response = await signedFetch("DELETE", safe);
      if (!response.ok && response.status !== 404) throw new Error(`s3 delete failed: ${response.status}`);
    },
    url: objectUrl,
  };
}

/**
 * The hosted driver, kept working and kept optional. Imported lazily so a self-hosted
 * install without the package does not fail to start.
 */
export function vercelBlobDriver(config: PlatformConfig): StorageDriver {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("STORAGE_DRIVER=vercel-blob requires BLOB_READ_WRITE_TOKEN");

  const load = async () => {
    const mod = (await import("@vercel/blob")) as typeof import("@vercel/blob");
    return mod;
  };

  return {
    name: "vercel-blob",
    async put(key, body, contentType) {
      const { put } = await load();
      const result = await put(assertSafeKey(key), Buffer.from(body), { access: "public", contentType, token, addRandomSuffix: false });
      return { key: assertSafeKey(key), size: body.byteLength, contentType, url: result.url };
    },
    async get(key) {
      const { head } = await load();
      try {
        const meta = await head(key, { token });
        const response = await fetch(meta.url);
        if (!response.ok) return null;
        return { body: new Uint8Array(await response.arrayBuffer()), contentType: meta.contentType ?? contentTypeForKey(key) };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const { del } = await load();
      await del(key, { token }).catch(() => {});
    },
    url(key) {
      return `${config.storage.publicBaseUrl ?? ""}/${assertSafeKey(key)}`;
    },
  };
}

export function storageDriver(config: PlatformConfig, fetchImpl?: typeof fetch): StorageDriver {
  switch (config.storage.driver) {
    case "local":
      return localDriver(config);
    case "s3":
      return s3Driver(config, fetchImpl);
    case "vercel-blob":
      return vercelBlobDriver(config);
    default: {
      const exhaustive: never = config.storage.driver;
      throw new Error(`unknown storage driver: ${String(exhaustive)}`);
    }
  }
}
