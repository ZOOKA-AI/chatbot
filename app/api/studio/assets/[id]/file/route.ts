import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { readAssetBytes, StudioError } from "@/lib/studio/media";

/**
 * The bytes, for the workspace that owns them.
 *
 * The path is read from the row, never from the URL, and the row must belong to the caller's
 * workspace. Another workspace's id is a 404, the same answer as an id that never existed.
 */

async function GETHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const { id } = await context.params;
  const download = new URL(request.url).searchParams.get("download") === "1";

  try {
    const { asset, bytes } = await readAssetBytes(callerOrganizationId(caller), id);
    const extension = asset.storagePath.split(".").pop() ?? "bin";
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.length),
        "cache-control": "private, max-age=30",
        ...(download
          ? { "content-disposition": `attachment; filename="${asset.label ?? asset.kind}-${asset.id.slice(0, 8)}.${extension}"` }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof StudioError) {
      // A legacy row whose local file did not survive a redeploy is gone, not "not found".
      const status = error.code === "asset_not_found" ? 404 : error.code === "asset_bytes_missing" ? 410 : 409;
      return json({ error: error.code }, status);
    }
    return json({ error: "read_failed" }, 500);
  }
}

export const GET = withCommanderTenant(GETHandler);
