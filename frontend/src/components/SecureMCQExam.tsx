import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseService';
import { syncMcqLiveStation } from '../services/adminService';
import { MCQAttempt, MCQExamConfig } from '../types/mcq';
import { StudentInfo } from '../types/dna';

type Option = { id: string; text: string };
type AssignedQuestion = {
  questionId: string;
  order: number;
  snapshot: {
    questionId: string;
    text: string;
    options: Option[];
    marks: number;
    negativeMarks: number;
    subject?: string;
    topic?: string;
    difficulty?: string;
  };
  shuffledOptionIds?: string[];
};
type ActiveAttempt = {
  attemptId: string;
  examId: string;
  examTitle: string;
  instructions?: string;
  allowReview?: boolean;
  durationMinutes?: number;
  resultDeclarationMode?: 'IMMEDIATE' | 'WHATSAPP_GROUP';
  whatsappGroupName?: string;
  whatsappGroupLink?: string;
  showExplanationsAfterSubmit?: boolean;
  deadline: number;
  status: string;
  candidate?: { name: string; rollNumber: string; department?: string; semester?: string; division?: string };
  assignedQuestions: AssignedQuestion[];
  answers: Record<string, string>;
  tabSwitchCount?: number;
  unfocusedSeconds?: number;
  proctorLocked?: boolean;
};
type Result = {
  status: string;
  resultsReleased?: boolean;
  score?: number;
  maxScore?: number;
  correctCount?: number;
  wrongCount?: number;
  unansweredCount?: number;
  percentageScore?: number;
  explanations?: Array<{ questionId: string; correctOptionId?: string; selectedOptionId?: string; explanation?: string }>;
};

