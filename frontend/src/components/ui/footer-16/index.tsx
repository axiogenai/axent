import React from 'react';
import LogoIcon from '@/assets/logo-icon';
import { motion, type Variants } from 'motion/react';
import { VercelBadge } from '../VercelBadge';
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
} from 'react-icons/fa6';

export interface Footer16Link {
  label: string;
  href: string;
}

export interface Footer16Column {
  title: string;
  links: Footer16Link[];
}

export interface Footer16Social {
  label: string;
  href: string;
  icon: 'facebook' | 'twitter' | 'instagram' | 'linkedin';
}

export interface Footer16Props {
  brandName?: string;
  brandLogo?: React.ReactNode;
  tagline?: string;
  columns?: Footer16Column[];
  socials?: Footer16Social[];
  copyright?: string;
  backgroundImage?: string;
  badge?: React.ReactNode;
}

const defaultColumns: Footer16Column[] = [];

const defaultSocials: Footer16Social[] = [
  { label: 'Facebook', href: 'https://team.axiogen.in', icon: 'facebook' },
  { label: 'Twitter', href: 'https://team.axiogen.in', icon: 'twitter' },
  { label: 'Instagram', href: 'https://team.axiogen.in', icon: 'instagram' },
  { label: 'LinkedIn', href: 'https://team.axiogen.in', icon: 'linkedin' },
];

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

const socialIcons = {
  facebook: FaFacebookF,
  twitter: FaXTwitter,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
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
  socials = defaultSocials,
  copyright = '© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved.',
  backgroundImage = backgroundUrl,
  badge,
}: Footer16Props) {
  const activeBadge = badge !== undefined ? badge : <VercelBadge />;
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
        {/* Sleek, tall, atmospheric watermark hidden on mobile to prevent logo collision, visible on desktop/tablet */}
        <motion.div
          variants={wordmarkVariants}
          className="pointer-events-none absolute inset-x-0 top-[2%] sm:top-[5%] lg:top-[6%] hidden sm:flex w-full justify-center overflow-hidden z-0 px-4"
          aria-hidden="true"
        >
          <div className="w-full max-w-[1380px] flex justify-center">
            <svg
              className="w-full h-auto select-none"
              viewBox="0 0 1000 240"
              preserveAspectRatio="xMidYMid meet"
              aria-label={brandName}
            >
              <defs>
                <linearGradient id="brandGrad16" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#71717a" stopOpacity="0.85" />
                  <stop offset="35%" stopColor="#52525b" stopOpacity="0.75" />
                  <stop offset="70%" stopColor="#3f3f46" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#18181b" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <text
                x="50%"
                y="58%"
                dominantBaseline="middle"
                textAnchor="middle"
                textLength="90%"
                lengthAdjust="spacing"
                className="font-sans font-medium tracking-tight uppercase select-none"
                fill="url(#brandGrad16)"
                fontSize="220"
              >
                {brandName}
              </text>
            </svg>
          </div>
        </motion.div>

        <div className="relative z-10 border-t border-white/10 bg-black/40 px-5 pt-8 pb-7 backdrop-blur-md sm:px-12 sm:pt-11 sm:pb-8 lg:pt-[46px]">
          <div className={columns && columns.length > 0 ? "grid gap-8 sm:gap-10 lg:grid-cols-[minmax(240px,1fr)_minmax(500px,1.2fr)] lg:gap-x-16" : "flex flex-col max-w-xl"}>
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

          <motion.div
            variants={riseVariants}
            className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-5 sm:mt-9 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <p className="text-xs font-normal text-zinc-500">
                {copyright}
              </p>
              {activeBadge && (
                <div className="inline-flex items-center">
                  {activeBadge}
                </div>
              )}
            </div>

            <motion.ul
              variants={listVariants}
              className="flex items-center gap-1 sm:justify-end"
              aria-label="Social links"
            >
              {socials.map((social) => {
                const Icon = socialIcons[social.icon] || FaFacebookF;

                return (
                  <motion.li variants={linkVariants} key={social.label}>
                    <a
                      href={social.href}
                      target={social.href.startsWith('http') ? '_blank' : undefined}
                      rel={social.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      aria-label={social.label}
                      className="group relative flex size-9 items-center justify-center text-zinc-400 transition-[color,transform] duration-200 ease-out hover:text-zinc-50 active:scale-[0.96]"
                    >
                      <Icon className="size-4 transition-[opacity,scale] duration-200 ease-out group-hover:scale-110 group-hover:opacity-100" />
                    </a>
                  </motion.li>
                );
              })}
            </motion.ul>
          </motion.div>
        </div>
      </motion.div>
    </footer>
  );
}

export default Footer16;
