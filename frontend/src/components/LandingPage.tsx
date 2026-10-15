import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  GraduationCap,
  FileCode2,
  Tv,
  ArrowRight,
  Lock,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Sliders,
  Database,
  BarChart3,
  Clock,
  Terminal,
  FileSpreadsheet
} from 'lucide-react';
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
    <div
      style={{
        minHeight: 'calc(100vh - 52px)',
        background: 'var(--bg-main)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      {/* ── HERO SECTION ── */}
      <section
        style={{
          padding: 'clamp(32px, 6vw, 72px) clamp(16px, 4vw, 32px) clamp(24px, 4vw, 48px)',
          maxWidth: '1240px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* System Status Pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              fontSize: '11.5px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: '0.02em'
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--success)',
                display: 'inline-block'
              }}
            />
            <span>Axent Assessment Core v2.4 · All Sittings Operational</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Proctoring Active</span>
          </div>
        </div>

        {/* Brand Headline with Logo */}
        <div style={{ textAlign: 'center', maxWidth: '860px', margin: '0 auto 36px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              marginBottom: '20px',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden'
            }}
          >
            <img
              src="/logo.png"
              alt="Axent Logo"
              style={{ width: '46px', height: '46px', objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 52px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              margin: '0 0 16px',
              color: 'var(--text-primary)'
            }}
          >
            Autonomous Examination, Computer Testing & Proctoring
          </h1>

          <p
            style={{
              fontSize: 'clamp(14px, 1.8vw, 17px)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              margin: '0 auto 32px',
              maxWidth: '680px'
            }}
          >
            High-integrity assessment infrastructure for universities and technical institutions.
            Features AI question generation, sandboxed compiler testbeds, and real-time CCTV invigilation.
          </p>

          {/* Primary Action Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}
          >
            <button
              onClick={() => handleNav('/mcq')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                border: 'none',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease'
              }}
            >
              <span>Student Exam Hall</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => handleNav('/paper-setter')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 22px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'border-color 0.15s ease'
              }}
            >
              <GraduationCap size={16} color="var(--accent)" />
              <span>Paper Setter Portal</span>
            </button>

            <button
              onClick={() => handleNav('/admin')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 22px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Tv size={16} />
              <span>CCTV Invigilation</span>
            </button>
          </div>
        </div>

        {/* ── METRIC TELEMETRY STRIP ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            margin: '40px 0'
          }}
        >
          <WatermelonStatCard
            label="Integrity Assurance"
            value="99.9%"
            unit="tamper-proof"
            icon={<ShieldCheck size={18} />}
            subtext="Client answer stripping & immutable snapshots"
          />
          <WatermelonStatCard
            label="AI Paper Generator"
            value="Autonomous"
            unit="LLM Core"
            icon={<Cpu size={18} />}
            subtext="Topic syllabus to structured paper in seconds"
          />
          <WatermelonStatCard
            label="Proctoring Precision"
            value="Dual Stream"
            unit="biometric"
            icon={<Tv size={18} />}
            subtext="Real-time CCTV tab & screen anomaly flagging"
          />
          <WatermelonStatCard
            label="Cloud Database"
            value="Synchronized"
            unit="Supabase"
            icon={<Database size={18} />}
            subtext="Zero orphan records, atomic deletion & ledger"
          />
        </div>
      </section>

      {/* ── ROLE-BASED PORTALS (BENTO SHOWCASE) ── */}
      <section
        style={{
          padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 32px)',
          maxWidth: '1240px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--accent)'
            }}
          >
            System Terminals
          </span>
          <h2
            style={{
              fontSize: 'clamp(20px, 3vw, 28px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '4px 0 8px'
            }}
          >
            Role-Based Assessment Gateways
          </h2>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            Direct access to assessment testing, authoring, and monitoring environments.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: '16px'
          }}
        >
          {/* 1. Student MCQ Terminal */}
          <WatermelonBentoCard
            padding="24px"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                  marginBottom: '16px'
                }}
              >
                <Layers size={18} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
                Student Examination Hall
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
                Candidate examination terminal. Secure waiting room countdown, shuffled question options,
                instant or scheduled release, and full anti-cheat lockdown.
              </p>
            </div>
            <button
              onClick={() => handleNav('/mcq')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '12px'
              }}
            >
              <span>Enter Examination Hall</span>
              <ArrowRight size={14} />
            </button>
          </WatermelonBentoCard>

          {/* 2. Paper Setter Portal */}
          <WatermelonBentoCard
            padding="24px"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                  marginBottom: '16px'
                }}
              >
                <GraduationCap size={18} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
                Paper Setter & Question Bank
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
                Configure exam sittings, generate papers via autonomous AI, maintain centralized question repositories,
                and export candidate grade sheets.
              </p>
            </div>
            <button
              onClick={() => handleNav('/paper-setter')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '12px'
              }}
            >
              <span>Open Paper Setter</span>
              <ArrowRight size={14} />
            </button>
          </WatermelonBentoCard>

          {/* 3. Code Lab IDE */}
          <WatermelonBentoCard
            padding="24px"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                  marginBottom: '16px'
                }}
              >
                <Terminal size={18} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
                Coding Practical Workspace
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
                Sandboxed online IDE for Python, C++, Java, and JavaScript. Keystroke telemetry recording,
                paste-ratio monitoring, and automated Viva Voce defense questioning.
              </p>
            </div>
            <button
              onClick={() => handleNav('/workspace')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '12px'
              }}
            >
              <span>Launch Code Lab</span>
              <ArrowRight size={14} />
            </button>
          </WatermelonBentoCard>

          {/* 4. CCTV Proctoring Console */}
          <WatermelonBentoCard
            padding="24px"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                  marginBottom: '16px'
                }}
              >
                <Tv size={18} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
                CCTV Invigilator Command
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
                Real-time invigilation grid with remote candidate workstation feeds, dual-monitor violation warnings,
                tab blur logging, and instant disqualification authority.
              </p>
            </div>
            <button
              onClick={() => handleNav('/admin')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '12px'
              }}
            >
              <span>Access Invigilator Grid</span>
              <ArrowRight size={14} />
            </button>
          </WatermelonBentoCard>
        </div>
      </section>

      {/* ── SECURITY & TECHNICAL ARCHITECTURE ── */}
      <section
        style={{
          padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 32px)',
          maxWidth: '1240px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 'clamp(20px, 4vw, 36px)'
          }}
        >
          <div style={{ maxWidth: '640px', marginBottom: '24px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--accent)'
              }}
            >
              Institutional Integrity
            </span>
            <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '6px 0 8px' }}>
              Engineered Against Link Manipulation & Cheating
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
              Axent implements cryptographic defense mechanisms ensuring exam papers cannot be manipulated,
              answers cannot be extracted via browser devtools, and scheduled sessions cannot be unlocked before time.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ color: 'var(--success)', marginTop: '2px' }}>
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 700 }}>Answer Sanitization</h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  Correct keys and explanations are completely stripped from local storage snapshots during tests.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ color: 'var(--success)', marginTop: '2px' }}>
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 700 }}>Waiting Room Lock</h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  Scheduled exams enforce synchronized countdowns with automatic client unlocking at start time.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ color: 'var(--success)', marginTop: '2px' }}>
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 700 }}>Central Cloud Ledger</h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  Cloud persistence ensures real-time grade books with instant CSV export and verified paper deletion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER (Strict team.axiogen.in mention) ── */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          padding: 'clamp(24px, 4vw, 40px) clamp(16px, 4vw, 32px)',
          marginTop: 'auto'
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          {/* Top row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '24px'
            }}
          >
            {/* Brand column */}
            <div style={{ maxWidth: '380px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <img
                  src="/logo.png"
                  alt="Axent"
                  style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
                <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Ax<span style={{ color: 'var(--accent)' }}>ent</span> Platform
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
                Autonomous Academic Examination & Forensic Proctoring Infrastructure. Designed for bulletproof testing integrity.
              </p>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Engineered and maintained by </span>
                <a
                  href="https://team.axiogen.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <span>team.axiogen.in</span>
                  <ExternalLink size={11} />
                </a>
              </div>
            </div>

            {/* Quick Navigation Links */}
            <div style={{ display: 'flex', gap: '36px', flexWrap: 'wrap' }}>
              <div>
                <h5 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  Portals
                </h5>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <button
                      onClick={() => handleNav('/mcq')}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      Examination Hall
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => handleNav('/paper-setter')}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      Paper Setter Portal
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => handleNav('/workspace')}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      Coding Workspace
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => handleNav('/admin')}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      CCTV Invigilation
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h5 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  Security & Access
                </h5>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <button
                      onClick={() => handleNav('/login')}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      Authority Gateway
                    </button>
                  </li>
                  <li>
                    <a
                      href="https://team.axiogen.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--text-secondary)', fontSize: '12.5px', textDecoration: 'none' }}
                    >
                      Axiogen Infrastructure
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Copyright Strip */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '11.5px',
              color: 'var(--text-muted)'
            }}
          >
            <div>
              © 2026 Axent Examination Systems by Axiogen (
              <a
                href="https://team.axiogen.in"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}
              >
                team.axiogen.in
              </a>
              ). All rights reserved.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              <span>Institutional Cloud Synchronized</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
