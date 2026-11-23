import "server-only";

import { randomUUID } from "node:crypto";
import { createWorkspaceSecret } from "@/lib/db/workspace-secrets";

export async function storeChatSecret(
  organizationId: string,
  createdBy: string,
  kind: string,
  value: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = `${kind}_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    if (await createWorkspaceSecret({ organizationId, name, value, createdBy })) {
      return name;
    }
  }
  throw new Error("secret storage unavailable");
}
