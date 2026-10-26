import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldAlert,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Monitor,
  User,
  X,
  FileText,
  Lock,
  Calendar
} from 'lucide-react';
import {
  DailyEmergencyKey,
  getTodayEmergencyKey,
  generateReplacementEmergencyKey,
  getEmergencyKeyHistory,
  subscribeToEmergencyKeyChanges
} from '../../services/emergencyKeyService';
import { playSound } from '../../utils/sounds';

interface EmergencyKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmergencyKeyModal: React.FC<EmergencyKeyModalProps> = ({ isOpen, onClose }) => {
  const [activeKey, setActiveKey] = useState<DailyEmergencyKey>(getTodayEmergencyKey());
  const [history, setHistory] = useState<DailyEmergencyKey[]>(getEmergencyKeyHistory());
  const [copied, setCopied] = useState<boolean>(false);
  const [showReissueConfirm, setShowReissueConfirm] = useState<boolean>(false);
  const [customPrefix, setCustomPrefix] = useState<string>('CSE');
  const [facultyNotes, setFacultyNotes] = useState<string>('');
  const [reissueSuccess, setReissueSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    // Refresh state when opened
    setActiveKey(getTodayEmergencyKey());
    setHistory(getEmergencyKeyHistory());

    // Subscribe to live changes across CCTV bus & other windows
    const unsubscribe = subscribeToEmergencyKeyChanges((key) => {
      setActiveKey(key);
      setHistory(getEmergencyKeyHistory());
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const isConsumed = activeKey.status === 'CONSUMED' || activeKey.usageCount >= 1;
  const usageRecord = activeKey.usageRecord;

  const handleCopyCode = () => {
    if (!activeKey?.code) return;
    try {
      navigator.clipboard.writeText(activeKey.code);
      setCopied(true);
      playSound('success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleExecuteReissue = () => {
    playSound('click');
    const newKey = generateReplacementEmergencyKey(
      'Chief Examination Officer',
      undefined,
      facultyNotes.trim() || 'Faculty authorized emergency re-issue'
    );
    setActiveKey(newKey);
    setHistory(getEmergencyKeyHistory());
    setShowReissueConfirm(false);
    setFacultyNotes('');
    setReissueSuccess(true);
    playSound('success');
    setTimeout(() => setReissueSuccess(false), 3000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* ── MODAL HEADER ── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <KeyRound size={16} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Emergency Unlock Key Manager
                </h3>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)'
                  }}
                >
                  Strict 1x / Day
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                Single-use physical voucher for on-site invigilator terminal authorization
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playSound('click');
              onClose();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── MODAL BODY ── */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {reissueSuccess && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={15} />
              <span>
                New authorized single-use emergency voucher issued and synced across campus terminals!
              </span>
            </div>
          )}

          {/* ── ACTIVE KEY VOUCHER CARD ── */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: isConsumed ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={13} color="var(--text-muted)" />
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Date: {activeKey.dateStr}
                </span>
              </div>

              {isConsumed ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  <AlertTriangle size={12} />
                  <span>CONSUMED & EXPIRED TODAY</span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  <CheckCircle2 size={12} />
                  <span>ACTIVE · 1 USE REMAINING</span>
                </div>
              )}
            </div>

            {/* Big Monospace Voucher Code Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                gap: '12px'
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Invigilator Emergency Master PIN
                </div>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: isConsumed ? 'var(--text-muted)' : 'var(--text-primary)',
                    letterSpacing: '0.08em',
                    textDecoration: isConsumed ? 'line-through' : 'none'
                  }}
                >
                  {activeKey.code}
                </div>
              </div>

              <button
                onClick={handleCopyCode}
                disabled={isConsumed}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: copied ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
                  color: copied ? '#10b981' : isConsumed ? 'var(--text-muted)' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: isConsumed ? 'not-allowed' : 'pointer'
                }}
                title="Copy voucher code to clipboard"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy Key'}</span>
              </button>
            </div>

            {/* Consumption Forensic Dossier */}
            {isConsumed && usageRecord ? (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={13} />
                  <span>Consumption Dossier (Zero Re-use Allowed Today):</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginTop: '2px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Workstation:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {usageRecord.stationId} ({usageRecord.labId || 'Campus Lab'})
                  </span>

                  <span style={{ color: 'var(--text-muted)' }}>Candidate:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {usageRecord.candidateName} [{usageRecord.candidateRoll}]
                  </span>

                  <span style={{ color: 'var(--text-muted)' }}>Time Consumed:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {new Date(usageRecord.timestamp).toLocaleTimeString()} ({new Date(usageRecord.timestamp).toLocaleDateString()})
                  </span>

                  <span style={{ color: 'var(--text-muted)' }}>Examination:</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {usageRecord.examTitle || 'Live Examination'}
                  </span>
                </div>
                <div style={{ fontSize: '10.5px', color: '#f87171', marginTop: '4px', fontStyle: 'italic' }}>
                  Note: Any workstation or student attempting to enter this code today will be permanently rejected.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                This key is valid for <strong>one-time use today</strong> across all 1,000+ candidate workstations.
                When entered by an invigilator on a frozen workstation, it immediately unlocks that terminal and permanently expires.
              </div>
            )}
          </div>

          {/* ── FACULTY RE-ISSUE CONTROLLER ── */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={13} color="var(--accent)" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Faculty Emergency Voucher Control
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Chief Invigilator Only
              </span>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
              If a genuine hardware fault occurs and an additional emergency unlock is strictly authorized by faculty, you may generate a replacement single-use voucher.
            </p>

            {!showReissueConfirm ? (
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  setShowReissueConfirm(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  width: 'fit-content'
                }}
              >
                <RefreshCw size={13} />
                <span>Issue Replacement Single-Use Voucher</span>
              </button>
            ) : (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Confirm Issuing New Single-Use Emergency Voucher:
                </div>
                <input
                  type="text"
                  placeholder="Reason / Faculty Authorization Note (e.g. Lab 02 Station 04 hardware crash)"
                  value={facultyNotes}
                  onChange={(e) => setFacultyNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleExecuteReissue}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      background: 'var(--accent)',
                      color: 'var(--accent-contrast)',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Check size={12} />
                    <span>Confirm & Generate New Key</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReissueConfirm(false)}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── AUDIT HISTORY LEDGER ── */}
          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={12} color="var(--text-muted)" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Emergency Key Audit History ({history.length})
                </span>
              </div>

              <div
                style={{
                  maxHeight: '160px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--bg-surface)'
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Code</th>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Station / Candidate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={h.keyId || i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {h.dateStr}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {h.code}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 700,
                              padding: '2px 5px',
                              borderRadius: '4px',
                              background: h.status === 'CONSUMED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              color: h.status === 'CONSUMED' ? '#f87171' : 'var(--text-muted)'
                            }}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                          {h.usageRecord
                            ? `${h.usageRecord.stationId} (${h.usageRecord.candidateRoll || h.usageRecord.candidateName})`
                            : 'Unused'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL FOOTER ── */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            System sync active across all terminals
          </div>
          <button
            onClick={() => {
              playSound('click');
              onClose();
            }}
            style={{
              padding: '6px 16px',
              fontSize: '11.5px',
              fontWeight: 600,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
