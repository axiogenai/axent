import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseService';

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
      <div style={progressRow}><span>Question {index + 1} of {attempt.assignedQuestions.length}</span><span>{Object.keys(answers).filter((key) => Boolean(answers[key])).length} answered</span></div>
      <div style={progressTrack}><div style={{ ...progressFill, width: `${((index + 1) / Math.max(1, attempt.assignedQuestions.length)) * 100}%` }} /></div>
      {question && <article>
        <h2 style={{ fontSize: 21, lineHeight: 1.5, marginTop: 26 }}>{question.snapshot.text}</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>Marks: {question.snapshot.marks}</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
          {orderedOptions.map((option, optionIndex) => {
            const selected = answers[question.questionId] === option.id;
            return <button key={option.id} type="button" disabled={saving || submitting} onClick={() => void selectAnswer(question, option.id)}
              style={{ ...optionStyle, ...(selected ? selectedOptionStyle : {}) }}>
              <span style={optionLetter}>{String.fromCharCode(65 + optionIndex)}</span><span style={{ textAlign: 'left', flex: 1 }}>{option.text}</span>
              {selected && <span aria-label="Selected">✓</span>}
            </button>;
          })}
        </div>
      </article>}
      <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
        <button style={secondaryButton} disabled={index === 0 || saving || attempt.allowReview === false} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Previous</button>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {index < attempt.assignedQuestions.length - 1 &&
            <button style={secondaryButton} disabled={saving} onClick={() => setIndex((i) => Math.min(attempt.assignedQuestions.length - 1, i + 1))}>Next question →</button>}
          <button style={primaryButton} disabled={saving || submitting} onClick={() => void submit()}>{submitting ? 'Submitting…' : 'Submit examination'}</button>
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
