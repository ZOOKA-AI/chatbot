"use client";

import { useMemo, useState } from "react";
import {
  Blocks,
  Cable,
  ClipboardList,
  Code2,
  LayoutTemplate,
  Mic,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  INTEGRATION_PROVIDERS,
  PROVIDER_CATEGORIES,
} from "@/lib/integrations/providers";
import {
  additionalRequestedProviders,
  extraAutomationProviders,
  implementedConnectionIds,
  starterTemplates,
  type StudioSection,
} from "@/lib/studio";
import { ProviderIcon } from "./provider-icon";
import styles from "./studio.module.css";

type Tab = "templates" | "integrations" | "tools";

const TABS: readonly { id: Tab; label: string; icon: typeof Blocks }[] = [
  { id: "templates", label: "قوالب", icon: LayoutTemplate },
  { id: "integrations", label: "تكاملات", icon: Cable },
  { id: "tools", label: "أدوات", icon: Wrench },
] as const;

const TOOLS: readonly {
  section: StudioSection;
  title: string;
  description: string;
  icon: typeof Blocks;
}[] = [
  {
    section: "agent",
    title: "مخطط الوكيل",
    description: "حوّل الفكرة إلى طلب واضح بهدف وسياق ومخرج قابل للمراجعة.",
    icon: Blocks,
  },
  {
    section: "tasks",
    title: "لوحة المهام",
    description: "رتّب الخطوات اليدوية وتابع ما اكتمل وما لم يبدأ.",
    icon: ClipboardList,
  },
  {
    section: "code",
    title: "الكود والمعاينة",
    description: "حرّر HTML داخل المتصفح وشاهد النتيجة في معاينة معزولة.",
    icon: Code2,
  },
  {
    section: "media",
    title: "الصوت وتسجيل الشاشة",
    description: "سجّل ملاحظة صوتية أو الشاشة وحوّل الفكرة إلى نص.",
    icon: Mic,
  },
] as const;

/**
 * One searchable catalog for every starting point: templates, integrations and
 * the built-in tools. It replaces hunting through the sidebar for each list.
 */
export function CatalogHub({
  onNavigate,
  onUseTemplate,
}: {
  onNavigate: (section: StudioSection) => void;
  onUseTemplate: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("templates");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const providers = useMemo(
    () => [
      ...INTEGRATION_PROVIDERS,
      ...extraAutomationProviders,
      ...additionalRequestedProviders,
    ],
    [],
  );

  const q = query.trim().toLocaleLowerCase();

  const templates = starterTemplates.filter((t) =>
    `${t.title} ${t.category} ${t.description}`
      .toLocaleLowerCase()
      .includes(q),
  );

  const filteredProviders = providers.filter(
    (p) =>
      (category === "all" || category === p.category) &&
      `${p.name} ${p.nameAr}`.toLocaleLowerCase().includes(q),
  );

  const tools = TOOLS.filter((t) =>
    `${t.title} ${t.description}`.toLocaleLowerCase().includes(q),
  );

  return (
    <>
      <div className={styles.toolbar}>
        <SearchField value={query} onChange={setQuery} />
        {tab === "integrations" ? (
          <label className={styles.selectLabel}>
            التصنيف
            <select
              onChange={(e) => setCategory(e.target.value)}
              value={category}
            >
              <option value="all">كل التصنيفات</option>
              {Object.entries(PROVIDER_CATEGORIES).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.ar}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div aria-label="أقسام الكتالوج" className={styles.catalogTabs} role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => {
          const count =
            id === "templates"
              ? starterTemplates.length
              : id === "integrations"
                ? providers.length
                : TOOLS.length;
          return (
            <button
              aria-selected={tab === id}
              className={`${styles.catalogTab} ${tab === id ? styles.catalogTabActive : ""}`}
              key={id}
              onClick={() => setTab(id)}
              role="tab"
              type="button"
            >
              <Icon size={16} /> {label}
              <small>{count}</small>
            </button>
          );
        })}
      </div>

      {tab === "templates" ? (
        <div className={styles.catalogGrid}>
          {templates.map((t) => (
            <article className={styles.catalogCard} key={t.id}>
              <span
                className={styles.catalogBadge}
                style={{ background: t.color }}
              >
                <LayoutTemplate size={14} />
              </span>
              <h3>{t.title}</h3>
              <p className={styles.catalogMeta}>{t.category} · HTML + CSS</p>
              <p>{t.description}</p>
              <button
                className={styles.secondary}
                onClick={() => onUseTemplate(t.id)}
                type="button"
              >
                استخدم القالب
              </button>
            </article>
          ))}
          {templates.length === 0 ? (
            <p className={styles.catalogEmpty}>لا يوجد قالب مطابق للبحث.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "integrations" ? (
        <div className={styles.catalogGrid}>
          {filteredProviders.map((p) => {
            const implemented = implementedConnectionIds.has(p.id);
            return (
              <article className={styles.catalogCard} key={p.id}>
                <span className={styles.catalogBadge}>
                  <ProviderIcon id={p.id} />
                </span>
                <h3>{p.nameAr}</h3>
                <p className={styles.catalogMeta}>
                  {PROVIDER_CATEGORIES[p.category]?.ar ?? p.category}
                </p>
                <p className={styles.catalogStatus}>
                  {implemented ? (
                    <>
                      <ShieldCheck size={14} /> إعداد ربط منفّذ
                    </>
                  ) : (
                    <>قيد التجهيز</>
                  )}
                </p>
                <button
                  className={styles.secondary}
                  onClick={() => onNavigate("integrations")}
                  type="button"
                >
                  التفاصيل
                </button>
              </article>
            );
          })}
          {filteredProviders.length === 0 ? (
            <p className={styles.catalogEmpty}>لا يوجد تكامل مطابق للبحث.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "tools" ? (
        <div className={styles.catalogGrid}>
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <article className={styles.catalogCard} key={t.section}>
                <span className={styles.catalogBadge}>
                  <Icon size={16} />
                </span>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <button
                  className={styles.secondary}
                  onClick={() => onNavigate(t.section)}
                  type="button"
                >
                  افتح
                </button>
              </article>
            );
          })}
          {tools.length === 0 ? (
            <p className={styles.catalogEmpty}>لا توجد أداة مطابقة للبحث.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.search}>
      <Search size={16} />
      <input
        onChange={(e) => onChange(e.target.value)}
        placeholder="ابحث في الكتالوج…"
        type="search"
        value={value}
      />
    </label>
  );
}
