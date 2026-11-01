"use client";

import { Dices, Gamepad2, Lightbulb, RotateCcw, Trophy } from "lucide-react";
import { useState } from "react";
import {
  creativeChallenges,
  gameResult,
  type Mark,
  quizQuestions,
} from "@/lib/studio-play";
import styles from "./studio.module.css";

export function Playground() {
  const [channel, setChannel] = useState<"quiz" | "game" | "ideas">("quiz");
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [question, setQuestion] = useState(0);
  const [challenge, setChallenge] = useState(0);
  const result = gameResult(board);
  const quiz = quizQuestions[question];
  const selected = answers[question];
  const score = quizQuestions.filter((q, i) => answers[i] === q.answer).length;
  const finished = Object.keys(answers).length === quizQuestions.length;
  return (
    <>
      <header className={styles.pageHeading}>
        <span className={styles.eyebrow}>
          <Gamepad2 size={17} /> وقت صغير، فكرة جديدة
        </span>
        <h1>استراحة وإبداع</h1>
        <p>
          ثلاث مساحات تعمل محلياً دون تسجيل: اختبار معرفة، لعبة لشخصين على الجهاز
          نفسه، وتحديات إبداع مكتوبة مسبقاً. لا بث أو قنوات خارجية أو ذكاء
          اصطناعي متصل هنا.
        </p>
      </header>
      <div className={styles.playChannels}>
        {[
          {
            id: "quiz" as const,
            icon: Trophy,
            title: "اختبر معرفتك",
            desc: "5 أسئلة مع شرح الإجابة",
          },
          {
            id: "game" as const,
            icon: Gamepad2,
            title: "تحدي X و O",
            desc: "شخصان، جهاز واحد",
          },
          {
            id: "ideas" as const,
            icon: Lightbulb,
            title: "شرارة فكرة",
            desc: "تحديات إبداع جاهزة",
          },
        ].map((c) => (
          <button
            aria-pressed={channel === c.id}
            className={styles.playChannel}
            key={c.id}
            onClick={() => setChannel(c.id)}
            type="button"
          >
            <c.icon size={25} />
            <strong>{c.title}</strong>
            <span>{c.desc}</span>
          </button>
        ))}
      </div>
      {channel === "quiz" && (
        <section aria-label="اختبار المعرفة" className={styles.playPanel}>
          <span className={styles.eyebrow}>
            السؤال {question + 1} من {quizQuestions.length}
          </span>
          <h2>{quiz.question}</h2>
          <div className={styles.quizOptions}>
            {quiz.options.map((option, i) => (
              <button
                aria-pressed={selected === i}
                disabled={selected !== undefined}
                key={option}
                onClick={() => setAnswers({ ...answers, [question]: i })}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          {selected !== undefined && (
            <output className={styles.quizFeedback}>
              {selected === quiz.answer
                ? "إجابة صحيحة! "
                : "ليست الإجابة الصحيحة. "}
              {quiz.explanation}
            </output>
          )}
          <div className={styles.playFooter}>
            {question < quizQuestions.length - 1 ? (
              <button
                className={styles.primary}
                disabled={selected === undefined}
                onClick={() => setQuestion(question + 1)}
                type="button"
              >
                السؤال التالي
              </button>
            ) : (
              <button
                className={styles.secondary}
                onClick={() => {
                  setAnswers({});
                  setQuestion(0);
                }}
                type="button"
              >
                <RotateCcw size={16} /> أعد الاختبار
              </button>
            )}
            <span>
              {finished
                ? `نتيجتك: ${score} من ${quizQuestions.length}`
                : `إجابات صحيحة: ${score}`}
            </span>
          </div>
          <p className={styles.muted}>
            النتيجة مؤقتة؛ تُصفّر عند إعادة تحميل الصفحة. لا ترتيب عالمي ولا جوائز
            أو حسابات.
          </p>
        </section>
      )}
      {channel === "game" && (
        <section aria-label="لعبة X و O" className={styles.playPanel}>
          <h2>جولة ودية، بلا تعقيد.</h2>
          <output className={styles.gameStatus}>
            {result === "draw"
              ? "تعادل! جولة أخرى؟"
              : result
                ? `فاز اللاعب ${result}!`
                : `الدور على اللاعب ${turn}`}
          </output>
          <div className={styles.gameGrid}>
            {board.map((mark, i) => (
              <button
                aria-label={`الخانة ${i + 1}${mark ? `: ${mark}` : ": فارغة"}`}
                disabled={mark !== null || result !== null}
                key={`cell-${i + 1}`}
                onClick={() => {
                  if (board[i] || result) return;
                  const next = [...board];
                  next[i] = turn;
                  setBoard(next);
                  setTurn(turn === "X" ? "O" : "X");
                }}
                type="button"
              >
                {mark ?? "·"}
              </button>
            ))}
          </div>
          <button
            className={styles.secondary}
            onClick={() => {
              setBoard(Array(9).fill(null));
              setTurn("X");
            }}
            type="button"
          >
            <RotateCcw size={16} /> جولة جديدة
          </button>
          <p className={styles.muted}>
            لعبة محلية لشخصين؛ لا خصم آلي ولا لعب عبر الشبكة.
          </p>
        </section>
      )}
      {channel === "ideas" && (
        <section aria-label="تحديات الإبداع" className={styles.playPanel}>
          <span className={styles.eyebrow}>
            تحدٍّ {challenge + 1} / {creativeChallenges.length}
          </span>
          <h2>غيّر زاوية تفكيرك.</h2>
          <blockquote className={styles.challenge}>
            {creativeChallenges[challenge]}
          </blockquote>
          <div className={styles.transferActions}>
            <button
              className={styles.primary}
              onClick={() =>
                setChallenge((challenge + 1) % creativeChallenges.length)
              }
              type="button"
            >
              <Dices size={16} /> فكرة أخرى
            </button>
            <a className={styles.secondary} href="/studio/templates">
              حوّلها إلى قالب
            </a>
            <a className={styles.secondary} href="/studio/tasks">
              خطّط لها كمهمة
            </a>
          </div>
          <p className={styles.muted}>
            تحديات أصلية مكتوبة مسبقاً، تتبدّل بالتتابع؛ ليست توليداً حياً بالذكاء
            الاصطناعي.
          </p>
        </section>
      )}
      <div className={styles.releaseNote}>
        <Lightbulb size={23} />
        <p>
          تريد شيئاً قابلًا للبناء؟ افتح قوالب الاختبارات والفعاليات والمقهى في
          مكتبة القوالب، ثم عدّل HTML ونزّله. لا ندرج محتوى بث غير مرخّص.
        </p>
      </div>
    </>
  );
}
