import React from 'react';
import { useNavigate } from 'react-router-dom';
import Hero1 from './ui/hero-1';
import { Footer16 } from './ui/footer-16';
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
        ]}
        onNavLinkClick={(link) => handleNav(link.href)}
      />

      {/* ── 2. WATERMELON UI FOOTER (footer-16.json) ── */}
      <Footer16
        brandName="AXENT"
        tagline={'Autonomous Academic Examination & Proctoring Platform.\nEngineered for uncompromised institutional integrity, real-time forensics,\nand cryptographic audit ledgers.'}
        copyright="© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved."
      />
    </div>
  );
};

export default LandingPage;
