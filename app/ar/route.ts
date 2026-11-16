import { languageEntry } from "@/lib/i18n-entry";

export function GET(request: Request) {
  return languageEntry("ar", request);
}
