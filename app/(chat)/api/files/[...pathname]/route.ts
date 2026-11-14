import { get } from "@vercel/blob";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { isWorkspaceBlobPath } from "@/lib/blob-path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pathname: string[] }> }
) {
  const context = await getWorkspaceContext();
  if (!context) {
    return new Response(null, { status: 401 });
  }

  const { pathname: segments } = await params;
  const pathname = segments.join("/");
  if (
    segments.some((segment) => segment.includes("/")) ||
    !isWorkspaceBlobPath(pathname, context.organizationId)
  ) {
    return new Response(null, { status: 404 });
  }

  const result = await get(pathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  });
  if (!result) {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers({
    "Cache-Control": "private, no-cache",
    ETag: result.blob.etag,
    "X-Content-Type-Options": "nosniff",
  });
  if (result.statusCode === 304) {
    return new Response(null, { status: 304, headers });
  }
  headers.set("Content-Type", result.blob.contentType);
  return new Response(result.stream, { headers });
}
