import React, { useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Info, 
  X, 
  Loader2 
} from 'lucide-react';
import { playSound } from '../utils/sounds';

export type ModalVariant = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

export interface ModalDetailItem {
  label: string;
  value: React.ReactNode;
  color?: string;
}

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  title: string;
  subtitle?: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  tone?: 'danger' | 'warning' | 'info' | 'success' | 'neutral' | string;
  icon?: React.ReactNode | 'danger' | 'warning' | 'info' | 'success' | string;
  details?: ModalDetailItem[];
  badgeText?: string;
  isDestructive?: boolean;
  confirmLoading?: boolean;
  hideCancel?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  subtitle,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant,
  tone,
  icon,
  details,
  badgeText,
  isDestructive,
  confirmLoading = false,
  hideCancel = false,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const effectiveVariant: ModalVariant = (variant || (tone === 'neutral' ? 'info' : tone) || 'warning') as ModalVariant;
  const effectiveDestructive = isDestructive !== undefined ? isDestructive : (effectiveVariant === 'danger');

  const handleDismiss = () => {
    if (confirmLoading) return;
    if (onCancel) onCancel();
    if (onClose) onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    // Trap Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onClose, confirmLoading]);

  if (!isOpen) return null;

  // Resolve Icon & Theme Colors
  const getIconAndColors = () => {
    let resolvedIcon = typeof icon !== 'string' ? icon : null;
    if (typeof icon === 'string') {
      if (icon === 'danger') resolvedIcon = <ShieldAlert size={22} color="var(--danger)" />;
      else if (icon === 'warning') resolvedIcon = <AlertTriangle size={22} color="var(--warning)" />;
      else if (icon === 'success') resolvedIcon = <CheckCircle2 size={22} color="var(--success)" />;
      else resolvedIcon = <Info size={22} color="var(--accent)" />;
    }

    switch (effectiveVariant) {
      case 'danger':
        return {
          icon: resolvedIcon || <ShieldAlert size={22} color="var(--danger)" />,
          badgeBg: 'var(--danger-bg)',
          badgeBorder: 'var(--danger-border)',
          accentColor: 'var(--danger)',
          defaultBadge: 'Institutional Proctor Violation',
        };
      case 'warning':
        return {
          icon: resolvedIcon || <AlertTriangle size={22} color="var(--warning)" />,
          badgeBg: 'var(--warning-bg)',
          badgeBorder: 'var(--warning-border)',
          accentColor: 'var(--warning)',
          defaultBadge: 'Session Confirmation Required',
        };
      case 'success':
        return {
          icon: resolvedIcon || <CheckCircle2 size={22} color="var(--success)" />,
          badgeBg: 'var(--success-bg)',
          badgeBorder: 'var(--success-border)',
          accentColor: 'var(--success)',
          defaultBadge: 'Operation Verified',
        };
      case 'info':
      case 'neutral':
      default:
        return {
          icon: resolvedIcon || <Info size={22} color="var(--accent)" />,
          badgeBg: 'var(--bg-surface)',
          badgeBorder: 'var(--border)',
          accentColor: 'var(--text-primary)',
          defaultBadge: 'Axent System Notice',
        };
    }
  };

  const config = getIconAndColors();
  const currentBadgeText = badgeText || config.defaultBadge;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirmLoading) {
          handleDismiss();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            padding: '16px 20px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                background: config.badgeBg,
                border: `1px solid ${config.badgeBorder}`,
                color: config.accentColor
              }}
            >
              {currentBadgeText}
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            disabled={confirmLoading}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-muted)',
              cursor: confirmLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease'
            }}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-md)',
                background: config.badgeBg,
                border: `1px solid ${config.badgeBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {config.icon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id="confirm-modal-title"
                style={{
                  margin: '0 0 4px',
                  fontSize: '16px',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3
                }}
              >
                {title}
              </h3>

              {subtitle && (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Structured Details Box (e.g. Candidate, USN, Violations) */}
          {details && details.length > 0 && (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                gap: '10px',
                fontSize: '12px'
              }}
            >
              {details.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: item.color || 'var(--text-primary)'
                    }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Explanation / Narrative Message */}
          {message && (
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                background: variant === 'danger' ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                border: variant === 'danger' ? '1px dashed var(--danger-border)' : 'none',
                borderRadius: variant === 'danger' ? 'var(--radius-sm)' : undefined,
                padding: variant === 'danger' ? '10px 12px' : 0
              }}
            >
              {message}
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          {!hideCancel && (
            <button
              type="button"
              onClick={handleDismiss}
              disabled={confirmLoading}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '12.5px',
                fontWeight: 600,
                padding: '8px 16px',
                cursor: confirmLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease'
              }}
            >
              {cancelText}
            </button>
          )}

          {onConfirm && (
            <button
              ref={confirmBtnRef}
              type="button"
              onClick={() => {
                playSound('click');
                onConfirm();
              }}
              disabled={confirmLoading}
              style={{
                background: isDestructive
                  ? 'var(--danger-bg)'
                  : 'var(--accent)',
                border: isDestructive
                  ? '1px solid var(--danger-border)'
                  : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                color: isDestructive
                  ? 'var(--danger)'
                  : 'var(--accent-contrast)',
                fontSize: '12.5px',
                fontWeight: 700,
                padding: '8px 18px',
                cursor: confirmLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'opacity 0.15s ease'
              }}
            >
              {confirmLoading && <Loader2 size={13} className="spin" />}
              <span>{confirmText}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
