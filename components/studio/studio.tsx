"use client";

import {
  ArrowUpLeft,
  ArrowUpRight,
  Blocks,
  Cable,
  Check,
  CheckCheck,
  ChevronLeft,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe2,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Monitor,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  INTEGRATION_PROVIDERS,
  PROVIDER_CATEGORIES,
} from "@/lib/integrations/providers";
import {
  additionalRequestedProviders,
  extraAutomationProviders,
  implementedConnectionIds,
  type LocalProject,
  PROJECT_STORAGE_KEY,
  parseLocalProjects,
  type StudioSection,
  starterTemplates,
  studioSections,
} from "@/lib/studio";
import { ProviderIcon } from "./provider-icon";
import styles from "./studio.module.css";

const sectionIcons = [
  LayoutDashboard,
  FolderOpen,
  LayoutTemplate,
  Code2,
  Cable,
  Globe2,
  UserRound,
];
const sectionHref = (id: StudioSection) =>
  id === "home" ? "/studio" : `/studio/${id}`;
const templateIds = new Set<string>(starterTemplates.map((t) => t.id));

export function Studio({ section }: { section: StudioSection }) {
  const router = useRouter();
  const createDialog = useRef<HTMLDialogElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  useEffect(() => {
    if (actionsOpen) createDialog.current?.showModal();
  }, [actionsOpen]);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState<string>(starterTemplates[0].html);
  const [previewCode, setPreviewCode] = useState<string>(
    starterTemplates[0].html,
  );
  const [projectName, setProjectName] = useState<string>(
    starterTemplates[0].title,
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [editorTab, setEditorTab] = useState<"preview" | "code">("preview");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    try {
      setProjects(
        parseLocalProjects(localStorage.getItem(PROJECT_STORAGE_KEY)),
      );
    } catch {
      setNotice("التخزين المحلي غير متاح. يمكنك تنزيل الكود لحفظه.");
    }
    setLoaded(true);
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get("template");
    const projectId = params.get("project");
    const template = starterTemplates.find((t) => t.id === templateId);
    if (template) {
      setCode(template.html);
      setPreviewCode(template.html);
      setProjectName(template.title);
    }
    if (projectId) {
      try {
        const saved = parseLocalProjects(
          localStorage.getItem(PROJECT_STORAGE_KEY),
        ).find((p) => p.id === projectId);
        if (saved) {
          setCode(saved.html);
          setPreviewCode(saved.html);
          setProjectName(saved.name);
          setActiveProjectId(saved.id);
        } else setNotice("لم يُعثر على هذا المشروع في هذا المتصفح.");
      } catch {
        setNotice("تعذّر فتح المشروع المحلي.");
      }
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!actionsOpen && !menuOpen && !inspectorOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsOpen(false);
        setMenuOpen(false);
        setInspectorOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [actionsOpen, menuOpen, inspectorOpen]);

  const navigate = (id: StudioSection) => {
    if (
      dirty &&
      !window.confirm("لديك تعديلات غير محفوظة. هل تريد مغادرة المحرر؟")
    )
      return;
    setMenuOpen(false);
    router.push(sectionHref(id));
  };
  const persist = (next: LocalProject[]) => {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
      setProjects(next);
      return true;
    } catch {
      setNotice(
        "تعذّر الحفظ: قد تكون مساحة المتصفح ممتلئة. نزّل HTML لحماية عملك.",
      );
      return false;
    }
  };
  const saveProject = () => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      setNotice("أدخل اسم المشروع أولاً.");
      return;
    }
    const project = {
      id: activeProjectId ?? crypto.randomUUID(),
      name: trimmedName,
      html: code,
      updatedAt: new Date().toISOString(),
    };
    if (persist([project, ...projects.filter((p) => p.id !== project.id)])) {
      setActiveProjectId(project.id);
      setDirty(false);
      setNotice("حُفظ المشروع على هذا المتصفح فقط. نزّل نسخة احتياطية من الكود.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([code], { type: "text/html;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zooka-site.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("تم طلب تنزيل ملف HTML.");
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice("نُسخ الكود.");
    } catch {
      setNotice("تعذّر النسخ. حدّد النص من تبويب الكود أو نزّل الملف.");
    }
  };
  const openTemplate = (id: string) => {
    if (!templateIds.has(id)) return;
    if (
      dirty &&
      !window.confirm("فتح القالب سيستبدل تعديلاتك غير المحفوظة. متابعة؟")
    )
      return;
    window.location.assign(`/studio/code?template=${encodeURIComponent(id)}`);
  };
  const title = studioSections.find((s) => s.id === section)?.label;
  const filteredProjects = projects.filter((p) =>
    p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return (
    <div className={styles.studio} dir="rtl" lang="ar">
      <a className={styles.skip} href="#studio-main">
        تخطَّ إلى المحتوى
      </a>
      <aside
        aria-label="التنقل الرئيسي"
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Sparkles size={22} />
          </span>
          <span>
            ZOOKA<span className={styles.brandSub}>STUDIO</span>
          </span>
          <button
            aria-label="إغلاق القائمة"
            className={`${styles.iconButton} ${styles.mobileOnly}`}
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <button
          className={styles.newTask}
          onClick={() => setActionsOpen(true)}
          type="button"
        >
          <Plus size={18} /> إنشاء جديد <span>⌘</span>
        </button>
        <p className={styles.navLabel}>مساحتك الإبداعية</p>
        <nav>
          {studioSections.map((s, i) => {
            const Icon = sectionIcons[i];
            return (
              <button
                aria-current={section === s.id ? "page" : undefined}
                className={`${styles.navItem} ${section === s.id ? styles.navActive : ""}`}
                key={s.id}
                onClick={() => navigate(s.id)}
                type="button"
              >
                <Icon size={19} />
                <span>{s.label}</span>
                {s.id === "integrations" && <small>40</small>}
              </button>
            );
          })}
        </nav>
        <div className={styles.sideHint}>
          <ShieldCheck size={20} />
          <strong>أنت تتحكم بما يُنفّذ</strong>
          <p>راجع الكود والصلاحيات قبل الربط أو النشر.</p>
        </div>
        <div className={styles.sidebarBottom}>
          <Link className={styles.profileLink} href="/settings/account">
            <span className={styles.avatar}>Z</span>
            <span>
              حسابك في Zooka<small>إدارة الحساب والإعدادات</small>
            </span>
            <Settings2 size={16} />
          </Link>
          <Link className={styles.backLink} href="/">
            العودة إلى المحادثة <ArrowUpLeft size={15} />
          </Link>
        </div>
      </aside>
      {(menuOpen || inspectorOpen) && (
        <button
          aria-label="إغلاق اللوحة"
          className={styles.scrim}
          onClick={() => {
            setMenuOpen(false);
            setInspectorOpen(false);
          }}
          type="button"
        />
      )}
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <button
              aria-expanded={menuOpen}
              aria-label="فتح القائمة"
              className={`${styles.iconButton} ${styles.mobileOnly}`}
              onClick={() => setMenuOpen(true)}
              type="button"
            >
              <Menu size={21} />
            </button>
            <span className={styles.breadcrumb}>
              Zooka <ChevronLeft size={14} />
            </span>
            <strong>{title}</strong>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.reviewBadge}>
              <span /> نسخة المراجعة
            </span>
            <button
              aria-expanded={inspectorOpen}
              aria-label="تفاصيل النسخة"
              className={styles.iconButton}
              onClick={() => setInspectorOpen(!inspectorOpen)}
              type="button"
            >
              <PanelLeftClose size={20} />
            </button>
            <button
              aria-label="الملف الشخصي"
              className={styles.avatarButton}
              onClick={() => navigate("profile")}
              type="button"
            >
              Z
            </button>
          </div>
        </header>
        <main className={styles.main} id="studio-main">
          {notice && (
            <output className={styles.notice}>
              {notice}
              <button
                aria-label="إغلاق التنبيه"
                className={styles.iconButton}
                onClick={() => setNotice("")}
                type="button"
              >
                <X size={16} />
              </button>
            </output>
          )}
          {section === "home" && (
            <>
              <div className={styles.welcome}>
                <span className={styles.eyebrow}>
                  <Sparkles size={16} /> من الفكرة إلى أول نسخة
                </span>
                <h1>
                  مساحة واحدة.
                  <br />
                  <span>لاحتمالات أكبر.</span>
                </h1>
                <p>خطّط، صمّم، واكتب الكود. كل مشروع يبدأ بخطوة صغيرة.</p>
              </div>
              <div className={styles.commandCard}>
                <div className={styles.commandHeading}>
                  <span className={styles.logo}>
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <strong>ماذا تريد أن تبني اليوم؟</strong>
                    <p>ابدأ بقالب حقيقي وعدّله في محرر الكود.</p>
                  </div>
                </div>
                <div className={styles.commandButtons}>
                  <button
                    className={styles.primary}
                    onClick={() => navigate("templates")}
                    type="button"
                  >
                    ابنِ موقعك الأول <ArrowUpLeft size={18} />
                  </button>
                  <Link className={styles.secondary} href="/?mode=work">
                    افتح مساعد العمل <ExternalLink size={16} />
                  </Link>
                </div>
                <div className={styles.commandFooter}>
                  <span>
                    <Code2 size={14} /> كود قابل للتنزيل
                  </span>
                  <span>
                    <ShieldCheck size={14} /> معاينة معزولة
                  </span>
                  <span>لا نشر تلقائي</span>
                </div>
              </div>
              <div className={styles.quickGrid}>
                {[
                  {
                    id: "projects" as const,
                    icon: FolderOpen,
                    title: "مشاريعك",
                    desc: "اجمع أفكارك ونسخك المحلية",
                    color: "mint",
                  },
                  {
                    id: "templates" as const,
                    icon: LayoutTemplate,
                    title: "قوالب جاهزة",
                    desc: "نقطة بداية أسرع لموقعك",
                    color: "lilac",
                  },
                  {
                    id: "integrations" as const,
                    icon: Workflow,
                    title: "اربط أدواتك",
                    desc: "اعرف المتاح ومتطلبات الربط",
                    color: "peach",
                  },
                ].map((a) => (
                  <button
                    className={styles.quickCard}
                    key={a.id}
                    onClick={() => navigate(a.id)}
                    type="button"
                  >
                    <span className={`${styles.tileIcon} ${styles[a.color]}`}>
                      <a.icon size={23} />
                    </span>
                    <strong>{a.title}</strong>
                    <span>{a.desc}</span>
                    <ArrowUpLeft className={styles.cardArrow} size={18} />
                  </button>
                ))}
              </div>
              <div className={styles.sectionHeading}>
                <h2>من أين تبدأ؟</h2>
                <button
                  className={styles.textButton}
                  onClick={() => navigate("templates")}
                  type="button"
                >
                  كل القوالب <ChevronLeft size={16} />
                </button>
              </div>
              <TemplateGrid onOpen={openTemplate} />
              <div className={styles.releaseNote}>
                <Blocks size={22} />
                <div>
                  <strong>مصممة للعمل الحقيقي، لا للوعود</strong>
                  <p>
                    هذه نسخة أولى للمراجعة. المشاريع تُحفظ محلياً؛ الذكاء
                    الاصطناعي والربط الفعلي متاحان عبر صفحات التطبيق الحالية.
                  </p>
                </div>
                <span>01</span>
              </div>
            </>
          )}
          {section === "projects" && (
            <>
              <PageHeading
                eyebrow="كل فكرة تستحق مساحة"
                title="مشاريعك"
                description="ملفات HTML محفوظة في هذا المتصفح فقط. لا مزامنة سحابية في هذه النسخة."
              />
              <div className={styles.toolbar}>
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="ابحث عن مشروع…"
                />
                <button
                  className={styles.primary}
                  onClick={() => navigate("templates")}
                  type="button"
                >
                  <Plus size={17} /> مشروع جديد
                </button>
              </div>
              {!loaded ? (
                <p>جارٍ قراءة المشاريع المحلية…</p>
              ) : filteredProjects.length === 0 ? (
                <div className={styles.empty}>
                  <FolderOpen size={40} />
                  <h2>{query ? "لا توجد نتائج" : "هنا تبدأ حكاية مشروعك"}</h2>
                  <p>
                    {query
                      ? "جرّب اسماً آخر."
                      : "اختر قالباً، عدّل الكود ثم احفظ مشروعك ليظهر هنا."}
                  </p>
                  <button
                    className={styles.secondary}
                    onClick={() => navigate("templates")}
                    type="button"
                  >
                    استكشف القوالب <ArrowUpLeft size={16} />
                  </button>
                </div>
              ) : (
                <div className={styles.quickGrid}>
                  {filteredProjects.map((p) => (
                    <article className={styles.projectCard} key={p.id}>
                      <span className={`${styles.tileIcon} ${styles.mint}`}>
                        <Code2 size={22} />
                      </span>
                      <h2>{p.name}</h2>
                      <p>
                        آخر حفظ: {new Date(p.updatedAt).toLocaleString("ar")}
                      </p>
                      <div className={styles.row}>
                        <a
                          className={styles.secondary}
                          href={`/studio/code?project=${encodeURIComponent(p.id)}`}
                        >
                          فتح المحرر
                        </a>
                        <button
                          aria-label={`حذف ${p.name}`}
                          className={styles.iconButton}
                          onClick={() => {
                            if (
                              window.confirm(
                                `حذف «${p.name}» من هذا المتصفح؟ لا يمكن التراجع.`,
                              )
                            )
                              persist(
                                projects.filter((item) => item.id !== p.id),
                              );
                          }}
                          type="button"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {section === "templates" && (
            <>
              <PageHeading
                eyebrow="لا تبدأ من الصفر"
                title="قوالب تصنع انطلاقتك"
                description="ثلاثة قوالب HTML مستقلة. افتح القالب، غيّر النصوص والألوان، ثم نزّل الكود."
              />
              <TemplateGrid onOpen={openTemplate} />
              <div className={styles.releaseNote}>
                <ShieldCheck size={24} />
                <p>
                  القوالب تتضمن بيانات توضيحية وعناوين تواصل نموذجية. استبدلها
                  قبل النشر؛ لا تتصل بنماذج دفع أو خدمات خارجية.
                </p>
              </div>
            </>
          )}
          {section === "code" && (
            <>
              <PageHeading
                eyebrow="مساحة البناء"
                title="الكود، ثم النتيجة"
                description="محرر HTML حقيقي ومعاينة معزولة. لا تُنفَّذ السكربتات ولا تُرسل النماذج ولا تُحمّل موارد خارجية في المعاينة."
              />
              <div className={styles.editorToolbar}>
                <input
                  aria-label="اسم المشروع"
                  className={styles.nameInput}
                  maxLength={100}
                  onChange={(e) => {
                    setProjectName(e.target.value);
                    setDirty(true);
                  }}
                  value={projectName}
                />
                <div className={styles.row}>
                  <button
                    className={styles.secondary}
                    onClick={copyCode}
                    type="button"
                  >
                    <Copy size={16} /> نسخ
                  </button>
                  <button
                    className={styles.secondary}
                    onClick={download}
                    type="button"
                  >
                    <Download size={16} /> HTML
                  </button>
                  <button
                    className={styles.primary}
                    disabled={!loaded}
                    onClick={saveProject}
                    type="button"
                  >
                    <Check size={16} /> حفظ محلي
                  </button>
                </div>
              </div>
              <div className={styles.editor}>
                <div className={styles.editorTop}>
                  <div className={styles.segment}>
                    <button
                      disabled={!loaded}
                      aria-pressed={editorTab === "preview"}
                      onClick={() => setEditorTab("preview")}
                      type="button"
                    >
                      <Globe2 size={16} /> المعاينة
                    </button>
                    <button
                      disabled={!loaded}
                      aria-pressed={editorTab === "code"}
                      onClick={() => setEditorTab("code")}
                      type="button"
                    >
                      <Code2 size={16} /> الكود
                    </button>
                  </div>
                  <div className={styles.row}>
                    <button
                      aria-label="عرض سطح المكتب"
                      aria-pressed={viewport === "desktop"}
                      className={styles.iconButton}
                      onClick={() => setViewport("desktop")}
                      type="button"
                    >
                      <Monitor size={18} />
                    </button>
                    <button
                      aria-label="عرض الجوال"
                      aria-pressed={viewport === "mobile"}
                      className={styles.iconButton}
                      onClick={() => setViewport("mobile")}
                      type="button"
                    >
                      <Smartphone size={18} />
                    </button>
                  </div>
                </div>
                {editorTab === "code" ? (
                  <textarea
                    aria-label="كود HTML"
                    className={styles.codeInput}
                    dir="ltr"
                    onChange={(e) => {
                      setCode(e.target.value);
                      setDirty(true);
                    }}
                    spellCheck={false}
                    value={code}
                  />
                ) : (
                  <div
                    className={`${styles.previewWrap} ${viewport === "mobile" ? styles.mobilePreview : ""}`}
                  >
                    <iframe
                      className={styles.sitePreview}
                      referrerPolicy="no-referrer"
                      sandbox=""
                      srcDoc={isolatedHtml(previewCode)}
                      title="معاينة الموقع المعزولة"
                    />
                  </div>
                )}
                <div className={styles.editorFooter}>
                  <span>
                    {dirty ? "تعديلات غير محفوظة" : "جاهز للتحرير"} · index.html
                  </span>
                  <button
                    className={styles.textButton}
                    onClick={() => {
                      setPreviewCode(code);
                      setEditorTab("preview");
                    }}
                    type="button"
                  >
                    تحديث المعاينة <ArrowUpLeft size={16} />
                  </button>
                </div>
              </div>
              <p className={styles.muted}>
                احفظ أو نزّل تعديلاتك قبل المغادرة. المعاينة ليست متصفحاً بعيداً
                ولا تستضيف موقعك على الإنترنت.
              </p>
            </>
          )}
          {section === "integrations" && (
            <>
              <PageHeading
                eyebrow="أدواتك، في مكان واحد"
                title="مركز التكاملات"
                description="ابحث عن أدواتك، وافتح إعداد الربط المتاح. لا يعني ظهور أيقونة أن الخدمة متصلة أو أن الوكيل يستطيع تنفيذ كل عملياتها."
              />
              <div className={styles.integrationBanner}>
                <ShieldCheck size={28} />
                <div>
                  <strong>حسابك. صلاحياتك. قرارك.</strong>
                  <p>
                    الربط يتم من إعدادات مساحة العمل بعد تسجيل الدخول. لا تُدخل
                    توكنات أو أسرار في نسخة المراجعة.
                  </p>
                </div>
                <Link
                  className={styles.secondary}
                  href="/settings/integrations"
                >
                  إدارة الربط <ExternalLink size={16} />
                </Link>
              </div>
              <div className={styles.toolbar}>
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="ابحث عن n8n، واتساب، GitHub…"
                />
                <label className={styles.selectLabel}>
                  التصنيف
                  <select
                    onChange={(e) => setCategory(e.target.value)}
                    value={category}
                  >
                    <option value="all">كل التكاملات</option>
                    {Object.entries(PROVIDER_CATEGORIES).map(([id, c]) => (
                      <option key={id} value={id}>
                        {c.ar}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.integrationGrid}>
                {[
                  ...INTEGRATION_PROVIDERS,
                  ...extraAutomationProviders,
                  ...additionalRequestedProviders,
                ]
                  .filter(
                    (p) =>
                      (category === "all" || category === p.category) &&
                      `${p.name} ${p.nameAr}`
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()),
                  )
                  .map((p) => {
                    const implemented = implementedConnectionIds.has(p.id);
                    return (
                      <article className={styles.integrationCard} key={p.id}>
                        <div className={styles.integrationHeader}>
                          <span
                            aria-hidden="true"
                            className={styles.providerIcon}
                          >
                            <ProviderIcon id={p.id} />
                          </span>
                          <span
                            className={
                              implemented
                                ? styles.availableBadge
                                : styles.plannedBadge
                            }
                          >
                            {implemented ? "مسار ربط متاح" : "غير مفعّل"}
                          </span>
                        </div>
                        <h2>{p.name}</h2>
                        <p>{p.descriptionAr}</p>
                        <span className={styles.providerCategory}>
                          {PROVIDER_CATEGORIES[p.category]?.ar}
                        </span>
                        {implemented ? (
                          <Link
                            className={styles.integrationAction}
                            href="/settings/integrations"
                          >
                            فتح إعداد الربط <ArrowUpLeft size={17} />
                          </Link>
                        ) : (
                          <button
                            className={styles.integrationAction}
                            onClick={() =>
                              setNotice(
                                `${p.nameAr}: لا يوجد موصل منفّذ في هذه النسخة. يلزم تطبيق رسمي لدى المزوّد وصلاحياته، وربط آمن من الخادم واختبارات قبل التفعيل. لن يؤدي حفظ توكن وحده إلى تفعيل العمليات.`,
                              )
                            }
                            type="button"
                          >
                            متطلبات التفعيل <ChevronLeft size={17} />
                          </button>
                        )}
                      </article>
                    );
                  })}
              </div>
              {![
                ...INTEGRATION_PROVIDERS,
                ...extraAutomationProviders,
                ...additionalRequestedProviders,
              ].some(
                (p) =>
                  (category === "all" || category === p.category) &&
                  `${p.name} ${p.nameAr}`
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()),
              ) && (
                <div className={styles.empty}>
                  <Search size={30} />
                  <h2>لا توجد نتائج</h2>
                  <p>جرّب كلمة مختلفة أو غيّر التصنيف.</p>
                </div>
              )}
            </>
          )}
          {section === "browser" && (
            <>
              <PageHeading
                eyebrow="حدود واضحة، تجربة آمنة"
                title="المتصفح"
                description="المعاينة المحلية متاحة الآن. جلسات المتصفح البعيد التفاعلية تحتاج خدمة تشغيل منفصلة ولم تُربط في هذه النسخة."
              />
              <div className={styles.browserFrame}>
                <div className={styles.browserBar}>
                  <span className={styles.dots}>● ● ●</span>
                  <span>
                    <ShieldCheck size={14} /> لا توجد جلسة متصلة
                  </span>
                  <Globe2 size={16} />
                </div>
                <div className={styles.empty}>
                  <span className={`${styles.tileIcon} ${styles.lilac}`}>
                    <Globe2 size={32} />
                  </span>
                  <h2>متصفح حقيقي، عندما يكون متصلاً فعلاً.</h2>
                  <p>
                    لن نعرض لقطات تمثيلية كجلسة حية. المعاينة الحالية تعرض HTML
                    فقط ولا تتصفح الإنترنت.
                  </p>
                  <button
                    className={styles.primary}
                    onClick={() => navigate("code")}
                    type="button"
                  >
                    فتح معاينة الموقع <ArrowUpLeft size={17} />
                  </button>
                </div>
              </div>
              <div className={styles.checklist}>
                <h2>ما يلزم لتفعيل الجلسات البعيدة</h2>
                {[
                  "خدمة متصفح معزولة لكل مستخدم مع وقت انتهاء محدد.",
                  "بث حي وآلية تحكم، مع حماية الشبكة وبيانات تسجيل الدخول.",
                  "موافقة قبل إرسال نماذج أو تنفيذ عمليات شراء أو نشر.",
                  "سجل إجراءات وحدود استخدام وفصل تام بين حسابات المستخدمين.",
                ].map((item) => (
                  <p key={item}>
                    <ShieldCheck size={18} />
                    {item}
                  </p>
                ))}
              </div>
            </>
          )}
          {section === "profile" && (
            <>
              <PageHeading
                eyebrow="هويتك ومساحتك"
                title="الملف الشخصي"
                description="هذه صفحة مراجعة عامة؛ لا تعرض بيانات حسابك الحقيقي ولا تحمل أسرار مساحة العمل."
              />
              <div className={styles.profileCard}>
                <span className={styles.largeAvatar}>Z</span>
                <div>
                  <span className={styles.eyebrow}>ZOOKA CREATOR</span>
                  <h2>مساحتك، بطريقتك.</h2>
                  <p>
                    إدارة الحساب والفريق والاشتراك من الإعدادات الآمنة الحالية.
                  </p>
                </div>
              </div>
              <div className={styles.settingsGrid}>
                {[
                  {
                    title: "الحساب والخصوصية",
                    desc: "بيانات الحساب وخيارات الخصوصية",
                    href: "/settings/account",
                    icon: UserRound,
                  },
                  {
                    title: "مساحة العمل والفريق",
                    desc: "إعدادات المساحة وإدارة الأعضاء",
                    href: "/workspace",
                    icon: Blocks,
                  },
                  {
                    title: "الباقة والاستخدام",
                    desc: "الاشتراك وحدود الاستخدام",
                    href: "/workspace/billing",
                    icon: CheckCheck,
                  },
                  {
                    title: "التكاملات والصلاحيات",
                    desc: "إدارة الاتصالات من حسابك الفعلي",
                    href: "/settings/integrations",
                    icon: Cable,
                  },
                ].map((s) => (
                  <Link
                    className={styles.settingCard}
                    href={s.href}
                    key={s.href}
                  >
                    <s.icon size={24} />
                    <div>
                      <strong>{s.title}</strong>
                      <p>{s.desc}</p>
                    </div>
                    <ArrowUpLeft size={18} />
                  </Link>
                ))}
              </div>
              <div className={styles.releaseNote}>
                <ShieldCheck size={22} />
                <p>
                  ستحتاج تسجيل الدخول لفتح الإعدادات. المشاريع التجريبية تبقى
                  على هذا المتصفح، ولا تشاركها نسخة المراجعة مع أي حساب آخر.
                </p>
              </div>
            </>
          )}
        </main>
        <footer className={styles.footer}>
          <span>ZOOKA STUDIO / REVIEW 01</span>
          <span>مساحة للإبداع، بحدود واضحة.</span>
        </footer>
      </div>
      {inspectorOpen && (
        <aside aria-label="تفاصيل النسخة" className={styles.inspector}>
          <div className={styles.sectionHeading}>
            <h2>تفاصيل النسخة</h2>
            <button
              aria-label="إغلاق التفاصيل"
              className={styles.iconButton}
              onClick={() => setInspectorOpen(false)}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
          <span className={`${styles.tileIcon} ${styles.mint}`}>
            <Sparkles size={24} />
          </span>
          <h3>تجربة قبل الإطلاق</h3>
          <p>نسخة مستقلة للمراجعة، لا تستبدل المحادثة الحالية.</p>
          <hr />
          <h3>متاح للتجربة</h3>
          {[
            "قوالب HTML قابلة للتعديل",
            "معاينة معزولة وجوال",
            "حفظ المشاريع محلياً وتنزيلها",
            "بحث وتصنيف التكاملات",
          ].map((s) => (
            <p className={styles.row} key={s}>
              <Check size={16} />
              {s}
            </p>
          ))}
          <hr />
          <h3>لم يُفعّل بعد</h3>
          <p>
            المتصفح البعيد، النشر الآلي، موصلات التواصل الاجتماعي ومزامنة
            المشاريع السحابية.
          </p>
          <Link className={styles.secondary} href="/settings/integrations">
            الإعدادات الحقيقية <ExternalLink size={16} />
          </Link>
        </aside>
      )}
      {actionsOpen && (
        <dialog
          ref={createDialog}
          className={styles.modalBackdrop}
          onClose={() => setActionsOpen(false)}
          aria-labelledby="create-title"
        >
          <section className={styles.actionSheet}>
            <div className={styles.sectionHeading}>
              <h2 id="create-title">ماذا تريد أن تبدأ؟</h2>
              <button
                aria-label="إغلاق"
                className={styles.iconButton}
                onClick={() => setActionsOpen(false)}
                type="button"
              >
                <X size={22} />
              </button>
            </div>
            <p className={styles.muted}>خطوتك التالية، بدون تعقيد.</p>
            {[
              {
                id: "templates" as const,
                icon: LayoutTemplate,
                title: "موقع من قالب",
                desc: "اختر قالباً وعدّل كوده فوراً",
              },
              {
                id: "code" as const,
                icon: Code2,
                title: "تحرير كود ومعاينته",
                desc: "HTML قابل للتحرير والتنزيل",
              },
              {
                id: "integrations" as const,
                icon: Cable,
                title: "ربط أداة",
                desc: "استكشف الأدوات ومسارات الربط",
              },
            ].map((a) => (
              <button
                className={styles.sheetAction}
                key={a.id}
                onClick={() => {
                  setActionsOpen(false);
                  navigate(a.id);
                }}
                type="button"
              >
                <a.icon size={25} />
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.desc}</small>
                </span>
                <ArrowUpLeft size={19} />
              </button>
            ))}
            <Link className={styles.sheetAction} href="/">
              <Sparkles size={25} />
              <span>
                <strong>محادثة جديدة</strong>
                <small>الانتقال إلى تطبيق المحادثة الحالي</small>
              </span>
              <ArrowUpRight size={19} />
            </Link>
          </section>
        </dialog>
      )}
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className={styles.pageHeading}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className={styles.search}>
      <Search size={18} />
      <input
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}
function TemplateGrid({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className={styles.templateGrid}>
      {starterTemplates.map((template, index) => (
        <button
          className={styles.templateCard}
          key={template.id}
          onClick={() => onOpen(template.id)}
          type="button"
        >
          <div
            className={styles.templateArtwork}
            style={{ background: template.color }}
          >
            <span>0{index + 1} / ZOOKA TEMPLATE</span>
            <strong>
              {
                [
                  "فكرتك،\nبصوت أوضح.",
                  "أعمال تتحدث\nعن نفسها.",
                  "انطلق نحو\nشيء أكبر.",
                ][index]
              }
            </strong>
            <div className={styles.artworkLines}>
              <i />
              <i />
              <i />
            </div>
            <span className={styles.artworkArrow}>
              <ArrowUpLeft size={24} />
            </span>
          </div>
          <div className={styles.templateInfo}>
            <span>{template.category} / HTML + CSS</span>
            <h3>{template.title}</h3>
            <p>{template.description}</p>
            <strong>
              استخدم القالب <ArrowUpLeft size={16} />
            </strong>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Sandbox denies scripts/forms/popups; CSP additionally prevents network exfiltration. */
function isolatedHtml(html: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">${html.replace(/<!doctype[^>]*>/gi, "")}`;
}
