import React from 'react';
import LogoIcon from '@/assets/logo-icon';
import { motion, type Variants } from 'motion/react';
import { Download } from 'lucide-react';

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
  onGetAppClick?: () => void;
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
  onGetAppClick,
}: Footer16Props) {
  return (
    <footer className="relative w-full overflow-hidden bg-zinc-950 font-sans text-zinc-100 antialiased">
      {/* 1. Giant atmospheric watermark text UNDER/BEHIND the mountains */}
      <motion.div
        variants={wordmarkVariants}
        className="pointer-events-none absolute inset-x-0 top-7 sm:top-5 lg:top-7 flex w-full justify-center overflow-hidden z-0 px-4"
        aria-hidden="true"
      >
        <div className="w-full max-w-[1380px] flex justify-center">
          <svg
            className="w-full h-auto select-none"
            viewBox="0 0 1000 220"
            preserveAspectRatio="xMidYMid meet"
            aria-label={brandName}
          >
            <defs>
              <linearGradient id="brandGrad16" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.9" />
                <stop offset="35%" stopColor="#a1a1aa" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#3f3f46" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <text
              x="50%"
              y="152"
              textAnchor="middle"
              fill="url(#brandGrad16)"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="165"
              letterSpacing="0.2em"
            >
              {brandName}
            </text>
          </svg>
        </div>
      </motion.div>

      {/* 2. Mountains background layer IN FRONT OF the text */}
      <div
        className="absolute inset-0 z-10 bg-cover bg-center pointer-events-none sm:translate-y-2"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 z-10 pointer-events-none bg-[linear-gradient(180deg,rgba(9,10,14,0.25)_0%,rgba(9,10,14,0.04)_42%,rgba(9,10,14,0.58)_68%,rgba(9,10,14,0.9)_100%)]"
        aria-hidden="true"
      />

      {/* 3. Foreground content with bottom glass blur dock */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.22 }}
        className="relative z-20 w-full mx-auto flex flex-col justify-end pt-5 sm:pt-28 lg:pt-36 min-h-[250px] sm:min-h-[460px] lg:min-h-[520px]"
      >
        {/* Backdrop blur glass container */}
        <div className="relative z-10 border-t border-white/10 bg-black/40 px-5 pt-6 pb-6 backdrop-blur-md sm:px-12 sm:pt-8 sm:pb-8">
          <div className={columns && columns.length > 0 ? "grid gap-8 sm:gap-10 lg:grid-cols-[minmax(240px,1fr)_minmax(500px,1.2fr)] lg:gap-x-16" : "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"}>
            {/* Brand column */}
            <motion.div variants={riseVariants} className="max-w-xl">
              <a
                href="/"
                className="group inline-flex items-center gap-2 text-zinc-50 transition-[opacity,transform] duration-200 ease-out hover:opacity-85 active:scale-[0.96]"
                aria-label={`${brandName} home`}
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

            {/* Get App Button */}
            {onGetAppClick && (!columns || columns.length === 0) && (
              <motion.div variants={riseVariants} className="flex items-center sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={onGetAppClick}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-zinc-900/80 px-4 py-2.5 text-xs font-semibold text-zinc-100 shadow-sm backdrop-blur-md transition-all hover:border-white/30 hover:bg-zinc-800 active:scale-95 cursor-pointer"
                >
                  <Download className="h-4 w-4 text-zinc-300" />
                  <span>Get App</span>
                </button>
              </motion.div>
            )}

            {/* Links Columns (rendered only if columns array is non-empty) */}
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
        </div>
      </motion.div>
    </footer>
  );
}

export default Footer16;
