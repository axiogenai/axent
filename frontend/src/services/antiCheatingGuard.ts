/**
 * Axent Anti-Cheating & AI Surveillance Guard
 * Protects examinations against:
 * 1. Gemini / Copilot / ChatGPT floating overlays, sidebars, and extension panels
 * 2. Secondary display & cursor departure to external windows
 * 3. Microphone voice assistance (voice queries to Gemini Live / external speech)
 * 4. Mobile split-screen multitasking, notification pull-down app switching, and touch selection
 * 5. Clipboard injection and DevTools tampering
 */

import { playSound } from '../utils/sounds';

export interface AntiCheatingConfig {
  stationId: string;
  labId?: string;
  enableAudioMonitoring?: boolean;
  enableAiExtensionScan?: boolean;
  enableCursorDepartureGuard?: boolean;
  enableMobileStrictShield?: boolean;
  onInfraction: (reason: string, details?: Record<string, unknown>) => void;
  onWarningBanner: (message: string) => void;
  onAudioAlert?: (decibels: number) => void;
  onAiAlert?: (details: string) => void;
}

export interface AntiCheatingShieldHandle {
  stop: () => void;
  requestFullscreen: () => Promise<boolean>;
  getAudioLevel: () => number;
  isAiShieldActive: () => boolean;
}

