import { domainToASCII } from "node:url";
import { z } from "zod";

const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
export function normalizeDomain(input: string) {
  // A domain name, not a URL: never silently buy a different name.
  const raw = input.trim().toLowerCase();
  if (/[\s/:@?#\\]/.test(raw)) {
    return null;
  }
  const domain = domainToASCII(raw);
  const parts = domain.split(".");
  if (
    !domain ||
    domain.length > 253 ||
    parts.length < 2 ||
    !parts.every((part) => label.test(part)) ||
    /^\d+$/.test(parts.at(-1) ?? "")
  ) {
    return null;
  }
  return domain;
}

export class RegistrarUnavailable extends Error {}
const availabilitySchema = z.object({ available: z.boolean() });
const priceValue = z
  .union([
    z.number().finite().positive(),
    z
      .string()
      .regex(/^\d+(?:\.\d+)?$/)
      .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0),
  ])
  .nullable();
const priceSchema = z.object({
  years: z.number().int().positive(),
  purchasePrice: priceValue,
  renewalPrice: priceValue,
  transferPrice: priceValue,
});

async function registrarRead(
  domain: string,
  operation: "availability" | "price"
) {
  const url = new URL(
    `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/${operation}`
  );
  if (operation === "price") {
    url.searchParams.set("years", "1");
  }
  if (process.env.VERCEL_TEAM_ID) {
    url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  }
  const headers: Record<string, string> = { accept: "application/json" };
  const token = process.env.VERCEL_ACCESS_TOKEN ?? process.env.VERCEL_TOKEN;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new RegistrarUnavailable("Registrar lookup failed");
  }
  return response.json() as Promise<unknown>;
}

export async function checkRegistrarDomain(domain: string) {
  const parsed = availabilitySchema.safeParse(
    await registrarRead(domain, "availability")
  );
  if (!parsed.success) {
    throw new RegistrarUnavailable("Invalid registrar response");
  }
  const checkedAt = new Date().toISOString();
  if (!parsed.data.available) {
    return {
      domain,
      available: false,
      source: "vercel_registrar",
      checkedAt,
      quote: null,
    };
  }
  // Availability and pricing are independent. Never invent a price on failure.
  let quote: (z.infer<typeof priceSchema> & { source: string }) | null = null;
  try {
    const price = priceSchema.safeParse(await registrarRead(domain, "price"));
    if (price.success && price.data.purchasePrice !== null) {
      quote = { ...price.data, source: "vercel_registrar" };
    }
  } catch {
    // A failed quote is explicit; it must not become a purchasable offer.
  }
  return {
    domain,
    available: true,
    source: "vercel_registrar",
    checkedAt,
    quote,
  };
}
