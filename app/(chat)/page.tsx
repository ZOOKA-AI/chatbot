import { cookies } from "next/headers";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { LandingPage } from "@/components/marketing/landing-page";
import { getLang } from "@/lib/i18n";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";
import { starterTemplates } from "@/lib/studio";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; prompt?: string; mode?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <RootPage searchParams={searchParams} />
    </Suspense>
  );
}

async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; prompt?: string; mode?: string }>;
}) {
  const [session, lang] = await Promise.all([auth(), getLang()]);
  if (!session?.user) {
    return <LandingPage lang={lang} />;
  }
  return <NewChatPage searchParams={searchParams} />;
}

async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; prompt?: string; mode?: string }>;
}) {
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();
  const params = await searchParams;
  const templateId = params.template;
  const rawPrompt = params.prompt;

  let initialMessages: any[] = [];
  if (templateId || rawPrompt) {
    const template = starterTemplates.find((t) => t.id === templateId);
    const text =
      rawPrompt ||
      (template
        ? `عدّل قالب "${template.title}" (${template.description}).\n\nالكود:\n\`\`\`html\n${template.html}\n\`\`\`\n\nماذا تريد تغييره؟`
        : "");
    if (text) {
      initialMessages = [
        {
          id: generateUUID(),
          role: "user",
          parts: [{ type: "text", text }],
        },
      ];
    }
  }

  const model = modelIdFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        autoResume={false}
        id={id}
        initialChatModel={model}
        initialMessages={initialMessages}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
      <DataStreamHandler />
    </>
  );
}
