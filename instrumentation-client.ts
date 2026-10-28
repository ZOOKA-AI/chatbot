import { init } from "@sentry/nextjs";
import { initBotId } from "botid/client/core";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event) {
    event.request = undefined;
    event.user = undefined;
    event.breadcrumbs = undefined;
    event.extra = undefined;
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        exception.value = "Sanitized application error";
      }
    }
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
