import { tool } from "ai";
import { z } from "zod";
import {
  getInstagramProfile,
  listInstagramMedia,
  publishInstagramMedia,
} from "@/lib/integrations/instagram/graph";

/**
 * Instagram tools: read the connected business account and publish a reel or a
 * single image. Publishing needs an explicit approval flag from the user, and it
 * never claims success unless Instagram returns a media id.
 */
export function createInstagramTools(organizationId: string) {
  return {
    readInstagramProfile: tool({
      description:
        "Read the profile (handle, followers, media count) of the connected Instagram business account.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getInstagramProfile(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    readInstagramMedia: tool({
      description:
        "List the most recent posts of the connected Instagram account with caption, permalink and engagement.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ limit }) => {
        const result = await listInstagramMedia(organizationId, limit ?? 10);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    publishToInstagram: tool({
      description:
        "Publish a reel (public videoUrl) or a single image (public imageUrl) with a caption to the connected Instagram account. Only call this after the user explicitly approved the exact caption and media, and pass approved: true.",
      inputSchema: z.object({
        caption: z.string().min(1).max(2_200).describe("The post caption."),
        videoUrl: z
          .string()
          .url()
          .optional()
          .describe("Publicly reachable MP4 URL for a reel."),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe("Publicly reachable JPG URL for a single image post."),
        shareToFeed: z.boolean().optional(),
        approved: z
          .literal(true)
          .describe("Set to true only after the user approved this exact post."),
      }),
      execute: async ({ caption, videoUrl, imageUrl, shareToFeed }) => {
        const result = await publishInstagramMedia(organizationId, {
          caption,
          videoUrl,
          imageUrl,
          shareToFeed,
        });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
