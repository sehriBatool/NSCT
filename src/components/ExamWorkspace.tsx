import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Grid3X3,
  Lock,
  Send,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { OptionKey, TestAttemptDetail } from '../types/exam.ts';

interface ExamWorkspaceProps {
  initialAttempt: TestAttemptDetail;
  onFinishedReview: (completedAttempt: TestAttemptDetail) => void;
  onExitToDashboard: () => void;
}

function formatCountdown(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({
  initialAttempt,
  onFinishedReview,
  onExitToDashboard,
}) => {
  const [attempt, setAttempt] = useState<TestAttemptDetail>(initialAttempt);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>(initialAttempt.answers ?? {});
  const [flagged, setFlagged] = useState<number[]>(initialAttempt.flagged ?? []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [navFilter, setNavFilter] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Sync clock offset between client Date.now() and serverNow
  const clockOffsetRef = useRef<number>(initialAttempt.serverNow - Date.now());
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    Math.max(0, initialAttempt.expiresAt - (Date.now() + clockOffsetRef.current))
  );

  const [isFrozen, setIsFrozen] = useState(initialAttempt.status !== 'in_progress');
  const [showTimeUpModal, setShowTimeUpModal] = useState(initialAttempt.status === 'expired');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const flaggedRef = useRef(flagged);
  flaggedRef.current = flagged;
  const autoSubmittedRef = useRef(false);

  const finalizeOnTimeout = useCallback(async () => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setIsFrozen(true);
    setShowSubmitModal(false);
    setShowTimeUpModal(true);
    setSubmitting(true);
    try {
      const finalized = await api.submitTest(attempt.id, answersRef.current);
      setAttempt(finalized);
    } catch (err) {
      if (err instanceof ApiError && err.payload?.attempt) {
        setAttempt(err.payload.attempt as unknown as TestAttemptDetail);
      } else {
        try {
          const latest = await api.getTestDetail(attempt.id);
          setAttempt(latest);
        } catch {
          // Keep frozen UI modal active
        }
      }
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id]);

  // 60-minute real-time countdown loop
  useEffect(() => {
    if (isFrozen) return;
    const tick = () => {
      const serverAlignedNow = Date.now() + clockOffsetRef.current;
      const left = attempt.expiresAt - serverAlignedNow;
      if (left <= 0) {
        setRemainingMs(0);
        void finalizeOnTimeout();
      } else {
        setRemainingMs(left);
      }
    };
    tick();
    const timerId = window.setInterval(tick, 500);
    return () => window.clearInterval(timerId);
  }, [attempt.expiresAt, finalizeOnTimeout, isFrozen]);

  const persistProgress = useCallback(
    async (nextAnswers: Record<string, OptionKey>, nextFlagged: number[]) => {
      if (isFrozen) return;
      setSaveState('saving');
      try {
        const res = await api.saveProgress(attempt.id, {
          answers: nextAnswers,
          flagged: nextFlagged,
        });
        clockOffsetRef.current = res.serverNow - Date.now();
        setSaveState('saved');
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setIsFrozen(true);
          setShowTimeUpModal(true);
          if (err.payload?.attempt) {
            setAttempt(err.payload.attempt as unknown as TestAttemptDetail);
          }
          return;
        }
        setSaveState('error');
      }
    },
    [attempt.id, isFrozen]
  );

  const currentQuestion = attempt.questions[currentIdx];

  const handleSelectOption = (option: OptionKey) => {
    if (isFrozen || !currentQuestion) return;
    const qKey = String(currentQuestion.id);
    const nextAnswers = { ...answers, [qKey]: option };
    setAnswers(nextAnswers);
    void persistProgress(nextAnswers, flagged);
  };

  const handleClearOption = () => {
    if (isFrozen || !currentQuestion) return;
    const qKey = String(currentQuestion.id);
    if (!answers[qKey]) return;
    const nextAnswers = { ...answers };
    delete nextAnswers[qKey];
    setAnswers(nextAnswers);
    void persistProgress(nextAnswers, flagged);
  };

  const handleToggleFlag = () => {
    if (isFrozen || !currentQuestion) return;
    const qId = currentQuestion.id;
    const exists = flagged.includes(qId);
    const nextFlagged = exists ? flagged.filter((id) => id !== qId) : [...flagged, qId];
    setFlagged(nextFlagged);
    void persistProgress(answers, nextFlagged);
  };

  const handleManualSubmit = async () => {
    if (isFrozen || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const completed = await api.submitTest(attempt.id, answers);
      setAttempt(completed);
      setIsFrozen(true);
      setShowSubmitModal(false);
      onFinishedReview(completed);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.payload?.attempt) {
        setAttempt(err.payload.attempt as unknown as TestAttemptDetail);
        setIsFrozen(true);
        setShowSubmitModal(false);
        setShowTimeUpModal(true);
      } else {
        setErrorMessage(err instanceof ApiError ? err.message : 'Failed to submit test.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts (A-D / 1-4 / Left-Right) when test is active
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFrozen || showSubmitModal || showTimeUpModal) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'ArrowRight') {
        setCurrentIdx((idx) => Math.min(attempt.questions.length - 1, idx + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIdx((idx) => Math.max(0, idx - 1));
      } else if (e.key === '1' || e.key.toLowerCase() === 'a') {
        handleSelectOption('A');
      } else if (e.key === '2' || e.key.toLowerCase() === 'b') {
        handleSelectOption('B');
      } else if (e.key === '3' || e.key.toLowerCase() === 'c') {
        handleSelectOption('C');
      } else if (e.key === '4' || e.key.toLowerCase() === 'd') {
        handleSelectOption('D');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = attempt.questions.length - answeredCount;
  const isCriticalTime = remainingMs <= 60 * 1000;
  const isLowTime = !isCriticalTime && remainingMs <= 10 * 60 * 1000;

  const filteredIndexes = useMemo(() => {
    return attempt.questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => {
        if (navFilter === 'unanswered') return !answers[String(q.id)];
        if (navFilter === 'flagged') return flagged.includes(q.id);
        return true;
      });
  }, [attempt.questions, answers, flagged, navFilter]);

  const NavigatorGrid = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          Answered: <strong className="font-mono text-slate-900 tabular-nums">{answeredCount}/100</strong>
        </span>
        <span>
          Flagged: <strong className="font-mono text-amber-700 tabular-nums">{flagged.length}</strong>
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            { id: 'all', label: 'All (100)' },
            { id: 'unanswered', label: `Left (${unansweredCount})` },
            { id: 'flagged', label: `Flag (${flagged.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setNavFilter(tab.id)}
            className={`rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              navFilter === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid max-h-[380px] grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10 lg:grid-cols-5">
        {filteredIndexes.length === 0 ? (
          <div className="col-span-full py-6 text-center text-xs text-slate-500">
            No questions match this filter.
          </div>
        ) : (
          filteredIndexes.map(({ q, idx }) => {
            const isAnswered = Boolean(answers[String(q.id)]);
            const isFlagged = flagged.includes(q.id);
            const isCurrent = idx === currentIdx;

            let classes =
              'border-slate-200 bg-white text-slate-700 hover:border-slate-400';
            if (isAnswered) {
              classes = 'border-emerald-300 bg-emerald-50 text-emerald-900';
            }
            if (isFlagged) {
              classes = 'border-amber-400 bg-amber-50 text-amber-900';
            }
            if (isCurrent) {
              classes = 'border-blue-700 bg-blue-700 text-white ring-2 ring-blue-700/20';
            }

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setCurrentIdx(idx);
                  setMobileNavOpen(false);
                }}
                aria-label={`Question ${idx + 1}${isAnswered ? ', answered' : ''}${isFlagged ? ', flagged' : ''}`}
                className={`relative flex h-9 items-center justify-center rounded-md border font-mono text-xs font-medium tabular-nums transition-colors ${classes}`}
              >
                <span>{idx + 1}</span>
                {isFlagged && !isCurrent && (
                  <span className="sr-only">Flagged</span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-50" />
          Answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-amber-400 bg-amber-50" />
          Flagged
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-blue-700 bg-blue-700" />
          Current
        </span>
      </div>
    </div>
  );

  if (!currentQuestion) {
    return null;
  }

  const chosenOption = answers[String(currentQuestion.id)];
  const isCurrentFlagged = flagged.includes(currentQuestion.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
      {/* Compact Sticky Countdown & Exam Action Bar (under 15% mobile height) */}
      <div className="sticky top-2 z-20 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xs backdrop-blur-xs sm:px-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-base font-semibold tabular-nums sm:text-lg ${
              isFrozen
                ? 'border-slate-300 bg-slate-100 text-slate-700'
                : isCriticalTime
                ? 'border-red-300 bg-red-50 text-red-700'
                : isLowTime
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-900'
            }`}
            aria-live="polite"
          >
            {isFrozen ? (
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{formatCountdown(remainingMs)}</span>
            {isCriticalTime && !isFrozen && (
              <span className="font-sans text-xs font-medium">Final Minute</span>
            )}
            {isLowTime && !isFrozen && (
              <span className="font-sans text-xs font-medium">Low Time</span>
            )}
            {isFrozen && (
              <span className="font-sans text-xs font-medium">Frozen</span>
            )}
          </div>

          <div className="hidden text-xs text-slate-500 sm:block">
            <span className="font-mono text-slate-700">{attempt.regNumber}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>
              {saveState === 'saving'
                ? 'Saving progress...'
                : saveState === 'error'
                ? 'Save retry needed'
                : 'Progress saved'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
          >
            <Grid3X3 className="h-4 w-4" aria-hidden="true" />
            <span>Grid ({answeredCount}/100)</span>
          </button>

          <button
            type="button"
            disabled={isFrozen}
            onClick={() => setShowSubmitModal(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Submit Exam</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {/* Main 2-Zone Assessment Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Question Stage */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <p className="text-xs font-medium text-slate-500">
              <span>{currentQuestion.subject}</span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span className="capitalize">{currentQuestion.difficulty}</span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span className="font-mono text-slate-800 tabular-nums">
                Question {currentQuestion.index} of {attempt.totalQuestions}
              </span>
            </p>

            <button
              type="button"
              disabled={isFrozen}
              onClick={handleToggleFlag}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                isCurrentFlagged
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isCurrentFlagged ? 'Flagged' : 'Flag for Review'}</span>
            </button>
          </div>

          <h2 className="mt-6 font-display text-lg leading-relaxed font-semibold text-slate-900 sm:text-xl">
            {currentQuestion.prompt}
          </h2>

          {/* Four Accessible MCQ Options */}
          <div className="mt-6 space-y-3" role="radiogroup" aria-label={`Question ${currentQuestion.index} options`}>
            {(
              [
                { key: 'A', text: currentQuestion.optionA },
                { key: 'B', text: currentQuestion.optionB },
                { key: 'C', text: currentQuestion.optionC },
                { key: 'D', text: currentQuestion.optionD },
              ] as const
            ).map((opt) => {
              const selected = chosenOption === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isFrozen}
                  onClick={() => handleSelectOption(opt.key)}
                  className={`flex min-h-[52px] w-full items-center gap-3.5 rounded-lg border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-65 ${
                    selected
                      ? 'border-blue-700 bg-blue-50/70 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold ${
                      selected
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {opt.key}
                  </span>
                  <span className="flex-1 leading-snug">{opt.text}</span>
                  {selected && (
                    <Check className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Question Footer Navigation */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>Previous</span>
              </button>

              {chosenOption && !isFrozen && (
                <button
                  type="button"
                  onClick={handleClearOption}
                  className="min-h-[42px] rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  Clear Choice
                </button>
              )}
            </div>

            {currentIdx < attempt.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(attempt.questions.length - 1, i + 1))}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <span>Next Question</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isFrozen}
                onClick={() => setShowSubmitModal(true)}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <span>Finish &amp; Submit</span>
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>

        {/* Right: Desktop 100-Question Navigator */}
        <aside className="hidden rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 lg:block">
          <h3 className="mb-3 font-display text-sm font-semibold text-slate-900">
            Question Navigator
          </h3>
          {NavigatorGrid}
          <p className="mt-4 text-xs text-slate-500">
            Keyboard shortcuts: Press <span className="font-mono">A–D</span> to answer and{' '}
            <span className="font-mono">← / →</span> to move between questions.
          </p>
        </aside>
      </div>

      {/* Mobile Question Grid Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/50 sm:items-center sm:justify-center lg:hidden">
          <div className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-5 sm:rounded-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Question Navigator (1–100)
              </h3>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigator"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {NavigatorGrid}
          </div>
        </div>
      )}

      {/* Manual Submit Confirmation Modal */}
      {showSubmitModal && !isFrozen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <h3 id="submit-modal-title" className="font-display text-lg font-semibold text-slate-900">
              Submit Examination?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Once submitted, your answers are locked and your score is immediately recorded under{' '}
              <span className="font-mono font-medium text-slate-900">{attempt.regNumber}</span>.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs">
              <div>
                <div className="font-mono text-base font-semibold text-emerald-700 tabular-nums">
                  {answeredCount}
                </div>
                <div className="text-slate-600">Answered</div>
              </div>
              <div>
                <div className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {unansweredCount}
                </div>
                <div className="text-slate-600">Unanswered</div>
              </div>
              <div>
                <div className="font-mono text-base font-semibold text-amber-700 tabular-nums">
                  {flagged.length}
                </div>
                <div className="text-slate-600">Flagged</div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Continue Exam
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleManualSubmit}
                className="min-h-[42px] rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting ? 'Grading...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time-Up Freeze Pop-Up Notification */}
      {showTimeUpModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="timeup-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="timeup-modal-title" className="font-display text-lg font-semibold text-slate-900">
                  Time Is Up — Examination Frozen
                </h3>
                <p className="mt-1.5 text-sm text-slate-600">
                  Your 60-minute examination window has ended. All answer controls are now locked, and your saved responses have been graded automatically.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              {submitting ? (
                <div className="text-center text-sm text-slate-600">
                  Calculating final score...
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Recorded Final Score</div>
                    <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                      {attempt.score ?? 0} / {attempt.totalQuestions}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-slate-500">Registration</div>
                    <div className="mt-1 font-mono text-sm font-medium text-slate-800">
                      {attempt.regNumber}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onExitToDashboard}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Dashboard
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => onFinishedReview(attempt)}
                className="min-h-[42px] rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
              >
                Review Answers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
