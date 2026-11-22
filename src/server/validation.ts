export type OptionKey = 'A' | 'B' | 'C' | 'D';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

const REG_NUMBER_REGEX = /^[A-Z0-9][A-Z0-9\-/]{2,22}[A-Z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SQL_INJECTION_HEURISTIC = /(?:--|;|\b(?:UNION\s+SELECT|DROP\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|DELETE\s+FROM|OR\s+1=1|EXEC\s*\()\b)/i;

export function normalizeRegNumber(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Registration number must be a string.');
  }
  const normalized = raw.trim().toUpperCase();
  if (!REG_NUMBER_REGEX.test(normalized) || SQL_INJECTION_HEURISTIC.test(normalized)) {
    throw new ValidationError(
      'Registration number must be 4–24 characters using letters, numbers, hyphens, or slashes (e.g., REG-2026-1001).'
    );
  }
  return normalized;
}

export function validateEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Email address must be a string.');
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length > 120 || !EMAIL_REGEX.test(normalized) || SQL_INJECTION_HEURISTIC.test(normalized)) {
    throw new ValidationError('Please enter a valid email address.');
  }
  return normalized;
}

export function validateFullName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Full name must be a string.');
  }
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 80 || /[<>]/.test(cleaned) || SQL_INJECTION_HEURISTIC.test(cleaned)) {
    throw new ValidationError('Full name must be between 2 and 80 valid characters.');
  }
  return cleaned;
}

export function validateDepartment(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Department must be a string.');
  }
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 80 || /[<>]/.test(cleaned) || SQL_INJECTION_HEURISTIC.test(cleaned)) {
    throw new ValidationError('Department must be between 2 and 80 valid characters.');
  }
  return cleaned;
}

export function validatePassword(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Password must be a string.');
  }
  if (raw.length < 8 || raw.length > 128) {
    throw new ValidationError('Password must be between 8 and 128 characters.');
  }
  if (!/[A-Za-z]/.test(raw) || !/[0-9]/.test(raw)) {
    throw new ValidationError('Password must include at least one letter and one number.');
  }
  return raw;
}

export function validateSecurityQuestion(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Security question must be a string.');
  }
  const cleaned = raw.trim();
  if (cleaned.length < 8 || cleaned.length > 160 || /[<>]/.test(cleaned)) {
    throw new ValidationError('Please select or enter a valid security question.');
  }
  return cleaned;
}

export function validateSecurityAnswer(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Security answer must be a string.');
  }
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length < 2 || cleaned.length > 120) {
    throw new ValidationError('Security answer must be between 2 and 120 characters.');
  }
  return cleaned;
}

export function validateAdminPasscode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Passcode must be a string.');
  }
  if (raw.length < 6 || raw.length > 128) {
    throw new ValidationError('Passcode must be between 6 and 128 characters.');
  }
  return raw;
}

export interface ValidatedQuestionInput {
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

export function validateQuestionPayload(body: Record<string, unknown>): ValidatedQuestionInput {
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const difficultyRaw = typeof body.difficulty === 'string' ? body.difficulty.trim().toLowerCase() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const optionA = typeof body.optionA === 'string' ? body.optionA.trim() : '';
  const optionB = typeof body.optionB === 'string' ? body.optionB.trim() : '';
  const optionC = typeof body.optionC === 'string' ? body.optionC.trim() : '';
  const optionD = typeof body.optionD === 'string' ? body.optionD.trim() : '';
  const correctRaw = typeof body.correctOption === 'string' ? body.correctOption.trim().toUpperCase() : '';
  const explanation = typeof body.explanation === 'string' ? body.explanation.trim() : '';

  if (subject.length < 2 || subject.length > 60) {
    throw new ValidationError('Subject must be between 2 and 60 characters.');
  }
  if (difficultyRaw !== 'easy' && difficultyRaw !== 'medium' && difficultyRaw !== 'hard') {
    throw new ValidationError('Difficulty must be easy, medium, or hard.');
  }
  if (prompt.length < 8 || prompt.length > 600) {
    throw new ValidationError('Question prompt must be between 8 and 600 characters.');
  }
  if (!optionA || !optionB || !optionC || !optionD) {
    throw new ValidationError('All four answer options (A, B, C, D) are required.');
  }
  if (correctRaw !== 'A' && correctRaw !== 'B' && correctRaw !== 'C' && correctRaw !== 'D') {
    throw new ValidationError('Correct option must be A, B, C, or D.');
  }

  return {
    subject,
    difficulty: difficultyRaw,
    prompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption: correctRaw,
    explanation: explanation || 'No additional explanation provided.',
  };
}

export function validateAnswersPayload(
  rawAnswers: unknown,
  allowedQuestionIds: Set<number>
): Record<string, OptionKey> {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    throw new ValidationError('Answers must be a key-value map of question IDs to options.');
  }
  const sanitized: Record<string, OptionKey> = {};
  for (const [key, value] of Object.entries(rawAnswers as Record<string, unknown>)) {
    const numId = Number(key);
    if (!Number.isInteger(numId) || !allowedQuestionIds.has(numId)) {
      throw new ValidationError(`Invalid question identifier in answers payload: ${key}`);
    }
    if (value !== 'A' && value !== 'B' && value !== 'C' && value !== 'D') {
      throw new ValidationError(`Invalid answer option for question ${key}. Must be A, B, C, or D.`);
    }
    sanitized[String(numId)] = value;
  }
  return sanitized;
}

export function validateFlaggedPayload(rawFlagged: unknown, allowedQuestionIds: Set<number>): number[] {
  if (!Array.isArray(rawFlagged)) {
    throw new ValidationError('Flagged questions must be an array of question IDs.');
  }
  const unique = new Set<number>();
  for (const item of rawFlagged) {
    const numId = Number(item);
    if (!Number.isInteger(numId) || !allowedQuestionIds.has(numId)) {
      throw new ValidationError(`Invalid flagged question ID: ${String(item)}`);
    }
    unique.add(numId);
  }
  return Array.from(unique);
}

export class ValidationError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}
