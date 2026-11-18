import "server-only";

import { renewSnapchatAccessToken } from "@/lib/integrations/snapchat/api";

/**
 * Providers whose pasted credential can be renewed without the owner.
 *
 * A token card that accepts `access_token|refresh_token` (Snapchat today) stores
 * a credential that outlives its one-hour access half. The probe has to use that
 * half, otherwise a connection the owner made correctly is reported as broken an
 * hour later and the only cure looks like pasting a token again.
 */
export type TokenRenewer = (workspaceId: string) => Promise<string | null>;

const RENEWERS: Record<string, TokenRenewer> = {
  snapchat: renewSnapchatAccessToken,
};

export function getTokenRenewer(providerId: string): TokenRenewer | undefined {
  return RENEWERS[providerId];
}

/** Renews a pasted-token provider's credential, or returns null when it cannot. */
export async function renewProviderToken(
  providerId: string,
  workspaceId: string
): Promise<string | null> {
  const renewer = getTokenRenewer(providerId);
  if (!renewer) {
    return null;
  }
  try {
    return await renewer(workspaceId);
  } catch {
    return null;
  }
}
