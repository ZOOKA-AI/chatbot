import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAgentMemories, saveAgentMemory } from "@/lib/db/agent-memory";
import { generateBrandDna, readBrandDna } from "@/lib/brand/dna";
import { listLeads, updateLeadStatus } from "@/lib/db/leads";
import { readWallet } from "@/lib/db/token-wallets";
import { chargeWallet } from "@/lib/db/wallet-charge";
import { LEAD_STATUSES } from "@/lib/leads/status";

/**
 * خادم MCP لمساحة عمل واحدة. كل استدعاء أداة يُخصم من محفظة التوكنز
 * بنفس مضاعفات الفوترة (1x قراءة، 5x كتابة)، ولا يرى إلا بيانات مساحته.
 */

const READ_COST = 1;
const WRITE_COST = 5;

type ToolContext = {
  organizationId: string;
  userId: string | null;
};

function textResult(payload: unknown) {
  return {
    content: [
      {
        text: typeof payload === "string" ? payload : JSON.stringify(payload),
        type: "text" as const,
      },
    ],
  };
}

async function charge(
  context: ToolContext,
  weighted: number,
  tool: string
): Promise<{ ok: true; remaining: number | null } | { ok: false; message: string }> {
  const result = await chargeWallet({
    organizationId: context.organizationId,
    weighted,
  });
  if (result.ok) {
    return { ok: true, remaining: result.remaining };
  }
  return {
    message:
      result.remaining === null
        ? `لا توجد محفظة توكنز لهذه المساحة، فتعذّر تنفيذ ${tool}.`
        : `الرصيد لا يكفي لتنفيذ ${tool}: المطلوب ${weighted} والرصيد ${result.remaining}.`,
    ok: false,
  };
}

export function buildZookaMcpServer(context: ToolContext): McpServer {
  const server = new McpServer({
    name: "zooka-ai",
    version: "1.0.0",
  });

  server.registerTool(
    "list_leads",
    {
      description:
        "اعرض ليدز مساحة العمل (اسم، هاتف، خدمة، مدينة، حالة). قراءة فقط.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
      title: "قائمة الليدز",
    },
    async ({ limit }) => {
      const paid = await charge(context, READ_COST, "list_leads");
      if (!paid.ok) {
        return { content: [{ text: paid.message, type: "text" }], isError: true };
      }
      const leads = await listLeads(context.organizationId, limit ?? 25);
      return textResult({ count: leads.length, leads });
    }
  );

  server.registerTool(
    "update_lead_status",
    {
      description: "غيّر حالة ليد واحد. كتابة تتطلب رصيداً أكبر.",
      inputSchema: {
        leadId: z.string().uuid().describe("معرّف الليد"),
        status: z.enum(LEAD_STATUSES),
      },
      title: "تحديث حالة ليد",
    },
    async ({ leadId, status }) => {
      const paid = await charge(context, WRITE_COST, "update_lead_status");
      if (!paid.ok) {
        return { content: [{ text: paid.message, type: "text" }], isError: true };
      }
      const updated = await updateLeadStatus(
        context.organizationId,
        leadId,
        status
      );
      if (!updated) {
        return {
          content: [
            { text: "لم يُعثر على الليد داخل هذه المساحة.", type: "text" },
          ],
          isError: true,
        };
      }
      return textResult({ leadId, status, updated: true });
    }
  );

  server.registerTool(
    "remember",
    {
      description:
        "احفظ حقيقة دائمة عن مساحة العمل ليستخدمها الوكيل في المحادثات القادمة.",
      inputSchema: {
        key: z.string().min(2).max(120),
        value: z.string().min(2).max(2000),
      },
      title: "حفظ ذكرى",
    },
    async ({ key, value }) => {
      if (!context.userId) {
        return {
          content: [
            { text: "المفتاح غير مرتبط بمستخدم، فلا يمكن الحفظ.", type: "text" },
          ],
          isError: true,
        };
      }
      const paid = await charge(context, WRITE_COST, "remember");
      if (!paid.ok) {
        return { content: [{ text: paid.message, type: "text" }], isError: true };
      }
      const saved = await saveAgentMemory({
        key,
        organizationId: context.organizationId,
        userId: context.userId,
        value,
      });
      return textResult({ key: saved.key, saved: true });
    }
  );

  server.registerTool(
    "recall",
    {
      description: "استرجع أهم ما حُفظ عن مساحة العمل. قراءة فقط.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional(),
      },
      title: "استرجاع الذاكرة",
    },
    async ({ limit }) => {
      const paid = await charge(context, READ_COST, "recall");
      if (!paid.ok) {
        return { content: [{ text: paid.message, type: "text" }], isError: true };
      }
      const memories = await listAgentMemories({
        limit: limit ?? 10,
        organizationId: context.organizationId,
      });
      return textResult({ count: memories.length, memories });
    }
  );

  server.registerTool(
    "get_brand_dna",
    {
      description:
        "هوية العلامة المحفوظة لهذه المساحة (تموضع، نبرة، جمهور، عروض، إثباتات). قراءة فقط.",
      inputSchema: {},
      title: "هوية العلامة",
    },
    async () => {
      const paid = await charge(context, READ_COST, "get_brand_dna");
      if (!paid.ok) {
        return { content: [{ text: paid.message, type: "text" }], isError: true };
      }
      const dna = await readBrandDna(context.organizationId);
      if (!dna) {
        return textResult({ dna: null, hint: "لم تُنشأ هوية بعد." });
      }
      return textResult({ dna });
    }
  );

  server.registerTool(
    "generate_brand_dna",
    {
      description:
        "يقرأ موقع المساحة ويستخرج هوية العلامة ويحفظها. تكلفتها أعلى لأنها تستدعي نموذجاً.",
      inputSchema: {
        url: z.string().url().describe("رابط الموقع الكامل"),
      },
      title: "توليد هوية العلامة",
    },
    async ({ url }) => {
      const paid = await charge(context, WRITE_COST * 5, "generate_brand_dna");
      if (!paid.ok) {
        return { content: [{ text: paid.message, type: "text" }], isError: true };
      }
      if (!context.userId) {
        return {
          content: [{ text: "المفتاح غير مرتبط بمستخدم.", type: "text" }],
          isError: true,
        };
      }
      try {
        const dna = await generateBrandDna({
          organizationId: context.organizationId,
          url,
          userId: context.userId,
        });
        return textResult({ dna, saved: true });
      } catch (error) {
        return {
          content: [
            {
              text: error instanceof Error ? error.message : "failed",
              type: "text",
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "wallet_balance",
    {
      description: "رصيد التوكنز الموزون للخطة الحالية. مجاني.",
      inputSchema: {},
      title: "رصيد المحفظة",
    },
    async () => {
      const wallet = await readWallet(context.organizationId);
      if (!wallet) {
        return textResult({ plan: null, wallet: null });
      }
      return textResult({
        periodEnd: wallet.period_end,
        periodStart: wallet.period_start,
        plan: wallet.plan,
        weightedRemaining: Number(wallet.weighted_remaining),
      });
    }
  );

  return server;
}
