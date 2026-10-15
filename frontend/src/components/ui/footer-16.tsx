import React from 'react';
import { motion, type Variants } from 'motion/react';
import { Globe, Terminal, Shield, ExternalLink } from 'lucide-react';

export interface Footer16Link {
  label: string;
  href: string;
  external?: boolean;
}

export interface Footer16Column {
  title: string;
  links: Footer16Link[];
}

export interface Footer16Social {
  label: string;
  href: string;
  icon: 'globe' | 'terminal' | 'shield' | 'external';
}

export interface Footer16Props {
  brandName?: string;
  tagline?: string;
  columns?: Footer16Column[];
  legalLinks?: Footer16Link[];
  socials?: Footer16Social[];
  copyright?: string;
  backgroundImage?: string;
}

const defaultColumns: Footer16Column[] = [
  {
    title: 'Examination Halls',
    links: [
      { label: 'Student MCQ Hall', href: '/mcq' },
      { label: 'Paper Setter Portal', href: '/paper-setter' },
      { label: 'Coding Practical Workspace', href: '/workspace' },
      { label: 'Invigilator CCTV Command', href: '/admin' },
    ],
  },
  {
    title: 'Platform Architecture',
    links: [
      { label: 'Dual Stream Proctoring', href: '#features' },
      { label: 'Real-Time Keystroke Forensics', href: '#features' },
      { label: 'Cloud Database Ledger', href: '#security' },
      { label: 'Anti-Tamper Sanitization', href: '#security' },
    ],
  },
  {
    title: 'Axiogen Ecosystem',
    links: [
      { label: 'team.axiogen.in', href: 'https://team.axiogen.in', external: true },
      { label: 'Axiogen Cloud Infrastructure', href: 'https://api.axiogen.in', external: true },
      { label: 'Axiogen Vault Storage', href: 'https://api.axiogen.in/vault', external: true },
      { label: 'System Telemetry', href: '#telemetry' },
    ],
  },
];

const defaultLegalLinks: Footer16Link[] = [
  { label: 'Institutional Integrity Policy', href: '#' },
  { label: 'Candidate Privacy Terms', href: '#' },
  { label: 'Cryptographic Audit Standard', href: '#' },
];

const defaultSocials: Footer16Social[] = [
  { label: 'team.axiogen.in', href: 'https://team.axiogen.in', icon: 'globe' },
  { label: 'Terminal Core', href: '/workspace', icon: 'terminal' },
  { label: 'Proctor Security', href: '/admin', icon: 'shield' },
];

