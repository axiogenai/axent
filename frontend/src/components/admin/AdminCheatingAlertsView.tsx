import React, { useState } from 'react';
import {
  AlertTriangle,
  Trash2,
  Search,
  Filter,
  ShieldAlert,
  Send,
  Lock,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Building,
  UserX,
  PlusCircle,
  KeyRound,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';
import {
  issueStudentEmergencyKey,
  getStudentBoundKey,
  subscribeToEmergencyKeyChanges,
  DailyEmergencyKey
} from '../../services/emergencyKeyService';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import { removeSingleStation, clearAllStations } from '../../services/adminService';
import { clearAllAttemptsFromEverywhere } from '../../services/mcqService';
import { playSound } from '../../utils/sounds';
import { SimpleSelect } from '../watermelon/Select';

interface AdminCheatingAlertsViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  selectedLabId: string;
  setSelectedLabId: (labId: string) => void;
  onInspectStation: (station: CandidateStation) => void;
  onSendWarning: (station: CandidateStation) => void;
  onLockStation: (stationId: string) => void;
  onUnlockStation: (stationId: string) => void;
  onDisqualify: (station: CandidateStation) => void;
}

export const AdminCheatingAlertsView: React.FC<AdminCheatingAlertsViewProps> = ({
  stations,
  allLabs,
  selectedLabId,
  setSelectedLabId,
  onInspectStation,
  onSendWarning,
  onLockStation,
  onUnlockStation,
  onDisqualify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dismissedStationIds, setDismissedStationIds] = useState<Set<string>>(() => new Set());

  const handleDismissIncident = (station: CandidateStation) => {
    playSound('click');
    setDismissedStationIds((prev) => new Set([...prev, station.id]));
    removeSingleStation(station.id);
    playSound('success');
  };

  const handlePurgeAllIncidents = async () => {
    if (!confirm('Are you sure you want to purge all flagged cheating incidents and stations from database?')) return;
    playSound('click');
    await clearAllStations(selectedLabId);
    await clearAllAttemptsFromEverywhere(selectedLabId === 'all' ? undefined : selectedLabId);
    setDismissedStationIds(new Set());
    playSound('success');
  };
  const [, setKeyUpdateTick] = useState<number>(0);

  React.useEffect(() => {
    const unsub = subscribeToEmergencyKeyChanges(() => {
      setKeyUpdateTick((t) => t + 1);
    });
    return () => unsub();
  }, []);

  const handleIssueKey = (station: CandidateStation) => {
    playSound('click');
    const newKey = issueStudentEmergencyKey({
      studentRoll: station.student?.rollNumber,
      studentName: station.student?.name,
      stationId: station.id,
      labId: station.labId,
      examTitle: station.student?.examType || 'Examination',
      issuedBy: 'Cheating Alert Proctors'
    });
    try {
      navigator.clipboard.writeText(newKey.code);
      setCopiedKey(newKey.code);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {}
    playSound('success');
  };

  const handleCopy = (code: string) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedKey(code);
      playSound('success');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  // Filter stations that have cheating risk or elevated metrics
  const flaggedStations = stations.filter((s) => {
    // Only real candidate stations with actual registered student details
    if (!s || !s.student || !s.student.name || s.student.name.trim() === '' || s.student.name === 'Candidate' || s.student.name === 'Candidate (N/A)') {
      return false;
    }
    const isPasteViolation = (s.metrics?.pasteRatio || 0) >= 30;
    const isTabViolation = (s.metrics?.tabSwitchViolations || 0) >= 1;
    const isRiskElevated = s.cheatingRisk === 'High' || s.cheatingRisk === 'Critical' || s.cheatingRisk === 'Medium';
    return isPasteViolation || isTabViolation || isRiskElevated;
  });

  const displayedAlerts = flaggedStations.filter((s) => {
    if (dismissedStationIds.has(s.id)) return false;
    if (selectedLabId !== 'all' && s.labId !== selectedLabId) return false;

    const isCritical =
      s.cheatingRisk === 'Critical' ||
      (s.metrics?.pasteRatio || 0) >= 60 ||
      (s.metrics?.tabSwitchViolations || 0) >= 3;

    if (severityFilter === 'critical' && !isCritical) return false;
    if (severityFilter === 'high' && isCritical) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.student?.name || '').toLowerCase().includes(q) ||
      (s.student?.rollNumber || '').toLowerCase().includes(q) ||
      s.stationNumber.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* â”€â”€ SECURITY RESPONSE STATUS HEADER â”€â”€ */}
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
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ShieldAlert size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Security & Cheating Incident Response Center
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: displayedAlerts.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                  color: displayedAlerts.length > 0 ? '#ef4444' : '#22c55e',
                  border: displayedAlerts.length > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.25)'
                }}
              >
                {displayedAlerts.length} FLAGGED INCIDENTS
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Real-time heuristic & AI surveillance alerts: Paste anomalies, tab switching, and visual tracking
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {displayedAlerts.length > 0 && (
            <button
              type="button"
              onClick={handlePurgeAllIncidents}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={13} />
              <span>Purge All Incidents</span>
            </button>
          )}
          <div style={{ minWidth: '180px' }}>
            <SimpleSelect
              value={selectedLabId}
              onChange={(val) => {
                playSound('click');
                setSelectedLabId(val);
              }}
              size="sm"
              options={[
                { value: 'all', label: 'All Laboratories' },
                ...allLabs.map((lab) => ({
                  value: lab.labId,
                  label: lab.labName
                }))
              ]}
            />
          </div>
        </div>
      </div>

      {/* â”€â”€ INCIDENTS LIST â”€â”€ */}
      {displayedAlerts.length === 0 ? (
        <div
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22c55e'
            }}
          >
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px', color: 'var(--text-primary)' }}>
              No Active Security Flags Detected
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '440px', margin: 0 }}>
              All current examination sessions meet institutional integrity requirements.
              No tab violations, external paste bursts, or unauthorized actions detected.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayedAlerts.map((station) => {
            const isCritical =
              station.cheatingRisk === 'Critical' ||
              (station.metrics?.pasteRatio || 0) >= 60 ||
              (station.metrics?.tabSwitchViolations || 0) >= 3;
            const isLocked = Boolean(station.isLockedByProctor);
            const studentKey = getStudentBoundKey(station.student?.rollNumber, station.id);

            return (
              <div
                key={station.id}
                style={{
                  background: 'var(--bg-elevated)',
                  border: isCritical ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(234, 179, 8, 0.5)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: isCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                        color: isCritical ? '#ef4444' : '#eab308',
                        border: isCritical ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(234, 179, 8, 0.3)'
                      }}
                    >
                      {isCritical ? 'CRITICAL INCIDENT' : 'ELEVATED SUSPICION'}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {station.stationNumber}
                    </span>

                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {station.student?.name || 'Candidate'} ({station.student?.rollNumber || 'N/A'})
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    LAB: {station.labName || station.labId} Â· IP: {station.ipAddress || '10.77.210.15'}
                  </div>
                </div>

                {/* Specific Violation Diagnostics */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                    gap: '10px',
                    padding: '10px 14px',
                    background: 'var(--bg-surface)',
                    borderRadius: '8px',
                    fontSize: '11.5px'
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Paste Ratio: </span>
                    <strong style={{ color: (station.metrics?.pasteRatio || 0) >= 50 ? '#ef4444' : 'var(--text-primary)' }}>
                      {station.metrics?.pasteRatio || 0}% External Content
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Tab Swaps: </span>
                    <strong style={{ color: (station.metrics?.tabSwitchViolations || 0) >= 2 ? '#ef4444' : 'var(--text-primary)' }}>
                      {station.metrics?.tabSwitchViolations || 0} Window Blurs
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Away Duration: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {station.metrics?.unfocusedTimeSeconds || 0} seconds
                    </strong>
                  </div>
                </div>

                {/* 5-Character Student-Bound Unlock Key Banner */}
                {studentKey && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: studentKey.status === 'CONSUMED' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                      border: studentKey.status === 'CONSUMED' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <KeyRound size={13} color={studentKey.status === 'CONSUMED' ? '#f87171' : '#3b82f6'} />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {studentKey.status === 'CONSUMED' ? 'Student Key Expired:' : 'Locked Student Unlock Key:'}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          fontSize: '14px',
                          color: studentKey.status === 'CONSUMED' ? 'var(--text-muted)' : 'var(--text-primary)',
                          letterSpacing: '0.08em',
                          textDecoration: studentKey.status === 'CONSUMED' ? 'line-through' : 'none'
                        }}
                      >
                        {studentKey.code}
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        (Bound strictly to {station.student?.name || 'this candidate'} Â· No other kid can use it)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {studentKey.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleCopy(studentKey.code)}
                          style={{
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            background: copiedKey === studentKey.code ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-elevated)',
                            color: copiedKey === studentKey.code ? '#10b981' : 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {copiedKey === studentKey.code ? 'Copied' : 'Copy'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleIssueKey(station)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10.5px',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                        title="Issue fresh 5-character key for this student"
                      >
                        Re-issue
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleIssueKey(station)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      background: studentKey?.status === 'ACTIVE' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
                      border: studentKey?.status === 'ACTIVE' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border)',
                      borderRadius: '6px',
                      color: studentKey?.status === 'ACTIVE' ? '#3b82f6' : 'var(--text-primary)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Generate an unguessable 5-character unlock key valid strictly for this student only"
                  >
                    <KeyRound size={12} />
                    <span>{studentKey?.status === 'ACTIVE' ? `Student Key: ${studentKey.code}` : 'Issue 5-Char Key'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSendWarning(station)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      borderRadius: '6px',
                      color: '#eab308',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Send size={12} />
                    <span>Send Warning Alert</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      if (isLocked) {
                        onUnlockStation(station.id);
                      } else {
                        onLockStation(station.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      background: isLocked ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: isLocked
                        ? '1px solid rgba(34, 197, 94, 0.3)'
                        : '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      color: isLocked ? '#22c55e' : '#ef4444',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Lock size={12} />
                    <span>{isLocked ? 'Unlock Station' : 'Lock Station'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDismissIncident(station)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '6px',
                      color: '#ef4444',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Dismiss and purge this incident from surveillance ledger"
                  >
                    <Trash2 size={12} />
                    <span>Dismiss Incident</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onInspectStation(station)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '11.5px',
                      cursor: 'pointer'
                    }}
                  >
                    <Eye size={12} />
                    <span>Inspect Evidence</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
