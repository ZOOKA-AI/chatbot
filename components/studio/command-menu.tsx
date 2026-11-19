"use client";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type StudioSection, studioSections } from "@/lib/studio";
import styles from "./studio.module.css";
export function CommandMenu({
  onNavigate,
}: {
  onNavigate: (id: StudioSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      ref.current?.showModal();
      input.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const matches = studioSections.filter((s) =>
    `${s.id} ${s.label}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const navigate = (id: StudioSection) => {
    setOpen(false);
    setQuery("");
    onNavigate(id);
  };
  return (
    <>
      <button
        aria-label="بحث وتنقل سريع"
        className={styles.iconButton}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search size={20} />
      </button>
      {open && (
        <dialog
          aria-labelledby="command-title"
          className={styles.modalBackdrop}
          onClose={() => setOpen(false)}
          ref={ref}
        >
          <section className={styles.actionSheet}>
            <div className={styles.sectionHeading}>
              <h2 id="command-title">اذهب مباشرة إلى…</h2>
              <button
                aria-label="إغلاق البحث"
                className={styles.iconButton}
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <input
              aria-label="ابحث عن قسم"
              className={styles.commandSearch}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) navigate(matches[0].id);
              }}
              placeholder="المهام، الصوت، التسجيل… Ctrl / ⌘ K"
              ref={input}
              type="search"
              value={query}
            />
            <div className={styles.commandResults}>
              {matches.map((s) => (
                <button
                  className={styles.sheetAction}
                  key={s.id}
                  onClick={() => navigate(s.id)}
                  type="button"
                >
                  {s.label}
                </button>
              ))}
              {!matches.length && <p>لا توجد نتائج. جرّب كلمة أخرى.</p>}
            </div>
          </section>
        </dialog>
      )}
    </>
  );
}
