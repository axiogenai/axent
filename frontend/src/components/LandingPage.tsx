import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  Lock,
  Database,
  Clock,
  Sparkles,
  EyeOff
} from 'lucide-react';
import Hero1 from './ui/hero-1';
import { Footer16 } from './ui/footer-16';
import { WatermelonStatCard } from './watermelon-ui';
import { ThemeMode } from '../types/dna';
import { playSound } from '../utils/sounds';

interface LandingPageProps {
  theme?: ThemeMode;
}

export const LandingPage: React.FC<LandingPageProps> = () => {
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    playSound('click');
    if (path.startsWith('#')) {
      const el = document.querySelector(path);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
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
              height: '52px',
              width: 'auto',
              maxWidth: '240px',
              display: 'block',
              objectFit: 'contain'
            }}
          />
        }
        navLinks={[
          { label: 'Examination Hall', href: '/mcq', active: true },
          { label: 'Exam Guidelines', href: '#features' },
          { label: 'Integrity Architecture', href: '#security' },
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
          { label: 'Integrity Standard', href: '#security' },
          { label: 'Candidate Guide', href: '#features' },
        ]}
        onNavLinkClick={(link) => handleNav(link.href)}
      />

      {/* ── 2. PLATFORM TELEMETRY METRIC STRIP ── */}
      <section id="features" className="py-12 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto w-full border-t border-zinc-900">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-400 mb-3">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
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
            label="Anti-Cheating Engine"
            value="Active"
            subtext="Tab switch & focus monitoring"
            icon={<Lock size={18} />}
          />
          <WatermelonStatCard
            label="Dual-Stream Proctor"
            value="Real-Time"
            subtext="Keystroke & focus logs"
            icon={<Clock size={18} />}
          />
          <WatermelonStatCard
            label="Cloud Ledger"
            value="Synchronized"
            subtext="Tamper-proof score records"
            icon={<Database size={18} />}
          />
        </div>
      </section>

      {/* ── 3. CANDIDATE EXAMINATION ACCESS (ONLY FOR STUDENTS) ── */}
      <section className="py-12 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
            Candidate Examination Access
          </h2>
          <p className="text-sm text-zinc-400">
            Secure, tamper-proof digital examination environment with automated countdowns, synchronized papers, and instant result calculation.
          </p>
        </div>

        {/* Single Student Card */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 md:p-10 transition-colors hover:border-zinc-700">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white shrink-0">
              <GraduationCap size={28} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h3 className="text-xl font-bold text-white">
                  Student Examination Hall
                </h3>
                <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">
                  CANDIDATE ACCESS
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                Anti-tamper MCQ examination interface. Displays waiting rooms with live countdowns for scheduled tests, locks answer keys securely, records candidate response telemetry, and submits grades instantly to the centralized cloud ledger upon completion.
              </p>

              {/* Feature bullets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {[
                  'Cryptographic answer key protection',
                  'Synchronized exam start countdown',
                  'Instant automated result calculation',
                  'Focus blur & tab-switch logging',
                  'Clean distraction-free interface',
                  'Cloud-backed real-time score ledger'
                ].map((feat) => (
                  <div key={feat} className="flex items-center gap-2 text-xs text-zinc-400">
                    <CheckCircle2 size={13} className="text-zinc-500 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleNav('/mcq')}
                className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <span>Enter Examination Hall</span>
                <ArrowRight size={16} />
              </button>
            </div>
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
