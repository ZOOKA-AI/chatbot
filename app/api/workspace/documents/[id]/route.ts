import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { documentFilename, getDocument } from "@/lib/projects/documents";

/**
 * One document, read or downloaded.
 *
 * `?download=1` returns the text as an attachment so the customer keeps a real file; without it
 * the body comes back as JSON for the viewer. Both paths resolve the document through the
 * caller's organization, so a document id from another workspace is simply not found.
 */

type Params = { params: Promise<{ id: string }> };

async function GETHandler(request: Request, context: Params) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const { id } = await context.params;
  const organizationId = callerOrganizationId(caller);

  const document = await getDocument({ organizationId, documentId: id });
  if (!document) return json({ error: "not_found" }, 404);

  const url = new URL(request.url);
  if (url.searchParams.get("download") === "1") {
    return new Response(document.body, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        // The title is customer-supplied, so it is encoded rather than interpolated raw.
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(documentFilename(document.title, document.format))}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  return json({ document });
}

export const GET = withCommanderTenant(GETHandler);
