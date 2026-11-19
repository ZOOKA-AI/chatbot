import { tool } from "ai";
import { z } from "zod";
import {
  getLinkedInProfile,
  publishLinkedInPost,
} from "@/lib/integrations/linkedin/api";

/**
 * LinkedIn tools: read the connected member profile and publish a text post.
 * Publishing needs an explicit approval flag and never claims success unless
 * LinkedIn returns a post id.
 */
export function createLinkedInTools(organizationId: string) {
  return {
    readLinkedInProfile: tool({
      description:
        "Read the connected LinkedIn member profile: name, email and member id.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getLinkedInProfile(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    publishToLinkedIn: tool({
      description:
        "Publish a text post to the connected LinkedIn profile. Only call this after the user explicitly approved the exact text, and pass approved: true.",
      inputSchema: z.object({
        text: z.string().min(1).max(3_000).describe("The post text."),
        approved: z
          .boolean()
          .describe("Set to true only after the user approved this exact post."),
      }),
      execute: async ({ text, approved }) => {
        if (approved !== true) {
          return {
            error:
              "The user has not approved this post yet. Show the exact text and ask for approval first.",
          };
        }
        const result = await publishLinkedInPost(organizationId, { text });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
