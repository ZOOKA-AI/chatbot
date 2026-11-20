import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

/** Static on purpose: a cookie read here breaks the /_not-found prerender. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        الصفحة غير موجودة
      </h1>
      <p className="text-sm text-muted-foreground" dir="ltr">
        Page not found
      </p>
      <p className="text-sm text-muted-foreground">
        الرابط الذي فتحته غير صحيح أو تم نقله. تقدر ترجع للصفحة الرئيسية.
      </p>
      <Link
        className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        href="/"
      >
        الصفحة الرئيسية
      </Link>
      <p className="pt-6 text-xs text-muted-foreground">{PRODUCT_NAME}</p>
    </main>
  );
}
