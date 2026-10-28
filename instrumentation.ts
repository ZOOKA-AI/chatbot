import { registerOTel } from "@vercel/otel";
import * as Sentry from "@sentry/nextjs";

export function register() {
  registerOTel({ serviceName: "chatbot" });
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
      }
      delete event.user;
      return event;
    },
  });
}
