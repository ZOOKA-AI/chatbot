import Link from "next/link";
import { SOCIAL_ACCOUNTS, type SocialAccount } from "@/lib/social-accounts";

type Lang = "ar" | "en";

/**
 * A row (desktop) / grid (phone) of official account icons.
 *
 * Reads lib/social-accounts.ts — the single source of truth from PR #191 —
 * and renders only accounts that are live AND carry a link. Pending accounts
 * (e.g. Instagram under platform review) never appear as clickable icons.
 */
export function liveAccounts(ids?: string[]): SocialAccount[] {
  const live = SOCIAL_ACCOUNTS.filter(
    (account) => account.status === "live" && Boolean(account.href)
  );
  if (!ids) {
    return live;
  }
  return ids
    .map((id) => live.find((account) => account.id === id))
    .filter((account): account is SocialAccount => Boolean(account));
}

export function SocialIconRow({
  lang,
  ids,
  size = "md",
  showHubLink = true,
}: {
  lang: Lang;
  ids?: string[];
  size?: "sm" | "md";
  showHubLink?: boolean;
}) {
  const ar = lang === "ar";
  const accounts = liveAccounts(ids);
  const box = size === "sm" ? "size-10" : "size-11";

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={
          ar ? "حسابات ZOOKA-AI الرسمية" : "Official ZOOKA-AI accounts"
        }
        className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap"
      >
        {accounts.map((account) => (
          <li key={account.id}>
            <a
              aria-label={`${account.label} — ${account.handle}${ar ? " (يفتح في نافذة جديدة)" : " (opens in a new tab)"}`}
              className={`${box} border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-xl border transition-colors focus-visible:ring-2 focus-visible:outline-none`}
              href={account.href}
              rel="noopener noreferrer me"
              target="_blank"
              title={`${account.label} · ${account.handle}`}
            >
              <svg
                aria-hidden="true"
                className="size-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d={account.path} />
              </svg>
              <span className="sr-only">{account.label}</span>
            </a>
          </li>
        ))}
      </ul>
      {showHubLink ? (
        <Link
          className="text-muted-foreground hover:text-foreground w-fit text-xs underline-offset-4 hover:underline"
          href="/social"
        >
          {ar
            ? "كل الحسابات الرسمية وحالتها ←"
            : "All official accounts and their status →"}
        </Link>
      ) : null}
    </div>
  );
}
