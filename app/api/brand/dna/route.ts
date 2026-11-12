import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { generateBrandDna, readBrandDna } from "@/lib/brand/dna";

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ dna: await readBrandDna(context.organizationId) });
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let payload: { url?: string };
  try {
    payload = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const url = (payload.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  try {
    const dna = await generateBrandDna({
      organizationId: context.organizationId,
      url,
      userId: context.user.id,
    });
    return NextResponse.json({ dna });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "failed";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}
