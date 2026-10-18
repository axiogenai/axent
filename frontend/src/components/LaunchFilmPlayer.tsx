import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, Minimize2,
  ChevronLeft, ChevronRight, Terminal, Shield, Check, Lock, Cpu, Globe, ArrowRight, Sparkles
} from 'lucide-react';

// ── COLOR CONSTANTS (Master Specification) ──────────────────────────────────
const C = {
  canvas: '#0A0A0C',
  surface: '#121316',
  surfaceElevated: '#17191E',
  border: '#23262D',
  borderStrong: '#323640',
  textPrimary: '#F5F6F8',
  textMuted: '#848A96',
  accent: '#0052FF',
  accentBright: '#1B68FF',
  accentSubtle: 'rgba(0, 82, 255, 0.15)',
};

// ── SHOT DEFINITIONS (25s Master: 600 frames @ 24fps) ─────────────────────────
interface ShotMeta {
  id: number;
  act: string;
  name: string;
  startFrame: number;
  endFrame: number;
}

const SHOTS_25S: ShotMeta[] = [
  { id: 1, act: 'ACT I: THE MANIFESTO', name: 'The Statement', startFrame: 0, endFrame: 72 },
  { id: 2, act: 'ACT I: THE MANIFESTO', name: 'Baseline Transition', startFrame: 72, endFrame: 120 },
  { id: 3, act: 'ACT II: THE PRODUCT REVEAL', name: 'Platform Hero Shot', startFrame: 120, endFrame: 186 },
  { id: 4, act: 'ACT II: THE PRODUCT REVEAL', name: 'Detail Pull & Readiness', startFrame: 186, endFrame: 240 },
  { id: 5, act: 'ACT III: PRECISION WORKFLOW', name: 'Assessment Selection', startFrame: 240, endFrame: 280 },
  { id: 6, act: 'ACT III: PRECISION WORKFLOW', name: 'The Assessment Canvas', startFrame: 280, endFrame: 320 },
  { id: 7, act: 'ACT III: PRECISION WORKFLOW', name: 'Navigation Matrix', startFrame: 320, endFrame: 360 },
  { id: 8, act: 'ACT IV: INTEGRITY DROP', name: 'Silence & Statement', startFrame: 360, endFrame: 420 },
  { id: 9, act: 'ACT IV: INTEGRITY DROP', name: 'Verification Telemetry', startFrame: 420, endFrame: 480 },
  { id: 10, act: 'ACT V: IDENTITY & RESOLVE', name: 'Identity & Call to Action', startFrame: 480, endFrame: 600 },
];

const SHOTS_15S: ShotMeta[] = [
  { id: 1, act: 'MANIFESTO', name: 'Exams Deserve Better', startFrame: 0, endFrame: 48 },
  { id: 2, act: 'PLATFORM HERO', name: 'Hero Isometric & Click', startFrame: 48, endFrame: 120 },
  { id: 3, act: 'INTERFACE MONTAGE', name: 'Canvas & Navigation', startFrame: 120, endFrame: 192 },
  { id: 4, act: 'THESIS DROP', name: 'Built for Exam Integrity', startFrame: 192, endFrame: 264 },
  { id: 5, act: 'RESOLVE', name: 'AXENT / axent.axiogen.in', startFrame: 264, endFrame: 360 },
];

