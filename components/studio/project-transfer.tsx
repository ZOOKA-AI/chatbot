"use client";

import { Download, FileUp, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import type { LocalProject } from "@/lib/studio";
import {
  createProjectBackup,
  MAX_BACKUP_BYTES,
  MAX_HTML_BYTES,
  MAX_PROJECTS,
  readProjectBackup,
  validateHtmlImport,
} from "@/lib/studio-tools";
import styles from "./studio.module.css";

export function ProjectTransfer({
  projects,
  ready,
  onSave,
  onNotice,
}: {
  projects: LocalProject[];
  ready: boolean;
  onSave: (projects: LocalProject[]) => boolean;
  onNotice: (message: string) => void;
}) {
  const htmlInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const importFile = async (
    file: File | undefined,
    kind: "html" | "backup",
  ) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.size > (kind === "html" ? MAX_HTML_BYTES : MAX_BACKUP_BYTES)) {
        onNotice(
          kind === "html"
            ? "الحد الأقصى لملف HTML هو 1 ميجابايت."
            : "الحد الأقصى للنسخة الاحتياطية هو 5 ميجابايت.",
        );
        return;
      }
      const raw = await file.text();
      let incoming: LocalProject[];
      if (kind === "html") {
        const error = validateHtmlImport(file.name, raw);
        if (error) {
          onNotice(error);
          return;
        }
        incoming = [
          {
            id: crypto.randomUUID(),
            name:
              file.name.replace(/\.html?$/i, "").slice(0, 100) ||
              "مشروع مستورد",
            html: raw,
            updatedAt: new Date().toISOString(),
          },
        ];
      } else {
        incoming = readProjectBackup(raw).map((p) => ({
          ...p,
          id: crypto.randomUUID(),
        }));
        if (!incoming.length) {
          onNotice("النسخة الاحتياطية لا تحتوي مشاريع.");
          return;
        }
        if (
          !window.confirm(
            `استعادة ${incoming.length} مشروع كنسخ جديدة؟ لن تُستبدل مشاريعك الحالية.`,
          )
        )
          return;
      }
      if (projects.length + incoming.length > MAX_PROJECTS) {
        onNotice(
          "الحد الأقصى 100 مشروع محلي. احذف بعض المشاريع بعد تنزيل نسخة احتياطية.",
        );
        return;
      }
      if (onSave([...incoming, ...projects]))
        onNotice(
          `أُضيف ${incoming.length} مشروع محلياً. الكود المستورد لا يُنفّذ على خادم Zooka، وتبقى المعاينة معزولة.`,
        );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "تعذّرت قراءة الملف.");
    } finally {
      setBusy(false);
      if (htmlInput.current) htmlInput.current.value = "";
      if (backupInput.current) backupInput.current.value = "";
    }
  };
  const exportBackup = () => {
    const raw = createProjectBackup(projects);
    if (new Blob([raw]).size > MAX_BACKUP_BYTES) {
      onNotice(
        "مشاريعك أكبر من حد الاستعادة 5 ميجابايت. نزّل HTML لكل مشروع على حدة من المحرر.",
      );
      return;
    }
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zooka-projects-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotice("طُلب تنزيل النسخة. الملف غير مشفّر؛ احفظه في مكان آمن.");
  };
  return (
    <section
      aria-label="استيراد ونسخ المشاريع"
      className={styles.transferPanel}
    >
      <div>
        <strong>عملك معك، أينما ذهبت.</strong>
        <p>
          استورد HTML أو احتفظ بنسخة JSON. لا رفع إلى خادم ولا مزامنة سحابية.
        </p>
      </div>
      <div className={styles.transferActions}>
        <button
          className={styles.secondary}
          disabled={!ready || busy}
          onClick={() => htmlInput.current?.click()}
          type="button"
        >
          <FileUp size={16} /> استيراد HTML
        </button>
        <button
          className={styles.secondary}
          disabled={!ready || busy || !projects.length}
          onClick={exportBackup}
          type="button"
        >
          <Download size={16} /> نسخة احتياطية
        </button>
        <button
          className={styles.secondary}
          disabled={!ready || busy}
          onClick={() => backupInput.current?.click()}
          type="button"
        >
          <ShieldCheck size={16} /> استعادة JSON
        </button>
      </div>
      <input
        accept=".html,.htm,text/html"
        aria-label="ملف HTML للاستيراد"
        hidden
        onChange={(e) => void importFile(e.target.files?.[0], "html")}
        ref={htmlInput}
        type="file"
      />
      <input
        accept=".json,application/json"
        aria-label="ملف النسخة الاحتياطية"
        hidden
        onChange={(e) => void importFile(e.target.files?.[0], "backup")}
        ref={backupInput}
        type="file"
      />
    </section>
  );
}