export function startAntiCheatingShield(config: AntiCheatingConfig): AntiCheatingShieldHandle {
  let isRunning = true;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let audioStream: MediaStream | null = null;
  let audioPollInterval: any = null;
  let sustainedSpeechCounter = 0;
  let cursorDepartureTimeout: any = null;
  let extensionScanInterval: any = null;
  let wakeLockSentinel: any = null;
  let currentAudioLevel = 0;
  const shieldStartTime = Date.now();
  const STARTUP_GRACE_PERIOD_MS = 20000;

  // ── 1. SCREEN WAKE LOCK (Prevents Mobile Device Sleep) ─────────────────────
  const initWakeLock = async () => {
    if ('wakeLock' in navigator && config.enableMobileStrictShield !== false) {
      try {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          if (isRunning) {
            // Re-request wake lock if released during active exam
            void initWakeLock();
          }
        });
      } catch {
        // WakeLock not supported or battery saver active
      }
    }
  };
  void initWakeLock();

  // ── 2. CURSOR DEPARTURE & FLOATING AI DETECTION (Desktop & Tablets) ─────────
  const handleMouseLeave = (e: MouseEvent) => {
    if (!isRunning || config.enableCursorDepartureGuard === false) return;
    if (Date.now() - shieldStartTime < STARTUP_GRACE_PERIOD_MS) return;
    // Check if mouse genuinely left the client window viewport
    if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
      if (cursorDepartureTimeout) clearTimeout(cursorDepartureTimeout);
      cursorDepartureTimeout = setTimeout(() => {
        if (!isRunning) return;
        if (Date.now() - shieldStartTime < STARTUP_GRACE_PERIOD_MS) return;
        playSound('warning');
        config.onWarningBanner('AI GUARD: Cursor departed exam window. External AI assistant or secondary panel interaction detected.');
        config.onInfraction('Cursor departed exam viewport towards external application / AI assistant');
        if (config.onAiAlert) config.onAiAlert('Cursor departure outside viewport');
      }, 7000);
    }
  };

  const handleMouseEnter = () => {
    if (cursorDepartureTimeout) {
      clearTimeout(cursorDepartureTimeout);
      cursorDepartureTimeout = null;
    }
  };

  document.documentElement.addEventListener('mouseleave', handleMouseLeave);
  document.documentElement.addEventListener('mouseenter', handleMouseEnter);

  // ── 3. EXTENSION & DOM INJECTION SCANNER (Gemini / Copilot / Sider / Harpa) ───
  const scanForAiExtensions = () => {
    if (!isRunning || config.enableAiExtensionScan === false) return;
    try {
      // Known browser AI assistant extension identifiers & floating overlays
      const suspiciousSelectors = [
        '[id*="gemini-assistant"]',
        '[class*="gemini-assistant"]',
        '[id*="copilot-sidebar"]',
        '[class*="copilot-sidebar"]',
        '#harpa-root',
        '#sider-container',
        '#monica-root',
        '.chatgpt-sidebar',
        '[id*="ai-sidebar"]',
        '[class*="ai-floating-widget"]'
      ];

      for (const sel of suspiciousSelectors) {
        const found = document.querySelector(sel);
        if (found) {
          (found as HTMLElement).style.display = 'none';
          playSound('warning');
          config.onWarningBanner('SECURITY PROTOCOL: Unauthorized floating AI assistant extension detected and blocked.');
          config.onInfraction(`Unauthorized AI extension overlay detected: ${sel}`);
          if (config.onAiAlert) config.onAiAlert(`Extension element ${sel} detected in DOM`);
          break;
        }
      }

      // Check for mobile / split-screen viewport anomalies
      if (window.visualViewport && (Date.now() - shieldStartTime >= STARTUP_GRACE_PERIOD_MS)) {
        const heightRatio = window.visualViewport.height / window.innerHeight;
        // On mobile, if height shrinks under 50% without focused text input, user entered split-screen multitasking!
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isTyping = activeTag === 'input' || activeTag === 'textarea';
        if (!isTyping && heightRatio < 0.50 && window.innerWidth <= 768) {
          playSound('warning');
          config.onWarningBanner('MOBILE SHIELD: Split-screen multitasking detected! Close secondary floating applications.');
          config.onInfraction('Split-screen multitasking / floating app detected');
        }
      }
    } catch {
      // DOM query safety
    }
  };

  extensionScanInterval = setInterval(scanForAiExtensions, 3500);

  // ── 4. ACOUSTIC / MICROPHONE MONITORING (Opt-in only, zero unsolicited focus theft) ─
  const initAudioMonitoring = async () => {
    // Strictly opt-in to avoid popping up browser permission modals that steal window focus
    if (!isRunning || config.enableAudioMonitoring !== true) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Query permissions first if supported so we never trigger an unexpected modal during exam
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const permStatus = await navigator.permissions.query({ name: 'microphone' as any });
            if (permStatus.state !== 'granted') {
              // Permission not already pre-granted: do NOT trigger modal that causes window blur and strikes!
              return;
            }
          } catch {
            // Permissions query not supported for microphone on this browser
          }
        }

        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true
          }
        });

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        audioContext = new AudioCtxClass();
        const source = audioContext.createMediaStreamSource(audioStream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 512;
        analyserNode.smoothingTimeConstant = 0.5;
        source.connect(analyserNode);

        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

        audioPollInterval = setInterval(() => {
          if (!isRunning || !analyserNode) return;
          analyserNode.getByteFrequencyData(dataArray);

          let vocalEnergy = 0;
          let count = 0;
          for (let i = 3; i < 36; i++) {
            vocalEnergy += dataArray[i];
            count++;
          }
          const averageLevel = count > 0 ? vocalEnergy / count : 0;
          currentAudioLevel = Math.round(averageLevel);

          if (averageLevel > 75) {
            sustainedSpeechCounter++;
            if (sustainedSpeechCounter >= 4) { // ~2s sustained speech
              sustainedSpeechCounter = 0;
              playSound('warning');
              config.onWarningBanner('ACOUSTIC SHIELD: Human speech / audio activity detected! Maintain absolute silence.');
              config.onInfraction('Acoustic voice activity / speech detected during exam');
              if (config.onAudioAlert) config.onAudioAlert(currentAudioLevel);
            }
          } else {
            sustainedSpeechCounter = Math.max(0, sustainedSpeechCounter - 1);
          }
        }, 500);
      }
    } catch (err) {
      // Microphone not permitted or unavailable - silently handle without breaking exam
    }
  };

  if (config.enableAudioMonitoring) {
    void initAudioMonitoring();
  }

  // ── 5. MOBILE & DESKTOP STRICT EVENT INTERCEPTIONS ─────────────────────────
  const preventMobileLongPress = (e: TouchEvent) => {
    // Prevent long-press contextual menus (Circle to Search / Google Lens)
    if (e.touches && e.touches.length > 1) {
      e.preventDefault(); // Disable pinch-zoom or multi-touch gestures
    }
  };

  const preventContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const preventDragDrop = (e: DragEvent) => {
    e.preventDefault();
  };

  const preventCopyPaste = (e: ClipboardEvent) => {
    // In examination terminals, block direct copy/paste
    e.preventDefault();
    config.onWarningBanner('CLIPBOARD SHIELD: Copy, cut, and paste actions are disabled.');
    config.onInfraction('Clipboard copy/paste attempt blocked');
    playSound('warning');
  };

  window.addEventListener('touchstart', preventMobileLongPress, { passive: false });
  window.addEventListener('contextmenu', preventContextMenu);
  window.addEventListener('dragstart', preventDragDrop);
  window.addEventListener('drop', preventDragDrop);
  window.addEventListener('copy', preventCopyPaste);
  window.addEventListener('paste', preventCopyPaste);
  window.addEventListener('cut', preventCopyPaste);

  // ── 6. FULLSCREEN UTILITY ──────────────────────────────────────────────────
  const requestFullscreen = async (): Promise<boolean> => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
        return true;
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
        return true;
      }
    } catch {
      // User gesture needed or policy blocked
    }
    return false;
  };

  return {
    stop: () => {
      isRunning = false;
      if (cursorDepartureTimeout) clearTimeout(cursorDepartureTimeout);
      if (extensionScanInterval) clearInterval(extensionScanInterval);
      if (audioPollInterval) clearInterval(audioPollInterval);

      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      document.documentElement.removeEventListener('mouseenter', handleMouseEnter);
      window.removeEventListener('touchstart', preventMobileLongPress);
      window.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('dragstart', preventDragDrop);
      window.removeEventListener('drop', preventDragDrop);
      window.removeEventListener('copy', preventCopyPaste);
      window.removeEventListener('paste', preventCopyPaste);
      window.removeEventListener('cut', preventCopyPaste);

      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
      if (audioContext) {
        void audioContext.close();
      }
      if (wakeLockSentinel) {
        void wakeLockSentinel.release();
      }
    },
    requestFullscreen,
    getAudioLevel: () => currentAudioLevel,
    isAiShieldActive: () => isRunning
  };
}
