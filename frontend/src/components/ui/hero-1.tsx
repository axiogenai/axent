import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpRight, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavLink {
    label: string;
    href: string;
    active?: boolean;
}

export interface SocialLink {
    label: string;
    href: string;
}

export interface Hero1Props {
    /** Brand / logo name shown top-left */
    brand?: React.ReactNode;
    /** Navigation links rendered in the center of the navbar */
    navLinks?: NavLink[];
    /** Main headline — can be a string or JSX (e.g. with <br />) */
    headline?: React.ReactNode;
    /** CTA button label */
    ctaLabel?: string;
    /** CTA button href */
    ctaHref?: string;
    /** Secondary CTA button label */
    secondaryCtaLabel?: string;
    /** Secondary CTA button href */
    secondaryCtaHref?: string;
    /** Small description text at the bottom-left */
    description?: string;
    /** Social links rendered at the bottom-right */
    socialLinks?: SocialLink[];
    /** Sign-in / auth button label */
    signInLabel?: string;
    /** Sign-in href */
    signInHref?: string;
    /** Callback for when a nav link is clicked */
    onNavLinkClick?: (link: NavLink) => void;
    /** Additional wrapper CSS classes */
    className?: string;
}

const DEFAULT_NAV: NavLink[] = [
    { label: "Examination Hall", href: "/mcq", active: true },
    { label: "Instructions", href: "#features" },
    { label: "Integrity Standard", href: "#security" },
];

const DEFAULT_SOCIAL: SocialLink[] = [
    { label: "team.axiogen.in", href: "https://team.axiogen.in" },
    { label: "Instructions", href: "#features" },
    { label: "Security Ledger", href: "#security" },
];

