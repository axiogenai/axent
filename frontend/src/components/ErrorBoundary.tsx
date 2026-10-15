import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, LogOut, ShieldAlert, Terminal } from 'lucide-react';
import { exitExamFullscreen, triggerViewportReflow } from '../services/timeSyncService';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Axent ErrorBoundary] Uncaught runtime exception:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleLiberateAndReset = async () => {
    try {
      if (document.exitPointerLock) document.exitPointerLock();
    } catch {}
    await exitExamFullscreen();
    triggerViewportReflow();

    try {
      sessionStorage.removeItem('codedna_mcq_session_attempt');
      localStorage.removeItem('codedna_mcq_active_attempt_backup');
      localStorage.removeItem('codedna_mcq_active_attempt');
      localStorage.removeItem('codedna_active_exam_mode');
    } catch {}

    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/mcq';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'An unexpected rendering exception interrupted this screen.';

      return (
        <div
          style={{
            minHeight: '100vh',
            width: '100%',
            background: 'var(--bg-main, #09090b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            color: 'var(--text-primary, #f4f4f5)',
            fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              background: 'var(--bg-elevated, #121215)',
              border: '1px solid var(--border, #27272a)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '32px 28px',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'var(--warning-bg, rgba(252, 211, 77, 0.1))',
                border: '1px solid var(--warning-border, rgba(252, 211, 77, 0.3))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--warning, #fcd34d)',
              }}
            >
              <AlertTriangle size={26} />
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '9999px',
                background: 'var(--bg-surface, #18181b)',
                border: '1px solid var(--border, #27272a)',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted, #71717a)',
                marginBottom: '12px',
              }}
            >
              <ShieldAlert size={12} />
              <span>Session Recovery Guard</span>
            </div>

            <h2
              style={{
                fontSize: '19px',
                fontWeight: 800,
                color: 'var(--text-primary, #f4f4f5)',
                margin: '0 0 8px',
                letterSpacing: '-0.01em',
              }}
            >
              {this.props.fallbackTitle || 'Examination Interface Protected'}
            </h2>

            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary, #a1a1aa)',
                lineHeight: 1.55,
                margin: '0 0 18px',
              }}
            >
              A view rendering irregularity was caught. Your saved answers remain securely buffered in local storage. Use the recovery options below to restore your view.
            </p>

            <div
              style={{
                background: 'var(--bg-surface, #18181b)',
                border: '1px solid var(--border, #27272a)',
                borderRadius: 'var(--radius-sm, 6px)',
                padding: '10px 14px',
                textAlign: 'left',
                marginBottom: '22px',
                fontSize: '12px',
                fontFamily: "var(--font-mono, 'JetBrains Mono', Consolas, monospace)",
                color: 'var(--danger, #fca5a5)',
                maxHeight: '120px',
                overflowY: 'auto',
                wordBreak: 'break-word',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: 'var(--text-muted, #71717a)', fontSize: '10.5px' }}>
                <Terminal size={11} />
                <span>Diagnostics</span>
              </div>
              {errorMsg}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  height: '38px',
                  padding: '0 18px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'var(--accent, #f4f4f5)',
                  color: 'var(--accent-contrast, #09090b)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RotateCcw size={14} />
                <span>Reload Paper</span>
              </button>

              <button
                type="button"
                onClick={this.handleLiberateAndReset}
                style={{
                  height: '38px',
                  padding: '0 18px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'var(--bg-surface, #18181b)',
                  color: 'var(--text-secondary, #a1a1aa)',
                  border: '1px solid var(--border, #27272a)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <LogOut size={14} />
                <span>Return to Paper Catalog</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
