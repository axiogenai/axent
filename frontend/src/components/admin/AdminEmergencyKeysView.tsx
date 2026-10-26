import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  Clock,
  Shield,
  ShieldAlert,
  Building,
  User,
  Monitor,
  Edit3
} from 'lucide-react';
import {
  DailyEmergencyKey,
  getTodayEmergencyKey,
  getTodayEmergencyKeysList,
  generateReplacementEmergencyKey,
  generateBatchEmergencyKeys,
  updateActiveEmergencyKeyCode,
  getEmergencyKeyHistory,
  subscribeToEmergencyKeyChanges
} from '../../services/emergencyKeyService';
import { playSound } from '../../utils/sounds';

export const AdminEmergencyKeysView: React.FC = () => {
  const [activeKey, setActiveKey] = useState<DailyEmergencyKey>(getTodayEmergencyKey());
  const [keysList, setKeysList] = useState<DailyEmergencyKey[]>(getTodayEmergencyKeysList());
  const [history, setHistory] = useState<DailyEmergencyKey[]>(getEmergencyKeyHistory());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const refreshState = () => {
    setActiveKey(getTodayEmergencyKey());
    setKeysList(getTodayEmergencyKeysList());
    setHistory(getEmergencyKeyHistory());
  };

  useEffect(() => {
    refreshState();
    const unsub = subscribeToEmergencyKeyChanges(() => {
      refreshState();
    });
    return () => unsub();
  }, []);

  const handleCopy = (code: string) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      playSound('success');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  const handleGenerateSingle = () => {
    playSound('click');
    const newKey = generateReplacementEmergencyKey(
      'Chief Examination Officer',
      undefined,
      'Faculty generated fresh 1-time voucher',
      true
    );
    refreshState();
    setBannerNotice(`Generated new 1-time emergency key: ${newKey.code}`);
    playSound('success');
    setTimeout(() => setBannerNotice(null), 3500);
  };

  const handleGenerateBatch = (count = 5) => {
    playSound('click');
    const newKeys = generateBatchEmergencyKeys(count, 'CSE', 'Chief Examination Officer');
    refreshState();
    setBannerNotice(`Generated batch of ${count} lab emergency vouchers for exam halls.`);
    playSound('success');
    setTimeout(() => setBannerNotice(null), 3500);
  };

  const handleSaveCustomKey = () => {
    if (!customInput.trim()) return;
    playSound('click');
    const updated = updateActiveEmergencyKeyCode(customInput.trim(), 'Chief Proctor');
    setCustomInput('');
    setShowCustomInput(false);
    refreshState();
    setBannerNotice(`Custom emergency key set: ${updated.code}`);
    playSound('success');
    setTimeout(() => setBannerNotice(null), 3500);
  };

  const isConsumed = activeKey.status === 'CONSUMED' || activeKey.usageCount >= 1;
  const activeUnusedKeys = keysList.filter((k) => k.status === 'ACTIVE');
  const consumedTodayKeys = keysList.filter((k) => k.status === 'CONSUMED');

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
          padding: '16px 20px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <KeyRound size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Emergency Unlock Keys & Lab Vouchers
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)'
                }}
              >
                Strict 1-Time Use
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
              Single-use PINs for on-site invigilator terminal authorization. Each key expires permanently upon first use.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleGenerateSingle}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            <RefreshCw size={13} />
            <span>Generate New Key</span>
          </button>

          <button
            type="button"
            onClick={() => handleGenerateBatch(5)}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            <PlusCircle size={13} />
            <span>+ Generate 5 Lab Keys</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <Edit3 size={13} />
            <span>Set Custom PIN</span>
          </button>
        </div>
      </div>

      {bannerNotice && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle2 size={16} />
          <span>{bannerNotice}</span>
        </div>
      )}

      {/* ── CUSTOM PIN INPUT DRAWER ── */}
      {showCustomInput && (
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              Enter Desired Custom Emergency PIN:
            </label>
            <input
              type="text"
              placeholder="e.g. CSE-PROCTOR-2026 or EXAM-9944"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                fontWeight: 700,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSaveCustomKey}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 16px',
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Check size={13} />
              <span>Save & Activate Key</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCustomInput(false)}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── SECTION 1: PRIMARY SPOTLIGHT VOUCHER ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: isConsumed ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
          borderRadius: '10px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Primary Active Emergency Key (Date: {activeKey.dateStr})
            </span>
          </div>

          {isConsumed ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              <AlertTriangle size={13} />
              <span>CONSUMED & EXPIRED TODAY</span>
            </div>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              <CheckCircle2 size={13} />
              <span>ACTIVE · 1 USE AVAILABLE</span>
            </div>
          )}
        </div>

        {/* Giant Monospace Display */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Master Proctor Authorization PIN
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: isConsumed ? 'var(--text-muted)' : 'var(--text-primary)',
                letterSpacing: '0.08em',
                textDecoration: isConsumed ? 'line-through' : 'none',
                marginTop: '4px'
              }}
            >
              {activeKey.code}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleCopy(activeKey.code)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: 600,
                background: copiedCode === activeKey.code ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-elevated)',
                color: copiedCode === activeKey.code ? '#10b981' : 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {copiedCode === activeKey.code ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedCode === activeKey.code ? 'Copied to Clipboard' : 'Copy Key'}</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateSingle}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              <span>Generate Fresh Key</span>
            </button>
          </div>
        </div>

        {/* Forensic Usage Dossier if consumed */}
        {isConsumed && activeKey.usageRecord ? (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '12px'
            }}
          >
            <div style={{ fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldAlert size={14} />
              <span>Consumption Dossier (Strict Single-Use Enforced):</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Workstation:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {activeKey.usageRecord.stationId} ({activeKey.usageRecord.labId || 'Campus Lab'})
              </span>

              <span style={{ color: 'var(--text-muted)' }}>Candidate:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {activeKey.usageRecord.candidateName} [{activeKey.usageRecord.candidateRoll}]
              </span>

              <span style={{ color: 'var(--text-muted)' }}>Time Used:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {new Date(activeKey.usageRecord.timestamp).toLocaleTimeString()} ({new Date(activeKey.usageRecord.timestamp).toLocaleDateString()})
              </span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            This key unlocks frozen candidate terminals on-site. The moment it is entered on any workstation, it is permanently consumed and expired.
          </div>
        )}
      </div>

      {/* ── SECTION 2: MULTI-KEY POOL FOR LABS ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Active Emergency Key Pool ({keysList.length} Total · {activeUnusedKeys.length} Unused Available)
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Multiple single-use vouchers can be issued to invigilators across different laboratories. Each key works strictly ONCE.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleGenerateSingle}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11.5px', gap: '5px' }}
            >
              <PlusCircle size={13} />
              <span>+ Add 1-Time Key</span>
            </button>
            <button
              type="button"
              onClick={() => handleGenerateBatch(5)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11.5px', gap: '5px' }}
            >
              <Layers size={13} />
              <span>+ Batch 5 Keys</span>
            </button>
          </div>
        </div>

        {/* Table of keys */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'var(--bg-surface)'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Voucher Code</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Assigned Lab</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Forensic Usage Details</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keysList.map((k) => (
                <tr key={k.keyId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {k.code}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                    {k.labAssignment || 'General Campus'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '3px 7px',
                        borderRadius: '4px',
                        background: k.status === 'CONSUMED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: k.status === 'CONSUMED' ? '#f87171' : '#10b981'
                      }}
                    >
                      {k.status === 'CONSUMED' ? 'CONSUMED' : 'ACTIVE · 1 USE'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                    {k.usageRecord ? (
                      <span>
                        Used on <strong>{k.usageRecord.stationId}</strong> by {k.usageRecord.candidateName} at{' '}
                        {new Date(k.usageRecord.timestamp).toLocaleTimeString()}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Unused · Ready for terminal unlock</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleCopy(k.code)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: copiedCode === k.code ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-elevated)',
                        color: copiedCode === k.code ? '#10b981' : 'var(--text-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {copiedCode === k.code ? 'Copied' : 'Copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 3: HISTORICAL AUDIT LOG ── */}
      {history.length > 0 && (
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={14} color="var(--text-muted)" />
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Historical Emergency Voucher Ledger ({history.length} Prior Keys)
            </h3>
          </div>

          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--bg-surface)'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Date</th>
                  <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Key Code</th>
                  <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Station & Candidate</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.keyId || i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{h.dateStr}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {h.code}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: h.status === 'CONSUMED' ? '#f87171' : 'var(--text-muted)' }}>
                        {h.status}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                      {h.usageRecord
                        ? `${h.usageRecord.stationId} (${h.usageRecord.candidateRoll || h.usageRecord.candidateName})`
                        : 'Unused / Archived'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
