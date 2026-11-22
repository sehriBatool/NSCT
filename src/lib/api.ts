import type {
  AdminOverviewData,
  AdminQuestionRecord,
  AdminStudentRow,
  AttemptSummary,
  DifficultyLevel,
  OptionKey,
  TestAttemptDetail,
  UserProfile,
} from '../types/exam.ts';

let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export class ApiError extends Error {
  status: number;
  payload?: Record<string, unknown>;
  constructor(message: string, status: number, payload?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (memoryAuthToken) {
    headers['Authorization'] = `Bearer ${memoryAuthToken}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export const api = {
  // Student Auth
  registerStudent: (payload: {
    regNumber: string;
    fullName: string;
    email: string;
    department: string;
    password: string;
    securityQuestion: string;
    securityAnswer: string;
  }) =>
    requestJson<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginStudent: (payload: { regNumber: string; password: string }) =>
    requestJson<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCurrentUser: () => requestJson<{ user: UserProfile }>('/api/auth/me'),

  lookupRecoveryQuestion: (payload: { regNumber: string; email: string }) =>
    requestJson<{ securityQuestion: string }>('/api/auth/recover/lookup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetPasswordWithRecovery: (payload: {
    regNumber: string;
    email: string;
    securityAnswer: string;
    newPassword: string;
  }) =>
    requestJson<{ ok: boolean; message: string }>('/api/auth/recover/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin Auth
  getAdminStatus: () =>
    requestJson<{ configured: boolean; source: 'env' | 'claimed' | 'unclaimed' }>('/api/admin/status'),

  bootstrapAdmin: (passcode: string) =>
    requestJson<{ token: string; user: UserProfile }>('/api/admin/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  loginAdmin: (passcode: string) =>
    requestJson<{ token: string; user: UserProfile }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  // Student Exam
  listMyTests: () =>
    requestJson<{
      attempts: AttemptSummary[];
      examConfig: { questionCount: number; durationMinutes: number; bankSize: number };
    }>('/api/tests'),

  startTest: () =>
    requestJson<TestAttemptDetail>('/api/tests/start', {
      method: 'POST',
    }),

  getTestDetail: (id: number) => requestJson<TestAttemptDetail>(`/api/tests/${id}`),

  saveProgress: (
    id: number,
    payload: { answers?: Record<string, OptionKey>; flagged?: number[] }
  ) =>
    requestJson<{ ok: boolean; serverNow: number }>(`/api/tests/${id}/progress`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  submitTest: (id: number, answers?: Record<string, OptionKey>) =>
    requestJson<TestAttemptDetail>(`/api/tests/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(answers ? { answers } : {}),
    }),

  // Admin Management
  getAdminOverview: () => requestJson<AdminOverviewData>('/api/admin/overview'),

  getAdminAttemptDetail: (id: number) => requestJson<TestAttemptDetail>(`/api/admin/attempts/${id}`),

  getAdminStudents: () => requestJson<{ students: AdminStudentRow[] }>('/api/admin/students'),

  getAdminQuestions: (subject = 'All', search = '') => {
    const params = new URLSearchParams();
    if (subject && subject !== 'All') params.set('subject', subject);
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString();
    return requestJson<{ questions: AdminQuestionRecord[]; totalCount: number }>(
      `/api/admin/questions${qs ? `?${qs}` : ''}`
    );
  },

  createAdminQuestion: (payload: {
    subject: string;
    difficulty: DifficultyLevel;
    prompt: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: OptionKey;
    explanation: string;
  }) =>
    requestJson<{ question: AdminQuestionRecord }>('/api/admin/questions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminQuestion: (
    id: number,
    payload: {
      subject: string;
      difficulty: DifficultyLevel;
      prompt: string;
      optionA: string;
      optionB: string;
      optionC: string;
      optionD: string;
      correctOption: OptionKey;
      explanation: string;
    }
  ) =>
    requestJson<{ question: AdminQuestionRecord }>(`/api/admin/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteAdminQuestion: (id: number) =>
    requestJson<{ ok: boolean }>(`/api/admin/questions/${id}`, {
      method: 'DELETE',
    }),
};
