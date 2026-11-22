import express, { type NextFunction, type Request, type Response } from 'express';
import { type DatabaseSync } from 'node:sqlite';
import { initDatabase } from './db.ts';
import {
  EXAM_DURATION_MS,
  EXAM_QUESTION_COUNT,
  gradeQuestions,
  selectRandomQuestionIds,
  type QuestionRecord,
} from './examEngine.ts';
import {
  constantTimeCompareStrings,
  hashSecret,
  signSessionToken,
  verifySecret,
  verifySessionToken,
  type SessionPayload,
} from './security.ts';
import {
  normalizeRegNumber,
  validateAdminPasscode,
  validateAnswersPayload,
  validateDepartment,
  validateEmail,
  validateFlaggedPayload,
  validateFullName,
  validatePassword,
  validateQuestionPayload,
  validateSecurityAnswer,
  validateSecurityQuestion,
  ValidationError,
  type OptionKey,
} from './validation.ts';

interface AuthenticatedRequest extends Request {
  auth?: SessionPayload;
}

interface RawUserRow {
  id: number;
  reg_number: string;
  full_name: string;
  email: string;
  department: string;
  password_hash: string;
  security_question: string;
  security_answer_hash: string;
  role: 'student' | 'admin';
  created_at: number;
}

interface RawQuestionRow {
  id: number;
  subject: string;
  difficulty: string;
  prompt: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionKey;
  explanation: string;
  created_at: number;
}

interface RawAttemptRow {
  id: number;
  user_id: number;
  reg_number: string;
  question_ids_json: string;
  answers_json: string;
  flagged_json: string;
  started_at: number;
  expires_at: number;
  submitted_at: number | null;
  score: number | null;
  total_questions: number;
  status: 'in_progress' | 'submitted' | 'expired';
  time_taken_seconds: number | null;
}

function mapQuestionRow(row: RawQuestionRow): QuestionRecord {
  return {
    id: row.id,
    subject: row.subject,
    difficulty: row.difficulty,
    prompt: row.prompt,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    optionD: row.option_d,
    correctOption: row.correct_option,
    explanation: row.explanation,
  };
}

