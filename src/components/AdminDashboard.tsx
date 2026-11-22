import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type {
  AdminOverviewData,
  AdminQuestionRecord,
  AdminStudentRow,
  DifficultyLevel,
  OptionKey,
} from '../types/exam.ts';

interface AdminDashboardProps {
  onInspectAttempt: (attemptId: number) => Promise<void>;
}

const EMPTY_FORM = {
  subject: 'Computer Science',
  difficulty: 'medium' as DifficultyLevel,
  prompt: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A' as OptionKey,
  explanation: '',
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onInspectAttempt }) => {
  const [tab, setTab] = useState<'overview' | 'questions' | 'students'>('overview');
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [questions, setQuestions] = useState<AdminQuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview search/filter
  const [attemptSearch, setAttemptSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'expired' | 'in_progress'>('all');

  // Question Bank filters & modal
  const [qSubject, setQSubject] = useState('All');
  const [qSearch, setQSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [qForm, setQForm] = useState(EMPTY_FORM);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestionRecord | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, st, qs] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminStudents(),
        api.getAdminQuestions(),
      ]);
      setOverview(ov);
      setStudents(st.students);
      setQuestions(qs.questions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load administrative records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const subjects = useMemo(() => {
    const s = new Set<string>(['Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Analytical Reasoning']);
    questions.forEach((q) => s.add(q.subject));
    return ['All', ...Array.from(s).sort()];
  }, [questions]);

  const filteredAttempts = useMemo(() => {
    if (!overview) return [];
    const term = attemptSearch.trim().toLowerCase();
    return overview.attempts.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!term) return true;
      return (
        a.regNumber.toLowerCase().includes(term) ||
        a.fullName.toLowerCase().includes(term) ||
        a.department.toLowerCase().includes(term)
      );
    });
  }, [overview, attemptSearch, statusFilter]);

  const filteredQuestions = useMemo(() => {
    const term = qSearch.trim().toLowerCase();
    return questions.filter((q) => {
      if (qSubject !== 'All' && q.subject !== qSubject) return false;
      if (!term) return true;
      return q.prompt.toLowerCase().includes(term) || q.subject.toLowerCase().includes(term);
    });
  }, [questions, qSubject, qSearch]);

  const handleExportCsv = () => {
    if (!filteredAttempts.length) return;
    const header = ['Attempt ID', 'Registration Number', 'Student Name', 'Department', 'Status', 'Score', 'Total', 'Time Taken (s)', 'Started At'];
    const rows = filteredAttempts.map((a) => [
      a.id,
      a.regNumber,
      `"${a.fullName.replace(/"/g, '""')}"`,
      `"${a.department.replace(/"/g, '""')}"`,
      a.status,
      a.score ?? '',
      a.totalQuestions,
      a.timeTakenSeconds ?? '',
      new Date(a.startedAt).toISOString(),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `examcore-scores-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openAddModal = () => {
    setEditingId(null);
    setQForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (q: AdminQuestionRecord) => {
    setEditingId(q.id);
    setQForm({
      subject: q.subject,
      difficulty: q.difficulty,
      prompt: q.prompt,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption,
      explanation: q.explanation,
    });
    setModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingQuestion(true);
    setError(null);
    try {
      if (editingId !== null) {
        await api.updateAdminQuestion(editingId, qForm);
      } else {
        await api.createAdminQuestion(qForm);
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save question.');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await api.deleteAdminQuestion(deleteTarget.id);
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete question.');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-slate-500">Faculty &amp; Administration Console</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Examination Monitoring &amp; Question Bank
          </h1>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'overview', label: 'Scores & Performance' },
              { id: 'questions', label: 'Question Bank' },
              { id: 'students', label: 'Students' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : null}

      {/* TAB 1: SCORES & PERFORMANCE */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Registered Students</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {overview.metrics.totalStudents}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Total Exam Attempts</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {overview.metrics.totalAttempts}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Average Score</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {overview.metrics.avgScore} / 100
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Pass Rate (50%+)</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {overview.metrics.passRate}%
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={attemptSearch}
                    onChange={(e) => setAttemptSearch(e.target.value)}
                    placeholder="Search reg. number or name..."
                    className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'all' | 'submitted' | 'expired' | 'in_progress')
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="submitted">Submitted</option>
                  <option value="expired">Time Expired</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>

              <button
                type="button"
                disabled={filteredAttempts.length === 0}
                onClick={handleExportCsv}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Export CSV</span>
              </button>
            </div>

            {filteredAttempts.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                No examination attempts recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                      <th className="px-6 py-3">Reg. Number</th>
                      <th className="px-6 py-3">Student</th>
                      <th className="px-6 py-3">Department</th>
                      <th className="px-6 py-3 text-right">Score</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAttempts.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5 font-mono text-xs font-medium text-slate-900">
                          {a.regNumber}
                        </td>
                        <td className="px-6 py-3.5 text-slate-800">{a.fullName}</td>
                        <td className="px-6 py-3.5 text-slate-600">{a.department}</td>
                        <td className="px-6 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {a.score !== null ? `${a.score} / ${a.totalQuestions}` : '—'}
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
                              Expired
                            </span>
                          )}
                          {a.status === 'in_progress' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectAttempt(a.id)}
                            className="text-xs font-semibold text-blue-700 hover:underline"
                          >
                            Inspect Answers
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: QUESTION BANK CRUD */}
      {tab === 'questions' && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={qSearch}
                  onChange={(e) => setQSearch(e.target.value)}
                  placeholder="Search question prompts..."
                  className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <select
                value={qSubject}
                onChange={(e) => setQSubject(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {filteredQuestions.length} of {questions.length} questions
              </span>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Question</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {filteredQuestions.map((q) => (
              <div
                key={q.id}
                className="flex flex-col justify-between gap-4 px-6 py-4 sm:flex-row sm:items-start"
              >
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">
                    <span className="font-mono text-slate-900 tabular-nums">#{q.id}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span>{q.subject}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span className="capitalize">{q.difficulty}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span className="font-mono text-emerald-700">Answer: {q.correctOption}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-900">{q.prompt}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(q)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(q)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: STUDENTS DIRECTORY */}
      {tab === 'students' && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Registered Student Accounts ({students.length})
            </h2>
          </div>
          {students.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No student accounts have registered yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                    <th className="px-6 py-3">Reg. Number</th>
                    <th className="px-6 py-3">Full Name</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Department</th>
                    <th className="px-6 py-3 text-right">Attempts</th>
                    <th className="px-6 py-3 text-right">Best Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 font-mono text-xs font-medium text-slate-900">
                        {st.regNumber}
                      </td>
                      <td className="px-6 py-3.5 text-slate-900">{st.fullName}</td>
                      <td className="px-6 py-3.5 text-slate-600">{st.email}</td>
                      <td className="px-6 py-3.5 text-slate-600">{st.department}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                        {st.attemptCount}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {st.bestScore !== null ? `${st.bestScore} / 100` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Add / Edit Question Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingId !== null ? `Edit Question #${editingId}` : 'Add New MCQ'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Subject</label>
                  <input
                    type="text"
                    required
                    value={qForm.subject}
                    onChange={(e) => setQForm({ ...qForm, subject: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Difficulty</label>
                  <select
                    value={qForm.difficulty}
                    onChange={(e) => setQForm({ ...qForm, difficulty: e.target.value as DifficultyLevel })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Correct Option</label>
                  <select
                    value={qForm.correctOption}
                    onChange={(e) => setQForm({ ...qForm, correctOption: e.target.value as OptionKey })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Question Prompt</label>
                <textarea
                  required
                  rows={3}
                  value={qForm.prompt}
                  onChange={(e) => setQForm({ ...qForm, prompt: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['A', 'B', 'C', 'D'] as const).map((key) => {
                  const field = `option${key}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
                  return (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-700">
                        Option {key}
                      </label>
                      <input
                        type="text"
                        required
                        value={qForm[field]}
                        onChange={(e) => setQForm({ ...qForm, [field]: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Explanation</label>
                <textarea
                  rows={2}
                  value={qForm.explanation}
                  onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[40px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuestion}
                  className="min-h-[40px] rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {savingQuestion ? 'Saving...' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Delete Question #{deleteTarget.id}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">{deleteTarget.prompt}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[40px] rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete Question
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
