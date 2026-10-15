import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  GraduationCap,
  Layers,
  ArrowRight,
  Terminal,
  Tv,
  CheckCircle2,
  Lock,
  Cpu,
  Database,
  BarChart3,
  Clock,
  ExternalLink
} from 'lucide-react';
import Hero1 from './ui/hero-1';
import { Footer16 } from './ui/footer-16';
import { WatermelonBentoCard, WatermelonStatCard } from './watermelon-ui';
import { ThemeMode } from '../types/dna';
import { playSound } from '../utils/sounds';

interface LandingPageProps {
  theme?: ThemeMode;
}

export const LandingPage: React.FC<LandingPageProps> = () => {
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    playSound('click');
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-[#06060c] text-zinc-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* ── 1. WATERMELON UI HERO SECTION (hero-1.json) ── */}
      <Hero1
        brand={
          <img
            src="/axent-logo.png"
            alt="Axent"
            style={{
              height: '30px',
              width: 'auto',
              maxWidth: '140px',
              display: 'block',
              objectFit: 'contain'
            }}
          />
        }
        navLinks={[
          { label: 'MCQ Exam Hall', href: '/mcq', active: true },
          { label: 'Paper Setter Portal', href: '/paper-setter' },
          { label: 'Coding Workspace', href: '/workspace' },
          { label: 'CCTV Control', href: '/admin' },
        ]}
        headline={
          <>
            Autonomous Integrity,
            <br />
            Absolute Precision.
          </>
        }
        ctaLabel="Enter Student Examination Hall"
        ctaHref="/mcq"
        description={'Enterprise-grade academic assessment, real-time dual-stream invigilation,\nand zero-tamper cryptographic examination ledgers.'}
        socialLinks={[
          { label: 'team.axiogen.in', href: 'https://team.axiogen.in' },
          { label: 'Cloud Ledger', href: '#features' },
          { label: 'Security Standard', href: '#security' },
        ]}
        signInLabel="Authority Login"
        signInHref="/login"
        onNavLinkClick={(link) => handleNav(link.href)}
      />

      {/* ── 2. PLATFORM TELEMETRY METRIC STRIP ── */}
      <section id="features" className="py-12 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto w-full border-t border-zinc-900">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-400 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Axent Assessment Core v2.4 · Live Telemetry</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Institutional Examination Standards
            </h2>
          </div>
          <p className="text-sm text-zinc-400 max-w-md font-normal leading-relaxed">
            Synchronized live test ledgers, automated question bank distribution, and tamper-resistant candidate audit trails.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <WatermelonStatCard
            label="Integrity Assurance"
            value="99.9%"
            subtext="Zero link manipulation"
            icon={<ShieldCheck size={18} />}
          />
          <WatermelonStatCard
            label="AI Paper Generator"
            value="Autonomous"
            subtext="Instant question & rubric split"
            icon={<Cpu size={18} />}
          />
          <WatermelonStatCard
            label="Dual-Stream Proctor"
            value="Real-Time"
            subtext="Keystroke & focus logs"
            icon={<Clock size={18} />}
          />
          <WatermelonStatCard
            label="Cloud Database"
            value="Synchronized"
            subtext="Instant CSV exports & ledger"
            icon={<Database size={18} />}
          />
        </div>
      </section>

      {/* ── 3. FOUR ROLE-BASED PORTALS (BENTO SHOWCASE) ── */}
      <section className="py-12 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
            Integrated Academic Roles & Portals
          </h2>
          <p className="text-sm text-zinc-400">
            Dedicated environments configured specifically for students, professors, invigilators, and academic heads.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Student Exam Hall */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-4">
                <GraduationCap size={20} />
              </div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">
                  Student Examination Hall
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">
                  CANDIDATE ACCESS
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                Anti-tamper MCQ examination interface. Displays waiting rooms for upcoming tests, real-time timer countdowns, and instant sanitized answer submissions.
              </p>
            </div>
            <button
              onClick={() => handleNav('/mcq')}
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-white text-sm font-semibold hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <span>Enter Examination Hall</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* 2. Paper Setter Portal */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-4">
                <Layers size={20} />
              </div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">
                  Paper Setter Studio
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">
                  PROFESSOR PORTAL
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                Design custom questions or leverage the Autonomous AI Paper Generator with 3 intuitive parameters (Questions, Marks, Severity). Manage the central question bank with one-click purge and permanent cloud deletion.
              </p>
            </div>
            <button
              onClick={() => handleNav('/paper-setter')}
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-white text-sm font-semibold hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <span>Open Paper Setter Studio</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* 3. Code Lab Practical Workspace */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-4">
                <Terminal size={20} />
              </div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">
                  Coding Practical Workspace
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">
                  LAB WORKSTATION
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                Sandboxed online IDE for Python, C++, Java, and JavaScript. Keystroke telemetry recording, paste-ratio monitoring, non-blocking lock alerts, and automated Viva Voce defense questioning.
              </p>
            </div>
            <button
              onClick={() => handleNav('/workspace')}
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-white text-sm font-semibold hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <span>Launch Code Lab Workspace</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* 4. CCTV Invigilator Command */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-4">
                <Tv size={20} />
              </div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">
                  CCTV Invigilator Command
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">
                  PROCTOR CONTROL
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                Real-time invigilation grid with remote candidate workstation feeds, dual-monitor violation warnings, tab blur logging, and instant disqualification authority.
              </p>
            </div>
            <button
              onClick={() => handleNav('/admin')}
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-white text-sm font-semibold hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <span>Access Invigilator Grid</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ── 4. SECURITY & INTEGRITY ARCHITECTURE ── */}
      <section id="security" className="py-12 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto w-full">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 md:p-10">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase">
              Cryptographic Safeguards
            </span>
            <h3 className="text-xl md:text-2xl font-bold text-white mt-1 mb-3">
              Engineered Against Link Manipulation & Cheating
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Axent implements cryptographic defense mechanisms ensuring exam papers cannot be manipulated, answers cannot be extracted via browser devtools, and scheduled sessions cannot be unlocked before time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <CheckCircle2 size={18} className="text-white shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Answer Sanitization</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Correct keys and explanations are completely stripped from client-side state and browser storage snapshots during tests.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <CheckCircle2 size={18} className="text-white shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Waiting Room Lock</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Scheduled exams enforce synchronized countdowns with automatic client unlocking strictly at start time.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <CheckCircle2 size={18} className="text-white shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Central Cloud Ledger</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Cloud persistence ensures real-time grade books with instant CSV export and verified paper deletion tombstones.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. WATERMELON UI FOOTER (footer-16.json) ── */}
      <Footer16
        brandName="AXENT"
        tagline={'Autonomous Academic Examination & Proctoring Platform.\nEngineered for uncompromised institutional integrity, real-time forensics,\nand cryptographic audit ledgers.'}
        copyright="© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved."
      />
    </div>
  );
};

export default LandingPage;
