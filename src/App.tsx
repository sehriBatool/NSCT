import { useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AuthPortal } from './components/AuthPortal.tsx';
import { ExamWorkspace } from './components/ExamWorkspace.tsx';
import { ReviewWorkspace } from './components/ReviewWorkspace.tsx';
import { SpecificationsView } from './components/SpecificationsView.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import { api, setAuthToken } from './lib/api.ts';
import type { TestAttemptDetail, UserProfile } from './types/exam.ts';

type AppView = 'auth' | 'dashboard' | 'exam' | 'review' | 'admin' | 'specs';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<AppView>('auth');
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'recover' | 'admin'>('login');
  const [activeAttempt, setActiveAttempt] = useState<TestAttemptDetail | null>(null);
  const [reviewAttempt, setReviewAttempt] = useState<TestAttemptDetail | null>(null);

  const handleAuthenticated = (token: string, nextUser: UserProfile) => {
    setAuthToken(token);
    setUser(nextUser);
    setActiveAttempt(null);
    setReviewAttempt(null);
    setView(nextUser.role === 'admin' ? 'admin' : 'dashboard');
  };

  const handleSignOut = () => {
    setAuthToken(null);
    setUser(null);
    setActiveAttempt(null);
    setReviewAttempt(null);
    setAuthTab('login');
    setView('auth');
  };

  const handleStartOrResumeTest = async () => {
    const attempt = await api.startTest();
    setActiveAttempt(attempt);
    setView('exam');
  };

  const handleOpenStudentReview = async (attemptId: number) => {
    const detail = await api.getTestDetail(attemptId);
    setReviewAttempt(detail);
    setView('review');
  };

  const handleAdminInspectAttempt = async (attemptId: number) => {
    const detail = await api.getAdminAttemptDetail(attemptId);
    setReviewAttempt(detail);
    setView('review');
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => {
              if (!user) setView('auth');
              else if (user.role === 'admin') setView('admin');
              else setView('dashboard');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ExamCore
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            {!user && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setView('auth');
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'auth' && authTab === 'login' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Student Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setView('auth');
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'auth' && authTab === 'register' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Registration
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('admin');
                    setView('auth');
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'auth' && authTab === 'admin' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Faculty Panel
                </button>
                <button
                  type="button"
                  onClick={() => setView('specs')}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'specs' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Specifications
                </button>
              </>
            )}

            {user && user.role === 'student' && (
              <>
                <button
                  type="button"
                  onClick={() => setView('dashboard')}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'dashboard' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Dashboard
                </button>
                {activeAttempt && (
                  <button
                    type="button"
                    onClick={() => setView('exam')}
                    className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                      view === 'exam' ? 'text-slate-900 underline underline-offset-4' : ''
                    }`}
                  >
                    Active Exam
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setView('specs')}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'specs' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Specifications
                </button>
              </>
            )}

            {user && user.role === 'admin' && (
              <>
                <button
                  type="button"
                  onClick={() => setView('admin')}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'admin' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Console
                </button>
                <button
                  type="button"
                  onClick={() => setView('specs')}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                    view === 'specs' ? 'text-slate-900 underline underline-offset-4' : ''
                  }`}
                >
                  Specifications
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50"
              >
                Sign Out
              </button>
            ) : view === 'specs' ? (
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  setView('auth');
                }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-800"
              >
                Student Portal
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView('specs')}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-slate-800 md:hidden"
              >
                Specifications
              </button>
            )}

            {!user && view !== 'specs' && (
              <button
                type="button"
                onClick={() => {
                  setAuthTab('register');
                  setView('auth');
                }}
                className="hidden rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-800 md:inline-flex"
              >
                Create Account
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {view === 'auth' && !user && (
          <AuthPortal initialTab={authTab} onAuthenticated={handleAuthenticated} />
        )}

        {view === 'specs' && <SpecificationsView />}

        {view === 'dashboard' && user?.role === 'student' && (
          <StudentDashboard
            user={user}
            onStartOrResumeTest={handleStartOrResumeTest}
            onOpenReview={handleOpenStudentReview}
          />
        )}

        {view === 'exam' && user?.role === 'student' && activeAttempt && (
          <ExamWorkspace
            initialAttempt={activeAttempt}
            onFinishedReview={(completed) => {
              setActiveAttempt(null);
              setReviewAttempt(completed);
              setView('review');
            }}
            onExitToDashboard={() => {
              setActiveAttempt(null);
              setView('dashboard');
            }}
          />
        )}

        {view === 'review' && reviewAttempt && user && (
          <ReviewWorkspace
            attempt={reviewAttempt}
            backLabel={user.role === 'admin' ? 'Back to Faculty Console' : 'Back to Dashboard'}
            onBack={() => setView(user.role === 'admin' ? 'admin' : 'dashboard')}
          />
        )}

        {view === 'admin' && user?.role === 'admin' && (
          <AdminDashboard onInspectAttempt={handleAdminInspectAttempt} />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>ExamCore Assessment System · 100-Question Timed Examination Portal</span>
          <button
            type="button"
            onClick={() => setView('specs')}
            className="font-medium text-slate-700 hover:text-blue-700 hover:underline"
          >
            Architecture &amp; API Specifications
          </button>
        </div>
      </footer>
    </div>
  );
}
