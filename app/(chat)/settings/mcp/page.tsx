import { Suspense } from "react";
import { withTenantPage } from "@/lib/db/request-tenant";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { McpKeysManager } from "@/components/mcp-keys-manager";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { listMcpKeys } from "@/lib/db/mcp-keys";
import { MCP_TOOL_CATALOG } from "@/lib/mcp/catalog";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "MCP",
};

async function McpSettingsPageImpl() {
  // الجلسة والكوكيز تُقرأ داخل Suspense حتى لا تُحجب الصفحة كاملة.
  return (
    <Suspense fallback={null}>
      <McpSettingsContent />
    </Suspense>
  );
}

async function McpSettingsContent() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const ar = lang === "ar";
  const keys = await listMcpKeys(context.organizationId);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 py-12"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">
          {ar ? "ربط MCP" : "MCP connection"}
        </h1>
        <p className="text-muted-foreground">
          {ar
            ? "اربط Claude أو أي عميل يدعم Model Context Protocol بمساحة عملك، ليدير الليدز والذاكرة بالمحادثة. كل استدعاء يُحسب على محفظة التوكنز: قراءة 1 والكتابة 5."
            : "Connect Claude or any Model Context Protocol client to this workspace so it can work with leads and memory conversationally. Each call is charged to the token wallet: reads 1, writes 5."}
        </p>
      </header>

      <McpKeysManager initialKeys={keys} lang={lang} />

      <section className="flex flex-col gap-2 rounded-2xl border bg-muted/30 p-5 text-sm">
        <h2 className="font-semibold">
          {ar ? "الأدوات المتاحة" : "Available tools"} ({MCP_TOOL_CATALOG.length})
        </h2>
        <ul className="flex flex-col gap-1 text-muted-foreground">
          {MCP_TOOL_CATALOG.map((tool) => (
            <li key={tool.name}>
              • <code dir="ltr">{tool.name}</code> — {ar ? tool.ar : tool.en} (
              {tool.cost === 0 ? (ar ? "مجاني" : "free") : `${tool.cost}x`})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

// Tenant-scoped render: data read during this page runs inside the caller's tenant.
export default withTenantPage(McpSettingsPageImpl);
