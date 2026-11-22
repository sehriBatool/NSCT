import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, FileCheck2, Play, RotateCcw, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { AttemptSummary, UserProfile } from '../types/exam.ts';

interface StudentDashboardProps {
  user: UserProfile;
  onStartOrResumeTest: () => Promise<void>;
  onOpenReview: (attemptId: number) => Promise<void>;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  onStartOrResumeTest,
  onOpenReview,
}) => {
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [examConfig, setExamConfig] = useState({
    questionCount: 100,
    durationMinutes: 60,
    bankSize: 140,
  });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listMyTests()
      .then((res) => {
        if (!active) return;
        setAttempts(res.attempts);
        setExamConfig(res.examConfig);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Unable to load exam history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeAttempt = attempts.find((a) => a.status === 'in_progress');
  const completedAttempts = attempts.filter((a) => a.status !== 'in_progress');
  const bestScore =
    completedAttempts.length > 0
      ? Math.max(...completedAttempts.map((a) => a.score ?? 0))
      : null;

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      await onStartOrResumeTest();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not launch exam session.');
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      {/* Candidate Header & Single Primary CTA */}
      <section className="flex flex-col justify-between gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">
            <span className="font-mono">{user.regNumber}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>{user.department}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>{user.email}</span>
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome, {user.fullName}
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            {activeAttempt
              ? 'You have an active examination in progress. Resume immediately before the 60-minute timer expires.'
              : `Each assessment randomly draws ${examConfig.questionCount} unique multiple-choice questions from our ${examConfig.bankSize}-question bank.`}
          </p>
        </div>

        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-800 disabled:opacity-60"
        >
          {activeAttempt ? (
            <>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>{starting ? 'Resuming...' : 'Resume Active Exam'}</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>{starting ? 'Preparing 100 MCQs...' : 'Start 100-Question Exam'}</span>
            </>
          )}
        </button>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 4-Column Assessment Specifications Strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Questions Per Attempt</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {examConfig.questionCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Randomized per session</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Time Limit</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {examConfig.durationMinutes} min
          </div>
          <div className="mt-1 text-xs text-slate-500">Auto-freezes at 00:00</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Question Bank Pool</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {examConfig.bankSize}
          </div>
          <div className="mt-1 text-xs text-slate-500">5 academic subjects</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Best Recorded Score</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {bestScore !== null ? `${bestScore} / ${examConfig.questionCount}` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {completedAttempts.length} completed {completedAttempts.length === 1 ? 'attempt' : 'attempts'}
          </div>
        </div>
      </section>

      {/* Past Attempts & Score History */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Examination History &amp; Review
            </h2>
            <p className="text-xs text-slate-500">
              Completed scores are permanently recorded under {user.regNumber}.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : attempts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileCheck2 className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
            <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
              No examination attempts yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
              Click “Start 100-Question Exam” above when you are ready. Your 60-minute countdown begins once the exam opens.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                  <th className="px-6 py-3">Attempt</th>
                  <th className="px-6 py-3">Started</th>
                  <th className="px-6 py-3 text-right">Answered</th>
                  <th className="px-6 py-3 text-right">Score</th>
                  <th className="px-6 py-3 text-right">Time Taken</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {attempts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-mono text-xs font-medium text-slate-900 tabular-nums">
                      #{a.id}
                    </td>
                    <td className="px-6 py-3.5 text-slate-700 whitespace-nowrap">
                      {formatDateTime(a.startedAt)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                      {a.answeredCount} / {a.totalQuestions}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {a.score !== null ? `${a.score} / ${a.totalQuestions}` : 'Pending'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-600 tabular-nums">
                      {formatDuration(a.timeTakenSeconds)}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      {a.status === 'submitted' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Submitted
                        </span>
                      )}
                      {a.status === 'expired' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Time Expired
                        </span>
                      )}
                      {a.status === 'in_progress' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          In Progress
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      {a.status === 'in_progress' ? (
                        <button
                          type="button"
                          onClick={handleStart}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                        >
                          <span>Resume</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenReview(a.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                        >
                          <span>Review Answers</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
