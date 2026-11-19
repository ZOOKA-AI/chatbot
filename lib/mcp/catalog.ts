/**
 * What the MCP endpoint actually exposes, for the screens that describe it.
 *
 * The settings page used to keep its own hand-written list and drifted to five
 * entries while the server registered seven. tests/unit/mcp-catalog.test.ts
 * fails if a name here and a registerTool call in lib/mcp/server.ts disagree.
 *
 * Costs are in weighted tokens, matching READ_COST / WRITE_COST in server.ts.
 */
export type McpToolInfo = {
  name: string;
  cost: number;
  kind: "read" | "write" | "free";
  ar: string;
  en: string;
};

export const MCP_TOOL_CATALOG: readonly McpToolInfo[] = [
  { name: "list_leads", cost: 1, kind: "read", ar: "قراءة الليدز", en: "Read leads" },
  {
    name: "update_lead_status",
    cost: 5,
    kind: "write",
    ar: "تحديث حالة ليد",
    en: "Update a lead status",
  },
  { name: "remember", cost: 5, kind: "write", ar: "حفظ حقيقة دائمة", en: "Save a durable fact" },
  { name: "recall", cost: 1, kind: "read", ar: "استرجاع الذاكرة", en: "Recall memory" },
  {
    name: "get_brand_dna",
    cost: 1,
    kind: "read",
    ar: "قراءة هوية العلامة المحفوظة",
    en: "Read the saved brand identity",
  },
  {
    name: "generate_brand_dna",
    cost: 25,
    kind: "write",
    ar: "توليد هوية العلامة من رابط الموقع",
    en: "Generate the brand identity from a website URL",
  },
  { name: "wallet_balance", cost: 0, kind: "free", ar: "رصيد المحفظة", en: "Wallet balance" },
];
