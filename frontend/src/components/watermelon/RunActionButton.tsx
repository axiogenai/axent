import React, { useState, useEffect } from 'react';
import {
  Play,
  RefreshCw,
  Terminal,
  Server,
  ShieldCheck,
  AlertTriangle,
  Zap,
} from 'lucide-react';

const EXECUTION_STEPS = [
  { id: 1, label: 'Connecting Cloud Sandbox...', icon: Server },
  { id: 2, label: 'Compiling Source Code...', icon: Terminal },
  { id: 3, label: 'Executing Program & I/O...', icon: Zap },
  { id: 4, label: 'Analyzing Writing Forensics...', icon: ShieldCheck },
];

interface RunActionButtonProps {
  onRun: () => void;
  isExecuting: boolean;
  disabled?: boolean;
  isLocked?: boolean;
  isRegistered?: boolean;
  title?: string;
}

export const RunActionButton: React.FC<RunActionButtonProps> = ({
  onRun,
  isExecuting,
  disabled = false,
  isLocked = false,
  isRegistered = true,
  title,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isExecuting) {
      setStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStepIndex((prev) => (prev < EXECUTION_STEPS.length - 1 ? prev + 1 : prev));
    }, 1100);

    return () => clearInterval(interval);
  }, [isExecuting]);

  const currentStep = EXECUTION_STEPS[stepIndex];
  const StepIcon = currentStep?.icon || RefreshCw;

  if (isExecuting) {
    return (
      <div
        style={{
          height: '32px',
          padding: '0 12px',
          borderRadius: '6px',
          border: '1px solid var(--accent)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-sm)',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <RefreshCw size={13} color="var(--accent)" className="spinner-icon" />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          <StepIcon size={12} color="var(--accent)" />
          <span>{currentStep.label}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onRun}
      disabled={disabled}
      title={title}
      className={`btn ${isLocked ? 'btn-danger' : 'btn-primary'}`}
      style={{
        height: '32px',
        padding: '0 14px',
        borderRadius: '6px',
        border: isLocked ? '1px solid var(--danger)' : '1px solid var(--accent)',
        background: isLocked ? 'var(--danger-bg)' : 'var(--accent)',
        color: isLocked ? 'var(--danger)' : 'var(--accent-contrast)',
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
        transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
      }}
    >
      {isLocked ? (
        <AlertTriangle size={13} color="var(--danger)" />
      ) : (
        <Play size={13} fill="currentColor" />
      )}
      <span>{isLocked ? 'Locked by Invigilator' : 'Run Program'}</span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 600,
          opacity: 0.9,
          padding: '1px 5px',
          borderRadius: '3px',
          background: 'rgba(0, 0, 0, 0.14)',
          color: 'currentColor',
          fontFamily: 'var(--font-mono)',
          marginLeft: '2px',
        }}
      >
        Ctrl+↵
      </span>
    </button>
  );
};
