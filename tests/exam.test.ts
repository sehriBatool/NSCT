import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/server/app.ts';
import { EXAM_QUESTION_COUNT, gradeQuestions, selectRandomQuestionIds } from '../src/server/examEngine.ts';
import { hashSecret, signSessionToken, verifySecret, verifySessionToken } from '../src/server/security.ts';
import { normalizeRegNumber, validateEmail, validatePassword, ValidationError } from '../src/server/validation.ts';

describe('Unit Tests: Validation, Security, and Exam Engine', () => {
  it('normalizes valid registration numbers and rejects SQL injection payloads', () => {
    assert.equal(normalizeRegNumber(' reg-2026-1001 '), 'REG-2026-1001');
    assert.throws(() => normalizeRegNumber("REG-1' OR 1=1 --"), ValidationError);
    assert.throws(() => normalizeRegNumber('REG; DROP TABLE users;'), ValidationError);
    assert.throws(() => normalizeRegNumber('ab'), ValidationError);
  });

  it('validates email and password strength rules', () => {
    assert.equal(validateEmail(' Student@University.EDU '), 'student@university.edu');
    assert.throws(() => validateEmail('not-an-email'), ValidationError);
    assert.equal(validatePassword('ExamPass2026'), 'ExamPass2026');
    assert.throws(() => validatePassword('short1'), ValidationError);
    assert.throws(() => validatePassword('onlyletters'), ValidationError);
  });

  it('hashes secrets with scrypt and verifies them in constant time', () => {
    const hash = hashSecret('SecurePass99');
    assert.ok(hash.includes(':'));
    assert.equal(verifySecret('SecurePass99', hash), true);
    assert.equal(verifySecret('WrongPass99', hash), false);
  });

  it('signs and verifies HMAC session tokens and rejects tampered tokens', () => {
    const token = signSessionToken({ userId: 7, regNumber: 'REG-2026-0007', role: 'student' });
    const verified = verifySessionToken(token);
    assert.ok(verified);
    assert.equal(verified.userId, 7);
    assert.equal(verified.regNumber, 'REG-2026-0007');

    const tampered = token.slice(0, -4) + 'xxxx';
    assert.equal(verifySessionToken(tampered), null);
  });

  it('selects 100 unique random question IDs from a larger bank', () => {
    const bank = Array.from({ length: 140 }, (_, i) => i + 1);
    const chosen = selectRandomQuestionIds(bank, EXAM_QUESTION_COUNT);
    assert.equal(chosen.length, 100);
    assert.equal(new Set(chosen).size, 100);
  });

  it('grades questions accurately with subject breakdown', () => {
    const questions = [
      {
        id: 1,
        subject: 'Math',
        difficulty: 'easy',
        prompt: '2+2?',
        optionA: '3',
        optionB: '4',
        optionC: '5',
        optionD: '6',
        correctOption: 'B' as const,
        explanation: '2+2=4',
      },
      {
        id: 2,
        subject: 'Physics',
        difficulty: 'easy',
        prompt: 'Unit of force?',
        optionA: 'Newton',
        optionB: 'Joule',
        optionC: 'Watt',
        optionD: 'Ohm',
        correctOption: 'A' as const,
        explanation: 'SI unit is Newton',
      },
    ];
    const summary = gradeQuestions(questions, { '1': 'B', '2': 'C' });
    assert.equal(summary.score, 1);
    assert.equal(summary.correctCount, 1);
    assert.equal(summary.incorrectCount, 1);
    assert.equal(summary.unansweredCount, 0);
    assert.equal(summary.percentage, 50);
    assert.equal(summary.passed, true);
  });
});

