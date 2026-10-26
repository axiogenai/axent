import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Volume2,
  VolumeX,
  Bell,
  Lock,
  Unlock,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Database,
  Check,
  Save,
  Radio,
  FileText
} from 'lucide-react';
import { playSound } from '../../utils/sounds';
import { EmergencyKeyModal } from './EmergencyKeyModal';
import {
  DailyEmergencyKey,
  getTodayEmergencyKey,
  subscribeToEmergencyKeyChanges,
  updateActiveEmergencyKeyCode
} from '../../services/emergencyKeyService';

interface AdminSettingsViewProps {
  onTriggerResetRoom: () => void;
  onClearSubmitted: () => void;
  onOpenSupabaseModal: () => void;
  onOpenEmergencyKeys?: () => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  onTriggerResetRoom,
  onClearSubmitted,
  onOpenSupabaseModal,
  onOpenEmergencyKeys
}) => {
  const [showInternalModal, setShowInternalModal] = useState<boolean>(false);
  const [activeEmergencyKey, setActiveEmergencyKey] = useState<DailyEmergencyKey>(getTodayEmergencyKey());

  useEffect(() => {
    const unsub = subscribeToEmergencyKeyChanges((key) => {
      setActiveEmergencyKey(key);
      setProctorPin(key.code);
    });
    return () => unsub();
  }, []);
  const [faceRigor, setFaceRigor] = useState<'standard' | 'strict' | 'relaxed'>('standard');
  const [tabLimit, setTabLimit] = useState<number>(3);
  const [pasteLimit, setPasteLimit] = useState<number>(50);
  const [soundAlerts, setSoundAlerts] = useState<boolean>(true);
  const [fullscreenLock, setFullscreenLock] = useState<boolean>(true);
  const [blockDevtools, setBlockDevtools] = useState<boolean>(true);
  const [autoSubmitOnExpire, setAutoSubmitOnExpire] = useState<boolean>(true);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [proctorPin, setProctorPin] = useState<string>(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('codedna_proctor_security_pin') : null) || 'CSE-PROCTOR-2026';
  });

  const handleSaveSettings = () => {
    const cleanPin = proctorPin.trim().toUpperCase() || 'CSE-PROCTOR-2026';
    if (typeof window !== 'undefined') {
      localStorage.setItem('codedna_proctor_security_pin', cleanPin);
    }
    updateActiveEmergencyKeyCode(cleanPin, 'Admin Settings');
    playSound('success');
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '100%' }}>
      {/* ── HEADER ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '14px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Settings size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Examination & Proctoring Settings
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Institutional rules, anti-cheating sensitivity, and emergency workstation controls
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveSettings}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {savedSuccess ? <Check size={13} /> : <Save size={13} />}
          <span>{savedSuccess ? 'Settings Saved' : 'Save Preferences'}</span>
        </button>
      </div>

      {/* ── SECTION 1: AI PROCTORING & INTEGRITY THRESHOLDS ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={16} color="#3b82f6" />
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            AI Proctoring & Integrity Thresholds
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
          {/* Face Tracking Rigor */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Face & Visual Attention Tracking
            </label>
            <select
              value={faceRigor}
              onChange={(e) => setFaceRigor(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              <option value="standard">Standard (Flag after 5s continuous face absence)</option>
              <option value="strict">Strict (Flag after 2s absence or multiple faces)</option>
              <option value="relaxed">Relaxed (Flag only on prolonged absence)</option>
            </select>
          </div>

          {/* Tab Switch Limit */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Max Tab / Window Blur Limit
            </label>
            <select
              value={tabLimit}
              onChange={(e) => setTabLimit(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              <option value={1}>1 Violation (Strict Zero-Tolerance)</option>
              <option value={2}>2 Violations (Warning then Auto-Flag)</option>
              <option value={3}>3 Violations (Standard University Policy)</option>
              <option value={5}>5 Violations (High Tolerance)</option>
            </select>
          </div>

          {/* Paste Ratio Alert Threshold */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              External Clipboard Paste Threshold
            </label>
            <select
              value={pasteLimit}
              onChange={(e) => setPasteLimit(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              <option value={30}>Flag if {'>'} 30% external pasted characters</option>
              <option value={50}>Flag if {'>'} 50% external pasted characters (Standard)</option>
              <option value={75}>Flag if {'>'} 75% external pasted characters</option>
            </select>
          </div>

          {/* Single-Use Daily Emergency Unlock Key */}
          <div
            style={{
              gridColumn: '1 / -1',
              background: 'var(--bg-surface)',
              border: activeEmergencyKey.status === 'CONSUMED' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={15} color={activeEmergencyKey.status === 'CONSUMED' ? '#f87171' : 'var(--accent)'} />
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Daily Single-Use Emergency Unlock Key
                </span>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: activeEmergencyKey.status === 'CONSUMED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: activeEmergencyKey.status === 'CONSUMED' ? '#f87171' : '#10b981'
                  }}
                >
                  {activeEmergencyKey.status === 'CONSUMED' ? 'CONSUMED TODAY' : '1-USE AVAILABLE TODAY'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  if (onOpenEmergencyKeys) onOpenEmergencyKeys();
                  else setShowInternalModal(true);
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11px', gap: '5px' }}
              >
                <KeyRound size={12} />
                <span>Open Key Voucher Manager</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Current Active Key Code ({activeEmergencyKey.dateStr}):
                </label>
                <input
                  type="text"
                  value={proctorPin}
                  onChange={(e) => setProctorPin(e.target.value.toUpperCase())}
                  placeholder="e.g. CSE-7492"
                  disabled={activeEmergencyKey.status === 'CONSUMED'}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {activeEmergencyKey.status === 'CONSUMED' && activeEmergencyKey.usageRecord ? (
                  <span style={{ color: '#f87171' }}>
                    Consumed at {new Date(activeEmergencyKey.usageRecord.timestamp).toLocaleTimeString()} on workstation {activeEmergencyKey.usageRecord.stationId} by {activeEmergencyKey.usageRecord.candidateName}. Expired for today.
                  </span>
                ) : (
                  <span>
                    Strict single-use policy: Once an invigilator enters this key on any student terminal, it is immediately marked as consumed and cannot be reused anywhere today.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: EXAM ENVIRONMENT & HARDWARE SECURITY ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lock size={16} color="#3b82f6" />
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Exam Hall Browser & Hardware Policies
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Enforce Strict Fullscreen Lockdown
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Candidate cannot access test content unless full browser window is actively engaged in full screen
              </div>
            </div>
            <input
              type="checkbox"
              checked={fullscreenLock}
              onChange={(e) => setFullscreenLock(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Block Developer Tools & Context Menu
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Disables right-click inspect element, F12 developer console, and source inspection hotkeys
              </div>
            </div>
            <input
              type="checkbox"
              checked={blockDevtools}
              onChange={(e) => setBlockDevtools(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Audible Invigilator Warning Chimes
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Play subtle audio alert chimes in the control room when high-risk cheating events are triggered
              </div>
            </div>
            <input
              type="checkbox"
              checked={soundAlerts}
              onChange={(e) => setSoundAlerts(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
            />
          </label>
        </div>
      </div>

      {/* ── SECTION 3: CLOUD DATABASE & REALTIME ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Database size={16} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Supabase Cloud Database & CCTV Sync
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Multi-room broadcast sync for cross-campus invigilation networks
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSupabaseModal}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Database size={12} />
          <span>Configure Cloud Sync</span>
        </button>
      </div>

      {/* ── SECTION 4: DANGER ZONE ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '10px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={16} color="#ef4444" />
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#ef4444' }}>
            Danger Zone & Emergency Room Operations
          </h3>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Emergency actions that purge or reset current workstation connections. Perform only between exam batches or under proctor authorization.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
          <button
            type="button"
            onClick={onClearSubmitted}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={13} />
            <span>Clear Completed Workstations</span>
          </button>

          <button
            type="button"
            onClick={onTriggerResetRoom}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <AlertTriangle size={13} />
            <span>Reset Entire Examination Room</span>
          </button>
        </div>
      </div>

      {/* ── INTERNAL EMERGENCY KEY MODAL ── */}
      <EmergencyKeyModal
        isOpen={showInternalModal}
        onClose={() => setShowInternalModal(false)}
      />

        </div>
  );
};