function getTicket(): string {
  const hash = window.location.hash.replace(/^#/, '');
  const fromHash = new URLSearchParams(hash).get('ticket');
  const fromQuery = new URLSearchParams(window.location.search).get('ticket');
  return (fromHash || fromQuery || '').trim();
}

export const SecureMCQExam: React.FC = () => {
  const [ticket] = useState(getTicket);
  const [attempt, setAttempt] = useState<ActiveAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [proctorLocked, setProctorLocked] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [unfocusedSeconds, setUnfocusedSeconds] = useState(0);
  const [screenSharing, setScreenSharing] = useState(false);
  const [checkingUnlock, setCheckingUnlock] = useState(false);
  const awayStartMs = useRef<number | null>(null);
  const answersRef = useRef(answers);
  const tabSwitchCountRef = useRef(tabSwitchCount);
  const unfocusedSecondsRef = useRef(unfocusedSeconds);
  const currentIndexRef = useRef(index);
  const telemetryAttemptRef = useRef<MCQAttempt | null>(null);
  const telemetryExamRef = useRef<MCQExamConfig | null>(null);
  const telemetryProfileRef = useRef<StudentInfo | null>(null);

  useEffect(() => {
    answersRef.current = answers;
    tabSwitchCountRef.current = tabSwitchCount;
    unfocusedSecondsRef.current = unfocusedSeconds;
    currentIndexRef.current = index;
  }, [answers, tabSwitchCount, unfocusedSeconds, index]);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<number | null>(null);
  const submitLock = useRef(false);
  const serverOffsetMs = useRef(0);
  const timeoutSubmitAttempted = useRef(false);

  useEffect(() => {
    let active = true;
    if (!ticket || !/^[a-f0-9]{64}$/i.test(ticket)) {
      setError('This secure exam link is invalid. Ask the invigilator to issue a new candidate link.');
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('start_mcq_attempt', { p_ticket_token: ticket });
        if (!active) return;
        if (rpcError || !data || typeof data !== 'object' || !(data as any).attemptId) {
          setError(rpcError?.message || 'Unable to start this examination. The ticket may be expired, revoked, or already used.');
          setLoading(false);
          return;
        }
        const next = data as unknown as ActiveAttempt;
        setAttempt(next);
        setAnswers(next.answers || {});
        setTabSwitchCount(Number(next.tabSwitchCount || 0));
        setUnfocusedSeconds(Number(next.unfocusedSeconds || 0));
        setProctorLocked(Boolean(next.proctorLocked));
        serverOffsetMs.current = Number((data as any).serverTime || Date.now()) - Date.now();
        setRemaining(Math.max(0, Number(next.deadline) - (Date.now() + serverOffsetMs.current)));
        setLoading(false);
        // Remove the bearer token from the visible URL after it has been read.
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        if (active) {
          setError('Could not contact the examination service. Check your connection and retry the secure link.');
          setLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [ticket]);

  const submit = useCallback(async () => {
    if (!attempt || submitLock.current || result) return;
    submitLock.current = true;
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('submit_mcq_attempt', {
      p_ticket_token: ticket,
      p_attempt_id: attempt.attemptId
    });
    if (rpcError || !data) {
      setError(rpcError?.message || 'Submission could not be confirmed. Keep this page open and retry.');
      setSubmitting(false);
      submitLock.current = false;
      return;
    }
    setResult(data as unknown as Result);
    setAttempt((previous) => previous ? { ...previous, status: String((data as unknown as Result).status || 'SUBMITTED') } : previous);
    setSubmitting(false);
  }, [attempt, result, ticket]);

  useEffect(() => {
    if (!attempt || result) return;
    const tick = () => {
      const value = Math.max(0, Number(attempt.deadline) - (Date.now() + serverOffsetMs.current));
      setRemaining(value);
      if (value <= 0 && !timeoutSubmitAttempted.current) {
        timeoutSubmitAttempted.current = true;
        void submit();
      }
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [attempt, result, submit]);

  const recordProctorEvent = useCallback(async (eventName: string, awaySeconds = 0, details = '') => {
    if (!attempt || result) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('record_mcq_proctor_event', {
        p_ticket_token: ticket,
        p_attempt_id: attempt.attemptId,
        p_event: eventName,
        p_away_seconds: Math.max(0, Math.min(3600, Math.floor(awaySeconds))),
        p_details: details.slice(0, 300)
      });
      if (rpcError || !data) {
        setError(rpcError?.message || 'Proctoring event could not be synchronized.');
        return;
      }
      const event = data as { tabSwitchCount?: number; unfocusedSeconds?: number; locked?: boolean };
      setTabSwitchCount(Number(event.tabSwitchCount || 0));
      setUnfocusedSeconds(Number(event.unfocusedSeconds || 0));
      setProctorLocked(Boolean(event.locked));
    } catch {
      setError('Proctoring connection interrupted. Keep the examination open and contact the invigilator.');
    }
  }, [attempt, result, ticket]);

  useEffect(() => {
    if (!attempt || result) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (awayStartMs.current === null) awayStartMs.current = Date.now();
        return;
      }
      if (awayStartMs.current !== null) {
        const awaySeconds = Math.round((Date.now() - awayStartMs.current) / 1000);
        awayStartMs.current = null;
        void recordProctorEvent('TAB_SWITCH', awaySeconds, 'Examination tab or window lost focus');
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      void recordProctorEvent('RIGHT_CLICK', 0, 'Context menu attempt blocked');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const restricted = event.key === 'F12' ||
        ((event.ctrlKey || event.metaKey) && ['c','v','x','u','s','p'].includes(key)) ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i','j','c'].includes(key));
      if (!restricted) return;
      event.preventDefault();
      event.stopPropagation();
      void recordProctorEvent('RESTRICTED_SHORTCUT', 0, 'Restricted keyboard shortcut blocked');
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) void recordProctorEvent('FULLSCREEN_EXIT', 0, 'Exam left full-screen mode');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [attempt, result, recordProctorEvent]);

  const requestFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      setError('Full-screen permission was not granted. Use the full-screen control or contact the invigilator.');
    }
  };

  const startScreenShare = async () => {
    if (!attempt || result || screenSharing) return;
    const profile = (() => {
      try {
        const raw = localStorage.getItem('codedna_student_profile');
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<StudentInfo>;
        if ((parsed.rollNumber || '').trim().toLowerCase() !== (attempt.candidate?.rollNumber || '').trim().toLowerCase()) return null;
        if (!parsed.labId || !parsed.stationNumber) return null;
        return parsed as StudentInfo;
      } catch { return null; }
    })();
    if (!profile) {
      setError('This candidate session is not linked to a registered lab workstation. Contact the invigilator before starting screen proctoring.');
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setError('This browser does not support screen sharing. Contact the invigilator.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } as MediaTrackConstraints, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No screen-sharing track was provided.');
      screenTrackRef.current = track;
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      screenVideoRef.current = video;
      await video.play();
      setScreenSharing(true);
      void recordProctorEvent('SCREEN_SHARE_STARTED', 0, 'Candidate started screen sharing');



      if (profile) {
        const telemetryAttempt = {
          id: attempt.attemptId, examId: attempt.examId, examTitle: attempt.examTitle,
          studentName: attempt.candidate?.name || '', studentRoll: attempt.candidate?.rollNumber || '',
          studentDept: attempt.candidate?.department || '', studentSem: attempt.candidate?.semester || '',
          studentDiv: attempt.candidate?.division || '', startTime: Number(attempt.deadline) - Number(attempt.durationMinutes || 0) * 60000,
          deadline: Number(attempt.deadline), status: attempt.status, assignedQuestions: attempt.assignedQuestions,
          answers, maxScore: 0, tabSwitchCount, unfocusedSeconds, infractionLog: []
        } as unknown as MCQAttempt;
        const telemetryExam = {
          id: attempt.examId, title: attempt.examTitle, questionCount: attempt.assignedQuestions.length,
          durationMinutes: attempt.durationMinutes || 0, totalMarks: 0, questionIds: attempt.assignedQuestions.map(q => q.questionId),
          status: 'PUBLISHED'
        } as unknown as MCQExamConfig;
        telemetryAttemptRef.current = telemetryAttempt;
        telemetryExamRef.current = telemetryExam;
        telemetryProfileRef.current = profile;
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270;
        screenCanvasRef.current = canvas;
        screenIntervalRef.current = window.setInterval(() => {
          if (!screenVideoRef.current || !screenTrackRef.current || screenTrackRef.current.readyState !== 'live') return;
          const ctx = canvas.getContext('2d');
          if (!ctx || screenVideoRef.current.videoWidth <= 0) return;
          ctx.drawImage(screenVideoRef.current, 0, 0, 480, 270);
          telemetryAttempt.answers = answersRef.current;
          telemetryAttempt.tabSwitchCount = tabSwitchCountRef.current;
          telemetryAttempt.unfocusedSeconds = unfocusedSecondsRef.current;
          syncMcqLiveStation(telemetryAttempt, telemetryExam, profile, currentIndexRef.current, false, {
            screenImageData: canvas.toDataURL('image/jpeg', 0.55),
            hasLiveScreenStream: true
          });
        }, 1800);
      }
      track.onended = () => stopScreenShare();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screen sharing was canceled or could not start.');
      setScreenSharing(false);
    }
  };

  const stopScreenShare = () => {
    if (screenIntervalRef.current !== null) {
      window.clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    setScreenSharing(false);
    if (telemetryAttemptRef.current && telemetryExamRef.current && telemetryProfileRef.current) {
      telemetryAttemptRef.current.answers = answersRef.current;
      telemetryAttemptRef.current.tabSwitchCount = tabSwitchCountRef.current;
      telemetryAttemptRef.current.unfocusedSeconds = unfocusedSecondsRef.current;
      syncMcqLiveStation(telemetryAttemptRef.current, telemetryExamRef.current, telemetryProfileRef.current, currentIndexRef.current, false, {
        screenImageData: '',
        hasLiveScreenStream: false
      });
    }
    void recordProctorEvent('SCREEN_SHARE_STOPPED', 0, 'Candidate screen sharing stopped');
  };

  useEffect(() => () => {
    if (screenIntervalRef.current !== null) window.clearInterval(screenIntervalRef.current);
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
    }
    if (telemetryAttemptRef.current && telemetryExamRef.current && telemetryProfileRef.current) {
      syncMcqLiveStation(telemetryAttemptRef.current, telemetryExamRef.current, telemetryProfileRef.current, currentIndexRef.current, false, {
        screenImageData: '',
        hasLiveScreenStream: false
      });
    }
  }, []);

  const checkProctorUnlock = async () => {
    if (!attempt || checkingUnlock) return;
    setCheckingUnlock(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('start_mcq_attempt', { p_ticket_token: ticket });
      if (rpcError || !data) throw new Error(rpcError?.message || 'Could not refresh the attempt state.');
      const latest = data as unknown as ActiveAttempt;
      setAttempt(latest);
      setAnswers(latest.answers || {});
      setTabSwitchCount(Number(latest.tabSwitchCount || 0));
      setUnfocusedSeconds(Number(latest.unfocusedSeconds || 0));
      setProctorLocked(Boolean(latest.proctorLocked));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check unlock status.');
    } finally {
      setCheckingUnlock(false);
    }
  };

  const selectAnswer = async (question: AssignedQuestion, optionId: string) => {
    if (!attempt || result || saving || submitting) return;
    setSaving(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('save_mcq_answer', {
      p_ticket_token: ticket,
      p_attempt_id: attempt.attemptId,
      p_question_id: question.questionId,
      p_option_id: optionId
    });
    if (rpcError) {
      setError(rpcError.message || 'Your answer was not saved. Please select again.');
    } else if ((data as any)?.saved === false && (data as any)?.status === 'TIMED_OUT') {
      setError('The server deadline has passed. Submitting your saved answers…');
      setSaving(false);
      void submit();
      return;
    } else {
      setAnswers((previous) => ({ ...previous, [question.questionId]: optionId }));
    }
    setSaving(false);
  };

  if (loading) return <main style={page}><section style={panel}><p>Verifying secure exam ticket…</p></section></main>;
  if (error && !attempt) return <main style={page}><section style={panel}><h1>Secure examination</h1><p role="alert" style={{ color: '#dc2626' }}>{error}</p><p>Do not use a manually generated or decoded token as an exam credential.</p></section></main>;
  if (!attempt) return null;

  if (result) return (
    <main style={page}><section style={panel}>
      <h1>Submission confirmed</h1>
      <p>{attempt.examTitle}</p>
      <p>Candidate: {attempt.candidate?.name || 'Candidate'} · {attempt.candidate?.rollNumber || ''}</p>
      {result.resultsReleased !== false ? <>
        <div style={scoreGrid}>
          <div><strong>{result.score ?? 0} / {result.maxScore ?? 0}</strong><span>Score</span></div>
          <div><strong>{result.percentageScore ?? 0}%</strong><span>Percentage</span></div>
          <div><strong>{result.correctCount ?? 0}</strong><span>Correct</span></div>
          <div><strong>{result.wrongCount ?? 0}</strong><span>Wrong</span></div>
        </div>
        <p>Your result was calculated by the examination server.</p>
        {attempt.showExplanationsAfterSubmit && result.explanations?.length ? <section style={{ marginTop: 24 }}>
          <h2>Answer review</h2>
          {result.explanations.map((item) => {
            const reviewedQuestion = attempt.assignedQuestions.find((q) => q.questionId === item.questionId);
            return <article key={item.questionId} style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
              <strong>{reviewedQuestion?.snapshot.text || 'Question'}</strong>
              <p>Correct option: {reviewedQuestion?.snapshot.options.find((o) => o.id === item.correctOptionId)?.text || '—'}</p>
              {item.explanation && <p>{item.explanation}</p>}
            </article>;
          })}
        </section> : null}
      </> : <>
        <p>Your submission has been recorded. The result is not released immediately for this examination.</p>
        {attempt.whatsappGroupName && <p>Result announcements: <strong>{attempt.whatsappGroupName}</strong></p>}
        {attempt.whatsappGroupLink && <p><a href={attempt.whatsappGroupLink} target="_blank" rel="noopener noreferrer">Open result announcement group</a></p>}
      </>}
    </section></main>
  );

  const question = attempt.assignedQuestions[index];
  const orderedOptions = question
    ? (question.shuffledOptionIds || question.snapshot.options.map((option) => option.id))
        .map((id) => question.snapshot.options.find((option) => option.id === id))
        .filter((option): option is Option => Boolean(option))
    : [];
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return <main style={page}>
    <section style={panel}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div><p style={eyebrow}>SECURE MCQ EXAMINATION</p><h1>{attempt.examTitle}</h1>
          <p style={{ color: '#64748b', margin: '6px 0' }}>{attempt.candidate?.name} · {attempt.candidate?.rollNumber}</p>
        </div>
        <div style={timerStyle} aria-live="polite"><span>Time remaining</span><strong>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</strong></div>
      </header>
      {attempt.instructions && <p style={{ background: '#f1f5f9', borderRadius: 10, padding: 12 }}>{attempt.instructions}</p>}
      {error && <p role="alert" style={{ color: '#dc2626' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        <span style={{ fontSize: 12, color: proctorLocked ? '#b45309' : '#64748b' }}>Proctoring: {tabSwitchCount} tab switches · {unfocusedSeconds}s away · {screenSharing ? 'screen shared' : 'screen not shared'}</span>
        <button type="button" style={secondaryButton} onClick={() => void requestFullscreen()}>Enter full screen</button>
        <button type="button" style={secondaryButton} onClick={() => void (screenSharing ? stopScreenShare() : startScreenShare())}>{screenSharing ? 'Stop screen share' : 'Share screen with invigilator'}</button>
      </div>
      {proctorLocked && <div role="alert" style={{ border: '1px solid #f59e0b', background: 'rgba(245,158,11,.10)', padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <strong>Examination locked after three focus violations.</strong>
        <p>Answers are blocked by the server until an administrator unlocks this attempt. Contact the invigilator, then check again.</p>
        <button type="button" style={secondaryButton} disabled={checkingUnlock} onClick={() => void checkProctorUnlock()}>{checkingUnlock ? 'Checking…' : 'Check invigilator unlock'}</button>
      </div>}
      <div style={progressRow}><span>Question {index + 1} of {attempt.assignedQuestions.length}</span><span>{Object.keys(answers).filter((key) => Boolean(answers[key])).length} answered</span></div>
      <div style={progressTrack}><div style={{ ...progressFill, width: `${((index + 1) / Math.max(1, attempt.assignedQuestions.length)) * 100}%` }} /></div>
      {question && <article>
        <h2 style={{ fontSize: 21, lineHeight: 1.5, marginTop: 26 }}>{question.snapshot.text}</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>Marks: {question.snapshot.marks}</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
          {orderedOptions.map((option, optionIndex) => {
            const selected = answers[question.questionId] === option.id;
            return <button key={option.id} type="button" disabled={saving || submitting || proctorLocked} onClick={() => void selectAnswer(question, option.id)}
              style={{ ...optionStyle, ...(selected ? selectedOptionStyle : {}) }}>
              <span style={optionLetter}>{String.fromCharCode(65 + optionIndex)}</span><span style={{ textAlign: 'left', flex: 1 }}>{option.text}</span>
              {selected && <span aria-label="Selected">✓</span>}
            </button>;
          })}
        </div>
      </article>}
      <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
        <button style={secondaryButton} disabled={index === 0 || saving || proctorLocked || attempt.allowReview === false} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Previous</button>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {index < attempt.assignedQuestions.length - 1 &&
            <button style={secondaryButton} disabled={saving || proctorLocked} onClick={() => setIndex((i) => Math.min(attempt.assignedQuestions.length - 1, i + 1))}>Next question →</button>}
          <button style={primaryButton} disabled={saving || submitting || proctorLocked} onClick={() => void submit()}>{submitting ? 'Submitting…' : 'Submit examination'}</button>
        </div>
      </footer>
      {saving && <p role="status" style={{ color: '#64748b' }}>Saving answer securely…</p>}
    </section>
  </main>;
};

const page: React.CSSProperties = { minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', padding: '32px 16px', color: 'var(--text-primary)' };
const panel: React.CSSProperties = { maxWidth: 900, margin: '0 auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, boxShadow: '0 12px 40px rgba(15,23,42,.08)' };
const eyebrow: React.CSSProperties = { color: '#64748b', letterSpacing: '.14em', fontSize: 11, fontWeight: 800 };
const timerStyle: React.CSSProperties = { display: 'grid', gap: 4, textAlign: 'right', background: '#0f172a', color: '#fff', padding: '12px 16px', borderRadius: 12 };
const scoreGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, margin: '24px 0' };
const progressRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginTop: 24, color: '#64748b', fontSize: 13 };
const progressTrack: React.CSSProperties = { height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginTop: 8 };
const progressFill: React.CSSProperties = { height: '100%', background: '#2563eb', borderRadius: 99 };
const optionStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-main)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 15, textAlign: 'left' };
const selectedOptionStyle: React.CSSProperties = { borderColor: '#2563eb', background: 'rgba(37,99,235,.08)' };
const optionLetter: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--bg-elevated)', fontWeight: 800, flexShrink: 0 };
const primaryButton: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', fontWeight: 600, cursor: 'pointer' };
