import { init } from "@sentry/nextjs";
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({ serviceName: "chatbot" });
  init({
    dsn: process.env.SENTRY_DSN,
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
}
