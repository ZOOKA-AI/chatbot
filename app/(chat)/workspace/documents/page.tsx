import Link from "next/link";
import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspaceDocuments } from "@/lib/projects/documents";

/**
 * The workspace's documents in one place.
 *
 * Until now a document could only be reached through the project that produced it, so a customer
 * who closed the project page had no way back to their own file. This page is the list: it reads
 * from the database on every request, scoped to the caller's workspace by the query itself.
 */
export default async function DocumentsPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");

  const documents = await listWorkspaceDocuments(context.organizationId);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6">
        <p className="text-xs opacity-60">المستندات / Documents</p>
        <h1 className="text-2xl font-semibold">مستندات المساحة</h1>
        <p className="mt-1 text-sm opacity-70">
          {documents.length === 0
            ? "لا توجد مستندات بعد. اطلب من وكيل مُخوَّل إنشاء مستند داخل مشروع."
            : `${documents.length} مستندًا محفوظًا في هذه المساحة.`}
        </p>
      </header>

      {documents.length === 0 ? (
        <Link
          className="inline-block rounded-md bg-[#2E86AB] px-4 py-2 text-sm font-medium text-white"
          href="/workspace/projects"
        >
          المشاريع / Projects
        </Link>
      ) : (
        <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
          {documents.map((document) => (
            <li className="p-4" key={document.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  className="font-medium underline-offset-4 hover:underline"
                  href={`/workspace/documents/${document.id}`}
                >
                  {document.title}
                </Link>
                <span className="text-xs opacity-60">
                  {new Date(document.createdAt).toLocaleString("ar-AE")} · {document.bytes} حرف
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs opacity-70">
                <Link href={`/workspace/projects?project=${document.projectId}`}>
                  المشروع / Project
                </Link>
                <a href={`/api/workspace/documents/${document.id}?download=1`}>
                  تنزيل / Download
                </a>
                {document.taskId ? <span>مهمة / Task {document.taskId.slice(0, 8)}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
