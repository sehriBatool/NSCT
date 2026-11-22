import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpenCheck, KeyRound, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { UserProfile } from '../types/exam.ts';

interface AuthPortalProps {
  initialTab?: 'login' | 'register' | 'recover' | 'admin';
  onAuthenticated: (token: string, user: UserProfile) => void;
}

const SECURITY_QUESTIONS = [
  'What was the name of your first elementary school?',
  'What city were you born in?',
  'What was your childhood nickname?',
  'What is the name of your favorite childhood teacher?',
];

export const AuthPortal: React.FC<AuthPortalProps> = ({ initialTab = 'login', onAuthenticated }) => {
  const [tab, setTab] = useState<'login' | 'register' | 'recover' | 'admin'>(initialTab);
  const [imageFailed, setImageFailed] = useState(false);

  // Login state
  const [loginReg, setLoginReg] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regNumber, setRegNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Recovery state
  const [recReg, setRecReg] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recQuestion, setRecQuestion] = useState<string | null>(null);
  const [recAnswer, setRecAnswer] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');
  const [recSuccess, setRecSuccess] = useState<string | null>(null);

  // Admin state
  const [adminStatus, setAdminStatus] = useState<'loading' | 'unclaimed' | 'configured'>('loading');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminConfirmPasscode, setAdminConfirmPasscode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
    setError(null);
  }, [initialTab]);

  useEffect(() => {
    if (tab !== 'admin') return;
    let active = true;
    setAdminStatus('loading');
    api
      .getAdminStatus()
      .then((res) => {
        if (!active) return;
        setAdminStatus(res.configured ? 'configured' : 'unclaimed');
      })
      .catch(() => {
        if (active) setAdminStatus('configured');
      });
    return () => {
      active = false;
    };
  }, [tab]);

  const handleTabChange = (next: 'login' | 'register' | 'recover' | 'admin') => {
    setTab(next);
    setError(null);
    setRecSuccess(null);
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.loginStudent({ regNumber: loginReg, password: loginPassword });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.registerStudent({
        regNumber,
        fullName,
        email,
        department,
        password,
        securityQuestion,
        securityAnswer,
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecSuccess(null);
    setSubmitting(true);
    try {
      const res = await api.lookupRecoveryQuestion({ regNumber: recReg, email: recEmail });
      setRecQuestion(res.securityQuestion);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Account lookup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.resetPasswordWithRecovery({
        regNumber: recReg,
        email: recEmail,
        securityAnswer: recAnswer,
        newPassword: recNewPassword,
      });
      setRecSuccess(res.message);
      setRecQuestion(null);
      setRecAnswer('');
      setRecNewPassword('');
      setLoginReg(recReg.toUpperCase());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Password recovery failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (adminPasscode !== adminConfirmPasscode) {
      setError('Passcodes do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.bootstrapAdmin(adminPasscode);
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to initialize admin passcode.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.loginAdmin(adminPasscode);
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid faculty passcode.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        {/* Left Editorial Academic Hero Panel */}
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 lg:col-span-6">
          {!imageFailed ? (
            <img
              src="/src/assets/images/hero_exam_hall_1795354098414.jpg"
              alt="Modern university examination hall bathed in natural morning light"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="h-64 w-full object-cover lg:h-full lg:min-h-[540px]"
            />
          ) : (
            <div className="flex h-64 w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 lg:h-full lg:min-h-[540px]">
              <BookOpenCheck className="h-16 w-16 text-slate-500" aria-hidden="true" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/10" />

          <div className="relative flex flex-col justify-end p-6 text-white sm:p-8 lg:absolute lg:inset-0">
            <div className="max-w-lg space-y-3">
              <p className="text-xs font-medium tracking-wide text-slate-300">
                Standardized Examination Platform · 100 Randomized MCQs
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                Focused, Timed Assessment for Academic Integrity
              </h1>
              <p className="text-sm leading-relaxed text-slate-200">
                Sign in with your university registration number to attempt a 100-question assessment drawn randomly from a curated multi-subject bank within a strict 60-minute window.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/15 pt-5 text-left">
              <div>
                <div className="font-mono text-lg font-semibold tabular-nums">100</div>
                <div className="text-xs text-slate-300">Random MCQs</div>
              </div>
              <div>
                <div className="font-mono text-lg font-semibold tabular-nums">60:00</div>
                <div className="text-xs text-slate-300">Auto-Lock Timer</div>
              </div>
              <div>
                <div className="font-mono text-lg font-semibold tabular-nums">140+</div>
                <div className="text-xs text-slate-300">Verified Bank</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Interactive Auth Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 lg:col-span-6">
          <div>
            {/* Segmented Mode Tabs */}
            <div
              role="tablist"
              aria-label="Authentication Mode"
              className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4"
            >
              {(
                [
                  { id: 'login', label: 'Sign In' },
                  { id: 'register', label: 'Register' },
                  { id: 'recover', label: 'Recover' },
                  { id: 'admin', label: 'Faculty' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    tab === item.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            {recSuccess && (
              <div
                role="status"
                className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                {recSuccess}
              </div>
            )}

            {/* Tab 1: Student Sign In */}
            {tab === 'login' && (
              <form onSubmit={handleStudentLogin} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    Student Sign In
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter your registration number and password to access your examination portal.
                  </p>
                </div>

                <div>
                  <label htmlFor="login-reg" className="block text-sm font-medium text-slate-700">
                    Registration Number
                  </label>
                  <input
                    id="login-reg"
                    type="text"
                    required
                    value={loginReg}
                    onChange={(e) => setLoginReg(e.target.value)}
                    placeholder="REG-2026-1001"
                    autoComplete="username"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 uppercase placeholder:normal-case placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-pass" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTabChange('recover')}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="login-pass"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  <span>{submitting ? 'Signing In...' : 'Sign In to Portal'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <p className="pt-2 text-center text-xs text-slate-600">
                  New student?{' '}
                  <button
                    type="button"
                    onClick={() => handleTabChange('register')}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Register your account
                  </button>
                </p>
              </form>
            )}

            {/* Tab 2: Student Registration */}
            {tab === 'register' && (
              <form onSubmit={handleStudentRegister} className="mt-6 space-y-3.5">
                <div>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    Student Account Registration
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Create your student profile with your official registration number.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-num" className="block text-xs font-medium text-slate-700">
                      Registration Number
                    </label>
                    <input
                      id="reg-num"
                      type="text"
                      required
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value)}
                      placeholder="REG-2026-1001"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase placeholder:normal-case focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700">
                      Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sara Ahmed"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700">
                      University Email
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="sara@university.edu"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-dept" className="block text-xs font-medium text-slate-700">
                      Department
                    </label>
                    <input
                      id="reg-dept"
                      type="text"
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Computer Science"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-pass" className="block text-xs font-medium text-slate-700">
                    Password (8+ chars, letters & numbers)
                  </label>
                  <input
                    id="reg-pass"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reg-sq" className="block text-xs font-medium text-slate-700">
                    Recovery Security Question
                  </label>
                  <select
                    id="reg-sq"
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                  >
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="reg-sa" className="block text-xs font-medium text-slate-700">
                    Security Answer (used for password recovery)
                  </label>
                  <input
                    id="reg-sa"
                    type="text"
                    required
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Enter memorable answer"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <span>{submitting ? 'Creating Account...' : 'Create Student Account'}</span>
                </button>
              </form>
            )}

            {/* Tab 3: Password Recovery */}
            {tab === 'recover' && (
              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    Password Recovery
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Verify your registration number, email, and security question to reset your password.
                  </p>
                </div>

                {!recQuestion ? (
                  <form onSubmit={handleRecoveryLookup} className="space-y-4">
                    <div>
                      <label htmlFor="rec-reg" className="block text-sm font-medium text-slate-700">
                        Registration Number
                      </label>
                      <input
                        id="rec-reg"
                        type="text"
                        required
                        value={recReg}
                        onChange={(e) => setRecReg(e.target.value)}
                        placeholder="REG-2026-1001"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm uppercase placeholder:normal-case focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="rec-email" className="block text-sm font-medium text-slate-700">
                        Registered Email
                      </label>
                      <input
                        id="rec-email"
                        type="email"
                        required
                        value={recEmail}
                        onChange={(e) => setRecEmail(e.target.value)}
                        placeholder="student@university.edu"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      <span>{submitting ? 'Locating Account...' : 'Verify Account'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRecoveryReset} className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm">
                      <div className="text-xs font-medium text-slate-500">Security Question</div>
                      <div className="mt-1 font-medium text-slate-900">{recQuestion}</div>
                    </div>

                    <div>
                      <label htmlFor="rec-ans" className="block text-sm font-medium text-slate-700">
                        Security Answer
                      </label>
                      <input
                        id="rec-ans"
                        type="text"
                        required
                        value={recAnswer}
                        onChange={(e) => setRecAnswer(e.target.value)}
                        placeholder="Your security answer"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="rec-new-pass" className="block text-sm font-medium text-slate-700">
                        New Password (8+ chars, letters & numbers)
                      </label>
                      <input
                        id="rec-new-pass"
                        type="password"
                        required
                        minLength={8}
                        value={recNewPassword}
                        onChange={(e) => setRecNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setRecQuestion(null)}
                        className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                      >
                        <span>{submitting ? 'Updating...' : 'Reset Password'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Tab 4: Faculty Admin (First-Run Claim or Login) */}
            {tab === 'admin' && (
              <div className="mt-6 space-y-4">
                {adminStatus === 'loading' ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Checking faculty access configuration...
                  </div>
                ) : adminStatus === 'unclaimed' ? (
                  <form onSubmit={handleAdminBootstrap} className="space-y-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-slate-900">
                        Initial Faculty Admin Setup
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        No administrator passcode is configured yet. Set a passcode now to claim and secure the faculty management panel.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="admin-claim-pass" className="block text-sm font-medium text-slate-700">
                        Choose Faculty Passcode (min 6 characters)
                      </label>
                      <input
                        id="admin-claim-pass"
                        type="password"
                        required
                        minLength={6}
                        value={adminPasscode}
                        onChange={(e) => setAdminPasscode(e.target.value)}
                        placeholder="Create faculty passcode"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-claim-confirm" className="block text-sm font-medium text-slate-700">
                        Confirm Faculty Passcode
                      </label>
                      <input
                        id="admin-claim-confirm"
                        type="password"
                        required
                        minLength={6}
                        value={adminConfirmPasscode}
                        onChange={(e) => setAdminConfirmPasscode(e.target.value)}
                        placeholder="Re-enter faculty passcode"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span>{submitting ? 'Securing Admin Panel...' : 'Claim Faculty Admin Access'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-slate-900">
                        Faculty &amp; Admin Sign In
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Monitor student test scores, review answers, and manage the 140+ question bank.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="admin-pass" className="block text-sm font-medium text-slate-700">
                        Administrator Passcode
                      </label>
                      <input
                        id="admin-pass"
                        type="password"
                        required
                        value={adminPasscode}
                        onChange={(e) => setAdminPasscode(e.target.value)}
                        placeholder="Enter administrator passcode"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      <span>{submitting ? 'Verifying...' : 'Enter Faculty Console'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Passwords and security answers are hashed server-side with per-user salts. Active tests enforce a strict 60-minute server deadline.
          </div>
        </div>
      </div>
    </div>
  );
};