describe('Integration Tests: Auth, 100-MCQ Exam, Timer Freeze, Review, and Admin APIs', () => {
  let server: http.Server;
  let baseUrl: string;
  let dbClose: () => void;
  let dbRef: ReturnType<typeof createApp>['db'];

  before(async () => {
    const { app, db, close } = createApp(':memory:');
    dbRef = db;
    dbClose = close;
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to obtain test server port');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    dbClose();
  });

  async function api(path: string, options: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    const data = (await res.json()) as Record<string, unknown>;
    return { status: res.status, data };
  }

  it('registers a student, recovers password, logs in, completes 100-MCQ test, and verifies review & freeze', async () => {
    // 1. Health check confirms 140 seeded questions
    const health = await api('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.questionBankSize, 140);

    // 2. Register student
    const regRes = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        regNumber: 'REG-2026-5001',
        fullName: 'Ada Lovelace',
        email: 'ada@examcore.edu',
        department: 'Computer Science',
        password: 'InitialPass2026',
        securityQuestion: 'What was your childhood nickname?',
        securityAnswer: 'Analytical',
      }),
    });
    assert.equal(regRes.status, 201);
    assert.ok(typeof regRes.data.token === 'string');

    // 3. Duplicate registration rejected
    const dupRes = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        regNumber: 'REG-2026-5001',
        fullName: 'Duplicate User',
        email: 'dup@examcore.edu',
        department: 'Physics',
        password: 'InitialPass2026',
        securityQuestion: 'What was your childhood nickname?',
        securityAnswer: 'Test',
      }),
    });
    assert.equal(dupRes.status, 409);

    // 4. Password recovery flow
    const lookupRes = await api('/api/auth/recover/lookup', {
      method: 'POST',
      body: JSON.stringify({
        regNumber: 'REG-2026-5001',
        email: 'ada@examcore.edu',
      }),
    });
    assert.equal(lookupRes.status, 200);
    assert.equal(lookupRes.data.securityQuestion, 'What was your childhood nickname?');

    const resetRes = await api('/api/auth/recover/reset', {
      method: 'POST',
      body: JSON.stringify({
        regNumber: 'REG-2026-5001',
        email: 'ada@examcore.edu',
        securityAnswer: 'analytical',
        newPassword: 'UpdatedPass2026',
      }),
    });
    assert.equal(resetRes.status, 200);

    // 5. Login with updated password
    const loginRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        regNumber: 'REG-2026-5001',
        password: 'UpdatedPass2026',
      }),
    });
    assert.equal(loginRes.status, 200);
    const studentToken = loginRes.data.token as string;
    assert.ok(studentToken);

    // 6. Start 100-MCQ test
    const startRes = await api('/api/tests/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(startRes.status, 201);
    const attemptId = startRes.data.id as number;
    const questions = startRes.data.questions as Array<{ id: number; correctOption?: string }>;
    assert.equal(questions.length, 100);
    assert.equal(startRes.data.status, 'in_progress');
    // Ensure answers are NOT leaked during active test
    assert.equal(questions[0].correctOption, undefined);

    // 7. Save partial progress
    const partialAnswers: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      partialAnswers[String(questions[i].id)] = 'A';
    }
    const patchRes = await api(`/api/tests/${attemptId}/progress`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: partialAnswers,
        flagged: [questions[0].id],
      }),
    });
    assert.equal(patchRes.status, 200);

    // 8. Submit test and verify score + review mode reveals correct answers
    const submitRes = await api(`/api/tests/${attemptId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ answers: partialAnswers }),
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.data.status, 'submitted');
    assert.equal(typeof submitRes.data.score, 'number');
    const reviewedQuestions = submitRes.data.questions as Array<{ correctOption?: string; explanation?: string }>;
    assert.ok(reviewedQuestions[0].correctOption);
    assert.ok(reviewedQuestions[0].explanation);

    // 9. Start a second attempt and test 60-minute expiration automatic freeze
    const secondStart = await api('/api/tests/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(secondStart.status, 201);
    const expiredAttemptId = secondStart.data.id as number;

    // Simulate 60-minute limit reached in SQLite
    dbRef.prepare('UPDATE test_attempts SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, expiredAttemptId);

    const latePatch = await api(`/api/tests/${expiredAttemptId}/progress`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ answers: {} }),
    });
    assert.equal(latePatch.status, 409);
    const frozenAttempt = latePatch.data.attempt as { status: string; score: number };
    assert.equal(frozenAttempt.status, 'expired');
    assert.equal(frozenAttempt.score, 0);
  });

  it('bootstraps faculty admin, inspects student performance, and manages question bank', async () => {
    const statusBefore = await api('/api/admin/status');
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.configured, false);

    const bootstrap = await api('/api/admin/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ passcode: 'FacultyPass2026' }),
    });
    assert.equal(bootstrap.status, 201);
    const adminToken = bootstrap.data.token as string;

    const overview = await api('/api/admin/overview', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(overview.status, 200);
    const metrics = overview.data.metrics as { totalQuestions: number; totalAttempts: number };
    assert.equal(metrics.totalQuestions, 140);
    assert.ok(metrics.totalAttempts >= 2);

    // Create a new question
    const createQ = await api('/api/admin/questions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: 'Computer Science',
        difficulty: 'medium',
        prompt: 'Which HTTP method is idempotent and typically replaces a target resource?',
        optionA: 'POST',
        optionB: 'PUT',
        optionC: 'PATCH',
        optionD: 'CONNECT',
        correctOption: 'B',
        explanation: 'PUT is idempotent and replaces the target representation.',
      }),
    });
    assert.equal(createQ.status, 201);
    const newId = (createQ.data.question as { id: number }).id;

    // Delete the newly created question
    const deleteQ = await api(`/api/admin/questions/${newId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deleteQ.status, 200);
  });
});
