import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TiktokConnectionPanel } from "@/components/tiktok-connection-panel";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { isTiktokConfigured, tiktokRedirectUri } from "@/lib/integrations/tiktok/config";
import {
  getTiktokConnectionView,
  isTiktokStorageKeyPresent,
  listUploads,
} from "@/lib/integrations/tiktok/store";
import { TIKTOK_SCOPES } from "@/lib/integrations/tiktok/config";
import { TIKTOK_MAX_UPLOAD_BYTES } from "@/lib/integrations/tiktok/validate";

export const metadata: Metadata = {
  title: "TikTok — ZOOKA-AI",
};

export default async function TiktokIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; account?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }
  const params = await searchParams;
  const canManage = ["owner", "admin"].includes(String(context.role));

  const connection = await getTiktokConnectionView(
    context.organizationId,
    context.user.id
  );
  const uploads = await listUploads(context.organizationId, context.user.id, 10);
  const configured = isTiktokConfigured() && isTiktokStorageKeyPresent();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">تيك توك · TikTok</h1>
        <p className="text-sm opacity-70">
          اربط حسابك أنت، وارفع الفيديو إلى صندوقك أنت. لا ينشر زوكا-أي شيئًا
          بنفسه، والنشر يكتمل بيدك داخل تيك توك.
        </p>
        <p className="text-xs opacity-60" dir="ltr">
          Per-creator OAuth · scopes: {TIKTOK_SCOPES.join(", ")} · cap{" "}
          {Math.round(TIKTOK_MAX_UPLOAD_BYTES / (1024 * 1024))}MB per upload
        </p>
      </header>

      <TiktokConnectionPanel
        configured={configured}
        canManage={canManage}
        redirectUri={tiktokRedirectUri()}
        connection={connection}
        uploads={uploads}
        flash={{
          connected: params.connected === "1",
          account: params.account ?? null,
          error: params.error ?? null,
        }}
      />

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-xs leading-6 opacity-80">
        <p className="font-medium opacity-100">حدود هذا الربط، بصراحة:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            الرفع يضع الفيديو في صندوق حسابك (inbox draft) عبر{" "}
            <code dir="ltr">video.upload</code>. لا نطلب{" "}
            <code dir="ltr">video.publish</code> لأن لا ميزة لدينا تنشر مباشرة.
          </li>
          <li>
            لا يُخزَّن أي توكن بصورة نصية: التخزين مشفّر AES-256-GCM، والقراءة
            تُفكّ في الذاكرة فقط، والتوكن لا يظهر في أي استجابة.
          </li>
          <li>
            كل ربط مرتبط بالمستخدم نفسه: زميلك في المساحة لا يرى حسابك ولا يستخدم
            توكنك.
          </li>
        </ul>
      </section>
    </main>
  );
}
