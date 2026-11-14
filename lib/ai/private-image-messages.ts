import { get } from "@vercel/blob";
import { blobUrlToPath, isWorkspaceBlobPath } from "@/lib/blob-path";
import type { ChatMessage } from "@/lib/types";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

export async function resolvePrivateImageMessages(
  messages: ChatMessage[],
  organizationId: string
): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") {
            return part;
          }
          const pathname = blobUrlToPath(part.url);
          if (pathname === null) {
            return part;
          }
          if (!isWorkspaceBlobPath(pathname, organizationId)) {
            throw new Error("Invalid workspace blob path");
          }
          const result = await get(pathname, { access: "private" });
          if (
            !result ||
            result.statusCode !== 200 ||
            result.blob.size > MAX_UPLOAD_BYTES ||
            !["image/png", "image/jpeg"].includes(result.blob.contentType)
          ) {
            throw new Error("Invalid workspace image");
          }
          const bytes = await new Response(result.stream).arrayBuffer();
          if (bytes.byteLength > MAX_UPLOAD_BYTES) {
            throw new Error("Invalid workspace image");
          }
          return {
            ...part,
            mediaType: result.blob.contentType,
            url: `data:${result.blob.contentType};base64,${Buffer.from(bytes).toString("base64")}`,
          };
        })
      ),
    }))
  );
}
