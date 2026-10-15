import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MCQExamSelector } from './MCQExamScreen';
import { ErrorBoundary } from './ErrorBoundary';

export const MCQHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Strict Exam-Lock Guard:
  // If a student is accessing a specific MCQ exam (?examId=...), allow it unconditionally.
  // Only redirect if genuinely registered for an active CODING practical session.
  useEffect(() => {
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
        const p = JSON.parse(rawProfile);
        if (p.name && p.rollNumber && p.examMode === 'CODING') {
          isCodingStudent = true;
        }
      }

      if (isCodingStudent) {
        console.warn('[Exam Guard] Student registered for Coding Practical attempted to access /mcq. Redirecting to /workspace.');
        navigate('/workspace', { replace: true });
      }
    } catch {
      // Ignore
    }
  }, [navigate, searchParams]);

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
      <ErrorBoundary fallbackTitle="Examination Portal Error Caught">
        <MCQExamSelector />
      </ErrorBoundary>
    </div>
  );
};

export default MCQHub;

