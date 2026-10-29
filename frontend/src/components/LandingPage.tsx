import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, ArrowUpRight } from 'lucide-react';
import Hero1 from './ui/hero-1';
import { Footer16 } from './ui/footer-16';
import { LaunchFilmPlayer } from './LaunchFilmPlayer';
import { triggerInstallPrompt } from './ui/PWAInstallPrompt';
import { ThemeMode } from '../types/dna';
import { playSound } from '../utils/sounds';

interface LandingPageProps {
  theme?: ThemeMode;
}

export const LandingPage: React.FC<LandingPageProps> = () => {
  const navigate = useNavigate();
  const [showFilm, setShowFilm] = useState(false);

  const handleNav = (path: string) => {
    playSound('click');
    if (path === '#install') {
      triggerInstallPrompt();
      return;
    }
    if (path === '/launch') {
      setShowFilm(true);
      return;
    }
    navigate(path);
  };

  const handleWatchFilm = () => {
    playSound('click');
    setShowFilm(true);
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#06060c] text-zinc-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* ── CODESPARK ON AXENT PROMINENT MASTER BANNER ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          playSound('click');
          navigate('/code-spark');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            playSound('click');
            navigate('/code-spark');
          }
        }}
        className="w-full bg-[#0a0a12] border-b-2 border-white/20 hover:bg-white/[0.04] transition-all cursor-pointer py-3.5 px-4 sm:px-8 sticky top-0 z-50 backdrop-blur-md shadow-2xl"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-black font-bold uppercase tracking-wider text-[11px] rounded-none">
              <Zap size={12} className="text-black" />
              <span>CODESPARK ON AXENT</span>
            </span>
            <span className="text-zinc-200 uppercase tracking-wider text-xs hidden sm:inline font-semibold">
              03 NOV 2026 PRIVATE COMPETITIVE EXAM • ROUND 1 APTITUDE ACTIVE • PRIVATE KEY (AXNT-XXXX) REQUIRED
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-white font-bold uppercase tracking-wider text-xs group flex-shrink-0">
            <span>ENTER CANDIDATE PORTAL</span>
            <ArrowRight size={14} className="text-white group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* ── 1. WATERMELON UI HERO SECTION (hero-1.json) ── */}
      <Hero1
        brand={
          <img
            src="/axent-logo.png"
            alt="Axent"
            style={{
              height: '22px',
              width: 'auto',
              maxWidth: '180px',
              display: 'block',
              objectFit: 'contain'
            }}
          />
        }
        navLinks={[
          { label: 'CodeSpark (3 Nov)', href: '/code-spark', active: true },
          { label: 'Examination Hall', href: '/mcq' },
          { label: '25s Launch Film', href: '/launch' },
          { label: 'Install App', href: '#install' }
        ]}
        headline={
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                playSound('click');
                navigate('/code-spark');
              }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-mono uppercase tracking-widest text-white transition-all cursor-pointer select-none"
            >
              <Zap size={13} className="text-white" />
              <span>CodeSpark on Axent • 03 Nov 2026 Private Arena &rarr;</span>
            </div>
            <br />
            Autonomous Integrity,
            <br />
            Absolute Precision.
          </>
        }
        ctaLabel="Enter CodeSpark Arena (03 Nov)"
        ctaHref="/code-spark"
        secondaryCtaLabel="Watch 25s Launch Film"
        secondaryCtaHref="/launch"
        onSecondaryCtaClick={handleWatchFilm}
        onSocialLinkClick={(link) => handleNav(link.href)}
        description={'Enterprise-grade academic assessment, real-time dual-stream invigilation,\nand zero-tamper cryptographic examination ledgers.'}
        socialLinks={[
          { label: 'CodeSpark Portal', href: '/code-spark' },
          { label: 'team.axiogen.in', href: 'https://team.axiogen.in' },
          { label: 'Launch Film (4K)', href: '/launch' }
        ]}
        onNavLinkClick={(link) => handleNav(link.href)}
      />

      {/* ── 2. WATERMELON UI FOOTER (footer-16.json) ── */}
      <Footer16
        brandName="AXENT"
        tagline={'Autonomous Academic Examination & Proctoring Platform.\nEngineered for uncompromised institutional integrity, real-time forensics,\nand cryptographic audit ledgers.'}
        copyright="© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved."
        columns={[]}
        onGetAppClick={triggerInstallPrompt}
      />

      {/* ── 3. FULL-SCREEN 4K MASTER LAUNCH FILM OVERLAY (Auto-Play & Auto-Return) ── */}
      {showFilm && (
        <div
          className="fixed inset-0 z-[9999] bg-black flex flex-col"
          style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
        >
          <LaunchFilmPlayer
            autoPlay={true}
            isOverlay={true}
            onClose={() => setShowFilm(false)}
          />
        </div>
      )}
    </div>
  );
};

export default LandingPage;
