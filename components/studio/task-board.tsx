"use client";

import {
  CheckCheck,
  ClipboardList,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type LocalTask,
  parseLocalTasks,
  TASK_STORAGE_KEY,
  type TaskStage,
  taskStages,
} from "@/lib/studio-tools";
import styles from "./studio.module.css";

export function TaskBoard() {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    try {
      setTasks(parseLocalTasks(localStorage.getItem(TASK_STORAGE_KEY)));
    } catch {
      setMessage("التخزين المحلي غير متاح. لن تُحفظ المهام.");
    }
    setReady(true);
  }, []);
  const save = (next: LocalTask[]) => {
    try {
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(next));
      setTasks(next);
      return true;
    } catch {
      setMessage(
        "تعذّر حفظ المهام. لم تُغيَّر القائمة؛ قد تكون مساحة التخزين ممتلئة.",
      );
      return false;
    }
  };
  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setMessage("اكتب عنوان المهمة.");
      return;
    }
    if (tasks.length >= 200) {
      setMessage("الحد الأقصى 200 مهمة محلية.");
      return;
    }
    if (
      save([
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          priority,
          dueDate,
          stage: "todo",
          createdAt: new Date().toISOString(),
        },
        ...tasks,
      ])
    ) {
      setTitle("");
      setDueDate("");
      setMessage("أُضيفت المهمة محلياً. لا تُنفّذ تلقائياً ولا ترسل تذكيراً.");
    }
  };
  const move = (id: string, stage: TaskStage) => {
    if (save(tasks.map((t) => (t.id === id ? { ...t, stage } : t))))
      setMessage("حُدّثت حالة المهمة.");
  };
  const download = () => {
    const text = [
      "# مهامي في Zooka",
      "",
      ...tasks.map(
        (t) =>
          `- [${t.stage === "done" ? "x" : " "}] ${t.title.replace(/[\r\n]/g, " ")} — ${taskStages.find((s) => s.id === t.stage)?.label}${t.priority === "high" ? " / أولوية عالية" : ""}${t.dueDate ? ` / ${t.dueDate}` : ""}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zooka-tasks.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("طُلب تنزيل قائمة المهام بصيغة Markdown.");
  };
  const visible = tasks.filter((t) =>
    t.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <header className={styles.pageHeading}>
        <span className={styles.eyebrow}>
          <ClipboardList size={16} /> من الفكرة إلى الإنجاز
        </span>
        <h1>لوحة المهام</h1>
        <p>
          نظّم عملك بثلاث حالات وأولويات وتاريخ مستهدف. هذه قائمة يدوية محفوظة
          على هذا المتصفح، وليست وكيل تنفيذ أو نظام تذكير.
        </p>
      </header>
      {message && <output className={styles.notice}>{message}</output>}
      <div className={styles.taskSummary}>
        <span>
          <strong>{tasks.length}</strong> إجمالي المهام
        </span>
        <span>
          <strong>{tasks.filter((t) => t.stage === "doing").length}</strong> قيد
          العمل
        </span>
        <span>
          <CheckCheck size={17} />
          <strong>{tasks.filter((t) => t.stage === "done").length}</strong>{" "}
          مكتملة
        </span>
      </div>
      <form className={styles.taskForm} onSubmit={add}>
        <label>
          المهمة
          <input
            disabled={!ready}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: مراجعة صفحة الموقع"
            required
            value={title}
          />
        </label>
        <label>
          الأولوية
          <select
            aria-label="الأولوية"
            onChange={(e) => setPriority(e.target.value as "normal" | "high")}
            value={priority}
          >
            <option value="normal">عادية</option>
            <option value="high">عالية</option>
          </select>
        </label>
        <label>
          التاريخ المستهدف
          <input
            onChange={(e) => setDueDate(e.target.value)}
            type="date"
            value={dueDate}
          />
        </label>
        <button className={styles.primary} disabled={!ready} type="submit">
          <Plus size={17} /> إضافة مهمة
        </button>
      </form>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <input
            aria-label="ابحث في المهام"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المهام…"
            type="search"
            value={query}
          />
        </label>
        <button
          className={styles.secondary}
          disabled={!ready || !tasks.length}
          onClick={download}
          type="button"
        >
          <Download size={16} /> تنزيل المهام
        </button>
      </div>
      {!ready ? (
        <p>جارٍ قراءة المهام…</p>
      ) : (
        <div className={styles.taskBoard}>
          {taskStages.map((stage) => (
            <section
              aria-label={stage.label}
              className={styles.taskColumn}
              key={stage.id}
            >
              <h2>
                {stage.label}
                <span>
                  {visible.filter((t) => t.stage === stage.id).length}
                </span>
              </h2>
              {visible
                .filter((t) => t.stage === stage.id)
                .map((task) => (
                  <article className={styles.taskCard} key={task.id}>
                    <div className={styles.row}>
                      <span
                        className={
                          task.priority === "high"
                            ? styles.availableBadge
                            : styles.plannedBadge
                        }
                      >
                        {task.priority === "high"
                          ? "أولوية عالية"
                          : "أولوية عادية"}
                      </span>
                      <button
                        aria-label={`حذف المهمة ${task.title}`}
                        className={styles.iconButton}
                        onClick={() => {
                          if (window.confirm(`حذف المهمة «${task.title}»؟`))
                            save(tasks.filter((t) => t.id !== task.id));
                        }}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <h3>{task.title}</h3>
                    {task.dueDate && (
                      <p>
                        التاريخ المستهدف:{" "}
                        <time dateTime={task.dueDate}>{task.dueDate}</time> —
                        بلا تنبيه
                      </p>
                    )}
                    <label>
                      حالة المهمة
                      <select
                        aria-label={`حالة ${task.title}`}
                        onChange={(e) =>
                          move(task.id, e.target.value as TaskStage)
                        }
                        value={task.stage}
                      >
                        {taskStages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}
              {!visible.some((t) => t.stage === stage.id) && (
                <p className={styles.taskEmpty}>
                  {query
                    ? "لا توجد نتائج هنا."
                    : "لا توجد مهام في هذه القائمة بعد."}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
