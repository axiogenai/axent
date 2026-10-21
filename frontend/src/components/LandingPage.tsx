import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Hero1 from './ui/hero-1';
import { Footer16 } from './ui/footer-16';
import { VercelBadge } from './ui/VercelBadge';
import { LaunchFilmPlayer } from './LaunchFilmPlayer';
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
          { label: 'Examination Hall', href: '/mcq', active: true },
          { label: '25s Launch Film', href: '/launch' }
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
        secondaryCtaLabel="Watch 25s Launch Film"
        secondaryCtaHref="/launch"
        onSecondaryCtaClick={handleWatchFilm}
        onSocialLinkClick={(link) => handleNav(link.href)}
        description={'Enterprise-grade academic assessment, real-time dual-stream invigilation,\nand zero-tamper cryptographic examination ledgers.'}
        socialLinks={[
          { label: 'team.axiogen.in', href: 'https://team.axiogen.in' },
          { label: 'Launch Film (4K)', href: '/launch' }
        ]}
        badge={<VercelBadge />}
        onNavLinkClick={(link) => handleNav(link.href)}
      />

      {/* ── 2. WATERMELON UI FOOTER (footer-16.json) ── */}
      <Footer16
        brandName="AXENT"
        tagline={'Autonomous Academic Examination & Proctoring Platform.\nEngineered for uncompromised institutional integrity, real-time forensics,\nand cryptographic audit ledgers.'}
        copyright="© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved."
        columns={[]}
        badge={<VercelBadge />}
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
