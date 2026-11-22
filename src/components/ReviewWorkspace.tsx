import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import type { OptionKey, TestAttemptDetail } from '../types/exam.ts';

interface ReviewWorkspaceProps {
  attempt: TestAttemptDetail;
  backLabel?: string;
  onBack: () => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export const ReviewWorkspace: React.FC<ReviewWorkspaceProps> = ({
  attempt,
  backLabel = 'Back to Dashboard',
  onBack,
}) => {
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'unanswered'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');

  const grading = attempt.grading;

  const subjects = useMemo(() => {
    const set = new Set<string>();
    attempt.questions.forEach((q) => set.add(q.subject));
    return ['All', ...Array.from(set).sort()];
  }, [attempt.questions]);

  const filteredQuestions = useMemo(() => {
    return attempt.questions.filter((q) => {
      if (subjectFilter !== 'All' && q.subject !== subjectFilter) return false;
      const chosen = attempt.answers[String(q.id)];
      if (filter === 'correct') return chosen !== undefined && chosen === q.correctOption;
      if (filter === 'incorrect') return chosen !== undefined && chosen !== q.correctOption;
      if (filter === 'unanswered') return chosen === undefined;
      return true;
    });
  }, [attempt.answers, attempt.questions, filter, subjectFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        <p className="text-xs font-medium text-slate-500">
          <span className="font-mono text-slate-800">{attempt.regNumber}</span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span>Attempt #{attempt.id}</span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span>{attempt.status === 'expired' ? 'Auto-Frozen at 60:00' : 'Submitted'}</span>
        </p>
      </div>

      {/* Score Summary Header */}
      {grading && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-medium text-slate-500">Examination Result Summary</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {grading.score} / {grading.totalQuestions}
                <span className="ml-3 text-xl font-semibold text-slate-500">
                  ({grading.percentage}%)
                </span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {grading.passed ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Passed (50%+ Threshold)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-800">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Below 50% Passing Threshold
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Correct Answers</div>
              <div className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
                {grading.correctCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Incorrect Answers</div>
              <div className="mt-1 font-mono text-xl font-semibold text-red-700 tabular-nums">
                {grading.incorrectCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Unanswered</div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-700 tabular-nums">
                {grading.unansweredCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Duration</div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {formatDuration(attempt.timeTakenSeconds)}
              </div>
            </div>
          </div>

          {/* Subject Breakdown Table */}
          <div className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="mb-3 font-display text-sm font-semibold text-slate-900">
              Performance by Subject
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {grading.subjectBreakdown.map((sub) => (
                <div
                  key={sub.subject}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5"
                >
                  <div className="truncate text-xs font-medium text-slate-700" title={sub.subject}>
                    {sub.subject}
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
                    <span className="text-base font-semibold text-slate-900">
                      {sub.correct}/{sub.total}
                    </span>
                    <span className="text-xs text-slate-500">{sub.accuracy}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'all', label: `All (${attempt.questions.length})` },
              { id: 'correct', label: `Correct (${grading?.correctCount ?? 0})` },
              { id: 'incorrect', label: `Incorrect (${grading?.incorrectCount ?? 0})` },
              { id: 'unanswered', label: `Unanswered (${grading?.unansweredCount ?? 0})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="review-subject" className="text-xs font-medium text-slate-600">
            Subject:
          </label>
          <select
            id="review-subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
          >
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Question-by-Question Review List */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No questions match the selected filter.
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const chosen = attempt.answers[String(q.id)];
            const isCorrect = chosen !== undefined && chosen === q.correctOption;
            const isUnanswered = chosen === undefined;

            return (
              <article
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <p className="text-xs font-medium text-slate-500">
                    <span className="font-mono text-slate-900 tabular-nums">Q.{q.index}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span>{q.subject}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span className="capitalize">{q.difficulty}</span>
                  </p>

                  {isCorrect ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Correct
                    </span>
                  ) : isUnanswered ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <MinusCircle className="h-4 w-4" aria-hidden="true" />
                      Unanswered
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      Incorrect
                    </span>
                  )}
                </div>

                <h3 className="mt-4 font-display text-base font-semibold text-slate-900">
                  {q.prompt}
                </h3>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      { key: 'A', text: q.optionA },
                      { key: 'B', text: q.optionB },
                      { key: 'C', text: q.optionC },
                      { key: 'D', text: q.optionD },
                    ] as const
                  ).map((opt) => {
                    const isRightAnswer = q.correctOption === opt.key;
                    const isStudentPick = chosen === opt.key;

                    let style = 'border-slate-200 bg-slate-50/40 text-slate-700';
                    if (isRightAnswer) {
                      style = 'border-emerald-300 bg-emerald-50 text-emerald-950 font-medium';
                    } else if (isStudentPick && !isRightAnswer) {
                      style = 'border-red-300 bg-red-50 text-red-950';
                    }

                    return (
                      <div
                        key={opt.key}
                        className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${style}`}
                      >
                        <span className="font-mono text-xs font-semibold">{opt.key}.</span>
                        <span className="flex-1">{opt.text}</span>
                        {isRightAnswer && (
                          <span className="text-xs font-semibold text-emerald-700">Answer</span>
                        )}
                        {isStudentPick && !isRightAnswer && (
                          <span className="text-xs font-semibold text-red-700">Your Pick</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
                    <strong className="font-semibold text-slate-800">Explanation:</strong>{' '}
                    {q.explanation}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
