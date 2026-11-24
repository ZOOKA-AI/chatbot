import { NextResponse } from "next/server";

import { unavailableModelIds } from "@/lib/ai/model-availability";
import { chatModels } from "@/lib/ai/models";

/**
 * Model ids this deployment cannot serve, so the selector can hide them instead
 * of letting a user send a message that is bound to fail. Booleans only: no
 * provider names beyond the public model ids, and nothing about any key.
 */
export function GET() {
  return NextResponse.json(
    { unavailable: unavailableModelIds(chatModels.map((model) => model.id), process.env) },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
