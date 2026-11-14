import { z } from "zod";
export const imageOptionsSchema = z
  .object({
    ratio: z.enum(["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"]).default("1:1"),
    purpose: z
      .enum([
        "advertisement",
        "product",
        "story",
        "thumbnail",
        "infographic",
        "brand",
      ])
      .default("advertisement"),
    style: z
      .enum(["photographic", "illustration", "3d-look", "minimal"])
      .default("photographic"),
    palette: z.string().trim().max(100).default(""),
    lighting: z.string().trim().max(100).default(""),
    background: z.string().trim().max(150).default(""),
    camera: z.string().trim().max(100).default(""),
    text: z.string().trim().max(200).default(""),
    language: z.enum(["ar", "en"]).default("ar"),
    reference: z
      .string()
      .max(1_500_000)
      .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict();
export type ImageOptions = z.infer<typeof imageOptionsSchema>;
export function imagePrompt(prompt: string, options?: ImageOptions) {
  if (!options) {
    return prompt;
  }
  return [
    prompt,
    `Design: ${options.purpose}. Style: ${options.style}. Language: ${options.language}.`,
    options.palette && `Palette: ${options.palette}`,
    options.lighting && `Lighting: ${options.lighting}`,
    options.background && `Background: ${options.background}`,
    options.camera && `Camera: ${options.camera}`,
    options.text &&
      `Requested visible lettering (accuracy is not guaranteed): ${options.text}`,
  ]
    .filter(Boolean)
    .join("\n");
}