function fetchOrderedQuestions(db: DatabaseSync, ids: number[]): QuestionRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`)
    .all(...ids) as unknown as RawQuestionRow[];
  const byId = new Map<number, QuestionRecord>();
  for (const row of rows) {
    byId.set(row.id, mapQuestionRow(row));
  }
  const ordered: QuestionRecord[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (q) ordered.push(q);
  }
  return ordered;
}

function finalizeAttemptIfNeeded(
  db: DatabaseSync,
  attempt: RawAttemptRow,
  forceStatus?: 'submitted' | 'expired'
): { attempt: RawAttemptRow; questions: QuestionRecord[] } {
  const questionIds = JSON.parse(attempt.question_ids_json) as number[];
  const questions = fetchOrderedQuestions(db, questionIds);
  const now = Date.now();
  const isTimeUp = now >= attempt.expires_at;

  if (attempt.status === 'in_progress' && (isTimeUp || forceStatus)) {
    const nextStatus: 'submitted' | 'expired' = isTimeUp ? 'expired' : (forceStatus ?? 'submitted');
    const submittedAt = isTimeUp ? attempt.expires_at : now;
    const timeTakenSeconds = Math.max(
      0,
      Math.min(EXAM_DURATION_MS / 1000, Math.round((submittedAt - attempt.started_at) / 1000))
    );
    const answers = JSON.parse(attempt.answers_json) as Record<string, OptionKey>;
    const grading = gradeQuestions(questions, answers);

    db.prepare(`
      UPDATE test_attempts
      SET status = ?, submitted_at = ?, score = ?, time_taken_seconds = ?
      WHERE id = ?
    `).run(nextStatus, submittedAt, grading.score, timeTakenSeconds, attempt.id);

    const updated = db
      .prepare('SELECT * FROM test_attempts WHERE id = ?')
      .get(attempt.id) as unknown as RawAttemptRow;
    return { attempt: updated, questions };
  }

  return { attempt, questions };
}

function formatAttemptResponse(attempt: RawAttemptRow, questions: QuestionRecord[]) {
  const answers = JSON.parse(attempt.answers_json) as Record<string, OptionKey>;
  const flagged = JSON.parse(attempt.flagged_json) as number[];
  const isFinished = attempt.status === 'submitted' || attempt.status === 'expired';
  const grading = isFinished ? gradeQuestions(questions, answers) : null;

  return {
    id: attempt.id,
    regNumber: attempt.reg_number,
    status: attempt.status,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    serverNow: Date.now(),
    submittedAt: attempt.submitted_at,
    score: attempt.score,
    totalQuestions: attempt.total_questions,
    timeTakenSeconds: attempt.time_taken_seconds,
    answers,
    flagged,
    grading,
    questions: questions.map((q, index) => ({
      index: index + 1,
      id: q.id,
      subject: q.subject,
      difficulty: q.difficulty,
      prompt: q.prompt,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      ...(isFinished
        ? {
            correctOption: q.correctOption,
            explanation: q.explanation,
          }
        : {}),
    })),
  };
}

export function createApp(dbPath?: string) {
  const db = initDatabase(dbPath);
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  const requireAuth = (role?: 'student' | 'admin') => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const token = header.slice('Bearer '.length).trim();
      const session = verifySessionToken(token);
      if (!session) {
        res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
        return;
      }
      if (role && session.role !== role) {
        res.status(403).json({ error: 'Insufficient permissions for this resource.' });
        return;
      }
      req.auth = session;
      next();
    };
  };

  app.get('/api/health', (_req, res) => {
    const row = db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number };
    res.json({ ok: true, questionBankSize: row.count });
  });

  // ---------------- STUDENT AUTH ----------------
  app.post('/api/auth/register', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const regNumber = normalizeRegNumber(body.regNumber);
      const fullName = validateFullName(body.fullName);
      const email = validateEmail(body.email);
      const department = validateDepartment(body.department);
      const password = validatePassword(body.password);
      const securityQuestion = validateSecurityQuestion(body.securityQuestion);
      const securityAnswer = validateSecurityAnswer(body.securityAnswer);

      const existingReg = db
        .prepare('SELECT id FROM users WHERE reg_number = ?')
        .get(regNumber);
      if (existingReg) {
        res.status(409).json({ error: 'An account with this registration number already exists.' });
        return;
      }

      const existingEmail = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(email);
      if (existingEmail) {
        res.status(409).json({ error: 'An account with this email address already exists.' });
        return;
      }

      const passwordHash = hashSecret(password);
      const securityAnswerHash = hashSecret(securityAnswer);
      const now = Date.now();

      const info = db
        .prepare(`
          INSERT INTO users (
            reg_number, full_name, email, department, password_hash,
            security_question, security_answer_hash, role, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'student', ?)
        `)
        .run(
          regNumber,
          fullName,
          email,
          department,
          passwordHash,
          securityQuestion,
          securityAnswerHash,
          now
        );

      const userId = Number(info.lastInsertRowid);
      const token = signSessionToken({ userId, regNumber, role: 'student' });

      res.status(201).json({
        token,
        user: {
          id: userId,
          regNumber,
          fullName,
          email,
          department,
          role: 'student',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const regNumber = normalizeRegNumber(body.regNumber);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) {
        throw new ValidationError('Password is required.');
      }

      const user = db
        .prepare('SELECT * FROM users WHERE reg_number = ? AND role = ?')
        .get(regNumber, 'student') as unknown as RawUserRow | undefined;

      if (!user || !verifySecret(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid registration number or password.' });
        return;
      }

      const token = signSessionToken({
        userId: user.id,
        regNumber: user.reg_number,
        role: 'student',
      });

      res.json({
        token,
        user: {
          id: user.id,
          regNumber: user.reg_number,
          fullName: user.full_name,
          email: user.email,
          department: user.department,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', requireAuth(), (req: AuthenticatedRequest, res) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.auth.role === 'admin') {
      res.json({
        user: {
          id: 0,
          regNumber: 'FACULTY-ADMIN',
          fullName: 'Exam Administrator',
          email: 'faculty@examcore.edu',
          department: 'Academic Assessment Office',
          role: 'admin',
        },
      });
      return;
    }

    const user = db
      .prepare('SELECT id, reg_number, full_name, email, department, role FROM users WHERE id = ?')
      .get(req.auth.userId) as unknown as Omit<RawUserRow, 'password_hash' | 'security_question' | 'security_answer_hash' | 'created_at'> | undefined;

    if (!user) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        regNumber: user.reg_number,
        fullName: user.full_name,
        email: user.email,
        department: user.department,
        role: user.role,
      },
    });
  });

  app.post('/api/auth/recover/lookup', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const regNumber = normalizeRegNumber(body.regNumber);
      const email = validateEmail(body.email);

      const user = db
        .prepare('SELECT security_question FROM users WHERE reg_number = ? AND email = ?')
        .get(regNumber, email) as { security_question: string } | undefined;

      if (!user) {
        res.status(404).json({ error: 'No matching account found for that registration number and email.' });
        return;
      }

      res.json({ securityQuestion: user.security_question });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/recover/reset', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const regNumber = normalizeRegNumber(body.regNumber);
      const email = validateEmail(body.email);
      const securityAnswer = validateSecurityAnswer(body.securityAnswer);
      const newPassword = validatePassword(body.newPassword);

      const user = db
        .prepare('SELECT id, security_answer_hash FROM users WHERE reg_number = ? AND email = ?')
        .get(regNumber, email) as { id: number; security_answer_hash: string } | undefined;

      if (!user || !verifySecret(securityAnswer, user.security_answer_hash)) {
        res.status(401).json({ error: 'Verification failed. Check your registration number, email, and security answer.' });
        return;
      }

      const newHash = hashSecret(newPassword);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

      res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
    } catch (err) {
      next(err);
    }
  });

  // ---------------- ADMIN AUTH ----------------
  app.get('/api/admin/status', (_req, res) => {
    const envPass = process.env.ADMIN_PASSCODE?.trim();
    if (envPass) {
      res.json({ configured: true, source: 'env' });
      return;
    }
    const row = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
    if (row) {
      res.json({ configured: true, source: 'claimed' });
      return;
    }
    res.json({ configured: false, source: 'unclaimed' });
  });

  app.post('/api/admin/bootstrap', (req, res, next) => {
    try {
      const envPass = process.env.ADMIN_PASSCODE?.trim();
      if (envPass) {
        res.status(409).json({ error: 'Admin passcode is managed via environment configuration.' });
        return;
      }
      const existing = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
      if (existing) {
        res.status(409).json({ error: 'Admin passcode has already been claimed.' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const passcode = validateAdminPasscode(body.passcode);
      const passcodeHash = hashSecret(passcode);

      db.prepare('INSERT INTO admin_config (id, passcode_hash, claimed_at) VALUES (1, ?, ?)').run(
        passcodeHash,
        Date.now()
      );

      const token = signSessionToken({ userId: 0, regNumber: 'FACULTY-ADMIN', role: 'admin' });
      res.status(201).json({
        token,
        user: {
          id: 0,
          regNumber: 'FACULTY-ADMIN',
          fullName: 'Exam Administrator',
          email: 'faculty@examcore.edu',
          department: 'Academic Assessment Office',
          role: 'admin',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/login', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const passcode = typeof body.passcode === 'string' ? body.passcode : '';
      if (!passcode) {
        throw new ValidationError('Passcode is required.');
      }

      const envPass = process.env.ADMIN_PASSCODE?.trim();
      let authorized = false;

      if (envPass) {
        authorized = constantTimeCompareStrings(passcode, envPass);
      } else {
        const config = db
          .prepare('SELECT passcode_hash FROM admin_config WHERE id = 1')
          .get() as { passcode_hash: string } | undefined;
        if (!config) {
          res.status(409).json({ error: 'Admin passcode is not yet claimed. Complete initial setup first.' });
          return;
        }
        authorized = verifySecret(passcode, config.passcode_hash);
      }

      if (!authorized) {
        res.status(401).json({ error: 'Invalid faculty administrator passcode.' });
        return;
      }

      const token = signSessionToken({ userId: 0, regNumber: 'FACULTY-ADMIN', role: 'admin' });
      res.json({
        token,
        user: {
          id: 0,
          regNumber: 'FACULTY-ADMIN',
          fullName: 'Exam Administrator',
          email: 'faculty@examcore.edu',
          department: 'Academic Assessment Office',
          role: 'admin',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------- STUDENT EXAM ROUTES ----------------
  app.get('/api/tests', requireAuth('student'), (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.userId;
    const rows = db
      .prepare('SELECT * FROM test_attempts WHERE user_id = ? ORDER BY started_at DESC')
      .all(userId) as unknown as RawAttemptRow[];

    const summaries = rows.map((raw) => {
      const { attempt } = finalizeAttemptIfNeeded(db, raw);
      const answers = JSON.parse(attempt.answers_json) as Record<string, OptionKey>;
      return {
        id: attempt.id,
        regNumber: attempt.reg_number,
        status: attempt.status,
        startedAt: attempt.started_at,
        expiresAt: attempt.expires_at,
        submittedAt: attempt.submitted_at,
        score: attempt.score,
        totalQuestions: attempt.total_questions,
        answeredCount: Object.keys(answers).length,
        timeTakenSeconds: attempt.time_taken_seconds,
      };
    });

    const bankCount = (db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number }).count;

    res.json({
      attempts: summaries,
      examConfig: {
        questionCount: EXAM_QUESTION_COUNT,
        durationMinutes: EXAM_DURATION_MS / 60000,
        bankSize: bankCount,
      },
    });
  });

  app.post('/api/tests/start', requireAuth('student'), (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.auth!.userId;
      const regNumber = req.auth!.regNumber;

      // Resume active non-expired test if one exists
      const activeRaw = db
        .prepare("SELECT * FROM test_attempts WHERE user_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1")
        .get(userId) as unknown as RawAttemptRow | undefined;

      if (activeRaw) {
        const { attempt, questions } = finalizeAttemptIfNeeded(db, activeRaw);
        if (attempt.status === 'in_progress') {
          res.json(formatAttemptResponse(attempt, questions));
          return;
        }
      }

      const allQuestionRows = db.prepare('SELECT id FROM questions').all() as { id: number }[];
      const allIds = allQuestionRows.map((r) => r.id);
      const selectedIds = selectRandomQuestionIds(allIds, EXAM_QUESTION_COUNT);

      const startedAt = Date.now();
      const expiresAt = startedAt + EXAM_DURATION_MS;

      const info = db
        .prepare(`
          INSERT INTO test_attempts (
            user_id, reg_number, question_ids_json, answers_json, flagged_json,
            started_at, expires_at, total_questions, status
          ) VALUES (?, ?, ?, '{}', '[]', ?, ?, ?, 'in_progress')
        `)
        .run(
          userId,
          regNumber,
          JSON.stringify(selectedIds),
          startedAt,
          expiresAt,
          EXAM_QUESTION_COUNT
        );

      const created = db
        .prepare('SELECT * FROM test_attempts WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as unknown as RawAttemptRow;
      const questions = fetchOrderedQuestions(db, selectedIds);

      res.status(201).json(formatAttemptResponse(created, questions));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tests/:id', requireAuth('student'), (req: AuthenticatedRequest, res, next) => {
    try {
      const attemptId = Number(req.params.id);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        throw new ValidationError('Invalid test attempt ID.');
      }

      const raw = db
        .prepare('SELECT * FROM test_attempts WHERE id = ? AND user_id = ?')
        .get(attemptId, req.auth!.userId) as unknown as RawAttemptRow | undefined;

      if (!raw) {
        res.status(404).json({ error: 'Test attempt not found.' });
        return;
      }

      const { attempt, questions } = finalizeAttemptIfNeeded(db, raw);
      res.json(formatAttemptResponse(attempt, questions));
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/tests/:id/progress', requireAuth('student'), (req: AuthenticatedRequest, res, next) => {
    try {
      const attemptId = Number(req.params.id);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        throw new ValidationError('Invalid test attempt ID.');
      }

      const raw = db
        .prepare('SELECT * FROM test_attempts WHERE id = ? AND user_id = ?')
        .get(attemptId, req.auth!.userId) as unknown as RawAttemptRow | undefined;

      if (!raw) {
        res.status(404).json({ error: 'Test attempt not found.' });
        return;
      }

      const checked = finalizeAttemptIfNeeded(db, raw);
      if (checked.attempt.status !== 'in_progress') {
        res.status(409).json({
          error: 'Time is up or the test has already been submitted. Answers are frozen.',
          attempt: formatAttemptResponse(checked.attempt, checked.questions),
        });
        return;
      }

      const questionIds = new Set<number>(JSON.parse(checked.attempt.question_ids_json) as number[]);
      const body = (req.body ?? {}) as Record<string, unknown>;

      let nextAnswersJson = checked.attempt.answers_json;
      let nextFlaggedJson = checked.attempt.flagged_json;

      if (body.answers !== undefined) {
        const sanitizedAnswers = validateAnswersPayload(body.answers, questionIds);
        nextAnswersJson = JSON.stringify(sanitizedAnswers);
      }
      if (body.flagged !== undefined) {
        const sanitizedFlagged = validateFlaggedPayload(body.flagged, questionIds);
        nextFlaggedJson = JSON.stringify(sanitizedFlagged);
      }

      db.prepare('UPDATE test_attempts SET answers_json = ?, flagged_json = ? WHERE id = ?').run(
        nextAnswersJson,
        nextFlaggedJson,
        attemptId
      );

      res.json({ ok: true, serverNow: Date.now() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tests/:id/submit', requireAuth('student'), (req: AuthenticatedRequest, res, next) => {
    try {
      const attemptId = Number(req.params.id);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        throw new ValidationError('Invalid test attempt ID.');
      }

      const raw = db
        .prepare('SELECT * FROM test_attempts WHERE id = ? AND user_id = ?')
        .get(attemptId, req.auth!.userId) as unknown as RawAttemptRow | undefined;

      if (!raw) {
        res.status(404).json({ error: 'Test attempt not found.' });
        return;
      }

      // Allow final answers snapshot ONLY if test has not already finalized or expired
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (raw.status === 'in_progress' && Date.now() < raw.expires_at && body.answers !== undefined) {
        const questionIds = new Set<number>(JSON.parse(raw.question_ids_json) as number[]);
        const sanitizedAnswers = validateAnswersPayload(body.answers, questionIds);
        db.prepare('UPDATE test_attempts SET answers_json = ? WHERE id = ?').run(
          JSON.stringify(sanitizedAnswers),
          attemptId
        );
        raw.answers_json = JSON.stringify(sanitizedAnswers);
      }

      const { attempt, questions } = finalizeAttemptIfNeeded(db, raw, 'submitted');
      res.json(formatAttemptResponse(attempt, questions));
    } catch (err) {
      next(err);
    }
  });

  // ---------------- ADMIN / TEACHER ROUTES ----------------
  app.get('/api/admin/overview', requireAuth('admin'), (_req, res) => {
    const rawAttempts = db
      .prepare(`
        SELECT a.*, u.full_name, u.email, u.department
        FROM test_attempts a
        JOIN users u ON u.id = a.user_id
        ORDER BY a.started_at DESC
      `)
      .all() as unknown as (RawAttemptRow & {
      full_name: string;
      email: string;
      department: string;
    })[];

    const attempts = rawAttempts.map((raw) => {
      const { attempt } = finalizeAttemptIfNeeded(db, raw);
      const answers = JSON.parse(attempt.answers_json) as Record<string, OptionKey>;
      return {
        id: attempt.id,
        userId: attempt.user_id,
        regNumber: attempt.reg_number,
        fullName: raw.full_name,
        email: raw.email,
        department: raw.department,
        status: attempt.status,
        startedAt: attempt.started_at,
        expiresAt: attempt.expires_at,
        submittedAt: attempt.submitted_at,
        score: attempt.score,
        totalQuestions: attempt.total_questions,
        answeredCount: Object.keys(answers).length,
        timeTakenSeconds: attempt.time_taken_seconds,
      };
    });

    const completed = attempts.filter((a) => a.status !== 'in_progress' && a.score !== null);
    const totalStudents = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'student'").get() as { count: number }).count;
    const totalQuestions = (db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number }).count;
    const avgScore =
      completed.length > 0
        ? Math.round((completed.reduce((acc, a) => acc + (a.score ?? 0), 0) / completed.length) * 10) / 10
        : 0;
    const passCount = completed.filter((a) => (a.score ?? 0) >= 50).length;
    const passRate = completed.length > 0 ? Math.round((passCount / completed.length) * 1000) / 10 : 0;

    const subjectCounts = db
      .prepare('SELECT subject, COUNT(*) AS count FROM questions GROUP BY subject ORDER BY subject ASC')
      .all() as { subject: string; count: number }[];

    res.json({
      metrics: {
        totalStudents,
        totalAttempts: attempts.length,
        completedAttempts: completed.length,
        avgScore,
        passRate,
        totalQuestions,
      },
      subjectCounts,
      attempts,
    });
  });

  app.get('/api/admin/attempts/:id', requireAuth('admin'), (req, res, next) => {
    try {
      const attemptId = Number(req.params.id);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        throw new ValidationError('Invalid test attempt ID.');
      }
      const raw = db
        .prepare('SELECT * FROM test_attempts WHERE id = ?')
        .get(attemptId) as unknown as RawAttemptRow | undefined;
      if (!raw) {
        res.status(404).json({ error: 'Test attempt not found.' });
        return;
      }
      const { attempt, questions } = finalizeAttemptIfNeeded(db, raw);
      res.json(formatAttemptResponse(attempt, questions));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/admin/students', requireAuth('admin'), (_req, res) => {
    const rows = db
      .prepare(`
        SELECT u.id, u.reg_number, u.full_name, u.email, u.department, u.created_at,
               COUNT(a.id) AS attempt_count,
               MAX(a.score) AS best_score
        FROM users u
        LEFT JOIN test_attempts a ON a.user_id = u.id
        WHERE u.role = 'student'
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `)
      .all() as {
      id: number;
      reg_number: string;
      full_name: string;
      email: string;
      department: string;
      created_at: number;
      attempt_count: number;
      best_score: number | null;
    }[];

    res.json({
      students: rows.map((r) => ({
        id: r.id,
        regNumber: r.reg_number,
        fullName: r.full_name,
        email: r.email,
        department: r.department,
        createdAt: r.created_at,
        attemptCount: r.attempt_count,
        bestScore: r.best_score,
      })),
    });
  });

  app.get('/api/admin/questions', requireAuth('admin'), (req, res) => {
    const subjectFilter = typeof req.query.subject === 'string' ? req.query.subject.trim() : '';
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let rows: RawQuestionRow[];
    if (subjectFilter && subjectFilter !== 'All') {
      rows = db
        .prepare('SELECT * FROM questions WHERE subject = ? ORDER BY id DESC')
        .all(subjectFilter) as unknown as RawQuestionRow[];
    } else {
      rows = db.prepare('SELECT * FROM questions ORDER BY id DESC').all() as unknown as RawQuestionRow[];
    }

    const mapped = rows
      .map(mapQuestionRow)
      .filter((q) => {
        if (!searchFilter) return true;
        return (
          q.prompt.toLowerCase().includes(searchFilter) ||
          q.subject.toLowerCase().includes(searchFilter) ||
          q.optionA.toLowerCase().includes(searchFilter) ||
          q.optionB.toLowerCase().includes(searchFilter) ||
          q.optionC.toLowerCase().includes(searchFilter) ||
          q.optionD.toLowerCase().includes(searchFilter)
        );
      });

    res.json({ questions: mapped, totalCount: rows.length });
  });

  app.post('/api/admin/questions', requireAuth('admin'), (req, res, next) => {
    try {
      const validated = validateQuestionPayload((req.body ?? {}) as Record<string, unknown>);
      const info = db
        .prepare(`
          INSERT INTO questions (
            subject, difficulty, prompt, option_a, option_b, option_c, option_d,
            correct_option, explanation, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          validated.subject,
          validated.difficulty,
          validated.prompt,
          validated.optionA,
          validated.optionB,
          validated.optionC,
          validated.optionD,
          validated.correctOption,
          validated.explanation,
          Date.now()
        );

      const created = db
        .prepare('SELECT * FROM questions WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as unknown as RawQuestionRow;

      res.status(201).json({ question: mapQuestionRow(created) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/admin/questions/:id', requireAuth('admin'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationError('Invalid question ID.');
      }
      const existing = db.prepare('SELECT id FROM questions WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: 'Question not found.' });
        return;
      }

      const validated = validateQuestionPayload((req.body ?? {}) as Record<string, unknown>);
      db.prepare(`
        UPDATE questions
        SET subject = ?, difficulty = ?, prompt = ?, option_a = ?, option_b = ?,
            option_c = ?, option_d = ?, correct_option = ?, explanation = ?
        WHERE id = ?
      `).run(
        validated.subject,
        validated.difficulty,
        validated.prompt,
        validated.optionA,
        validated.optionB,
        validated.optionC,
        validated.optionD,
        validated.correctOption,
        validated.explanation,
        id
      );

      const updated = db
        .prepare('SELECT * FROM questions WHERE id = ?')
        .get(id) as unknown as RawQuestionRow;

      res.json({ question: mapQuestionRow(updated) });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/admin/questions/:id', requireAuth('admin'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationError('Invalid question ID.');
      }
      const total = (db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number }).count;
      if (total <= EXAM_QUESTION_COUNT) {
        res.status(409).json({
          error: `Cannot delete question: at least ${EXAM_QUESTION_COUNT} questions must remain in the bank for randomized 100-question exams.`,
        });
        return;
      }

      const result = db.prepare('DELETE FROM questions WHERE id = ?').run(id);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Question not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Centralized error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Unhandled API error:', err);
    res.status(500).json({ error: 'An internal server error occurred.' });
  });

  return {
    app,
    db,
    close: () => db.close(),
  };
}
