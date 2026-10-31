import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Lazy-load page components for ultra-fast initial page delivery (<200ms)
const LandingPage = React.lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })));
const CodeSparkPortal = React.lazy(() => import('./components/CodeSparkPortal').then(m => ({ default: m.CodeSparkPortal })));
const CodeSparkExamHall = React.lazy(() => import('./components/CodeSparkExamHall').then(m => ({ default: m.CodeSparkExamHall })));
const Workspace = React.lazy(() => import('./components/Workspace').then(m => ({ default: m.Workspace })));
const MCQHub = React.lazy(() => import('./components/MCQHub').then(m => ({ default: m.MCQHub })));
const PaperSetterPortal = React.lazy(() => import('./components/PaperSetterPortal').then(m => ({ default: m.PaperSetterPortal })));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AuthorityLogin = React.lazy(() => import('./components/auth/AuthorityLogin').then(m => ({ default: m.AuthorityLogin })));
const PaperSetterLogin = React.lazy(() => import('./components/auth/AuthorityLogin').then(m => ({ default: m.PaperSetterLogin })));
const AdminLogin = React.lazy(() => import('./components/auth/AuthorityLogin').then(m => ({ default: m.AdminLogin })));
const AuthorityInvitePortal = React.lazy(() => import('./components/auth/AuthorityInvitePortal').then(m => ({ default: m.AuthorityInvitePortal })));
const FinalReport = React.lazy(() => import('./components/FinalReport').then(m => ({ default: m.FinalReport })));
const LaunchFilmPlayer = React.lazy(() => import('./components/LaunchFilmPlayer').then(m => ({ default: m.LaunchFilmPlayer })));
import { SEOUpdater } from './components/SEOUpdater';
import {
  CodeSubmission,
  AnalysisReport,
  ExecutionHistoryItem,
  CompilerExecutionResult,
  VivaEvaluation,
  ThemeMode,
  StudentInfo
} from './types/dna';
import { runRealCode } from './services/compilerService';
import { verifyStudentCode } from './services/groqService';
import { playSound } from './utils/sounds';
import { initBackendKeepAlive } from './services/keepAliveService';
import { initRemoteHardRefreshListener } from './services/remoteControlService';
import { RefreshCw, FileCode, Play } from 'lucide-react';
import { DEFAULT_LANGUAGE_TEMPLATES } from './components/CodeEditor';
import { PWAInstallPrompt } from './components/ui/PWAInstallPrompt';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const RootNavigator: React.FC = () => {
  const isMcq = () => {
    try {
      if (typeof window === 'undefined') return false;
      const raw = localStorage.getItem('codedna_student_profile');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.course === 'Code Spark 2026' || (p.accessKey && String(p.accessKey).toUpperCase().startsWith('AXENT-'))) return false;
        if (p.examMode === 'MCQ' || p.examType === 'Multiple Choice Question (MCQ) Examination') return true;
      }
      if (localStorage.getItem('codedna_active_exam_mode') === 'MCQ') return true;
    } catch {}
    return false;
  };

  return <Navigate to={isMcq() ? '/mcq' : '/workspace'} replace />;
};

