"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveAnswersAction, submitAttemptAction } from "@/server/actions/assessment";
import type { Answer, LearnerQuestion } from "@/lib/questions";
import { Button } from "@/ui/button";
import { Select, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { cn } from "@/ui/cn";

type SaveState = "idle" | "saving" | "saved" | "offline";

type TakerProps = Parameters<typeof QuizTakerInner>[0];

const noop = () => () => {};

/**
 * Renders the quiz only in the browser: it restores answers kept on the device (for weak
 * connections on site), which the server can't know about.
 */
export function QuizTaker(props: TakerProps) {
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!hydrated) return <p className="text-muted">Loading your questions…</p>;
  return <QuizTakerInner {...props} />;
}

function QuizTakerInner({
  slug,
  itemId,
  attemptId,
  questions,
  initialAnswers,
  deadline,
}: {
  slug: string;
  itemId: string;
  attemptId: string;
  questions: LearnerQuestion[];
  initialAnswers: Record<string, Answer>;
  deadline: string | null;
}) {
  const storageKey = `yari-attempt-${attemptId}`;
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    // A local copy survives a dropped connection or a closed tab on site.
    try {
      const local = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (local && typeof local === "object") return { ...initialAnswers, ...local };
    } catch {}
    return initialAnswers;
  });
  const [save, setSave] = useState<SaveState>("idle");
  const [submitting, startSubmit] = useTransition();
  const [left, setLeft] = useState<number | null>(() =>
    deadline ? new Date(deadline).getTime() - Date.now() : null,
  );
  const dirty = useRef(false);
  // The newest answers for autosave/submit, updated in the change handler (not during render).
  const latest = useRef(answers);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSave("saving");
    try {
      await saveAnswersAction(attemptId, latest.current);
      setSave("saved");
    } catch {
      dirty.current = true;
      setSave("offline");
    }
  }, [attemptId]);

  // Autosave a moment after the last change, and retry every 10 s if the connection dropped.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(flush, 1200);
    return () => clearTimeout(t);
  }, [answers, flush]);
  useEffect(() => {
    const t = setInterval(() => dirty.current && void flush(), 10_000);
    return () => clearInterval(t);
  }, [flush]);

  const submit = useCallback(() => {
    startSubmit(async () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      await submitAttemptAction(slug, itemId, attemptId, latest.current);
    });
  }, [slug, itemId, attemptId, storageKey]);

  // Countdown; submits automatically when time runs out.
  useEffect(() => {
    if (!deadline) return;
    const end = new Date(deadline).getTime();
    const t = setInterval(() => {
      const ms = end - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(t);
        submit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, submit]);

  function answer(id: string, value: Answer) {
    dirty.current = true;
    const next = { ...latest.current, [id]: value };
    latest.current = next;
    setAnswers(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }

  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const mm = left !== null ? Math.max(0, Math.floor(left / 60000)) : 0;
  const ss = left !== null ? Math.max(0, Math.floor((left % 60000) / 1000)) : 0;

  return (
    <div className="space-y-8">
      {/* Sticky status bar: progress, timer, save state. */}
      <div className="border-line bg-bg/95 sticky top-16 z-20 -mx-4 flex items-center gap-4 border-b px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <span className="font-mono text-sm">
          {answered}/{questions.length} answered
        </span>
        <span className="text-muted flex-1 text-xs" aria-live="polite">
          {save === "saving"
            ? "Saving…"
            : save === "saved"
              ? "Saved"
              : save === "offline"
                ? "Offline — kept on this device, will retry"
                : ""}
        </span>
        {left !== null && (
          <span
            className={cn("font-mono text-lg tabular-nums", left < 60_000 && "text-danger")}
            role="timer"
            aria-label="Time left"
          >
            {mm}:{String(ss).padStart(2, "0")}
          </span>
        )}
      </div>

      <ol className="space-y-6">
        {questions.map((q, i) => (
          <li key={q.id} className="border-line bg-surface border p-5">
            <fieldset>
              <legend className="w-full">
                <span className="eyebrow">
                  Question {i + 1} · {q.points} pt{q.points === 1 ? "" : "s"}
                </span>
                <span className="mt-2 block text-lg whitespace-pre-line">{q.prompt}</span>
              </legend>
              <div className="mt-4">
                <QuestionInput q={q} value={answers[q.id]} onChange={(v) => answer(q.id, v)} />
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="border-line space-y-3 border-t pt-6">
        {answered < questions.length && (
          <Notice>
            {questions.length - answered} question{questions.length - answered === 1 ? " is" : "s are"}{" "}
            unanswered.
          </Notice>
        )}
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={submitting}
          onClick={() => {
            if (answered < questions.length && !confirm("Submit with unanswered questions?")) return;
            submit();
          }}
        >
          {submitting ? "Submitting…" : "Submit answers"}
        </Button>
      </div>
    </div>
  );
}

function isAnswered(q: LearnerQuestion, a: Answer | undefined) {
  if (a === undefined || a === null) return false;
  if (q.type === "MULTI_SELECT") return Array.isArray(a) && a.length > 0;
  if (q.type === "SHORT_ANSWER") return typeof a === "string" && a.trim().length > 0;
  if (q.type === "MATCHING") return Object.keys(a as object).length === (q.options.left?.length ?? 0);
  return true;
}

const optionClass = (on: boolean) =>
  cn(
    "flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-2 has-[:focus-visible]:outline-2",
    on ? "border-fg bg-sunk" : "border-line hover:bg-sunk",
  );

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: LearnerQuestion;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
}) {
  switch (q.type) {
    case "MCQ":
      return (
        <div className="grid gap-2">
          {q.options.choices!.map((c) => (
            <label key={c.id} className={optionClass(value === c.id)}>
              <input
                type="radio"
                name={q.id}
                checked={value === c.id}
                onChange={() => onChange(c.id)}
                className="size-5 accent-current"
              />
              {c.text}
            </label>
          ))}
        </div>
      );
    case "MULTI_SELECT": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="grid gap-2">
          <p className="text-muted text-sm">Choose all that apply.</p>
          {q.options.choices!.map((c) => (
            <label key={c.id} className={optionClass(picked.includes(c.id))}>
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))
                }
                className="size-5 accent-current"
              />
              {c.text}
            </label>
          ))}
        </div>
      );
    }
    case "TRUE_FALSE":
      return (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <label key={String(v)} className={optionClass(value === v)}>
              <input
                type="radio"
                name={q.id}
                checked={value === v}
                onChange={() => onChange(v)}
                className="size-5 accent-current"
              />
              {v ? "True" : "False"}
            </label>
          ))}
        </div>
      );
    case "SHORT_ANSWER":
      return (
        <Textarea
          aria-label="Your answer"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={1000}
          className="min-h-20"
        />
      );
    case "MATCHING": {
      const map = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<
        string,
        string
      >;
      return (
        <div className="space-y-3">
          {q.options.left!.map((l) => (
            <div key={l.id} className="grid gap-2 sm:grid-cols-2 sm:items-center">
              <span id={`${q.id}-${l.id}`}>{l.text}</span>
              <Select
                aria-labelledby={`${q.id}-${l.id}`}
                value={map[l.id] ?? ""}
                onChange={(e) => onChange({ ...map, [l.id]: e.target.value })}
              >
                <option value="" disabled>
                  Choose a match
                </option>
                {q.options.right!.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      );
    }
  }
}
