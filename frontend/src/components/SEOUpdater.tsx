import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface RouteSEO {
  title: string;
  description: string;
  canonicalPath: string;
  robots?: string;
}

const ROUTE_SEO_MAP: Record<string, RouteSEO> = {
  '/': {
    title: 'Axent — Autonomous Examination & Cognitive Evaluation Platform',
    description: 'Enterprise-grade autonomous academic assessment, AI paper generation, real-time dual-stream candidate invigilation, and zero-tamper cryptographic examination ledgers.',
    canonicalPath: '/',
    robots: 'index, follow'
  },
  '/mcq': {
    title: 'Examination Hall — Axent Live Assessment Portal',
    description: 'Secure, real-time academic assessment and multiple-choice examination terminal with dual-stream proctoring, focus tracking, and immediate result computation.',
    canonicalPath: '/mcq',
    robots: 'index, follow'
  },
  '/launch': {
    title: 'Axent Master Launch Film (4K UHD) — Director\'s Treatment',
    description: 'Watch the official 25-second 4K UHD director’s launch film for Axent — the next-generation autonomous academic assessment platform by Axiogen.',
    canonicalPath: '/launch',
    robots: 'index, follow'
  },
  '/workspace': {
    title: 'Examination Workspace — Axent Code & Assessment Terminal',
    description: 'Interactive IDE and code submission terminal for technical assessments, real-time compiler telemetry, and automated Viva Voce evaluation.',
    canonicalPath: '/workspace',
    robots: 'noindex, follow'
  },
  '/report': {
    title: 'Assessment & Telemetry Evaluation Report — Axent',
    description: 'Comprehensive code DNA analysis, plagiarism telemetry, performance metrics, and automated viva scores.',
    canonicalPath: '/report',
    robots: 'noindex, follow'
  },
  '/login': {
    title: 'Institutional Authority Sign-In — Axent Portal',
    description: 'Secure zero-trust login portal for university administrators, proctors, and authorized faculty paper setters.',
    canonicalPath: '/login',
    robots: 'index, follow'
  },
  '/login/paper-setter': {
    title: 'Paper Setter Faculty Login — Axent Portal',
    description: 'Faculty portal for syllabus blueprint creation, automated question bank synthesis, and exam publication.',
    canonicalPath: '/login/paper-setter',
    robots: 'index, follow'
  },
  '/login/admin': {
    title: 'Chief Proctor & Administrator Sign-In — Axent Portal',
    description: 'Administrative sign-in for real-time exam monitoring, laboratory seating allocation, and security enforcement.',
    canonicalPath: '/login/admin',
    robots: 'noindex, follow'
  },
  '/paper-setter': {
    title: 'Autonomous Paper Setter Portal — Axent',
    description: 'AI-assisted syllabus parsing, Blooms taxonomy cognitive weighting, question authoring, and cloud publication.',
    canonicalPath: '/paper-setter',
    robots: 'noindex, nofollow'
  },
  '/admin': {
    title: 'Proctor Oversight & Command Center — Axent',
    description: 'Real-time candidate telemetry, infraction tracking, college laboratory synchronization, and examination ledgers.',
    canonicalPath: '/admin',
    robots: 'noindex, nofollow'
  },
  '/admin/mcq-tickets': {
    title: 'Candidate Hall Ticket Issuer — Axent',
    description: 'Issue cryptographic access credentials, hall tickets, and laboratory seat assignments.',
    canonicalPath: '/admin/mcq-tickets',
    robots: 'noindex, nofollow'
  }
};

export const SEOUpdater: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const current = ROUTE_SEO_MAP[location.pathname] || {
      title: 'Axent — Autonomous Academic Assessment Platform',
      description: 'Enterprise academic assessment, dual-stream invigilation, and zero-tamper cryptographic ledgers.',
      canonicalPath: location.pathname,
      robots: 'index, follow'
    };

    // Update Document Title
    document.title = current.title;

    // Helper to safely update meta tag
    const updateMeta = (selector: string, attribute: string, value: string) => {
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        const [attrName, attrVal] = selector.replace(/[\[\]']/g, '').split('=');
        element.setAttribute(attrName, attrVal);
        document.head.appendChild(element);
      }
      element.setAttribute(attribute, value);
    };

    // Update Meta Description
    updateMeta('meta[name="description"]', 'content', current.description);
    updateMeta('meta[name="title"]', 'content', current.title);

    // Update Open Graph
    updateMeta('meta[property="og:title"]', 'content', current.title);
    updateMeta('meta[property="og:description"]', 'content', current.description);
    updateMeta('meta[property="og:url"]', 'content', `https://axent.axiogen.in${current.canonicalPath}`);

    // Update Twitter Cards
    updateMeta('meta[name="twitter:title"]', 'content', current.title);
    updateMeta('meta[name="twitter:description"]', 'content', current.description);
    updateMeta('meta[name="twitter:url"]', 'content', `https://axent.axiogen.in${current.canonicalPath}`);

    // Update Robots
    if (current.robots) {
      updateMeta('meta[name="robots"]', 'content', current.robots);
    }

    // Update Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://axent.axiogen.in${current.canonicalPath}`);
  }, [location.pathname]);

  return null;
};
