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
      type="button"
      className={
        className ??
        "border-border bg-background hover:bg-muted absolute top-4 end-4 z-10 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-medium text-sm transition-colors"
      }
      onClick={() => {
        document.cookie = `zooka_lang=${target}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}
