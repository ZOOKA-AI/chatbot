import { initBotId } from "botid/client/core";
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
    }
    delete event.user;
    return event;
  },
});

initBotId({
  protect: [
    {
      path: "/api/chat",
      method: "POST",
    },
  ],
});
