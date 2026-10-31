import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

export const maxDuration = 60;

const MODELS = [
  process.env.GEMINI_TRANSCRIBE_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
].filter((value): value is string => Boolean(value));

const MAX_BYTES = 15 * 1024 * 1024;

function buildPrompt(lang: string) {
  const languageHint =
    lang === "ar"
      ? "The speaker usually talks in Gulf/UAE Arabic, but may mix English or say a few English words. Transcribe Arabic in Arabic script."
      : "The speaker usually talks in English, but may mix Arabic. Transcribe Arabic words in Arabic script.";
  return [
    "You are a speech-to-text engine.",
    languageHint,
    "Return ONLY the transcript text of what is said, with normal punctuation.",
    "Do not translate, do not summarize, do not add notes, quotes, labels or formatting.",
    "If the audio is silent or unintelligible, return an empty string.",
  ].join(" ");
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "invalid_audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  const lang = ((form?.get("lang") as string | null) ?? "ar").slice(0, 2);
  const mimeType = audio.type || "audio/webm";
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: buildPrompt(lang) },
          { inline_data: { mime_type: mimeType, data } },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 1024 },
  });

  let lastStatus = 0;
  let lastDetail = "";
  for (const model of MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body,
        cache: "no-store",
      }
    );
    if (!response.ok) {
      lastStatus = response.status;
      lastDetail = (await response.text().catch(() => "")).slice(0, 300);
      // A wrong/unavailable model is worth a fallback; other errors are real.
      if (response.status === 404 || response.status === 400) {
        continue;
      }
      break;
    }
    const payload = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
    return NextResponse.json({ text, model });
  }

  console.error("voice transcribe failed", lastStatus, lastDetail);
  return NextResponse.json(
    { error: "transcription_failed", status: lastStatus },
    { status: 502 }
  );
}
