import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock3, FileQuestion, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { SecureMCQExam } from './SecureMCQExam';
import { fetchExamsFromCloud } from '../services/supabaseService';
import { MCQExamConfig } from '../types/mcq';

function readTicket(): string {
  return (new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket') || '').trim();
}

function formatDate(value?: number): string {
  if (!value) return 'Schedule not specified';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export const MCQHub: React.FC = () => {
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(readTicket);
  const [exams, setExams] = useState<MCQExamConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedExam, setSelectedExam] = useState<MCQExamConfig | null>(null);
  const [ticketInput, setTicketInput] = useState('');

  const loadExams = useCallback(async (manual = false) => {
    setError('');
    manual ? setRefreshing(true) : setLoading(true);
    try {
      const rows = await fetchExamsFromCloud();
      if (rows === null) {
        setError('We could not load the exam catalogue from the examination server. Please retry or contact your invigilator.');
        setExams([]);
      } else {
        setExams(rows.filter((exam) => exam.status === 'PUBLISHED'));
      }
    } catch {
      setError('We could not load the exam catalogue from the examination server. Please retry or contact your invigilator.');
      setExams([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    try {
      const activeMode = localStorage.getItem('codedna_active_exam_mode');
      const rawProfile = localStorage.getItem('codedna_student_profile');
      let isCodingStudent = activeMode === 'CODING';
      if (rawProfile) {
        const profile = JSON.parse(rawProfile);
        if (profile.name && profile.rollNumber && profile.examMode === 'CODING') isCodingStudent = true;
      }
      if (isCodingStudent && !ticket) {
        navigate('/workspace', { replace: true });
        return;
      }
    } catch {}
    void loadExams();
  }, [loadExams, navigate, ticket]);

  useEffect(() => {
    const onHashChange = () => setTicket(readTicket());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const examState = useMemo(() => (exam: MCQExamConfig) => {
    const now = Date.now();
    if (exam.startTime && now < exam.startTime) return { label: 'Upcoming', detail: `Starts ${formatDate(exam.startTime)}`, available: false };
    if (exam.endTime && now >= exam.endTime) return { label: 'Closed', detail: `Ended ${formatDate(exam.endTime)}`, available: false };
    return { label: 'Available', detail: exam.endTime ? `Closes ${formatDate(exam.endTime)}` : 'Available now', available: true };
  }, []);

  // The secure attempt route is only entered with a bearer ticket in the URL fragment.
  // A catalogue selection never creates or guesses credentials.
  if (ticket) return <SecureMCQExam />;

  const beginWithTicket = () => {
    if (!selectedExam) return;
    const raw = ticketInput.trim();
    let token = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const parsed = new URL(raw);
        token = new URLSearchParams(parsed.hash.replace(/^#/, '')).get('ticket') || '';
      } else if (raw.includes('#')) {
        token = new URLSearchParams(raw.slice(raw.indexOf('#') + 1)).get('ticket') || '';
      } else if (raw.includes('ticket=')) {
        token = new URLSearchParams(raw.replace(/^.*?ticket=/, 'ticket=')).get('ticket') || '';
      }
    } catch {}
    token = token.trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setError('Enter the secure candidate link issued by your invigilator, or open that link directly.');
      return;
    }
    // The server validates that this ticket belongs to the selected exam. Keep it
    // in the fragment, never in a query string, and let SecureMCQExam validate it.
    window.location.hash = `ticket=${encodeURIComponent(token)}`;
  };

  return (
    <main style={page}>
      <div style={container}>
        <header style={hero}>
          <div style={heroIcon}><ShieldCheck size={25} /></div>
          <div style={{ flex: 1 }}>
            <p style={eyebrow}>AXENT · STUDENT EXAMINATION PORTAL</p>
            <h1 style={{ margin: '5px 0 8px', fontSize: 'clamp(26px, 4vw, 36px)', letterSpacing: '-.035em' }}>Your examinations</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Browse published MCQ exams, check their schedule, and open the exam assigned to you.</p>
          </div>
          <button type="button" onClick={() => void loadExams(true)} disabled={loading || refreshing} style={iconButton} aria-label="Refresh exams" title="Refresh exams">
            <RefreshCw size={17} className={refreshing ? 'spinner-icon' : ''} />
          </button>
        </header>

        {error && <div role="alert" style={errorBox}>{error}</div>}

        <section style={sectionHeader}>
          <div><h2 style={{ margin: 0, fontSize: 19 }}>Published exams</h2><p style={muted}>{loading ? 'Loading examination catalogue…' : `${exams.length} published ${exams.length === 1 ? 'exam' : 'exams'}`}</p></div>
          <span style={securePill}><LockKeyhole size={13} /> Secure access</span>
        </section>

        {loading ? (
          <div style={emptyState}><RefreshCw className="spinner-icon" size={24} /><p>Loading available examinations…</p></div>
        ) : exams.length === 0 ? (
          <div style={emptyState}><FileQuestion size={30} /><h3 style={{ margin: '8px 0 4px' }}>No published exams to show</h3><p style={muted}>When your institute publishes an MCQ examination, it will appear here.</p><button type="button" style={secondaryButton} onClick={() => void loadExams(true)} disabled={refreshing}>Try again</button></div>
        ) : (
          <div style={examGrid}>
            {exams.map((exam) => {
              const state = examState(exam);
              const chosen = selectedExam?.id === exam.id;
              return <article key={exam.id} style={{ ...examCard, ...(chosen ? selectedCard : {}) }}>
                <div style={cardTop}><span style={examIcon}><FileQuestion size={19} /></span><span style={state.available ? availablePill : unavailablePill}><span style={dot} />{state.label}</span></div>
                <h3 style={{ fontSize: 17, lineHeight: 1.4, margin: '16px 0 6px' }}>{exam.title}</h3>
                <p style={description}>{exam.description || exam.subject || 'MCQ examination'}</p>
                <div style={metaRow}><span><Clock3 size={14} />{exam.durationMinutes} min</span><span><CheckCircle2 size={14} />{exam.questionCount} questions</span></div>
                <div style={schedule}><CalendarClock size={14} /><span>{state.detail}</span></div>
                <button type="button" disabled={!state.available} onClick={() => { setSelectedExam(exam); setTicketInput(''); setError(''); }} style={state.available ? primaryButton : disabledButton}>{chosen ? 'Selected exam' : state.available ? 'Select exam' : state.label}</button>
              </article>;
            })}
          </div>
        )}

        {selectedExam && (
          <section style={accessPanel}>
            <div style={accessTitle}><div><p style={eyebrow}>NEXT STEP</p><h2 style={{ margin: '4px 0 6px', fontSize: 21 }}>{selectedExam.title}</h2><p style={muted}>Enter the secure candidate link or ticket issued for this exam.</p></div><span style={securePill}><LockKeyhole size={13} /> Ticket required</span></div>
            <label style={label} htmlFor="candidate-ticket">Secure candidate link or ticket</label>
            <input id="candidate-ticket" autoComplete="off" value={ticketInput} onChange={(event) => setTicketInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') beginWithTicket(); }} placeholder="Paste the link from your invigilator" style={input} />
            <div style={accessActions}><button type="button" style={primaryButton} onClick={beginWithTicket}>Continue to examination <span aria-hidden="true">→</span></button><button type="button" style={secondaryButton} onClick={() => { setSelectedExam(null); setTicketInput(''); setError(''); }}>Cancel</button></div>
            <p style={{ ...muted, marginBottom: 0 }}>Your ticket is verified by the examination server and must belong to the selected exam. If you do not have a ticket, ask your invigilator to issue or resend your secure exam link.</p>
          </section>
        )}
        <footer style={footer}><ShieldCheck size={15} /> Exam access is verified by Axent. Selecting an exam does not bypass candidate authorization.</footer>
      </div>
    </main>
  );
};

const page: React.CSSProperties = { minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 'clamp(20px, 4vw, 42px) 16px 48px' };
const container: React.CSSProperties = { maxWidth: 1120, margin: '0 auto' };
const hero: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 18, marginBottom: 34 };
const heroIcon: React.CSSProperties = { width: 54, height: 54, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 16, background: 'rgba(37,99,235,.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,.22)' };
const eyebrow: React.CSSProperties = { color: '#6484b4', fontSize: 11, letterSpacing: '.15em', fontWeight: 800, margin: 0 };
const muted: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55, marginTop: 6 };
const sectionHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' };
const securePill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 99, padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
const examGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 285px), 1fr))', gap: 16 };
const examCard: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, minWidth: 0, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 26px rgba(0,0,0,.035)' };
const selectedCard: React.CSSProperties = { borderColor: '#3b82f6', boxShadow: '0 0 0 1px rgba(59,130,246,.2)' };
const cardTop: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const examIcon: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--bg-main)', color: 'var(--text-secondary)' };
const availablePill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '6px 9px', fontSize: 11, color: '#15803d', background: 'rgba(34,197,94,.1)' };
const unavailablePill: React.CSSProperties = { ...availablePill, color: '#b45309', background: 'rgba(245,158,11,.1)' };
const dot: React.CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: 'currentColor' };
const description: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55, margin: '0 0 18px', minHeight: 40 };
const metaRow: React.CSSProperties = { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', marginTop: 'auto', paddingTop: 12 };
const schedule: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: 'var(--text-secondary)', margin: '13px 0 16px' };
const primaryButton: React.CSSProperties = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 8, background: '#2563eb', color: '#fff', border: 0, borderRadius: 10, padding: '11px 15px', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const disabledButton: React.CSSProperties = { ...primaryButton, background: 'var(--bg-main)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'not-allowed' };
const secondaryButton: React.CSSProperties = { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const iconButton: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 42, height: 42, flexShrink: 0, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 11, cursor: 'pointer' };
const emptyState: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 16, padding: '44px 20px', color: 'var(--text-secondary)' };
const errorBox: React.CSSProperties = { padding: 14, marginBottom: 18, border: '1px solid rgba(220,38,38,.25)', background: 'rgba(220,38,38,.07)', color: '#dc2626', borderRadius: 12, fontSize: 13, lineHeight: 1.5 };
const accessPanel: React.CSSProperties = { marginTop: 24, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(18px, 3vw, 26px)' };
const accessTitle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 };
const input: React.CSSProperties = { boxSizing: 'border-box', width: '100%', background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 13px', fontSize: 14, outlineOffset: 2 };
const accessActions: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12, marginTop: 30, textAlign: 'center' };
