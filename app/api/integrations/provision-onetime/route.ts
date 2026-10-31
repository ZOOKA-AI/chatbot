import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getUser, getWorkspaceForUser } from "@/lib/db/queries";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauth/config";
import {
  getOAuthAccessToken,
  saveOAuthConnection,
} from "@/lib/integrations/oauth/store";

/** SHA-256 of a throwaway one-time key. Remove this route right after use. */
const ONE_TIME_KEY_SHA256 =
  "aa5f7e1395f84661af37531816065c9cd3c3b9249a105cbbf6751e946c5c6bc0";

function authorized(headerValue: string | null) {
  if (!headerValue) {
    return false;
  }
  return (
    createHash("sha256").update(headerValue).digest("hex") ===
    ONE_TIME_KEY_SHA256
  );
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-onetime"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    token?: string;
  } | null;
  const email = (body?.email ?? "").trim().toLowerCase();
  const token = (body?.token ?? "").trim();
  if (!email || token.length < 20) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const users = await getUser(email);
  if (!users.length) {
    return NextResponse.json({ error: "no_user" }, { status: 404 });
  }
  const workspace = await getWorkspaceForUser(users[0].id);
  if (!workspace) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }

  const definition = OAUTH_PROVIDERS.github;
  const response = await fetch(definition.userUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "zooka-ai",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "token_rejected", status: response.status },
      { status: 400 }
    );
  }
  const account = definition.describeAccount(
    (await response.json()) as Record<string, unknown>
  );

  const stored = await saveOAuthConnection({
    organizationId: workspace.id,
    provider: "github",
    tokens: { accessToken: token, tokenType: "bearer" },
    accountId: account.accountId,
    accountName: account.accountName,
    avatarUrl: account.avatarUrl,
    scopes: definition.scopes.join(" "),
    tokenExpiresAt: null,
  });
  const readBack = await getOAuthAccessToken(workspace.id, "github");

  return NextResponse.json({
    stored,
    workspace: workspace.name,
    workspaceId: workspace.id,
    accountName: account.accountName,
    roundTrip: readBack === token,
  });
}
