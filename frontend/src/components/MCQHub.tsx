import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SecureMCQExam } from './SecureMCQExam';
import { MCQExamSelector } from './MCQExamScreen';
import { ErrorBoundary } from './ErrorBoundary';

export const MCQHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ticketHash, setTicketHash] = useState(() =>
    new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket') || ''
  );

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

  // If secure ticket is present in fragment, render the secure authoritative exam runner
  if (ticketHash) {
    return <SecureMCQExam />;
  }

  return (
    <ErrorBoundary fallbackTitle="Examination Portal Error Caught">
      <MCQExamSelector />
    </ErrorBoundary>
  );
};

export default MCQHub;
