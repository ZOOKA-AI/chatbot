"use client";

import dynamic from "next/dynamic";

// The chat client (editors, artifacts, markdown and diagram renderers) is
// about 3.7 MB of decoded JS. Importing it from a server component, even with
// `await import()`, still puts it in the route's entry chunks, so every
// anonymous visitor of the landing page downloaded it. Loading it through
// next/dynamic from a client boundary makes it an async chunk that is fetched
// only when the signed-in chat actually renders.
export const LazyChat = dynamic(
  () => import("@/components/chat").then((m) => m.Chat),
  { loading: () => <div className="flex h-dvh" /> }
);

export const LazyDataStreamHandler = dynamic(() =>
  import("@/components/data-stream-handler").then((m) => m.DataStreamHandler)
);
