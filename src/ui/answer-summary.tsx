import { Check, X } from "lucide-react";
import type { Answer, SnapshotQuestion } from "@/lib/questions";

type Q = Pick<SnapshotQuestion, "type" | "prompt" | "options"> & {
  key?: unknown;
  explanation?: string | null;
};

/** A question with the learner's answer, and optionally the correct answer. Used in results and marking. */
export function AnswerSummary({
  question: q,
  answer,
  showKey,
  correctKey,
}: {
  question: Q;
  answer: Answer | undefined;
  showKey?: boolean;
  correctKey?: unknown;
}) {
  const key = (correctKey ?? (showKey ? q.key : undefined)) as
    | { correct?: string | string[] | boolean; accepted?: string[]; pairs?: Record<string, string> }
    | undefined;
  const text = (id: string | undefined, list?: { id: string; text: string }[]) =>
    list?.find((c) => c.id === id)?.text ?? "—";

  let given: React.ReactNode = <span className="text-muted">No answer</span>;
  let right: React.ReactNode = null;
  switch (q.type) {
    case "MCQ":
    case "MULTI_SELECT": {
      const picked = Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : [];
      const correct = key ? (Array.isArray(key.correct) ? key.correct : [key.correct as string]) : null;
      return (
        <div className="space-y-2">
          <p className="whitespace-pre-line">{q.prompt}</p>
          <ul className="space-y-1 text-sm">
            {(q.options.choices ?? []).map((c) => {
              const chosen = picked.includes(c.id);
              const isRight = correct?.includes(c.id);
              return (
                <li key={c.id} className={`flex items-center gap-2 ${chosen ? "font-medium" : "text-muted"}`}>
                  {correct ? (
                    isRight ? (
                      <Check className="text-success size-4" aria-label="Correct option" />
                    ) : (
                      <X className={`size-4 ${chosen ? "text-danger" : "opacity-0"}`} aria-hidden />
                    )
                  ) : (
                    <span className="size-4" />
                  )}
                  {c.text}
                  {chosen && <span className="text-muted text-xs">(chosen)</span>}
                </li>
              );
            })}
          </ul>
          {q.explanation && <p className="text-muted text-sm">{q.explanation}</p>}
        </div>
      );
    }
    case "TRUE_FALSE":
      if (typeof answer === "boolean") given = answer ? "True" : "False";
      if (key) right = key.correct ? "True" : "False";
      break;
    case "SHORT_ANSWER":
      if (typeof answer === "string" && answer.trim())
        given = <span className="whitespace-pre-wrap">“{answer}”</span>;
      if (key?.accepted) right = key.accepted.join(" / ");
      break;
    case "MATCHING": {
      const a = (answer ?? {}) as Record<string, string>;
      given = (
        <ul className="space-y-1">
          {(q.options.left ?? []).map((l) => (
            <li key={l.id}>
              {l.text} → <strong className="font-medium">{text(a[l.id], q.options.right)}</strong>
              {key?.pairs && a[l.id] !== key.pairs[l.id] && (
                <span className="text-success"> (correct: {text(key.pairs[l.id], q.options.right)})</span>
              )}
            </li>
          ))}
        </ul>
      );
      break;
    }
  }
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-line">{q.prompt}</p>
      <div className="text-sm">
        <span className="text-muted">Answer: </span>
        {given}
      </div>
      {right && (
        <p className="text-sm">
          <span className="text-muted">Correct: </span>
          {right}
        </p>
      )}
      {q.explanation && <p className="text-muted text-sm">{q.explanation}</p>}
    </div>
  );
}
