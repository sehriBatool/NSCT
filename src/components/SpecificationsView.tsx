import React from 'react';

export const SpecificationsView: React.FC = () => {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">System Architecture &amp; Technical Reference</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
          Platform Specifications &amp; API Contract
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Technical blueprint covering the full-stack architecture, relational database schema, security controls, and REST APIs powering the 100-question timed examination system.
        </p>
      </div>

      {/* Technology Stack */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">01. Technology Stack</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-medium text-slate-500">Frontend Layer</div>
            <div className="mt-1 font-display text-sm font-semibold text-slate-900">
              React 19 · TypeScript · Tailwind CSS v4
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Responsive single-page interface with accessible keyboard navigation, tabular countdown displays, and mobile question drawers.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-medium text-slate-500">Backend Runtime &amp; API</div>
            <div className="mt-1 font-display text-sm font-semibold text-slate-900">
              Node.js 22 · Express 4 · TypeScript
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              REST API handling scrypt password hashing, HMAC-SHA256 Bearer sessions, Fisher-Yates random sampling, and server-enforced 60-minute locks.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-medium text-slate-500">Database &amp; Testing</div>
            <div className="mt-1 font-display text-sm font-semibold text-slate-900">
              SQLite (node:sqlite) · node:test
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Relational schema with foreign keys, WAL journaling, 100% parameterized prepared statements, and automated unit + integration tests.
            </p>
          </div>
        </div>
      </section>

      {/* Relational Database Schema */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">02. Relational Database Schema</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-2.5">Table</th>
                <th className="px-4 py-2.5">Key Columns</th>
                <th className="px-4 py-2.5">Purpose &amp; Integrity Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">users</td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  id (PK), reg_number (UNIQUE), full_name, email (UNIQUE), department, password_hash, security_question, security_answer_hash, role
                </td>
                <td className="px-4 py-3 text-slate-600">
                  Stores student accounts indexed by registration number with scrypt-salted hashes for passwords and recovery answers.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">questions</td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  id (PK), subject, difficulty, prompt, option_a..d, correct_option, explanation
                </td>
                <td className="px-4 py-3 text-slate-600">
                  Pre-seeded bank of 140+ MCQs across 5 subjects; minimum 100 questions enforced on deletion.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">test_attempts</td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  id (PK), user_id (FK), reg_number, question_ids_json, answers_json, flagged_json, started_at, expires_at, submitted_at, score, status
                </td>
                <td className="px-4 py-3 text-slate-600">
                  Records randomized 100-question subsets, live auto-saved responses, authoritative 60-min expiry timestamp, and final score.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">admin_config</td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  id (CHECK id=1), passcode_hash, claimed_at
                </td>
                <td className="px-4 py-3 text-slate-600">
                  Stores one-time claimed faculty admin passcode hash when ADMIN_PASSCODE env var is not set.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* REST API Endpoints */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">03. REST API Endpoints</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-2.5">Method &amp; Route</th>
                <th className="px-4 py-2.5">Auth</th>
                <th className="px-4 py-2.5">Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-2.5 font-mono text-slate-900">POST /api/auth/register · /login</td>
                <td className="px-4 py-2.5 text-slate-600">Public</td>
                <td className="px-4 py-2.5 text-slate-600">Register or sign in using normalized registration number and scrypt password verification.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono text-slate-900">POST /api/auth/recover/lookup · /reset</td>
                <td className="px-4 py-2.5 text-slate-600">Public</td>
                <td className="px-4 py-2.5 text-slate-600">Two-step security question verification and password reset.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono text-slate-900">POST /api/tests/start</td>
                <td className="px-4 py-2.5 text-slate-600">Student</td>
                <td className="px-4 py-2.5 text-slate-600">Randomly samples 100 unique questions (omitting answers) and sets a 60-minute server expiry.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono text-slate-900">PATCH /api/tests/:id/progress</td>
                <td className="px-4 py-2.5 text-slate-600">Student</td>
                <td className="px-4 py-2.5 text-slate-600">Auto-saves answers &amp; flags; rejects with HTTP 409 and freezes exam if 60 minutes elapsed.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono text-slate-900">POST /api/tests/:id/submit</td>
                <td className="px-4 py-2.5 text-slate-600">Student</td>
                <td className="px-4 py-2.5 text-slate-600">Grades all 100 questions, records final score, and unlocks Review Mode explanations.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono text-slate-900">GET /api/admin/overview · /questions</td>
                <td className="px-4 py-2.5 text-slate-600">Admin</td>
                <td className="px-4 py-2.5 text-slate-600">Monitors student scores, inspects attempt breakdowns, and manages the question bank CRUD.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
