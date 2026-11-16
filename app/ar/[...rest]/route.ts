import { languageEntry } from "@/lib/i18n-entry";

export function GET(request: Request, context: { params: Promise<{ rest: string[] }> }) {
  return context.params.then(({ rest }) => languageEntry("ar", request, rest ?? []));
}
