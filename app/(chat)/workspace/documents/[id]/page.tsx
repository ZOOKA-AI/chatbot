import Link from "next/link";
import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { documentFilename, getDocument } from "@/lib/projects/documents";

/**
 * The document as the customer reads it.
 *
 * A plain server page on purpose: it loads from the database on every request, so a reload, a
 * bookmark or a shared link all show the same stored text rather than something held in memory.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");

  const { id } = await params;
  const document = await getDocument({ organizationId: context.organizationId, documentId: id });
  if (!document) redirect("/workspace/projects");

  const filename = documentFilename(document.title, document.format);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs opacity-60">مستند المشروع / Project document</p>
          <h1 className="text-2xl font-semibold">{document.title}</h1>
          <p className="mt-1 text-xs opacity-60">
            {new Date(document.createdAt).toLocaleString("ar-AE")} · {document.bytes} حرف
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/workspace/documents/${document.id}?download=1`}
            className="rounded-md bg-[#2E86AB] px-4 py-2 text-sm font-medium text-white"
          >
            تنزيل / Download
          </a>
          <Link
            href={`/workspace/projects?project=${document.projectId}`}
            className="rounded-md border border-white/20 px-4 py-2 text-sm"
          >
            المشروع
          </Link>
        </div>
      </div>
      <article className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-6 text-sm leading-7">
        {document.body}
      </article>
      <p className="mt-4 text-xs opacity-50">{filename}</p>
    </main>
  );
}