// ── SYNTHESIZED SOUND ENGINE (Web Audio API) ───────────────────────────────────
class SoundDesignEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastTriggeredShot: number = -1;

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public triggerForShot(shotId: number, frameInShot: number) {
    if (this.isMuted || !this.ctx) return;
    if (frameInShot !== 0 && shotId === this.lastTriggeredShot) return;
    this.lastTriggeredShot = shotId;

    switch (shotId) {
      case 1:
        // C1 Analog Drone (32.7 Hz) + Sub-drop
        this.playSubDrop(60, 28, 2.5);
        this.playDrone(32.7, 3.0);
        break;
      case 2:
        // White noise riser + Mechanical Snap
        this.playRiser(1.8);
        setTimeout(() => this.playSnap(), 1700);
        break;
      case 3:
        // 120 BPM 16th rhythmic pulse
        this.playPulsePattern(2.8);
        this.playSineTone(880, 0.15, 0.08);
        break;
      case 4:
        // Kick transient + Tactile Tick
        this.playKick();
        this.playTick();
        break;
      case 5:
        // Mouse click actuation + Bassline drop
        this.playAcousticClick();
        this.playKick();
        break;
      case 6:
        // Synthesizer arpeggio + Keystrokes
        this.playArpeggio();
        this.playKeystrokes();
        break;
      case 7:
        // White noise whoosh + Index tick
        this.playWhoosh();
        this.playTick();
        break;
      case 8:
        // Silence + Monolithic Sub-Boom (28Hz)
        this.playSubDrop(55, 24, 3.2);
        break;
      case 9:
        // Digital ping + Warm subtle ambient pad
        this.playDigitalPing();
        this.playDrone(440, 2.5, 0.04);
        break;
      case 10:
        // C-Major 9th Resolve Chord + Final Tactile Lock
        this.playCMaj9Chord();
        this.playSnap();
        break;
    }
  }

  private playSubDrop(startFreq: number, endFreq: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(15, endFreq), now + duration);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playDrone(freq: number, duration: number, vol = 0.15) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const now = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, now);
    filter.frequency.linearRampToValueAtTime(320, now + duration);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playRiser(duration: number) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const now = this.ctx.currentTime;
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(7500, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + duration - 0.05);
    gain.gain.setValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  }

  private playSnap() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  private playKick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  private playTick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.015);
  }

  private playAcousticClick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.02);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  private playSineTone(freq: number, duration: number, vol = 0.15) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playPulsePattern(duration: number) {
    if (!this.ctx) return;
    const tempo = 120; // BPM
    const sixteenth = 60 / tempo / 4; // 0.125s
    const beats = Math.floor(duration / sixteenth);
    const now = this.ctx.currentTime;

    const baseFreqs = [220, 261.63, 329.63, 392]; // Am7 pattern
    for (let i = 0; i < beats; i++) {
      const time = now + i * sixteenth;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreqs[i % baseFreqs.length], time);
      gain.gain.setValueAtTime(0.07, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.08);
    }
  }

  private playArpeggio() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392, 493.88, 587.33]; // Cmaj9 arpeggio
    notes.forEach((f, idx) => {
      const time = now + idx * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, time);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.35);
    });
  }

  private playKeystrokes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const time = now + i * 0.14 + (Math.random() * 0.04);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400 + Math.random() * 200, time);
      gain.gain.setValueAtTime(0.05, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.025);
    }
  }

  private playWhoosh() {
    if (!this.ctx) return;
    const duration = 0.45;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const now = this.ctx.currentTime;
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  }

  private playDigitalPing() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now); // A6
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  private playCMaj9Chord() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    // Cmaj9: C3, E3, G3, B3, D4
    const freqs = [130.81, 164.81, 196.00, 246.94, 293.66];
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 3.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 3.5);
    });
  }
}

