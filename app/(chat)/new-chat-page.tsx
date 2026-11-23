import { cookies } from "next/headers";
import { LazyChat as Chat, LazyDataStreamHandler as DataStreamHandler } from "@/components/chat-lazy";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { starterTemplates } from "@/lib/studio";
import { generateUUID } from "@/lib/utils";

export async function NewChatPage({
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
