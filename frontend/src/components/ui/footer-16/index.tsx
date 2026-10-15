import React from 'react';
import LogoIcon from '@/assets/logo-icon';
import { motion, type Variants } from 'motion/react';
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
}

const defaultColumns: Footer16Column[] = [
  {
    title: 'Examination',
    links: [
      { label: 'Student Exam Hall', href: '/mcq' },
      { label: 'Candidate Guidelines', href: '#' },
      { label: 'Anti-Cheat Architecture', href: '#' },
      { label: 'System Telemetry', href: '#' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Dual Stream Proctoring', href: '#' },
      { label: 'Keystroke Forensics', href: '#' },
      { label: 'Cryptographic Ledger', href: '#' },
      { label: 'Security Standard', href: '#' },
    ],
  },
  {
    title: 'Integrity',
    links: [
      { label: 'Real-Time Facial Telemetry', href: '#' },
      { label: 'AI Gaze Vectoring', href: '#' },
      { label: 'Hardware Attestation', href: '#' },
      { label: 'Tamper-Proof Audit', href: '#' },
    ],
  },
];

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
        height: '42px',
        width: 'auto',
        maxWidth: '200px',
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
        className="relative mx-auto flex min-h-[580px] flex-col justify-end pt-16 sm:min-h-[640px] lg:min-h-[720px]"
      >
        {/* Sleek, tall, atmospheric watermark perfectly proportioned across the dunes */}
        <motion.div
          variants={wordmarkVariants}
          className="pointer-events-none absolute top-[3%] sm:top-[5%] lg:top-[6%] left-1/2 flex w-[95vw] max-w-[1440px] -translate-x-1/2 justify-center overflow-hidden z-0"
          aria-hidden="true"
        >
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
              textLength="92%"
              lengthAdjust="spacing"
              className="font-sans font-medium tracking-tight uppercase select-none"
              fill="url(#brandGrad16)"
              fontSize="220"
            >
              {brandName}
            </text>
          </svg>
        </motion.div>

        <div className="relative z-10 border-t border-white/10 bg-black/1 px-4 pt-9 pb-7 shadow-[0_-24px_80px_rgba(9,10,14,0.34)] backdrop-blur-xs sm:px-12 sm:pt-11 sm:pb-8 lg:pt-[46px]">
          <div className="grid gap-10 lg:grid-cols-[minmax(240px,1fr)_minmax(500px,1.2fr)] lg:gap-x-16">
            {/* Brand column */}
            <motion.div variants={riseVariants} className="max-w-xl">
              <a
                href="/"
                className="group inline-flex min-h-10 items-start gap-2 text-zinc-50 transition-[opacity,transform] duration-200 ease-out hover:opacity-85 active:scale-[0.96]"
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
              <p className="text-md max-w-lg leading-relaxed font-normal text-pretty whitespace-pre-line text-zinc-300/78 sm:text-sm mt-3">
                {tagline}
              </p>
            </motion.div>

            {/* Links Columns (3 balanced columns matching reference) */}
            <motion.nav
              variants={sectionVariants}
              aria-label="Footer navigation"
              className="grid grid-cols-1 gap-7 min-[480px]:grid-cols-3 min-[480px]:gap-x-8 lg:gap-x-12"
            >
              {columns.map((column) => (
                <motion.div variants={riseVariants} key={column.title}>
                  <h3 className="text-md leading-none font-light tracking-wide text-zinc-50 uppercase">
                    {column.title}
                  </h3>
                  <motion.ul
                    variants={listVariants}
                    className="mt-4 space-y-[8px]"
                  >
                    {column.links.map((link) => (
                      <motion.li variants={linkVariants} key={link.label}>
                        <a
                          href={link.href}
                          target={link.href.startsWith('http') ? '_blank' : undefined}
                          rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                          className="inline-flex min-h-5 items-center text-sm leading-tight font-light text-zinc-300/70 transition-colors duration-200 ease-out hover:text-zinc-50"
                        >
                          {link.label}
                        </a>
                      </motion.li>
                    ))}
                  </motion.ul>
                </motion.div>
              ))}
            </motion.nav>
          </div>

          <motion.div
            variants={riseVariants}
            className="mt-6 flex flex-col border-t border-white/10 pt-4 sm:mt-9 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-normal text-zinc-400/76">
              {copyright}
            </p>

            <motion.ul
              variants={listVariants}
              className="flex items-center gap-1 sm:justify-end mt-3 sm:mt-0"
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
