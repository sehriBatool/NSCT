import crypto from 'node:crypto';
import type { OptionKey } from './validation.ts';

export const EXAM_QUESTION_COUNT = 100;
export const EXAM_DURATION_MINUTES = 60;
export const EXAM_DURATION_MS = EXAM_DURATION_MINUTES * 60 * 1000;

export interface QuestionRecord {
  id: number;
  subject: string;
  difficulty: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: OptionKey;
  explanation: string;
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

export function selectRandomQuestionIds(allIds: number[], count = EXAM_QUESTION_COUNT): number[] {
  if (allIds.length < count) {
    throw new Error(`Insufficient questions in bank: need ${count}, found ${allIds.length}.`);
  }
  const pool = [...allIds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }
  return pool.slice(0, count);
}

export function gradeQuestions(
  questions: QuestionRecord[],
  answers: Record<string, OptionKey>
): GradingSummary {
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  const subjectMap = new Map<string, { total: number; correct: number }>();

  for (const q of questions) {
    const entry = subjectMap.get(q.subject) ?? { total: 0, correct: 0 };
    entry.total += 1;

    const chosen = answers[String(q.id)];
    if (!chosen) {
      unansweredCount += 1;
    } else if (chosen === q.correctOption) {
      correctCount += 1;
      entry.correct += 1;
    } else {
      incorrectCount += 1;
    }

    subjectMap.set(q.subject, entry);
  }

  const totalQuestions = questions.length;
  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

  const subjectBreakdown: SubjectBreakdown[] = Array.from(subjectMap.entries()).map(
    ([subject, stats]) => ({
      subject,
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 1000) / 10 : 0,
    })
  );

  return {
    score: correctCount,
    totalQuestions,
    correctCount,
    incorrectCount,
    unansweredCount,
    percentage,
    passed: percentage >= 50,
    subjectBreakdown,
  };
}
