import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { QUESTION_BANK_SEED } from './questionBankSeed.ts';

export function initDatabase(dbPath?: string): DatabaseSync {
  const resolvedPath = dbPath ?? path.resolve(process.cwd(), 'data', 'examcore.db');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reg_number TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      security_question TEXT NOT NULL,
      security_answer_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      passcode_hash TEXT NOT NULL,
      claimed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
      prompt TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
      explanation TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reg_number TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      flagged_json TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      submitted_at INTEGER,
      score INTEGER,
      total_questions INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
      time_taken_seconds INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_user ON test_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_reg ON test_attempts(reg_number);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
  `);

  const countRow = db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number } | undefined;
  if (!countRow || countRow.count === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO questions (
        subject, difficulty, prompt, option_a, option_b, option_c, option_d,
        correct_option, explanation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    db.exec('BEGIN');
    try {
      for (const q of QUESTION_BANK_SEED) {
        insertStmt.run(
          q.subject,
          q.difficulty,
          q.prompt,
          q.optionA,
          q.optionB,
          q.optionC,
          q.optionD,
          q.correctOption,
          q.explanation,
          now
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return db;
}
