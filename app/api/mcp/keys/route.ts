import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  createMcpKey,
  listMcpKeys,
  revokeMcpKey,
} from "@/lib/db/mcp-keys";

/** إدارة مفاتيح MCP داخل الجلسة: إنشاء، عرض، إلغاء. */

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const keys = await listMcpKeys(context.organizationId);
  return NextResponse.json({ keys });
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (context.user.organizationRole === "member") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: { name?: string };
  try {
    payload = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const name = (payload.name ?? "").trim().slice(0, 80) || "MCP key";
  const { key, token } = await createMcpKey({
    name,
    organizationId: context.organizationId,
    userId: context.user.id,
  });

  // النص الصريح يظهر مرة واحدة فقط؛ لا يُخزَّن ولا يُسجَّل.
  return NextResponse.json({ key, token }, { status: 201 });
}

export async function DELETE(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const revoked = await revokeMcpKey({
    id,
    organizationId: context.organizationId,
  });
  return NextResponse.json({ revoked }, { status: revoked ? 200 : 404 });
}