const socialIcons = {
  globe: Globe,
  terminal: Terminal,
  shield: Shield,
  external: ExternalLink,
};

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
  tagline = 'Autonomous Academic Examination & Proctoring Platform.\nEngineered for uncompromised institutional integrity, real-time forensics,\nand cryptographic audit ledgers.',
  columns = defaultColumns,
  legalLinks = defaultLegalLinks,
  socials = defaultSocials,
  copyright = '© 2026 Axent · Engineered by team.axiogen.in. All institutional rights reserved.',
  backgroundImage = backgroundUrl,
}: Footer16Props) {
  return (
    <footer className="relative w-full overflow-hidden bg-zinc-950 font-sans text-zinc-100 antialiased border-t border-zinc-900">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center sm:-translate-y-16 opacity-35"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,10,14,0.45)_0%,rgba(9,10,14,0.1)_42%,rgba(9,10,14,0.7)_68%,rgba(9,10,14,0.98)_100%)] z-0"
        aria-hidden="true"
      />

      <motion.div
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="relative mx-auto flex min-h-[580px] flex-col justify-end pt-16 sm:min-h-[640px] lg:min-h-[720px] z-10"
      >
        {/* Architectural Giant Wordmark */}
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            top: '8%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: '1200px',
            overflow: 'hidden',
            zIndex: 0,
            opacity: 0.15
          }}
          aria-hidden="true"
        >
          <motion.div
            variants={wordmarkVariants}
            className="w-full flex justify-center"
          >
            <svg
              className="h-auto w-full select-none"
              viewBox={`0 0 ${Math.max(brandName.length * 110, 480)} 160`}
              preserveAspectRatio="xMidYMid meet"
              aria-label={brandName}
            >
              <defs>
                <linearGradient id="brandGrad16" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3f3f46" />
                  <stop offset="100%" stopColor="#09090b" />
                </linearGradient>
              </defs>
              <text
                x="50%"
                y="55%"
                dominantBaseline="middle"
                textAnchor="middle"
                lengthAdjust="spacing"
                className="font-sans font-black tracking-widest uppercase"
                fill="url(#brandGrad16)"
                fontSize="120"
                style={{ letterSpacing: '0.15em' }}
              >
                {brandName}
              </text>
            </svg>
          </motion.div>
        </div>

        {/* Content & Navigation Grid */}
        <div className="relative z-10 border-t border-white/10 bg-zinc-950/80 px-6 pt-10 pb-8 backdrop-blur-md sm:px-12 sm:pt-12 sm:pb-10 lg:px-20 lg:pt-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(260px,1.2fr)_minmax(500px,1.8fr)] lg:gap-x-20">
            {/* Brand column */}
            <motion.div variants={riseVariants} className="max-w-xl">
              <a
                href="/"
                className="inline-block transition-opacity duration-200 hover:opacity-85 mb-5"
                aria-label="Axent home"
                title="Axent Platform Home"
              >
                <img
                  src="/axent-logo.png"
                  alt="Axent"
                  style={{
                    height: '32px',
                    width: 'auto',
                    maxWidth: '160px',
                    display: 'block',
                    objectFit: 'contain'
                  }}
                />
              </a>
              <p className="text-sm leading-relaxed text-zinc-400 whitespace-pre-line mb-4 font-normal">
                {tagline}
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Synchronized with</span>
                <a
                  href="https://team.axiogen.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white underline hover:text-zinc-200"
                >
                  team.axiogen.in
                </a>
              </div>
            </motion.div>

            {/* Links Columns */}
            <motion.nav
              variants={sectionVariants}
              aria-label="Footer navigation"
              className="grid grid-cols-1 gap-8 min-[520px]:grid-cols-3 min-[520px]:gap-x-10 lg:gap-x-12"
            >
              {columns.map((column) => (
                <motion.div variants={riseVariants} key={column.title}>
                  <h3 className="text-xs font-semibold tracking-wider text-zinc-200 uppercase font-mono mb-4">
                    {column.title}
                  </h3>
                  <motion.ul variants={listVariants} className="space-y-2.5">
                    {column.links.map((link) => (
                      <motion.li variants={linkVariants} key={link.label}>
                        <a
                          href={link.href}
                          target={link.external ? '_blank' : undefined}
                          rel={link.external ? 'noopener noreferrer' : undefined}
                          className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors duration-200 hover:text-white"
                        >
                          <span>{link.label}</span>
                          {link.external && <ExternalLink size={11} className="text-zinc-500" />}
                        </a>
                      </motion.li>
                    ))}
                  </motion.ul>
                </motion.div>
              ))}
            </motion.nav>
          </div>

          {/* Bottom Bar: Copyright & Legal */}
          <motion.div
            variants={riseVariants}
            className="mt-10 flex flex-col border-t border-zinc-800/80 pt-6 sm:mt-12 sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <p className="text-xs text-zinc-500 font-mono">
              {copyright}
            </p>

            <div className="flex flex-wrap items-center gap-6">
              {/* Social / Telemetry Icons */}
              <motion.ul variants={listVariants} className="flex items-center gap-2">
                {socials.map((social) => {
                  const Icon = socialIcons[social.icon] || Globe;
                  return (
                    <motion.li variants={linkVariants} key={social.label}>
                      <a
                        href={social.href}
                        target={social.href.startsWith('http') ? '_blank' : undefined}
                        rel={social.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        aria-label={social.label}
                        title={social.label}
                        className="flex w-8 h-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:text-white hover:border-zinc-700"
                      >
                        <Icon size={14} />
                      </a>
                    </motion.li>
                  );
                })}
              </motion.ul>

              {/* Legal Links */}
              <motion.ul variants={listVariants} className="flex flex-wrap items-center gap-x-5 text-xs text-zinc-500">
                {legalLinks.map((link) => (
                  <motion.li variants={linkVariants} key={link.label}>
                    <a
                      href={link.href}
                      className="hover:text-zinc-300 transition-colors"
                    >
                      {link.label}
                    </a>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </footer>
  );
}
export default Footer16;
