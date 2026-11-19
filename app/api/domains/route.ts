import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { checkRegistrarDomain, normalizeDomain } from "@/lib/domains/registrar";

const domainSchema = z
  .object({
    action: z.enum(["CHECK", "PURCHASE"]),
    domainName: z.string().trim().min(3).max(253),
    projectId: z.string().uuid().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const context = await getWorkspaceContext();
    if (!context || context.user.type === "guest") {
      return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
    }
    const parsed = domainSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const domain = normalizeDomain(parsed.data.domainName);
    if (!domain) {
      return NextResponse.json(
        { error: "أدخل اسم نطاق فقط، دون رابط أو مسار" },
        { status: 400 }
      );
    }
    if (parsed.data.action === "PURCHASE") {
      // A provider key alone cannot enable payment: fulfillment does not exist yet.
      // Never collect money for a domain we cannot register and reconcile.
      return NextResponse.json(
        {
          error:
            "شراء النطاقات غير مفعّل حتى اكتمال التسجيل والدفع والتحقق من الملكية. لم يُخصم أي مبلغ.",
          code: "DOMAIN_FULFILLMENT_NOT_READY",
        },
        { status: 503 }
      );
    }
    try {
      const result = await checkRegistrarDomain(domain);
      return NextResponse.json(
        { ...result, purchasable: false, purchased: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return NextResponse.json(
        {
          error: "تعذّر التحقق من المسجّل. لا تتوفر نتيجة مؤكدة أو سعر للشراء.",
          code: "REGISTRAR_UNAVAILABLE",
        },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: "تعذّر تنفيذ الطلب" }, { status: 500 });
  }
}