export default function Hero1({
    brand = (
        <img
            src="/axent-logo.png"
            alt="Axent"
            style={{ height: '52px', width: 'auto', display: 'block', objectFit: 'contain' }}
        />
    ),
    navLinks = DEFAULT_NAV,
    headline = (
        <>
            Autonomous Integrity,
            <br />
            Absolute Precision.
        </>
    ),
    ctaLabel = "Enter Student Examination Hall",
    ctaHref = "/mcq",
    secondaryCtaLabel,
    secondaryCtaHref,
    description = "Enterprise-grade academic assessment, real-time dual stream invigilation,\nand zero-tamper cryptographic examination ledgers.",
    socialLinks = DEFAULT_SOCIAL,
    signInLabel,
    signInHref,
    onNavLinkClick,
    className,
}: Hero1Props) {
    const [links, setLinks] = useState<NavLink[]>(navLinks);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleNavLinkClick = (clickedLink: NavLink, e: React.MouseEvent) => {
        if (onNavLinkClick) {
            e.preventDefault();
            onNavLinkClick(clickedLink);
        }
        setLinks(
            links.map((link) => ({
                ...link,
                active: link.label === clickedLink.label,
            }))
        );
        setIsMobileMenuOpen(false);
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.12,
                delayChildren: 0.1,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 24 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
        },
    };

    const backgroundVariants = {
        hidden: { opacity: 0, scale: 1.05 },
        visible: {
            opacity: 0.9,
            scale: 1,
            transition: { duration: 1.2, ease: "easeOut" as const },
        },
    };

    return (
        <section
            className={cn(
                "relative w-full min-h-screen flex flex-col justify-between overflow-hidden text-white selection:bg-white selection:text-black",
                className
            )}
            style={{ backgroundColor: "#06060c" }}
        >
            <motion.div
                initial="hidden"
                animate="visible"
                variants={backgroundVariants}
                className="absolute bottom-0 left-0 w-full sm:w-[85%] md:w-[65%] h-[80%] md:h-[75%] pointer-events-none select-none z-0 overflow-hidden"
            >
                <img
                    src="https://assets.watermelon.sh/hero-1.avif"
                    alt="Axent structural background"
                    className="absolute inset-0 h-full w-full object-cover object-bottom-left opacity-90"
                />
              
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(ellipse 80% 70% at 20% 80%, transparent 40%, #06060c 85%)",
                    }}
                />
            </motion.div>

            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative z-50 flex items-center justify-between px-6 py-6 md:px-12 lg:px-20"
            >
                {/* Brand Logo */}
                <a href="/" className="flex items-center gap-2 group">
                    {typeof brand === "string" ? (
                        <span className="relative text-white font-semibold text-lg tracking-tight select-none">
                            {brand}
                            <span className="absolute -top-1 -right-2 text-xs text-white select-none">
                                •
                            </span>
                        </span>
                    ) : (
                        brand
                    )}
                </a>

                <nav className="hidden md:block">
                    <ul className="flex items-center gap-10 lg:gap-14">
                        {links.map((link) => (
                            <li key={link.label} className="relative py-1">
                                <a
                                    href={link.href}
                                    onClick={(e) => handleNavLinkClick(link, e)}
                                    className={cn(
                                        "text-sm font-medium transition-colors duration-300 relative px-0.5 tracking-wide",
                                        link.active
                                            ? "text-white"
                                            : "text-white/60 hover:text-white"
                                    )}
                                >
                                    {link.label}
                                    {link.active && (
                                        <motion.span
                                            layoutId="activeUnderline"
                                            className="absolute left-0 right-0 bottom-[-4px] h-[1.5px] bg-white"
                                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                        />
                                    )}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                {signInLabel && signInHref && (
                    <div className="hidden md:block ml-4">
                        <a
                            href={signInHref}
                            className="inline-flex items-center justify-center px-5 py-2 rounded-lg border border-white/20 text-white text-sm font-medium bg-transparent hover:border-white/50 hover:bg-white/5 transition-all duration-300"
                        >
                            {signInLabel}
                        </a>
                    </div>
                )}

                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="md:hidden flex flex-col justify-center items-center w-9 h-9 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors z-50 relative"
                    aria-label="Toggle navigation menu"
                >
                    <div className="w-4 h-4 flex flex-col justify-between items-center relative">
                        <span
                            className={cn(
                                "w-full h-[1.5px] bg-white transition-all duration-300 absolute left-0",
                                isMobileMenuOpen ? "rotate-45 top-[7px]" : "top-[2px]"
                            )}
                        />
                        <span
                            className={cn(
                                "w-full h-[1.5px] bg-white transition-all duration-300 absolute left-0 top-[7px]",
                                isMobileMenuOpen && "opacity-0"
                            )}
                        />
                        <span
                            className={cn(
                                "w-full h-[1.5px] bg-white transition-all duration-300 absolute left-0",
                                isMobileMenuOpen ? "-rotate-45 top-[7px]" : "top-[12px]"
                            )}
                        />
                    </div>
                </button>
            </motion.header>

            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 bg-[#06060c]/98 backdrop-blur-md z-40 flex flex-col justify-between px-6 py-24 md:hidden"
                    >
                        <nav className="flex flex-col gap-6 mt-8">
                            {links.map((link, idx) => (
                                <motion.div
                                    key={link.label}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <a
                                        href={link.href}
                                        onClick={(e) => handleNavLinkClick(link, e)}
                                        className={cn(
                                            "text-2xl font-semibold transition-colors duration-200 block",
                                            link.active ? "text-white" : "text-white/50"
                                        )}
                                    >
                                        {link.label}
                                    </a>
                                </motion.div>
                            ))}
                        </nav>

                        {signInLabel && signInHref && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25 }}
                                className="flex flex-col gap-6"
                            >
                                <a
                                    href={signInHref}
                                    className="w-full py-3.5 rounded-full border border-white/20 text-white text-center text-base font-medium bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    {signInLabel}
                                </a>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Main Hero Content Area ── */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 flex-1 flex flex-col justify-between px-6 pt-12 pb-10 md:px-12 lg:px-20 md:pt-16 md:pb-12"
            >
                {/* Top Section: Headline & CTA Button */}
                <div className="flex flex-col gap-8 md:gap-10 max-w-[850px] mt-[5vh]">
                    <motion.h1
                        variants={itemVariants}
                        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.08] tracking-[-0.04em] text-white"
                    >
                        {headline}
                    </motion.h1>

                    <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-4">
                        <a
                            href={ctaHref}
                            className="inline-flex w-fit items-center gap-4 bg-white text-black font-semibold text-sm p-1.5 pl-5 rounded-lg hover:bg-white/90 transition-all duration-300 shadow-[0_4px_16px_rgba(255,255,255,0.06)] group"
                        >
                            <span>{ctaLabel}</span>
                            <span className="w-8 h-8 rounded-md bg-black flex items-center justify-center shrink-0 overflow-hidden relative">
                                <ArrowUpRight className="w-4 h-4 text-white transition-transform duration-300 ease-out group-hover:translate-x-[2px] group-hover:translate-y-[-2px]" />
                            </span>
                        </a>

                        {secondaryCtaLabel && secondaryCtaHref && (
                            <a
                                href={secondaryCtaHref}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/20 text-white text-sm font-medium hover:border-white/50 hover:bg-white/5 transition-all duration-300"
                            >
                                <span>{secondaryCtaLabel}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 text-white/60" />
                            </a>
                        )}
                    </motion.div>
                </div>

                {/* Bottom Section: Description & Controls */}
                <motion.div
                    variants={itemVariants}
                    className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 lg:gap-10 mt-auto pt-16 w-full relative"
                >
                    <div className="md:max-w-2xl">
                        <p className="text-white/80 text-sm md:text-base lg:text-lg leading-relaxed font-normal whitespace-pre-line">
                            {description}
                        </p>
                    </div>

                    <div className="flex items-center gap-6 lg:gap-10">
                        {socialLinks.map((social) => (
                            <a
                                key={social.label}
                                href={social.href}
                                target={social.href.startsWith("http") ? "_blank" : undefined}
                                rel={social.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                className="text-white/70 text-sm lg:text-base hover:text-white transition-colors duration-250 tracking-wide font-mono"
                            >
                                {social.label}
                            </a>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </section>
    );
}
