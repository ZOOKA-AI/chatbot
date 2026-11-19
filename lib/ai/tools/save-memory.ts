import { tool } from "ai";
import { z } from "zod";
import { saveAgentMemory } from "@/lib/db/agent-memory";

/**
 * Lets the agent keep what it learns instead of asking the same question next
 * week. Scoped to the workspace that owns the conversation.
 */
export function createSaveMemory({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  return tool({
    description:
      "احفظ حقيقة دائمة أو قاعدة عمل أو تفضيلاً خاصاً بمساحة العمل، ليُستخدم تلقائياً في المحادثات القادمة. استخدمها عندما يذكر المستخدم تفضيلاً ثابتاً أو قراراً أو معلومة عن نشاطه التجاري. لا تحفظ أسراراً أو كلمات مرور أو بيانات دفع.",
    inputSchema: z.object({
      key: z
        .string()
        .min(2)
        .max(120)
        .describe("مفتاح قصير بوصف واضح، مثل: اسم_الشركة أو تفضيل_الرد"),
      value: z
        .string()
        .min(2)
        .max(2000)
        .describe("المعلومة كاملة ومستقلة بذاتها دون إشارة إلى سياق المحادثة"),
      importance: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("أهمية المعلومة من 1 إلى 10، والافتراضي 7"),
    }),
    execute: async ({ key, value, importance }) => {
      try {
        const saved = await saveAgentMemory({
          importance,
          key,
          organizationId,
          userId,
          value,
        });
        return { saved: true, key: saved.key };
      } catch (error) {
        return {
          saved: false,
          error:
            error instanceof Error ? error.message : "تعذّر حفظ المعلومة",
        };
      }
    },
  });
}
