import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MCQExamSelector } from './MCQExamScreen';

export const MCQHub: React.FC = () => {
  const navigate = useNavigate();

  // Strict Exam-Lock Guard:
  // If a student registered for a CODING practical tries to manually visit /mcq,
  // redirect them immediately to /workspace to prevent cheating/bypassing!
  useEffect(() => {
    try {
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
  }, [navigate]);

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
      <MCQExamSelector />
    </div>
  );
};

export default MCQHub;
