import { cookies } from "next/headers";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { PlatformSite } from "@/components/platform/platform-site";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLang } from "@/lib/i18n";
import { generateUUID } from "@/lib/utils";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <RootPage />
    </Suspense>
  );
}

/**
 * Visitors get the marketing site; signed-in users keep landing straight in
 * the chat, so the product entry point is unchanged for members.
 */
async function RootPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);
  if (!session?.user) {
    return <PlatformSite lang={lang} />;
  }
  return <NewChatPage />;
}

async function NewChatPage() {
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();

  if (!modelIdFromCookie) {
    return (
      <>
        <Chat
          autoResume={false}
          id={id}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialMessages={[]}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        autoResume={false}
        id={id}
        initialChatModel={modelIdFromCookie.value}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
      <DataStreamHandler />
    </>
  );
}
