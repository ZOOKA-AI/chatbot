"use client";
import {
  Cable,
  CircleHelp,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { ProviderIcon } from "@/components/studio/provider-icon";
import {
  type HubProvider,
  type HubState,
  hubProviders,
} from "@/lib/integration-hub/catalog";
import { diagnosticMessage } from "@/lib/integration-hub/messages";
import styles from "./creative.module.css";

interface LiveProvider extends HubProvider {
  state: HubState;
  account: string | null;
  checkedAt: string | null;
  code: string | null;
  grantedScopes: string[];
}
const categories = [...new Set(hubProviders.map((item) => item.category))];
export function IntegrationHub() {
  const { resolvedTheme } = useTheme();
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const t = useCallback(
    (ar: string, en: string) => (lang === "ar" ? ar : en),
    [lang]
  );
  const [providers, setProviders] = useState<LiveProvider[] | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const load = useCallback(async () => {
    setBusy("load");
    try {
      const response = await fetch("/api/integration-hub", {
        cache: "no-store",
      });
      if (response.redirected) {
        throw new Error("SIGN_IN_REQUIRED");
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "SERVICE_UNAVAILABLE");
      }
      setProviders(data.providers);
      setManage(data.canManage === true);
      setMessage(
        t(
          "الحالة من مساحتك؛ VERIFIED يثبت قراءة محددة خلال 15 دقيقة فقط، لا صلاحية نشر.",
          "Workspace state loaded. VERIFIED proves only the tested read within 15 minutes, not publishing rights."
        )
      );
    } catch (error) {
      setProviders(null);
      setManage(false);
      setMessage(
        diagnosticMessage(
          error instanceof Error ? error.message : "SERVICE_UNAVAILABLE",
          lang
        )
      );
    } finally {
      setBusy(null);
    }
  }, [t, lang]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setProviders(
          (current) =>
            current?.map((provider) =>
              provider.state === "VERIFIED" &&
              provider.checkedAt &&
              Date.now() - Date.parse(provider.checkedAt) >= 15 * 60 * 1000
                ? {
                    ...provider,
                    state: "CONFIGURED",
                    code: "VERIFICATION_STALE",
                  }
                : provider
            ) ?? null
        ),
      30_000
    );
    return () => clearInterval(timer);
  }, []);
  async function test(id: string) {
    setBusy(id);
    try {
      const response = await fetch("/api/integration-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? data.code ?? "CHECK_FAILED");
      }
      setMessage(`${id}: ${data.state} · ${data.code}`);
      await load();
    } catch (error) {
      setMessage(
        diagnosticMessage(
          error instanceof Error ? error.message : "CHECK_FAILED",
          lang
        )
      );
      setProviders(
        (current) =>
          current?.map((item) =>
            item.id === id
              ? { ...item, state: "ERROR", code: "CHECK_FAILED" }
              : item
          ) ?? null
      );
    } finally {
      setBusy(null);
    }
  }
  const source: Array<HubProvider & Partial<LiveProvider>> =
    providers ?? hubProviders;
  const rows = source.filter(
    (item) =>
      (!category || item.category === category) &&
      `${item.name} ${item.category}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  return (
    <main
      className={styles.root}
      data-color-mode={resolvedTheme}
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
    >
      <header className={styles.header}>
        <div>
          <p>Innovate • Automate • Grow</p>
          <h1>ZOOKA INTEGRATION HUB</h1>
          <p>
            {t(
              "الإعداد ليس اتصالاً، والاتصال ليس اختباراً ناجحاً.",
              "Configured is not connected. Connected is not verified."
            )}
          </p>
        </div>
        <nav className={styles.nav}>
          <Link className={styles.link} href="/creative">
            Creative Studio
          </Link>
          <Link className={styles.link} href="/settings/integrations">
            {t("إعدادات الربط", "Connection settings")}
          </Link>
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            type="button"
          >
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </nav>
      </header>
      <div className={styles.warning}>
        <p>
          {t(
            "CONFIGURED يعني وجود إعداد أو اعتماد محفوظ فقط، وليس اتصالاً مؤكداً. VERIFIED يتطلب استجابة API رسمية صالحة، وينتهي بعد 15 دقيقة أو تغيير الاعتماد. لا يثبت صلاحية النشر أو جميع الصلاحيات.",
            "CONFIGURED means settings or stored authorization only, not proven connectivity. VERIFIED requires a valid official API read and expires after 15 minutes or credential changes. It does not prove publishing or all permissions."
          )}
        </p>
      </div>
      <p className={styles.notice} role="status">
        {message || t("جارٍ قراءة الحالة…", "Loading state…")}
      </p>
      {!providers && (
        <p>
          {t(
            "الكتالوج أدناه ليس حالة حسابك. إن ظهر SERVICE_UNAVAILABLE فافحص قاعدة البيانات والترحيل؛ لا تضف مفاتيح عشوائياً.",
            "The catalog below is not your account state. SERVICE_UNAVAILABLE requires database/migration review, not arbitrary API keys."
          )}{" "}
          <Link className={styles.link} href="/login">
            {t("دخول", "Sign in")}
          </Link>
        </p>
      )}
      <section
        aria-label="Observed integration counts"
        className={styles.stats}
      >
        {["VERIFIED", "CONFIGURED", "ERROR", "EXPIRED"].map((state) => (
          <div className={styles.panel} key={state}>
            <ShieldCheck size={18} />
            <span>{state}</span>
            <strong>
              {providers
                ? providers.filter((item) => item.state === state).length
                : "—"}
            </strong>
          </div>
        ))}
      </section>
      <div className={styles.tools} style={{ marginTop: 20 }}>
        <label>
          <Search size={16} />
          <input
            aria-label="Search integrations"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث باسم الخدمة", "Search service")}
            value={query}
          />
        </label>
        <label>
          {t("الفئة", "Category")}
          <select
            onChange={(e) => setCategory(e.target.value)}
            value={category}
          >
            <option value="">{t("الكل", "All")}</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button disabled={Boolean(busy)} onClick={() => load()} type="button">
          <RefreshCw size={16} />
          {t("تحديث الحالة المخزنة", "Refresh stored state")}
        </button>
      </div>
      <div className={styles.templates}>
        {rows.map((item) => (
          <article
            className={styles.panel}
            data-provider={item.id}
            key={item.id}
          >
            <ProviderIcon id={item.id} />
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>{item.name}</h2>
            <p>{item.category}</p>
            <strong>
              {item.state ??
                t("لم تُقرأ حالة الحساب", "Account state not loaded")}
            </strong>
            <p>{item.description}</p>
            {item.account && (
              <p>
                {t("الحساب", "Account")}: {item.account}
              </p>
            )}
            {item.checkedAt && (
              <p className={styles.help}>
                {t("آخر محاولة", "Last attempted check")}:{" "}
                {new Date(item.checkedAt).toLocaleString(lang)} ·{" "}
                {item.code ? diagnosticMessage(item.code, lang) : ""}
              </p>
            )}
            <details>
              <summary>
                <CircleHelp size={15} />
                {t(
                  "المعلومات والمتطلبات والمثال",
                  "Help, requirements and example"
                )}
              </summary>
              <p>Auth: {item.auth}</p>
              <p>
                {t(
                  "الصلاحيات المطلوبة تُراجع قبل منحها؛ المسجل منها:",
                  "Review required scopes before authorization; declared requirements:"
                )}
              </p>
              <ul>
                {item.scopes.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
              {item.grantedScopes && (
                <p>
                  {t("المحفوظ لمساحتك", "Stored grant")}:{" "}
                  {item.grantedScopes.join(", ") || "—"}
                </p>
              )}
              <p>
                {t(
                  "مثال: افتح الإعدادات، امنح الحد الأدنى اللازم، ثم اختبر القراءة. لا تضع مفتاحاً في المحادثة أو المتصفح العام.",
                  "Example: open settings, grant only required access, then test a read. Never paste keys into chat or public browser storage."
                )}
              </p>
              <a href={item.docs} rel="noopener noreferrer" target="_blank">
                {t("الوثائق الرسمية", "Official documentation")}
              </a>
            </details>
            <Link className={styles.link} href={item.configure}>
              <Cable size={15} />
              {t(
                "إعداد / إعادة تفويض / فصل",
                "Configure / reconnect / disconnect"
              )}
            </Link>
            {item.canTest ? (
              <button
                disabled={!manage || !providers || Boolean(busy)}
                onClick={() => test(item.id)}
                type="button"
              >
                <ShieldCheck size={15} />
                {busy === item.id
                  ? t("جارٍ الاختبار…", "Testing…")
                  : t("اختبار قراءة حقيقي", "Test actual read")}
              </button>
            ) : (
              <p className={styles.help}>
                {t(
                  "لا يوجد اختبار آمن منفّذ لهذا الموصل هنا. الإرشادات ليست تكاملاً مثبّتاً.",
                  "No safe probe implemented here. Guidance is not an installed connector."
                )}
              </p>
            )}
          </article>
        ))}
      </div>
      <section className={styles.section}>
        <h2>Integration Discovery</h2>
        <p>
          {t(
            "الكتالوج يعرض مرشحين وروابطهم الرسمية. إضافة موصل جديد تمر بمراجعة الكود والاختبارات والتفويض؛ لا يثبّت هذا النظام كوداً أو يطلب صلاحيات بنفسه.",
            "Catalog entries are discovery candidates with official docs. New connectors require reviewed code, tests and authorization. This system does not self-install code or grant permissions."
          )}
        </p>
        <Link className={styles.link} href="/studio/agent">
          {t("تحضير موجز مهمة للوكيل", "Prepare an agent task brief")}
        </Link>
      </section>
    </main>
  );
}
