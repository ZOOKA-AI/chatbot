/** Visual redaction, NOT encryption. WhatsApp destination is necessarily readable in the link. */
export const MASKED_COMPANY_FIELD = "*** · *** · ***" as const;
export const MASKED_PHONE_LABEL = "*** · *** · ****" as const;
/** Latest owner instruction replaces the prior contact number. WhatsApp only; no tel link. */
export const WHATSAPP_PHONE_E164 = "+971566047579" as const;
export const WHATSAPP_SUPPORT_URL =
  `https://wa.me/${WHATSAPP_PHONE_E164.slice(1)}` as const;
export function maskLegalText(text: string, fields: readonly string[]): string {
  return [...new Set(fields.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .reduce(
      (result, field) => result.split(field).join(MASKED_COMPANY_FIELD),
      text,
    );
}