export const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Theme: Clean Light default, toggleable to Matte Black
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codedna_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'light'; // Clean Daylight White default
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('codedna_theme', theme);

    // Dynamically update browser tab favicon to match active theme
    const activeFavicon = theme === 'dark' ? '/favicon-32x32.png' : '/favicon-light-32x32.png';
    const favicons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
    favicons.forEach((el) => {
      if (!el.hasAttribute('media')) {
        el.href = activeFavicon;
      }
    });
  }, [theme]);

  // Keep Render free-tier backend awake in background
  useEffect(() => {
    initBackendKeepAlive();
  }, []);

  // Remote Hard Refresh: Remotely triggers hard reload on every connected device
  useEffect(() => {
    const cleanup = initRemoteHardRefreshListener();
    return cleanup;
  }, []);

  // Normalize malformed double-slash URLs (e.g. //invite -> /invite)
  useEffect(() => {
    if (location.pathname.includes('//')) {
      const cleanPath = location.pathname.replace(/\/+/g, '/');
      navigate(cleanPath + location.search + location.hash, { replace: true });
    }
  }, [location, navigate]);

  // Standalone installed app strictly runs the candidate MCQ examination hall
  useEffect(() => {
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
    if (isStandalone && !location.pathname.startsWith('/code-spark') && !location.pathname.startsWith('/codespark') && location.pathname !== '/mcq') {
      navigate('/mcq', { replace: true });
    }
  }, [location.pathname, navigate]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    playSound('click');
  };

  const [compilerResult, setCompilerResult] = useState<CompilerExecutionResult | null>(null);

  // Candidate Submission State with persistent localStorage backing
  const [codeData, setCodeData] = useState<CodeSubmission>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('codedna_last_submission');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (
            parsed &&
            typeof parsed.code === 'string' &&
            !parsed.code.includes('CodeDNA Lab Evaluation - Compiler Active')
          ) {
            return parsed;
          }
        }
      } catch {}
    }
    return {
      code: '',
      language: 'Python',
      student: {
        name: '',
        rollNumber: '',
        course: '',
        department: '',
        semester: '',
        examType: 'Internal Assessment (CIE)',
        assignmentTitle: '',
        labId: 'LAB-01',
        stationNumber: 'Station #01'
      },
      metrics: {
        typingSpeed: 0,
        timeSpent: 0,
        pasteCount: 0,
        deleteCount: 0,
        editCount: 0,
        undoCount: 0,
        pasteRatio: 0,
        pastedLines: 0,
        pastedChars: 0,
        totalLines: 0,
        keystrokes: 0,
        pauseDuration: 0,
        pasteLockViolations: 0,
        tabSwitchViolations: 0,
        unfocusedTimeSeconds: 0
      },
      snapshots: []
    };
  });

  const [analysisResults, setAnalysisResults] = useState<AnalysisReport | null>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/report')) {
      try {
        const saved = localStorage.getItem('codedna_last_report');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryItem[]>([]);

  const [isExecuting, setIsExecuting] = useState(false);
  const [vivaEvaluation, setVivaEvaluation] = useState<VivaEvaluation | null>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/report')) {
      try {
        const saved = localStorage.getItem('codedna_last_viva');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  // Handle updating code submission and syncing to localStorage
  const handleCodeChange = (submission: CodeSubmission) => {
    setCodeData(submission);
    try {
      localStorage.setItem('codedna_last_submission', JSON.stringify(submission));
    } catch {}
  };

  // Run Code and Verify Project
  const handleRunCode = async (submission: CodeSubmission, stdin = '') => {
    handleCodeChange(submission);
    setIsExecuting(true);
    setExecutionHistory([]);

    // Initial console header
    setExecutionHistory([
      {
        type: 'system',
        text: `> Compiling and running ${submission.language} program on cloud compiler...`
      }
    ]);

    try {
      // 1. Execute program on real Judge0 CE compiler
      const execResult = await runRealCode(submission.code, submission.language, stdin);
      setCompilerResult(execResult);
      try {
        localStorage.setItem('codedna_last_compiler', JSON.stringify(execResult));
      } catch {}

      const historyItems: ExecutionHistoryItem[] = [];

      if (execResult.compileOutput) {
        historyItems.push({
          type: 'error',
          text: `[Compiler Error]:\n${execResult.compileOutput}`
        });
      }

      if (execResult.stderr) {
        historyItems.push({
          type: 'error',
          text: `[Runtime Error]:\n${execResult.stderr}`
        });
      }

      if (execResult.stdout) {
        historyItems.push({
          type: 'output',
          text: execResult.stdout
        });
      }

      // Exit status summary
      historyItems.push({
        type: execResult.isError ? 'error' : 'system',
        text: `\n[Program finished with exit code ${execResult.exitCode} | Time: ${execResult.time} | Memory: ${execResult.memory} KB]`
      });

      setExecutionHistory(historyItems);
      try {
        localStorage.setItem('codedna_last_history', JSON.stringify(historyItems));
      } catch {}

      // 2. Perform Teacher Anti-Cheating & Integrity Verification
      const { report } = await verifyStudentCode(
        submission.code,
        submission.metrics,
        submission.language,
        submission.student,
        execResult
      );

      setAnalysisResults(report);
      try {
        localStorage.setItem('codedna_last_report', JSON.stringify(report));
      } catch {}
      playSound(execResult.isError ? 'warning' : 'success');
      return { report, execResult };
    } catch (err: unknown) {
      console.error('Execution failure:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionHistory([
        {
          type: 'error',
          text: `Execution Engine Error: ${msg}`
        }
      ]);
      playSound('error');
      return undefined;
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClearTerminal = () => {
    setExecutionHistory([]);
    try {
      localStorage.removeItem('codedna_last_history');
    } catch {}
    playSound('click');
  };

  const handleReset = () => {
    setAnalysisResults(null);
    setCompilerResult(null);
    setExecutionHistory([]);
    setVivaEvaluation(null);

    const now = Date.now();
    try {
      localStorage.removeItem('codedna_last_report');
      localStorage.removeItem('codedna_last_compiler');
      localStorage.removeItem('codedna_last_history');
      localStorage.removeItem('codedna_last_viva');
      localStorage.removeItem('codedna_last_submission');
      localStorage.removeItem('codedna_student_profile');

      // Purge all old session start timers and student profiles
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('codedna_session_start_') || key.startsWith('codedna_student_profile_')) {
          localStorage.removeItem(key);
        }
      });
    } catch {}

    const freshStudent: StudentInfo = {
      name: '',
      rollNumber: '',
      course: '',
      department: '',
      semester: '',
      examType: 'Internal Assessment (CIE)',
      assignmentTitle: '',
      labId: 'LAB-01',
      labName: '',
      stationNumber: 'Station #01',
      examDurationMinutes: 90,
      sessionStartTime: now
    };

    const freshSubmission: CodeSubmission = {
      code: '',
      language: 'Python',
      student: freshStudent,
      metrics: {
        typingSpeed: 0,
        timeSpent: 0,
        pasteCount: 0,
        deleteCount: 0,
        editCount: 0,
        undoCount: 0,
        pasteRatio: 0,
        pastedLines: 0,
        pastedChars: 0,
        totalLines: 0,
        keystrokes: 0,
        pauseDuration: 0,
        pasteLockViolations: 0,
        tabSwitchViolations: 0,
        unfocusedTimeSeconds: 0
      },
      snapshots: []
    };

    setCodeData(freshSubmission);
    navigate(`/workspace?newCandidate=true&t=${now}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="app-root">
      <ScrollToTop />
      <SEOUpdater />

      {location.pathname !== '/' && location.pathname !== '/launch' && !location.pathname.startsWith('/mcq') && !location.pathname.startsWith('/code-spark') && !location.pathname.startsWith('/codespark') && (
        <Navbar
          theme={theme}
          onToggleTheme={toggleTheme}
          isRunning={isExecuting}
        />
      )}

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingTop: location.pathname !== '/' && location.pathname !== '/launch' && !location.pathname.startsWith('/mcq') && !location.pathname.startsWith('/code-spark') && !location.pathname.startsWith('/codespark') ? '52px' : 0
        }}
      >
        <React.Suspense fallback={
          <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '22px', height: '22px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          </div>
        }>
        <Routes>
          <Route path="/" element={<LandingPage theme={theme} />} />
          <Route
            path="/workspace"
            element={
              <Workspace
                initialCode={codeData.code}
                onRunCode={handleRunCode}
                onCodeChange={handleCodeChange}
                executionHistory={executionHistory}
                isExecuting={isExecuting}
                compilerResult={compilerResult}
                analysisResults={analysisResults}
                onViewReport={() => navigate('/report')}
                onClearTerminal={handleClearTerminal}
                vivaEvaluation={vivaEvaluation}
                onVivaComplete={(ev) => {
                  setVivaEvaluation(ev);
                  try {
                    localStorage.setItem('codedna_last_viva', JSON.stringify(ev));
                  } catch {}
                }}
                theme={theme}
              />
            }
          />
          <Route
            path="/report"
            element={
              <ReportScreen
                codeData={codeData}
                analysisResults={analysisResults}
                executionHistory={executionHistory}
                compilerResult={compilerResult}
                vivaEvaluation={vivaEvaluation}
                isExecuting={isExecuting}
                onRunCode={handleRunCode}
                onReset={handleReset}
                onBack={() => navigate('/workspace')}
              />
            }
          />
          <Route
            path="/login"
            element={<AuthorityLogin theme={theme} />}
          />
          <Route
            path="/login/paper-setter"
            element={<Navigate to="/login/admin?redirect=%2Fadmin%3Ftab%3Dpaper_setter" replace />}
          />
          <Route
            path="/login/setter"
            element={<Navigate to="/login/paper-setter" replace />}
          />
          <Route
            path="/setter-login"
            element={<Navigate to="/login/paper-setter" replace />}
          />
          <Route
            path="/login/admin"
            element={<AdminLogin theme={theme} />}
          />
          <Route
            path="/admin-login"
            element={<Navigate to="/login/admin" replace />}
          />
          <Route
            path="/invite"
            element={
              <ProtectedRoute requiredRole="admin">
                <AuthorityInvitePortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login/invite"
            element={
              <ProtectedRoute requiredRole="admin">
                <AuthorityInvitePortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/authority-invite"
            element={
              <ProtectedRoute requiredRole="admin">
                <AuthorityInvitePortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/mcq-tickets"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard
                  theme={theme}
                  initialTab="examinations"
                  onSelectReportForStudent={(rep, sub) => {
                    setAnalysisResults(rep);
                    try {
                      localStorage.setItem('codedna_last_report', JSON.stringify(rep));
                    } catch {}
                    if (sub) {
                      setCodeData(sub);
                      try {
                        localStorage.setItem('codedna_last_submission', JSON.stringify(sub));
                      } catch {}
                    }
                    navigate('/report');
                  }}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/code-spark"
            element={<CodeSparkPortal theme={theme} />}
          />
          <Route
            path="/codespark"
            element={<Navigate to="/code-spark" replace />}
          />
          <Route
            path="/codespark-exams"
            element={
              <CodeSparkExamHall
                theme={theme}
                codeData={codeData}
                onRunCode={handleRunCode}
                onCodeChange={handleCodeChange}
                executionHistory={executionHistory}
                isExecuting={isExecuting}
                compilerResult={compilerResult}
                analysisResults={analysisResults}
                onClearTerminal={handleClearTerminal}
                vivaEvaluation={vivaEvaluation}
                onVivaComplete={(ev) => {
                  setVivaEvaluation(ev);
                  try {
                    localStorage.setItem('codedna_last_viva', JSON.stringify(ev));
                  } catch {}
                }}
                onReset={handleReset}
              />
            }
          />
          <Route
            path="/code-spark-exams"
            element={<Navigate to="/codespark-exams" replace />}
          />
          <Route
            path="/code-spark/exam"
            element={<Navigate to="/codespark-exams" replace />}
          />
          <Route
            path="/codespark/exam"
            element={<Navigate to="/codespark-exams" replace />}
          />
          <Route
            path="/mcq"
            element={<MCQHub />}
          />
          <Route
            path="/paper-setter"
            element={<Navigate to="/admin?tab=paper_setter" replace />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard
                  theme={theme}
                  onSelectReportForStudent={(rep, sub) => {
                    setAnalysisResults(rep);
                    try {
                      localStorage.setItem('codedna_last_report', JSON.stringify(rep));
                    } catch {}
                    if (sub) {
                      setCodeData(sub);
                      try {
                        localStorage.setItem('codedna_last_submission', JSON.stringify(sub));
                      } catch {}
                    }
                    navigate('/report');
                  }}
                />
              </ProtectedRoute>
            }
          />
          <Route path="/launch" element={<LaunchFilmPlayer autoPlay={true} onClose={() => navigate('/')} />} />
          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </React.Suspense>
      </main>
      <PWAInstallPrompt />
    </div>
  );
};

// ── Auto-Evaluating Report View: Guarantees report opens immediately ──
interface ReportScreenProps {
  codeData: CodeSubmission;
  analysisResults: AnalysisReport | null;
  executionHistory: ExecutionHistoryItem[];
  compilerResult: CompilerExecutionResult | null;
  vivaEvaluation: VivaEvaluation | null;
  isExecuting: boolean;
  onRunCode: (
    data: CodeSubmission,
    stdin?: string
  ) => Promise<{ report?: AnalysisReport; execResult?: CompilerExecutionResult } | void>;
  onReset: () => void;
  onBack: () => void;
}

const ReportScreen: React.FC<ReportScreenProps> = ({
  codeData,
  analysisResults,
  executionHistory,
  compilerResult,
  vivaEvaluation,
  isExecuting,
  onRunCode,
  onReset,
  onBack
}: ReportScreenProps) => {
  const [hasTriggeredAutoRun, setHasTriggeredAutoRun] = useState(false);

  useEffect(() => {
    // If report is not yet generated but candidate has code in editor, run evaluation immediately!
    if (!analysisResults && codeData.code.trim().length > 0 && !isExecuting && !hasTriggeredAutoRun) {
      setHasTriggeredAutoRun(true);
      onRunCode(codeData);
    }
  }, [analysisResults, codeData, isExecuting, hasTriggeredAutoRun, onRunCode]);

  // Loading indicator while compiling & generating report
  if (isExecuting || (!analysisResults && codeData.code.trim().length > 0 && hasTriggeredAutoRun)) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          textAlign: 'center',
          padding: '20px'
        }}
      >
        <RefreshCw size={32} className="spinner-icon" color="var(--accent)" style={{ marginBottom: '16px' }} />
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Compiling Program & Generating Anti-Cheating Dossier...
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.5 }}>
          Executing candidate code on cloud compiler and analyzing keystroke typing forensics for cheating detection.
        </p>
      </div>
    );
  }

  // If no code in editor at all
  if (!analysisResults && codeData.code.trim().length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          textAlign: 'center',
          padding: '20px'
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}
        >
          <FileCode size={26} color="var(--accent)" />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          No Candidate Code in Editor
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', marginBottom: '20px', lineHeight: 1.5 }}>
          Please write or paste code in the Code Editor first to compile and generate the official practical marks and cheating report.
        </p>
        <button className="btn btn-primary" onClick={onBack}>
          Open Code Editor
        </button>
      </div>
    );
  }

  // Render complete Invigilator Report
  return (
    <div style={{ maxWidth: '1240px', margin: '24px auto', width: '100%', padding: '0 20px' }}>
      <FinalReport
        codeData={codeData}
        analysisResults={analysisResults!}
        executionOutput={executionHistory}
        compilerResult={compilerResult}
        vivaEvaluation={vivaEvaluation}
        onReset={onReset}
        onBack={onBack}
      />
    </div>
  );
};

export default App;
