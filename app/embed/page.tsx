export const dynamic = "force-dynamic";

import type { Metadata } from "next";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EmbedAuth } from "./embed-auth";

export const metadata: Metadata = {
  title: "Zooka AI — محادثة",
};

export default async function EmbedPage() {
  const session = await auth();

  if (!session?.user) {
    return <EmbedAuth />;
  }

  const id = generateUUID();

  return (
    <DataStreamProvider>
      <SidebarProvider>
        <Chat
          autoResume={false}
          id={id}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialMessages={[]}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
        />
      </SidebarProvider>
      <DataStreamHandler />
    </DataStreamProvider>
  );
}
