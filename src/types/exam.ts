export type OptionKey = 'A' | 'B' | 'C' | 'D';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type UserRole = 'student' | 'admin';

export interface UserProfile {
  id: number;
  regNumber: string;
  fullName: string;
  email: string;
  department: string;
  role: UserRole;
}

export interface AttemptSummary {
  id: number;
  regNumber: string;
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: number;
  expiresAt: number;
  submittedAt: number | null;
  score: number | null;
  totalQuestions: number;
  answeredCount: number;
  timeTakenSeconds: number | null;
}

export interface ExamQuestionItem {
  index: number;
  id: number;
  subject: string;
  difficulty: DifficultyLevel;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption?: OptionKey;
  explanation?: string;
}

export interface SubjectBreakdown {
  subject: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface GradingSummary {
  score: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  percentage: number;
  passed: boolean;
  subjectBreakdown: SubjectBreakdown[];
}

export interface TestAttemptDetail {
  id: number;
  regNumber: string;
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: number;
  expiresAt: number;
  serverNow: number;
  submittedAt: number | null;
  score: number | null;
  totalQuestions: number;
  timeTakenSeconds: number | null;
  answers: Record<string, OptionKey>;
  flagged: number[];
  grading: GradingSummary | null;
  questions: ExamQuestionItem[];
}

export interface AdminAttemptRow extends AttemptSummary {
  userId: number;
  fullName: string;
  email: string;
  department: string;
}

export interface AdminOverviewData {
  metrics: {
    totalStudents: number;
    totalAttempts: number;
    completedAttempts: number;
    avgScore: number;
    passRate: number;
    totalQuestions: number;
  };
  subjectCounts: Array<{ subject: string; count: number }>;
  attempts: AdminAttemptRow[];
}

export interface AdminStudentRow {
  id: number;
  regNumber: string;
  fullName: string;
  email: string;
  department: string;
  createdAt: number;
  attemptCount: number;
  bestScore: number | null;
}

export interface AdminQuestionRecord {
  id: number;
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
