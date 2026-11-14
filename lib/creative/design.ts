import { z } from "zod";

export const ratios = {
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "3:2": [1536, 1024],
  "2:3": [1024, 1536],
} as const;
export const fonts = [
  "Arial",
  "Cairo",
  "Tajawal",
  "Noto Kufi Arabic",
  "Georgia",
  "sans-serif",
] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const rasterSource = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
export const layerSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(["text", "rect", "ellipse", "image"]),
    x: z.number().min(-2000).max(4000),
    y: z.number().min(-2000).max(4000),
    width: z.number().min(10).max(3840),
    height: z.number().min(10).max(3840),
    rotation: z.number().min(-360).max(360),
    opacity: z.number().min(0).max(1),
    fill: color,
    text: z.string().max(500),
    font: z.enum(fonts),
    fontSize: z.number().min(10).max(240),
    direction: z.enum(["rtl", "ltr"]),
    source: rasterSource.optional(),
  })
  .strict();
export const designSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(100),
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(320).max(3840),
    background: color,
    layers: z.array(layerSchema).max(40),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((design, context) => {
    if (
      new Set(design.layers.map((layer) => layer.id)).size !==
      design.layers.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate layer ids",
      });
    }
  });
export type Design = z.infer<typeof designSchema>;
export type Layer = z.infer<typeof layerSchema>;
export const categoryNames = [
  "الأعمال",
  "إعلانات",
  "عروض",
  "عقارات",
  "مطاعم",
  "خدمات",
  "تقنية",
  "ذكاء اصطناعي",
  "مناسبات",
  "إسلامي",
  "فاخر",
  "تعليمي",
  "إنفوجرافيك",
];
export function newLayer(kind: Layer["kind"], id = crypto.randomUUID()): Layer {
  return {
    id,
    kind,
    x: 100,
    y: 180,
    width: 600,
    height: 150,
    rotation: 0,
    opacity: 1,
    fill: "#2E86AB",
    text: "اكتب قصتك هنا",
    font: "Arial",
    fontSize: 64,
    direction: "rtl",
  };
}
export function templateDesign(index: number): Design {
  const category = categoryNames[index % categoryNames.length];
  return {
    version: 1,
    id: `template-${index}`,
    name: `ZOOKA · ${category}`,
    width: 1080,
    height: 1080,
    background: index % 2 ? "#101827" : "#F8F9FA",
    updatedAt: "2026-11-14T00:00:00.000Z",
    layers: [
      {
        ...newLayer("rect", "accent"),
        x: 60,
        y: 60,
        width: 960,
        height: 18,
        fill: "#A23B72",
      },
      {
        ...newLayer("text", "title"),
        x: 90,
        y: 200,
        width: 900,
        height: 180,
        text: category,
        fill: index % 2 ? "#F8F9FA" : "#172033",
        fontSize: 100,
      },
      {
        ...newLayer("ellipse", "shape"),
        x: 660,
        y: 520,
        width: 280,
        height: 280,
        fill: "#2E86AB",
        opacity: 0.7,
      },
      {
        ...newLayer("text", "subtitle"),
        x: 90,
        y: 460,
        width: 800,
        height: 120,
        text: "فكرتك. هويتك. خطوتك التالية.",
        fontSize: 42,
        fill: index % 2 ? "#F8F9FA" : "#172033",
      },
      {
        ...newLayer("text", "brand"),
        x: 90,
        y: 900,
        width: 800,
        height: 70,
        text: "ZOOKA AI · Innovate • Automate • Grow",
        fontSize: 30,
        direction: "ltr",
      },
    ],
  };
}
export function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char] ?? char
  );
}
/** No scripts, foreignObject, raw HTML, fonts or remote URLs in exported assets. */
export function designSvg(input: Design): string {
  const design = designSchema.parse(input);
  const shapes = design.layers
    .map((layer) => {
      const box = `x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}"`;
      const transform = `opacity="${layer.opacity}" transform="rotate(${layer.rotation} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})"`;
      if (layer.kind === "image") {
        return layer.source
          ? `<image ${box} ${transform} href="${escapeXml(layer.source)}" preserveAspectRatio="xMidYMid meet"/>`
          : "";
      }
      if (layer.kind === "rect") {
        return `<rect ${box} ${transform} fill="${layer.fill}"/>`;
      }
      if (layer.kind === "ellipse") {
        return `<ellipse cx="${layer.x + layer.width / 2}" cy="${layer.y + layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" ${transform} fill="${layer.fill}"/>`;
      }
      return `<text x="${layer.direction === "rtl" ? layer.x + layer.width : layer.x}" y="${layer.y + layer.fontSize}" ${transform} fill="${layer.fill}" font-family="${layer.font}" font-size="${layer.fontSize}" direction="${layer.direction}" text-anchor="start" xml:space="preserve">${escapeXml(layer.text)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${design.width}" height="${design.height}" viewBox="0 0 ${design.width} ${design.height}"><rect width="100%" height="100%" fill="${design.background}"/>${shapes}</svg>`;
}
export function loadDesigns(raw: string | null): Design[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return z.array(designSchema).max(12).parse(parsed);
  } catch {
    return [];
  }
}
