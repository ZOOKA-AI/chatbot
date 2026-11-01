import { PRODUCT_NAME } from "@/lib/brand";
import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = `${PRODUCT_NAME} — مساعد الأعمال الذكي`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
