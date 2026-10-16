import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SecureMCQExam } from './SecureMCQExam';
import { MCQExamSelector } from './MCQExamScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { KeyRound, ArrowRight, ShieldCheck, X } from 'lucide-react';

export const MCQHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ticketHash, setTicketHash] = useState(() =>
    new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket') || ''
  );
  const [manualTicket, setManualTicket] = useState('');
  const [showTicketInput, setShowTicketInput] = useState(false);
  const [ticketError, setTicketError] = useState('');

  // Listen to hash changes (e.g. when ticket URL is clicked or updated)
  useEffect(() => {
    const handleHashChange = () => {
      const nextTicket = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket') || '';
      setTicketHash(nextTicket);
      if (nextTicket) {
        try {
          localStorage.setItem('codedna_active_exam_mode', 'MCQ');
        } catch {}
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Strict Exam-Lock Guard:
  // If a student is registered for an active CODING practical session, redirect to /workspace.
  useEffect(() => {
    if (ticketHash) {
      try {
        localStorage.setItem('codedna_active_exam_mode', 'MCQ');
      } catch {}
      return;
    }

    try {
      const examId = searchParams.get('examId');
      if (examId) {
        localStorage.setItem('codedna_active_exam_mode', 'MCQ');
        return;
      }

      const activeMode = localStorage.getItem('codedna_active_exam_mode');
      const rawProfile = localStorage.getItem('codedna_student_profile');
      let isCodingStudent = activeMode === 'CODING';
      if (rawProfile) {
        const profile = JSON.parse(rawProfile);
        if (profile.name && profile.rollNumber && profile.examMode === 'CODING') {
          isCodingStudent = true;
        }
      }
      if (isCodingStudent) {
        navigate('/workspace', { replace: true });
      }
    } catch {}
  }, [navigate, ticketHash, searchParams]);

  const handleLaunchTicket = (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError('');
    const cleanToken = manualTicket.trim();
    if (!cleanToken) {
      setTicketError('Please enter your 64-character invigilator ticket token.');
      return;
    }
    // If user pasted a full URL, extract the token from fragment or query
    let token = cleanToken;
    if (cleanToken.includes('#ticket=')) {
      token = cleanToken.split('#ticket=')[1].split('&')[0];
    } else if (cleanToken.includes('ticket=')) {
      token = cleanToken.split('ticket=')[1].split('&')[0];
    }

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setTicketError('Invalid ticket token format. Please check the token provided by your invigilator.');
      return;
    }

    window.location.hash = `ticket=${encodeURIComponent(token)}`;
    setTicketHash(token);
  };

  // If secure ticket is present in fragment, render the secure authoritative exam runner
  if (ticketHash) {
    return <SecureMCQExam />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
      {/* Optional Top Bar for Invigilator Ticket Entry */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <ShieldCheck size={14} color="var(--accent)" />
          <span>AXENT Examination Hall</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!showTicketInput ? (
            <button
              type="button"
              onClick={() => setShowTicketInput(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent)',
                cursor: 'pointer'
              }}
            >
              <KeyRound size={12} />
              <span>Have an Invigilator Ticket?</span>
            </button>
          ) : (
            <form onSubmit={handleLaunchTicket} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="text"
                placeholder="Paste ticket token..."
                value={manualTicket}
                onChange={(e) => setManualTicket(e.target.value)}
                style={{
                  width: '220px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <span>Launch</span>
                <ArrowRight size={11} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTicketInput(false);
                  setTicketError('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px'
                }}
              >
                <X size={14} />
              </button>
            </form>
          )}
        </div>
      </div>

      {ticketError && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '6px 16px', fontSize: '11.5px', borderBottom: '1px solid var(--danger-border)' }}>
          {ticketError}
        </div>
      )}

      {/* Main Examination Selector & Runner */}
      <ErrorBoundary fallbackTitle="Examination Portal Error Caught">
        <MCQExamSelector />
      </ErrorBoundary>
    </div>
  );
};

export default MCQHub;
