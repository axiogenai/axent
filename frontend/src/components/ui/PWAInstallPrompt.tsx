import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, Share, Monitor } from 'lucide-react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    __axentDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function triggerInstallPrompt() {
  window.dispatchEvent(new CustomEvent('axent-open-install'));
}

export function PWAInstallPrompt() {
  // Never show PWA install prompt on CodeSpark portal
  if (typeof window !== 'undefined' && (window.location.pathname.includes('/codespark') || window.location.pathname.includes('/code-spark'))) {
    return null;
  }
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => (typeof window !== 'undefined' ? window.__axentDeferredPrompt || null : null)
  );
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [showDesktopHint, setShowDesktopHint] = useState(false);

  useEffect(() => {
    // 1. Check if already running in standalone/installed mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Mobile Detection (Auto-prompt strictly reserved for mobile phones)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isMobileDevice =
      /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
      (window.innerWidth < 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
    setIsMobile(isMobileDevice);

    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari =
      /safari/.test(userAgent) &&
      !/chrome|crios|crmo|firefox|fxios/.test(userAgent);

    if (isIOSDevice && isSafari && isMobileDevice) {
      setIsIOS(true);
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }

    // 3. Capture browser beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__axentDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);

      // ONLY auto-prompt on mobile phones! Never auto-prompt on PC/Desktop
      if (isMobileDevice) {
        setTimeout(() => {
          setIsVisible(true);
        }, 1200);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsVisible(false);
      window.__axentDeferredPrompt = null;
      setDeferredPrompt(null);
    };

    // 4. Manual trigger listener (when user clicks "Get App" in footer or header)
    const handleManualTrigger = () => {
      const active = window.__axentDeferredPrompt || deferredPrompt;
      if (active) {
        active.prompt().catch(() => {});
      } else if (isIOSDevice) {
        setIsVisible(true);
        setShowIOSHint(true);
      } else {
        // Desktop guide if browser doesn't expose prompt event
        setIsVisible(true);
        setShowDesktopHint(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('axent-open-install', handleManualTrigger);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('axent-open-install', handleManualTrigger);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSHint((prev) => !prev);
      return;
    }

    const activePrompt = deferredPrompt || window.__axentDeferredPrompt;
    if (!activePrompt) {
      if (!isMobile) {
        setShowDesktopHint(true);
      } else {
        setShowIOSHint(true);
      }
      return;
    }

    try {
      await activePrompt.prompt();
      const choiceResult = await activePrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsVisible(false);
        setDeferredPrompt(null);
        window.__axentDeferredPrompt = null;
      }
    } catch {
      // User cancelled
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setShowDesktopHint(false);
    setShowIOSHint(false);
  };

  if (isInstalled || !isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Install Axent Platform Application"
          className="fixed top-[76px] right-4 left-4 sm:left-auto sm:right-6 sm:top-[88px] z-50 sm:max-w-sm w-auto pointer-events-auto"
        >
          <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-2.5 sm:p-3 shadow-2xl backdrop-blur-md">
            {/* Ultra-compact single-row pill */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
                <img
                  src="/favicon-32x32.png"
                  alt="Axent Icon"
                  className="h-5 w-5 object-contain"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-tight text-zinc-100 truncate">
                  Axent Mobile App
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  Standalone examination mode
                </p>
              </div>

              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-95 cursor-pointer shadow-sm"
              >
                <Download className="h-3 w-3" />
                <span>Install</span>
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install notification"
                className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 active:scale-95 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Desktop browser hint (only if clicked manually on desktop) */}
            {showDesktopHint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2.5 border-t border-white/5 pt-2 text-[11px] text-zinc-400 flex items-center gap-2"
              >
                <Monitor className="h-3.5 w-3.5 text-zinc-200 shrink-0" />
                <span>Click the install icon in your browser's address bar (URL omnibox).</span>
              </motion.div>
            )}

            {/* iOS Hint dropdown (if tapped on iOS) */}
            {showIOSHint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2.5 border-t border-white/5 pt-2 text-[11px] text-zinc-400"
              >
                Tap <Share className="inline h-3 w-3 mx-0.5 text-zinc-200" /> <span className="text-zinc-200 font-medium">Share</span> then <span className="text-zinc-200 font-medium">"Add to Home Screen"</span>.
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PWAInstallPrompt;
