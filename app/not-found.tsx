import Link from "next/link";
import { getLang } from "@/lib/i18n";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Custom 404. Reading the language cookie here also makes the /_not-found route
 * dynamic, which Next 16 requires because the root layout's generateMetadata
 * reads the same cookie.
 */
export default async function NotFound() {
  const lang = await getLang();
  const ar = lang === "ar";
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {ar ? "الصفحة غير موجودة" : "Page not found"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {ar
          ? "الرابط الذي فتحته غير صحيح أو تم نقله. تقدر ترجع للصفحة الرئيسية."
          : "The link you opened is incorrect or has moved. You can go back home."}
      </p>
      <Link
        className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        href="/"
      >
        {ar ? "الصفحة الرئيسية" : "Home"}
      </Link>
      <p className="pt-6 text-xs text-muted-foreground">{PRODUCT_NAME}</p>
    </main>
  );
}