// ── FORMAT TIME HELPER ────────────────────────────────────────────────────────
function formatSMPTE(frame: number, fps = 24): string {
  const totalSeconds = Math.floor(frame / fps);
  const frames = frame % fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

// ── MASTER LAUNCH FILM COMPONENT ───────────────────────────────────────────────
export const LaunchFilmPlayer: React.FC = () => {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [mode, setMode] = useState<'25s' | '15s'>('25s');
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const soundEngineRef = useRef<SoundDesignEngine | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const totalFrames = mode === '25s' ? 600 : 360;
  const shots = mode === '25s' ? SHOTS_25S : SHOTS_15S;

  // Find active shot
  const currentShot = shots.find((s) => currentFrame >= s.startFrame && currentFrame < s.endFrame) || shots[shots.length - 1];
  const frameInShot = currentFrame - currentShot.startFrame;

  // Initialize Sound Engine
  useEffect(() => {
    soundEngineRef.current = new SoundDesignEngine();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    soundEngineRef.current?.setMuted(isMuted);
  }, [isMuted]);

  // Main 24fps Playback Loop
  const tick = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const delta = time - lastTimeRef.current;
    const frameDurationMs = 1000 / 24;

    if (delta >= frameDurationMs) {
      lastTimeRef.current = time - (delta % frameDurationMs);
      setCurrentFrame((prev) => {
        const next = prev + 1;
        if (next >= totalFrames) {
          setIsPlaying(false);
          return totalFrames;
        }
        return next;
      });
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [totalFrames]);

  useEffect(() => {
    if (isPlaying) {
      soundEngineRef.current?.init();
      lastTimeRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, tick]);

  // Trigger Audio Cues based on Shot Transitions
  useEffect(() => {
    if (isPlaying && soundEngineRef.current) {
      soundEngineRef.current.triggerForShot(currentShot.id, frameInShot);
    }
  }, [currentShot.id, frameInShot, isPlaying]);

  // Keyboard Navigation Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight' || e.code === 'Period') {
        setIsPlaying(false);
        setCurrentFrame((f) => Math.min(totalFrames, f + 1));
      } else if (e.code === 'ArrowLeft' || e.code === 'Comma') {
        setIsPlaying(false);
        setCurrentFrame((f) => Math.max(0, f - 1));
      } else if (e.code === 'KeyM') {
        setIsMuted((m) => !m);
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalFrames]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSeek = (frame: number) => {
    setCurrentFrame(Math.max(0, Math.min(totalFrames, frame)));
  };

  const handleRestart = () => {
    setCurrentFrame(0);
    setIsPlaying(true);
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: C.canvas,
        color: C.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'relative'
      }}
    >
      {/* ── TOP HUD HEADER ── */}
      <div
        style={{
          height: '46px',
          borderBottom: `1px solid ${C.border}`,
          background: 'rgba(10, 10, 12, 0.92)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 40
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: `1px solid ${C.border}`,
              color: C.textMuted,
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <ChevronLeft size={13} />
            <span>Back to Axent</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: C.textPrimary }}>
              AXENT // LAUNCH FILM
            </span>
            <span style={{ fontSize: '10px', color: C.accent, border: `1px solid ${C.accent}`, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>
              4K 24.00 FPS
            </span>
          </div>
        </div>

        {/* Current Shot & Timecode Readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', fontFamily: 'monospace', color: C.textMuted }}>
            <span>{currentShot.act}</span>
            <span style={{ color: C.border }}>//</span>
            <span style={{ color: C.textPrimary, fontWeight: 700 }}>SHOT {String(currentShot.id).padStart(2, '0')}: {currentShot.name.toUpperCase()}</span>
          </div>

          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '4px',
              padding: '3px 10px',
              fontFamily: 'monospace',
              fontSize: '12.5px',
              fontWeight: 800,
              color: C.accentBright,
              letterSpacing: '0.06em'
            }}
          >
            {formatSMPTE(currentFrame, 24)}
            <span style={{ color: C.textMuted, fontSize: '10px', marginLeft: '6px' }}>[F:{String(currentFrame).padStart(3, '0')}/{totalFrames}]</span>
          </div>
        </div>
      </div>

      {/* ── CINEMATIC 16:9 VIEWPORT ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: C.canvas,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: 'min(94vw, calc(82vh * (16 / 9)))',
            aspectRatio: '16 / 9',
            background: C.canvas,
            border: `1px solid ${C.border}`,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.85)'
          }}
        >
          {/* RENDER SHOT CONTENT BASED ON TIMECODE */}
          <FilmShotRenderer
            shotId={currentShot.id}
            frameInShot={frameInShot}
            totalShotFrames={currentShot.endFrame - currentShot.startFrame}
            mode={mode}
          />

          {/* Subdued Cinematic Framing Overlay / Safe Area Lines */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.25, fontSize: '9px', fontFamily: 'monospace' }}>
              <span>AXENT.PROD.2026 // REC.709</span>
              <span>SHUTTER 180° // 24 FPS</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.25, fontSize: '9px', fontFamily: 'monospace' }}>
              <span>TC {formatSMPTE(currentFrame, 24)}</span>
              <span>MASTER 4K UHD</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM TIMELINE & TRANSPORT CONTROLS ── */}
      <div
        style={{
          background: C.surface,
          borderTop: `1px solid ${C.border}`,
          padding: '10px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 40
        }}
      >
        {/* Scrubber Bar with Shot Markers */}
        <div style={{ position: 'relative', width: '100%', height: '14px', display: 'flex', alignItems: 'center' }}>
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              handleSeek(Math.floor(pct * totalFrames));
            }}
            style={{
              width: '100%',
              height: '6px',
              background: '#1a1c22',
              borderRadius: '3px',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            {/* Filled Progress */}
            <div
              style={{
                width: `${(currentFrame / totalFrames) * 100}%`,
                height: '100%',
                background: C.accent,
                borderRadius: '3px',
                transition: 'width 0.03s linear'
              }}
            />

            {/* Shot Markers */}
            {shots.map((s) => {
              const leftPct = (s.startFrame / totalFrames) * 100;
              return (
                <div
                  key={s.id}
                  title={`Shot ${s.id}: ${s.name}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: '-3px',
                    bottom: '-3px',
                    width: '1.5px',
                    background: currentFrame >= s.startFrame ? C.accentBright : C.border,
                    pointerEvents: 'none'
                  }}
                />
              );
            })}

            {/* Playhead Marker */}
            <div
              style={{
                position: 'absolute',
                left: `${(currentFrame / totalFrames) * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#fff',
                border: `2px solid ${C.accent}`,
                boxShadow: '0 0 6px rgba(0,0,0,0.6)',
                pointerEvents: 'none'
              }}
            />
          </div>
        </div>

        {/* Playback Controls & Settings */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              style={{
                background: isPlaying ? C.surfaceElevated : C.accent,
                color: isPlaying ? C.textPrimary : '#fff',
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: '1px' }} />}
            </button>

            <button
              onClick={handleRestart}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Restart from beginning"
            >
              <RotateCcw size={14} />
            </button>

            <button
              onClick={() => handleSeek(currentFrame - 1)}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: '4px',
                padding: '0 8px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              title="Previous Frame (,)"
            >
              <ChevronLeft size={12} />
              <span>-1f</span>
            </button>

            <button
              onClick={() => handleSeek(currentFrame + 1)}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: '4px',
                padding: '0 8px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              title="Next Frame (.)"
            >
              <span>+1f</span>
              <ChevronRight size={12} />
            </button>

            {/* Audio Toggle */}
            <button
              onClick={() => setIsMuted((m) => !m)}
              style={{
                background: isMuted ? 'rgba(239, 68, 68, 0.15)' : 'none',
                border: `1px solid ${isMuted ? 'rgba(239, 68, 68, 0.4)' : C.border}`,
                color: isMuted ? '#ef4444' : C.textMuted,
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                marginLeft: '6px'
              }}
              title={isMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>

          {/* Mode Selector (25s Master vs 15s Cutdown) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'inline-flex',
                background: C.canvas,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                padding: '2px'
              }}
            >
              <button
                onClick={() => {
                  setMode('25s');
                  setCurrentFrame(0);
                }}
                style={{
                  background: mode === '25s' ? C.surfaceElevated : 'transparent',
                  color: mode === '25s' ? C.textPrimary : C.textMuted,
                  border: 'none',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: mode === '25s' ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                25s Master Film
              </button>
              <button
                onClick={() => {
                  setMode('15s');
                  setCurrentFrame(0);
                }}
                style={{
                  background: mode === '15s' ? C.surfaceElevated : 'transparent',
                  color: mode === '15s' ? C.textPrimary : C.textMuted,
                  border: 'none',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: mode === '15s' ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                15s Social Teaser
              </button>
            </div>

            <button
              onClick={toggleFullscreen}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Toggle Fullscreen (F)"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── FILM SHOT RENDERER (Discipline, Quintic Curves & Accurate UI) ─────────────
interface FilmShotRendererProps {
  shotId: number;
  frameInShot: number;
  totalShotFrames: number;
  mode: '25s' | '15s';
}

const FilmShotRenderer: React.FC<FilmShotRendererProps> = ({
  shotId,
  frameInShot,
  totalShotFrames,
}) => {
  const p = Math.max(0, Math.min(1, frameInShot / Math.max(1, totalShotFrames)));

  switch (shotId) {
    // ── SHOT 01: THE STATEMENT (Frames 1-72) ──────────────────────────────────
    case 1: {
      const isRevealed = frameInShot >= 12;
      const wipeProgress = Math.max(0, Math.min(1, (frameInShot - 12) / 6));
      const scalePush = 1 + p * 0.012; // 100% to 101.2% micro push

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {isRevealed && (
            <div
              style={{
                transform: `scale(${scalePush})`,
                transition: 'transform 0.04s linear',
                textAlign: 'center',
                maxWidth: '75%'
              }}
            >
              <div
                style={{
                  overflow: 'hidden',
                  clipPath: `inset(0 0 ${(1 - wipeProgress) * 100}% 0)`
                }}
              >
                <h1
                  style={{
                    fontSize: 'clamp(28px, 5.5vw, 68px)',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    lineHeight: 1.05,
                    color: C.textPrimary,
                    margin: 0
                  }}
                >
                  EXAMS DESERVE BETTER.
                </h1>
              </div>

              {/* Sub-label resolving along baseline */}
              <div
                style={{
                  marginTop: '18px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  color: C.textMuted,
                  opacity: Math.max(0, Math.min(1, (frameInShot - 24) / 12))
                }}
              >
                AXENT // AUTONOMOUS ACADEMIC INTEGRITY ENGINE
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── SHOT 02: BASELINE TRANSITION (Frames 73-120) ──────────────────────────
    case 2: {
      const sweepProgress = Math.min(1, frameInShot / 14); // 12-14 frame sweep
      const expandProgress = Math.max(0, (frameInShot - 14) / (totalShotFrames - 14));

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {/* Blue Laser Rule Sweeping Outward */}
          <div
            style={{
              position: 'absolute',
              height: `${Math.max(1.5, expandProgress * 100)}%`,
              width: `${sweepProgress * 100}%`,
              background: expandProgress > 0 ? C.surface : C.accent,
              borderTop: expandProgress > 0 ? `1px solid ${C.accent}` : 'none',
              borderBottom: expandProgress > 0 ? `1px solid ${C.accent}` : 'none',
              transition: 'all 0.04s linear'
            }}
          />
        </div>
      );
    }

    // ── SHOT 03: PLATFORM HERO SHOT (Frames 121-186) ──────────────────────────
    case 3: {
      const dollyScale = 0.88 + p * (0.96 - 0.88);
      const sheenPos = (p * 150) - 25; // 0 to 125%

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            perspective: '1200px',
            position: 'relative'
          }}
        >
          {/* 3D Isometric Tilt Window with Real Axent Examination Enclave */}
          <div
            style={{
              width: '86%',
              height: '82%',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              transform: `scale(${dollyScale}) rotateX(4deg) rotateY(-2deg)`,
              boxShadow: '0 40px 90px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {/* Ambient Specular Sheen Pass */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: '60px',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                left: `${sheenPos}%`,
                pointerEvents: 'none',
                zIndex: 10
              }}
            />

            {/* Real Axent Topbar with Official Logo Asset */}
            <div
              style={{
                height: '42px',
                borderBottom: `1px solid ${C.border}`,
                background: 'rgba(10, 10, 12, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src="/axent-logo.png"
                  alt="Axent"
                  style={{ height: '18px', width: 'auto', display: 'block', objectFit: 'contain' }}
                />
                <span style={{ fontSize: '11px', color: C.textMuted, borderLeft: `1px solid ${C.border}`, paddingLeft: '10px' }}>
                  Institutional Examination Enclave · v2.4
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: C.accentBright, fontWeight: 700 }}>
                  <Shield size={12} />
                  <span>5 CAMPUS LABS ONLINE</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginLeft: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27272a' }} />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27272a' }} />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27272a' }} />
                </div>
              </div>
            </div>

            {/* Real Axent Dashboard Content (Real Labs + Real Exam) */}
            <div style={{ flex: 1, padding: '16px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', overflow: 'hidden' }}>
              {/* Left Column: Real Canonical College Labs */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: '6px', background: C.canvas, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                    ACTIVE LAB ENCLAVES
                  </span>
                  <span style={{ fontSize: '10px', color: C.accentBright, fontWeight: 700 }}>130 STATIONS</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { id: 'LAB-01', name: 'Turing Enclave', cap: '30/30 Online', active: true },
                    { id: 'LAB-02', name: 'von Neumann Hall', cap: '25/25 Online', active: false },
                    { id: 'LAB-03', name: 'Dijkstra Lab', cap: '20/20 Online', active: false },
                    { id: 'LAB-04', name: 'Lovelace Center', cap: '25/25 Online', active: false },
                    { id: 'LAB-05', name: 'Shannon Hall', cap: '30/30 Online', active: false },
                  ].map((lab) => (
                    <div
                      key={lab.id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '4px',
                        background: lab.active ? 'rgba(0, 82, 255, 0.12)' : C.surface,
                        border: `1px solid ${lab.active ? C.accent : C.border}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: lab.active ? C.textPrimary : '#a1a1aa' }}>
                          {lab.id}: {lab.name}
                        </div>
                        <div style={{ fontSize: '9.5px', color: C.textMuted }}>{lab.cap}</div>
                      </div>
                      {lab.active && <Check size={12} color={C.accentBright} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Real Live Published Exams from Supabase */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: '6px', background: C.canvas, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: C.accentBright, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        SUPABASE CLOUD SYNCED // ACTIVE SITTING
                      </span>
                      <h4 style={{ fontSize: '15px', fontWeight: 800, color: C.textPrimary, margin: '2px 0 0' }}>
                        General Aptitude & Reasoning Examination
                      </h4>
                    </div>
                    <span style={{ fontSize: '10.5px', background: 'rgba(0, 82, 255, 0.14)', color: C.accentBright, border: `1px solid ${C.accent}`, padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      LIVE EXAM
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '10px', borderRadius: '4px' }}>
                      <div style={{ fontSize: '10px', color: C.textMuted }}>QUESTION COUNT</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.textPrimary }}>25 Questions</div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '10px', borderRadius: '4px' }}>
                      <div style={{ fontSize: '10px', color: C.textMuted }}>EXAM DURATION</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.textPrimary }}>30 Minutes</div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '10px', borderRadius: '4px' }}>
                      <div style={{ fontSize: '10px', color: C.textMuted }}>MARKING SCHEME</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.textPrimary }}>+1.0 / -0.25</div>
                    </div>
                  </div>

                  {/* Secondary Practical Exam */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: C.textPrimary }}>CodeDNA Practical Programming Exam</div>
                      <div style={{ fontSize: '10.5px', color: C.textMuted }}>Judge0 CE Cloud Compiler · Python / C++ · Keystroke Forensics</div>
                    </div>
                    <span style={{ fontSize: '10px', color: C.textMuted, border: `1px solid ${C.border}`, padding: '2px 6px', borderRadius: '3px' }}>
                      READY
                    </span>
                  </div>
                </div>

                {/* Bottom Status Ribbon */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: C.textMuted, fontFamily: 'monospace' }}>
                  <span>AUDIT LEDGER: SHA-256 #8912 VERIFIED</span>
                  <span style={{ color: C.accentBright }}>REAL-TIME ENCLAVE ACTIVE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── SHOT 04: DETAIL PULL & READINESS (Frames 187-240) ─────────────────────
    case 4: {
      const isBlue = frameInShot >= 20;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {/* Pixel-Accurate Candidate Station Enclave from MCQExamScreen */}
          <div
            style={{
              width: '560px',
              background: C.canvas,
              border: `1.5px solid ${isBlue ? C.accent : C.border}`,
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 24px 70px rgba(0,0,0,0.7)',
              transition: 'border-color 0.12s ease'
            }}
          >
            {/* Header with Candidate Profile */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src="/axent-logo.png" alt="Axent" style={{ height: '14px', width: 'auto' }} />
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: C.textMuted, textTransform: 'uppercase' }}>
                  CANDIDATE STATION ENCLAVE
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: isBlue ? 'rgba(0, 82, 255, 0.12)' : 'rgba(132, 138, 150, 0.1)',
                  border: `1px solid ${isBlue ? C.accent : C.border}`,
                  transition: 'all 0.15s ease'
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isBlue ? C.accent : C.textMuted
                  }}
                />
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: isBlue ? C.accentBright : C.textMuted }}>
                  {isBlue ? 'READINESS VERIFIED' : 'CALIBRATING'}
                </span>
              </div>
            </div>

            {/* Real Candidate Credentials */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 2px', color: C.textPrimary }}>
                    Aditya S.
                  </h3>
                  <div style={{ fontSize: '11.5px', color: C.textMuted }}>
                    Roll No: <code style={{ color: C.textPrimary }}>CS2026-8841</code> · B.Tech CSE (Sem VI)
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: C.accentBright, border: `1px solid ${C.accent}`, padding: '2px 8px', borderRadius: '4px' }}>
                  LAB-01 · Station #01
                </span>
              </div>
            </div>

            {/* Real Dual-Stream Proctoring Telemetry Checks */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={14} color={isBlue ? C.accentBright : C.textMuted} />
                <span>Webcam Face Locked (99.4%)</span>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={14} color={isBlue ? C.accentBright : C.textMuted} />
                <span>Fullscreen Lockdown Enforced</span>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={14} color={isBlue ? C.accentBright : C.textMuted} />
                <span>Paste Buffer Sealed (0.0%)</span>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={14} color={isBlue ? C.accentBright : C.textMuted} />
                <span>Supabase Ledger Synced</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── SHOT 05: ASSESSMENT SELECTION (Frames 241-280) ────────────────────────
    case 5: {
      const isClicked = frameInShot >= 22;
      const isHovered = frameInShot >= 10;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {/* Real Live Exam Selection Card from Supabase */}
          <div
            style={{
              width: '600px',
              background: C.canvas,
              border: `1.5px solid ${isHovered ? C.accent : C.border}`,
              borderRadius: '8px',
              padding: '22px 26px',
              transform: isClicked ? 'scale(0.992) translateY(2px)' : 'scale(1)',
              transition: 'all 0.08s ease',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '10.5px', color: C.accentBright, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                EXAM ENCLAVE // LIVE CIE ASSESSMENT
              </div>
              <h4 style={{ fontSize: '17px', fontWeight: 800, color: C.textPrimary, margin: '0 0 4px' }}>
                General Aptitude & Reasoning Examination
              </h4>
              <p style={{ fontSize: '12px', color: C.textMuted, margin: 0 }}>
                25 Verified Questions · 30 Mins · Single Best Answer · Negative -0.25
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '10px', color: C.textMuted }}>
                <span style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '2px 6px', borderRadius: '3px' }}>Quantitative</span>
                <span style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '2px 6px', borderRadius: '3px' }}>Logical Reasoning</span>
                <span style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '2px 6px', borderRadius: '3px' }}>Verbal Ability</span>
              </div>
            </div>

            <button
              style={{
                background: isHovered ? C.accent : C.surfaceElevated,
                color: isHovered ? '#fff' : C.textPrimary,
                border: `1px solid ${isHovered ? C.accent : C.border}`,
                padding: '10px 20px',
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <span>Enter Exam</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Virtual System Cursor */}
          <div
            style={{
              position: 'absolute',
              top: '52%',
              left: `${Math.min(76, 28 + p * 48)}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              transition: 'left 0.04s ease'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={C.accentBright} stroke="#ffffff" strokeWidth="1.5">
              <polygon points="3 3, 3 20, 8 15, 14 21, 16 19, 10 13, 17 13" />
            </svg>
          </div>
        </div>
      );
    }

    // ── SHOT 06: THE ASSESSMENT CANVAS (Frames 281-320) ────────────────────────
    case 6: {
      const elapsedSec = Math.floor(frameInShot / 6);

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${C.border}`,
            position: 'relative'
          }}
        >
          {/* Real Axent Top Navigation Bar */}
          <div
            style={{
              height: '42px',
              borderBottom: `1px solid ${C.border}`,
              background: C.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/axent-logo.png" alt="Axent" style={{ height: '16px', width: 'auto' }} />
              <span style={{ fontSize: '11px', color: C.textPrimary, fontWeight: 700 }}>
                General Aptitude & Reasoning Examination
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11.5px', fontFamily: 'monospace' }}>
              <span style={{ color: C.textMuted }}>CANDIDATE: Aditya S. [CS2026-8841]</span>
              <span style={{ color: C.accentBright, fontWeight: 800 }}>
                TIME: 00:29:{String(Math.max(0, 48 - elapsedSec)).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Split Body: Real Question 02 from Supabase + Dual-Stream Proctor HUD */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 0.8fr' }}>
            {/* Left Column: Real Question 02 from Supabase */}
            <div style={{ padding: '24px', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ fontSize: '11px', color: C.accentBright, fontWeight: 800 }}>
                    QUESTION 02 OF 25 · LOGICAL REASONING
                  </span>
                  <span style={{ fontSize: '10.5px', color: C.textMuted, border: `1px solid ${C.border}`, padding: '1px 6px', borderRadius: '3px' }}>
                    +1.0 / -0.25 Marks
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.45, color: C.textPrimary, margin: '0 0 18px' }}>
                  In a certain code language, the word 'MANGO' is written as 'NBOHP'. How will the word 'APPLE' be coded?
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'A', text: 'BQQMF', isCorrectSelected: true },
                    { key: 'B', text: 'BQPMF', isCorrectSelected: false },
                    { key: 'C', text: 'BQQNG', isCorrectSelected: false },
                    { key: 'D', text: 'CQQMF', isCorrectSelected: false },
                  ].map((opt) => (
                    <div
                      key={opt.key}
                      style={{
                        padding: '10px 14px',
                        background: opt.isCorrectSelected ? 'rgba(0, 82, 255, 0.12)' : C.surface,
                        border: `1px solid ${opt.isCorrectSelected ? C.accent : C.border}`,
                        borderRadius: '4px',
                        fontSize: '12.5px',
                        color: opt.isCorrectSelected ? C.textPrimary : C.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 800, color: opt.isCorrectSelected ? C.accentBright : C.textMuted }}>
                          {opt.key}.
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{opt.text}</span>
                      </div>
                      {opt.isCorrectSelected && <Check size={14} color={C.accentBright} />}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: '10.5px', color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Fullscreen Locked · 0/3 Tab Switch Warnings</span>
                <span style={{ color: C.accentBright }}>Station #01 Enclave Verified</span>
              </div>
            </div>

            {/* Right Column: Real Dual-Stream Webcam HUD & CodeDNA Pattern Scratchpad */}
            <div style={{ background: '#08080a', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Webcam Invigilation Feed Viewfinder */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: '6px', background: C.surface, padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    DUAL-STREAM WEBCAM PROCTOR
                  </span>
                  <span style={{ fontSize: '10px', color: C.accentBright, fontWeight: 700 }}>
                    FACE LOCKED 99.4%
                  </span>
                </div>
                <div
                  style={{
                    height: '100px',
                    background: '#060608',
                    border: `1px dashed ${C.border}`,
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  <div style={{ border: `1.5px solid ${C.accent}`, width: '50px', height: '60px', borderRadius: '4px' }} />
                  <span style={{ fontSize: '9px', color: C.accentBright, marginTop: '4px', fontFamily: 'monospace' }}>
                    GAZE: CENTERED // AUDIO: CALM
                  </span>
                </div>
              </div>

              {/* CodeDNA Candidate Solver Scratchpad */}
              <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: '6px', background: C.surface, padding: '12px', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.5, color: '#d4d4d8' }}>
                <div style={{ color: C.textMuted, marginBottom: '6px' }}>// CodeDNA Pattern Verifier (Python 3.10)</div>
                <div style={{ color: '#848A96' }}># Caesar Shift Pattern: Shift +1</div>
                <div>MANGO -&gt; M(+1) A(+1) N(+1) G(+1) O(+1) = NBOHP</div>
                <div>APPLE -&gt; A(+1) P(+1) P(+1) L(+1) E(+1) = BQQMF</div>
                <div style={{ marginTop: '8px', color: C.accentBright }}>[Verified: Option A ('BQQMF')]</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── SHOT 07: QUESTION NAVIGATION MATRIX (Frames 321-360) ───────────────────
    case 7: {
      const isHover10 = frameInShot >= 20;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.surface,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div
            style={{
              width: '580px',
              background: C.canvas,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 24px 70px rgba(0,0,0,0.7)'
            }}
          >
            {/* Real Question Palette Header from MCQExamScreen */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 800, color: C.textPrimary }}>
                  QUESTION NAVIGATION MATRIX
                </span>
                <div style={{ fontSize: '10.5px', color: C.textMuted }}>
                  General Aptitude & Reasoning Examination · 25 Questions
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '10px' }}>
                <span style={{ color: C.textMuted }}>● Done: 8</span>
                <span style={{ color: C.accentBright, fontWeight: 700 }}>● Active: 1</span>
                <span style={{ color: C.textMuted }}>○ Left: 16</span>
              </div>
            </div>

            {/* Grid Nodes 01-25 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {Array.from({ length: 25 }, (_, i) => i + 1).map((num) => {
                const isCompleted = num <= 8;
                const isActive = num === 9;
                const isTargetHover = num === 10 && isHover10;

                return (
                  <div
                    key={num}
                    style={{
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '4px',
                      background: isActive ? C.accent : isTargetHover ? 'rgba(0, 82, 255, 0.25)' : isCompleted ? '#17191E' : 'transparent',
                      color: isActive ? '#fff' : isCompleted ? C.textMuted : C.textPrimary,
                      border: `1px solid ${isActive || isTargetHover ? C.accent : isCompleted ? '#272a32' : C.border}`,
                      transition: 'all 0.1s ease',
                      position: 'relative'
                    }}
                  >
                    {String(num).padStart(2, '0')}
                    {isCompleted && (
                      <span style={{ position: 'absolute', top: '3px', right: '4px', width: '4px', height: '4px', borderRadius: '50%', background: C.accentBright }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Telemetry Bottom Strip */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.textMuted, fontFamily: 'monospace' }}>
              <span>CANDIDATE: Aditya S. [Station #01]</span>
              <span style={{ color: C.accentBright }}>ENCLAVE HASH: 0x7F2A...9C1D</span>
            </div>
          </div>
        </div>
      );
    }

    // ── SHOT 08: THE SILENCE & STATEMENT (Frames 361-420) ──────────────────────
    case 8: {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div style={{ textAlign: 'left', maxWidth: '72%' }}>
            <h1
              style={{
                fontSize: 'clamp(32px, 6vw, 76px)',
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1.02,
                color: C.textPrimary,
                margin: 0
              }}
            >
              BUILT FOR
              <br />
              <span style={{ color: C.accentBright }}>EXAM INTEGRITY.</span>
            </h1>
          </div>
        </div>
      );
    }

    // ── SHOT 09: VERIFICATION TELEMETRY (Frames 421-480) ───────────────────────
    case 9: {
      const pipPulse = frameInShot >= 25 && frameInShot <= 35;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div style={{ textAlign: 'left', maxWidth: '72%', marginBottom: '28px' }}>
            <h1
              style={{
                fontSize: 'clamp(32px, 6vw, 76px)',
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1.02,
                color: C.textPrimary,
                margin: 0
              }}
            >
              BUILT FOR
              <br />
              <span style={{ color: C.accentBright }}>EXAM INTEGRITY.</span>
            </h1>
          </div>

          {/* Micro-telemetry HUD element with Real Cryptographic Hash */}
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                padding: '8px 18px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: C.textMuted,
                letterSpacing: '0.12em'
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: C.accentBright,
                  transform: pipPulse ? 'scale(1.8)' : 'scale(1)',
                  boxShadow: pipPulse ? '0 0 10px #0052FF' : 'none',
                  transition: 'transform 0.15s ease'
                }}
              />
              <span>[ REAL-TIME ENCLAVE VERIFIED // SECURE INSTANCE ]</span>
            </div>

            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#52525b', letterSpacing: '0.06em' }}>
              SHA-256: 7d9f2a08c1b3e8e20f12d4a5b6c7d8e9... // SUPABASE PGSQL COMMITTED
            </div>
          </div>
        </div>
      );
    }

    // ── SHOT 10: OFFICIAL IDENTITY & RESOLVE (Frames 481-600) ──────────────────
    case 10: {
      const showDomain = frameInShot >= 24;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: C.canvas,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {/* Real Official Axent Brand Logo Asset */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
            <img
              src="/axent-logo.png"
              alt="AXENT"
              style={{
                height: 'clamp(52px, 8vw, 84px)',
                width: 'auto',
                maxWidth: '380px',
                display: 'block',
                objectFit: 'contain'
              }}
            />
            <p
              style={{
                fontSize: '13px',
                letterSpacing: '0.12em',
                color: C.textMuted,
                textTransform: 'uppercase',
                margin: 0,
                fontWeight: 600
              }}
            >
              Autonomous Academic Examination & Proctoring Platform
            </p>
          </div>

          {/* Secondary Typography 48px Below */}
          {showDomain && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 'clamp(14px, 1.8vw, 18px)',
                  letterSpacing: '0.12em',
                  color: C.textPrimary,
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  padding: '8px 24px',
                  borderRadius: '4px'
                }}
              >
                axent.axiogen.in
              </div>
              <span style={{ fontSize: '11px', color: '#52525b', fontFamily: 'monospace' }}>
                Engineered by team.axiogen.in
              </span>
            </div>
          )}
        </div>
      );
    }

    default:
      return <div style={{ background: C.canvas, width: '100%', height: '100%' }} />;
  }
};

export default LaunchFilmPlayer;
