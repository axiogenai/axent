import React from 'react';
import LogoIcon from '@/assets/logo-icon';
import { motion, type Variants } from 'motion/react';

export interface Footer16Link {
  label: string;
  href: string;
}

export interface Footer16Column {
  title: string;
  links: Footer16Link[];
}

export interface Footer16Props {
  brandName?: string;
  brandLogo?: React.ReactNode;
  tagline?: string;
  columns?: Footer16Column[];
  copyright?: string;
  backgroundImage?: string;
}

const defaultColumns: Footer16Column[] = [];

const backgroundUrl = 'https://assets.watermelon.sh/footer-16-bg.avif';

const sectionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

const wordmarkVariants: Variants = {
  hidden: { opacity: 0, y: 30, filter: 'blur(10px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', duration: 1.1, bounce: 0 },
  },
};

const riseVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', duration: 0.65, bounce: 0 },
  },
};

const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.045,
    },
  },
};

const linkVariants: Variants = {
  hidden: { opacity: 0, y: 7 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.42, bounce: 0 },
  },
};

export function Footer16({
  brandName = 'AXENT',
  brandLogo = (
    <img
      src="/axent-logo.png"
      alt="Axent"
      style={{
        height: '24px',
        width: 'auto',
        maxWidth: '160px',
        display: 'block',
        objectFit: 'contain'
      }}
    />
  ),
  tagline = 'Autonomous Academic Examination & Proctoring Platform.\nEngineered for uncompromised institutional integrity, real-time forensics,\nand cryptographic audit ledgers.',
  columns = defaultColumns,
  copyright = '© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved.',
  backgroundImage = backgroundUrl,
}: Footer16Props) {
  return (
    <footer className="relative w-full overflow-hidden bg-zinc-950 font-sans text-zinc-100 antialiased">
      <div
        className="absolute inset-0 z-10 bg-cover bg-center sm:-translate-y-16"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,10,14,0.35)_0%,rgba(9,10,14,0.06)_42%,rgba(9,10,14,0.58)_68%,rgba(9,10,14,0.9)_100%)]"
        aria-hidden="true"
      />

      <motion.div
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.22 }}
        className={`relative w-full mx-auto flex flex-col justify-end pt-8 sm:pt-16 ${
          columns && columns.length > 0
            ? 'min-h-[460px] sm:min-h-[640px] lg:min-h-[720px]'
            : 'min-h-[160px] sm:min-h-[220px]'
        }`}
      >
        {/* Sleek atmospheric watermark */}
        <motion.div
          variants={wordmarkVariants}
          className="pointer-events-none absolute inset-x-0 top-[2%] sm:top-[5%] lg:top-[6%] hidden sm:flex w-full justify-center overflow-hidden z-0 px-4"
          aria-hidden="true"
        >
          <div className="w-full max-w-[1380px] flex justify-center">
            <svg
              className="w-full h-auto select-none"
              viewBox="0 0 1200 240"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="axent-watermark-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <text
                x="50%"
                y="185"
                textAnchor="middle"
                fill="url(#axent-watermark-gradient)"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight="900"
                fontSize="170"
                letterSpacing="0.22em"
              >
                AXENT
              </text>
            </svg>
          </div>
        </motion.div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:justify-between lg:gap-12">
            <motion.div variants={riseVariants} className="max-w-sm">
              <a
                href="/"
                className="inline-flex items-center gap-2 text-zinc-100 transition-opacity hover:opacity-80"
                aria-label={brandName}
              >
                {brandLogo ? (
                  brandLogo
                ) : (
                  <>
                    <LogoIcon className="size-8 -translate-y-2" />
                    <span className="text-xl leading-none font-normal tracking-wide">
                      {brandName}
                    </span>
                  </>
                )}
              </a>
              <p className="text-xs leading-relaxed font-normal text-zinc-400 whitespace-pre-line sm:text-sm mt-3 max-w-md">
                {tagline}
              </p>
            </motion.div>

            {/* Links Columns */}
            {columns && columns.length > 0 && (
              <motion.nav
                variants={sectionVariants}
                aria-label="Footer navigation"
                className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 sm:gap-x-8 lg:gap-x-12"
              >
                {columns.map((column, idx) => (
                  <motion.div
                    variants={riseVariants}
                    key={column.title}
                    className={idx === 2 ? 'col-span-2 sm:col-span-1' : ''}
                  >
                    <h3 className="text-[11px] leading-tight font-semibold tracking-wider text-zinc-300 uppercase">
                      {column.title}
                    </h3>
                    <motion.ul
                      variants={listVariants}
                      className="mt-3 space-y-2.5"
                    >
                      {column.links.map((link) => (
                        <motion.li variants={linkVariants} key={link.label}>
                          <a
                            href={link.href}
                            target={link.href.startsWith('http') ? '_blank' : undefined}
                            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                            className="inline-flex text-xs leading-normal font-normal text-zinc-400 transition-colors duration-200 ease-out hover:text-zinc-100"
                          >
                            {link.label}
                          </a>
                        </motion.li>
                      ))}
                    </motion.ul>
                  </motion.div>
                ))}
              </motion.nav>
            )}
          </div>

          <motion.div
            variants={riseVariants}
            className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-5 sm:mt-9 sm:flex-row"
          >
            <p className="text-xs font-normal text-zinc-500 text-center sm:text-left">
              {copyright}
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              <span>Campus Integrity Core Active</span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </footer>
  );
}

export default Footer16;
