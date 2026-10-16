import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SecureMCQExam } from './SecureMCQExam';

export const MCQHub: React.FC = () => {
  const [searchParams] = useSearchParams();
  const hashTicket = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket');
  const ticket = hashTicket || searchParams.get('ticket');

  if (ticket) return <SecureMCQExam />;

  return (
    <main style={{ minHeight: 'calc(100vh - 52px)', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <section style={{ maxWidth: 620, width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 18, padding: 28 }}>
        <p style={{ color: '#64748b', fontSize: 11, letterSpacing: '.14em', fontWeight: 800 }}>AXENT · SECURE EXAM ACCESS</p>
        <h1>Candidate ticket required</h1>
        <p style={{ lineHeight: 1.65 }}>MCQ examinations now require a unique candidate link issued by a trusted administrator. Manual identity forms and decoded Base64 tokens are not valid exam credentials.</p>
        <p style={{ color: '#64748b', fontSize: 13 }}>If you are a candidate, contact your invigilator and ask them to issue or resend your secure examination link.</p>
      </section>
    </main>
  );
};

export default MCQHub;
