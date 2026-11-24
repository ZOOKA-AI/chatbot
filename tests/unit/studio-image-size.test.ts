import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, test } from "vitest";

import { readImageSize } from "@/lib/studio/image-size";

/**
 * Vercel has no ffprobe, so studio images are measured from their header. A wrong reader would either
 * mark good images failed (they never open) or accept a renamed file, so both directions are pinned.
 */

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from("ffe000104a46494600010100000100010000", "hex");
  const sof0 = Buffer.alloc(19);
  Buffer.from("ffc000110803", "hex").copy(sof0, 0);
  sof0[4] = 0x08;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3;
  return Buffer.concat([Buffer.from("ffd8", "hex"), app0, sof0, Buffer.from("ffd9", "hex")]);
}

function webpVp8x(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(32);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("image size from the header", () => {
  test("PNG, JPEG and WebP (VP8X) report their declared size", () => {
    assert.deepEqual(readImageSize(pngHeader(1024, 768), "image/png"), { width: 1024, height: 768 });
    assert.deepEqual(readImageSize(jpegHeader(1024, 1024), "image/jpeg"), { width: 1024, height: 1024 });
    assert.deepEqual(readImageSize(webpVp8x(800, 600), "image/webp"), { width: 800, height: 600 });
  });

  test("bytes that do not match the declared type are refused", () => {
    assert.equal(readImageSize(pngHeader(10, 10), "image/jpeg"), null);
    assert.equal(readImageSize(jpegHeader(10, 10), "image/png"), null);
    assert.equal(readImageSize(Buffer.from("not an image at all, just text padding......"), "image/png"), null);
    assert.equal(readImageSize(Buffer.alloc(0), "image/webp"), null);
    assert.equal(readImageSize(pngHeader(0, 10), "image/png"), null);
    assert.equal(readImageSize(pngHeader(10, 10), "video/mp4"), null);
  });

  test.skipIf(!hasFfmpeg)("matches real files encoded by ffmpeg", () => {
    for (const [codec, format, mime] of [
      ["png", "image2pipe", "image/png"],
      ["mjpeg", "image2pipe", "image/jpeg"],
      ["libwebp", "webp", "image/webp"],
      ["libwebp_anim", "webp", "image/webp"],
    ] as const) {
      let bytes: Buffer;
      try {
        bytes = execFileSync("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=321x123",
          "-frames:v", "1", "-pix_fmt", codec === "mjpeg" ? "yuvj420p" : codec === "png" ? "rgb24" : "yuv420p",
          "-c:v", codec, "-f", format, "-",
        ]);
      } catch {
        continue; // this ffmpeg build lacks the encoder
      }
      assert.deepEqual(readImageSize(bytes, mime), { width: 321, height: 123 }, codec);
    }
  });
});
