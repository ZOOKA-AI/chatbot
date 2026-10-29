"use client";

export function LanguageToggle({
  lang,
  className,
}: {
  lang: "ar" | "en";
  className?: string;
}) {
  const target = lang === "ar" ? "en" : "ar";
  const label = target === "ar" ? "العربية" : "English";

  return (
    <button
      className={
        className ??
        "border-border bg-background hover:bg-muted absolute top-4 end-4 z-10 rounded-lg border px-3 py-1.5 font-medium text-sm transition-colors"
      }
      onClick={() => {
        // biome-ignore lint/suspicious/noDocumentCookie: simple client-side language preference cookie
        document.cookie = `zooka_lang=${target}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
      type="button"
    >
      {label}
    </button>
  );
}
