import { put } from "@vercel/blob";
import { tool } from "ai";
import { z } from "zod";
import { blobPathToUrl } from "@/lib/blob-path";
import { finishMediaJob, reserveFreeImage } from "@/lib/db/queries";
import {
  anyFreeImageProvider,
  dailyImageLimit,
  generateFreeImage,
} from "@/lib/media/free-image";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

/**
 * Image generation for the chat agent, through the free-tier providers only
 * (Cloudflare Workers AI, then OVHcloud). Nothing here bills a third party.
 *
 * The tool returns either a stored image URL or an honest reason. The model is
 * told never to describe an image it did not receive, so a refusal cannot turn
 * into a fabricated "here is your picture".
 */
export function createGenerateImage({
  organizationId,
}: {
  organizationId: string;
}) {
  return tool({
    description:
      "Generate one image from a text prompt with a free image model (FLUX.1 schnell, fallback Stable Diffusion XL) and show it in the chat. Use when the user asks to draw, create or design a picture, logo idea, illustration or social post visual. Write the prompt in English for best results, describing subject, style, colours and composition. Never claim an image was created unless this tool returns a url.",
    inputSchema: z.object({
      prompt: z
        .string()
        .min(3)
        .max(1500)
        .describe("Detailed English description of the image to create"),
    }),
    execute: async ({ prompt }) => {
      if (!anyFreeImageProvider()) {
        return {
          error: "توليد الصور غير مُفعّل بعد على هذه المنصة.",
          modelNote:
            "Image generation is not configured on this deployment (no free provider key). Tell the user plainly; do not describe or invent an image.",
        };
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return {
          error: "تخزين الصور غير مُعدّ على هذه البيئة.",
          modelNote:
            "Image storage is not configured on this deployment. Tell the user; do not describe or invent an image.",
        };
      }

      const entitlements = await getWorkspaceEntitlements(organizationId);
      const limit = dailyImageLimit(entitlements.plan);
      const reservation = await reserveFreeImage({
        organizationId,
        prompt,
        dailyLimit: limit,
      });
      if (!reservation.job) {
        return {
          error: `وصلت مساحة العمل إلى حد الصور اليومي (${limit} صور). يتجدد الحد منتصف الليل بتوقيت UTC.`,
          upgradeUrl: entitlements.plan === "free" ? "/pricing" : undefined,
          modelNote: `The workspace reached its daily image limit of ${limit}. It resets at 00:00 UTC. Do not invent an image.`,
        };
      }
      const jobId = reservation.job.id;

      const outcome = await generateFreeImage(prompt);
      if (!outcome.ok) {
        const exhausted = outcome.attempts.some(
          (attempt) => attempt.code === "free_allowance_exhausted"
        );
        await finishMediaJob({
          id: jobId,
          status: "failed",
          error: outcome.attempts
            .map((attempt) => `${attempt.provider}:${attempt.code}`)
            .join(", "),
        }).catch(() => null);
        return {
          error: exhausted
            ? "نفدت حصة توليد الصور المجانية لليوم لدى المزوّد. حاول بعد منتصف الليل بتوقيت UTC."
            : "تعذّر توليد الصورة الآن. حاول مرة أخرى بعد قليل.",
          modelNote: `Image generation failed (${outcome.attempts
            .map((attempt) => `${attempt.provider}: ${attempt.code}`)
            .join("; ")}). Tell the user honestly; do not describe or invent an image.`,
        };
      }

      const extension =
        outcome.mimeType === "image/png"
          ? "png"
          : outcome.mimeType === "image/webp"
            ? "webp"
            : "jpg";
      try {
        const stored = await put(
          `${organizationId}/generated-media/${jobId}.${extension}`,
          outcome.bytes,
          {
            access: "private",
            contentType: outcome.mimeType,
            addRandomSuffix: true,
          }
        );
        const url = blobPathToUrl(stored.pathname);
        await finishMediaJob({ id: jobId, status: "succeeded", assetUrl: url });
        return {
          url,
          provider: outcome.provider,
          model: outcome.model,
          seconds: outcome.seconds,
          usedToday: reservation.used,
          dailyLimit: limit,
          modelNote:
            "The image is already displayed to the user above your reply. Do not repeat the url or use markdown image syntax; add one short sentence at most.",
        };
      } catch {
        await finishMediaJob({
          id: jobId,
          status: "failed",
          error: "storage",
        }).catch(() => null);
        return {
          error: "وُلّدت الصورة لكن تعذّر حفظها. حاول مرة أخرى.",
          modelNote:
            "The image could not be stored. Tell the user; do not describe or invent an image.",
        };
      }
    },
  });
}
