import { tool } from "ai";
import { z } from "zod";
import {
  getFacebookPage,
  listFacebookPosts,
  publishFacebookPost,
} from "@/lib/integrations/facebook/graph";

/**
 * Facebook page tools: read the connected page and its latest posts, and
 * publish a text post. Publishing needs an explicit approval flag from the user
 * and never claims success unless Facebook returns a post id.
 */
export function createFacebookTools(organizationId: string) {
  return {
    readFacebookPage: tool({
      description:
        "Read the connected Facebook page: name, link, fans and followers.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getFacebookPage(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    readFacebookPosts: tool({
      description:
        "List the most recent posts of the connected Facebook page with message, permalink and engagement.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ limit }) => {
        const result = await listFacebookPosts(organizationId, limit ?? 10);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    publishToFacebook: tool({
      description:
        "Publish a text post (optionally with a link) to the connected Facebook page. Only call this after the user explicitly approved the exact text, and pass approved: true.",
      inputSchema: z.object({
        message: z.string().min(1).describe("The post text."),
        link: z
          .string()
          .url()
          .optional()
          .describe("Optional link to attach to the post."),
        approved: z
          .boolean()
          .describe("Set to true only after the user approved this exact post."),
      }),
      execute: async ({ message, link, approved }) => {
        if (approved !== true) {
          return {
            error:
              "The user has not approved this post yet. Show the exact text and ask for approval first.",
          };
        }
        const result = await publishFacebookPost(organizationId, {
          message,
          link,
        });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
