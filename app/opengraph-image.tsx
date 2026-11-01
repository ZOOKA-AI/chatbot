import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Zooka AI — وكيل أعمال لشركات الخدمات في الإمارات";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
