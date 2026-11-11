import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getStripe } from "@/lib/saas/stripe";

/**
 * نطاقات العملاء: التحقق من التوفر بمصدر حقيقي (RDAP)، والشراء يمر ببوابة الدفع
 * أولاً ثم يسجل النطاق لدى المزود. لا تُعاد أي نتيجة مصطنعة: كل مسار غير مربوط
 * يرجع 503 صريحاً بدل أن يدّعي النجاح.
 */

const domainSchema = z.object({
  action: z.enum(["CHECK", "PURCHASE"]),
  domainName: z.string().trim().min(4).max(253),
  projectId: z.string().uuid().optional(),
});

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const KNOWN_REGISTERED_TLDS = /\.(com|net|org|io|ai|ae|co)$/;

export function normalizeDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];
}

async function rdapAvailability(domain: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 404) {
      return true;
    }
    if (res.ok) {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = domainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const domain = normalizeDomain(parsed.data.domainName);
  if (!(DOMAIN_RE.test(domain) && KNOWN_REGISTERED_TLDS.test(domain))) {
    return NextResponse.json(
      { error: "اسم نطاق غير صالح أو امتداد غير مدعوم" },
      { status: 400 }
    );
  }

  if (parsed.data.action === "CHECK") {
    const available = await rdapAvailability(domain);
    if (available === null) {
      return NextResponse.json(
        {
          error: "تعذر التحقق من التوفر الآن، أعد المحاولة",
          code: "REGISTRY_UNAVAILABLE",
        },
        { status: 502 }
      );
    }
    const priceUSD = Number(process.env.DOMAIN_PRICE_USD ?? "20");
    return NextResponse.json({
      domain,
      available,
      priceUSD,
      priceSource: process.env.OPENPROVIDER_TOKEN
        ? "registrar"
        : "platform_price",
      registrarConnected: Boolean(process.env.OPENPROVIDER_TOKEN),
    });
  }

  // PURCHASE: لا تسجيل قبل الدفع. ننشئ جلسة دفع حقيقية، والتسجيل يتم بعد التأكيد.
  if (!process.env.OPENPROVIDER_TOKEN) {
    return NextResponse.json(
      {
        error: "مزود النطاقات غير مربوط بعد، لا يمكن تنفيذ شراء حقيقي",
        code: "REGISTRAR_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const available = await rdapAvailability(domain);
  if (available !== true) {
    return NextResponse.json(
      {
        error:
          available === false
            ? "النطاق مسجل بالفعل"
            : "تعذر التحقق من التوفر، لم يُنشأ أي طلب دفع",
        code: available === false ? "DOMAIN_TAKEN" : "REGISTRY_UNAVAILABLE",
      },
      { status: available === false ? 409 : 502 }
    );
  }

  const priceUSD = Number(process.env.DOMAIN_PRICE_USD ?? "20");
  const origin = new URL(request.url).origin;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    success_url: `${origin}/settings/domains?status=paid&domain=${domain}`,
    cancel_url: `${origin}/settings/domains?status=cancelled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(priceUSD * 100),
          product_data: { name: `تسجيل النطاق ${domain} لسنة واحدة` },
        },
      },
    ],
    metadata: {
      purpose: "domain_purchase",
      domain,
      organizationId: context.organizationId,
      projectId: parsed.data.projectId ?? "",
    },
  });

  return NextResponse.json({
    domain,
    priceUSD,
    checkoutUrl: session.url,
    sessionId: session.id,
  });
}
