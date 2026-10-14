import React from 'react';
import { CheckCircle2, RefreshCw, Send, Lock } from 'lucide-react';

interface SubmitActionButtonProps {
  onSubmit: () => void;
  isSubmitting?: boolean;
  isSubmitted?: boolean;
  disabled?: boolean;
  isLocked?: boolean;
}

export const SubmitActionButton: React.FC<SubmitActionButtonProps> = ({
  onSubmit,
  isSubmitting = false,
  isSubmitted = false,
  disabled = false,
  isLocked = false,
}) => {
  return (
    <button
      onClick={onSubmit}
      disabled={disabled || isSubmitting}
      title={
        isLocked
          ? 'Submissions locked by invigilator'
          : isSubmitted
          ? 'Exam already submitted and dossier generated'
          : 'Finalize exam and submit code for official practical marks'
      }
      style={{
        height: '32px',
        padding: '0 14px',
        borderRadius: '6px',
        border: isSubmitted
          ? '1px solid var(--success)'
          : isLocked
          ? '1px solid var(--border)'
          : '1px solid var(--border-strong)',
        background: isSubmitted
          ? 'var(--success-bg)'
          : 'var(--bg-surface)',
        color: isSubmitted
          ? 'var(--success)'
          : 'var(--text-primary)',
        fontSize: '12px',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-sm)',
        userSelect: 'none',
        transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {isSubmitting ? (
        <>
          <RefreshCw size={13} className="spinner-icon" color="var(--accent)" />
          <span>Submitting...</span>
        </>
      ) : isSubmitted ? (
        <>
          <CheckCircle2 size={13} color="var(--success)" />
          <span>Submitted & Done</span>
        </>
      ) : isLocked ? (
        <>
          <Lock size={13} color="var(--text-muted)" />
          <span>Submit Locked</span>
        </>
      ) : (
        <>
          <Send size={12} color="var(--accent)" />
          <span>Submit & Finish</span>
        </>
      )}
    </button>
  );
};
