import React, { useState } from 'react';
import {
  Monitor,
  Search,
  Filter,
  Lock,
  Unlock,
  Radio,
  CheckCircle2,
  XCircle,
  Eye,
  Wifi,
  Trash2,
  PlusCircle,
  Building,
  RefreshCw,
  KeyRound
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import { playSound } from '../../utils/sounds';
import { getStudentBoundKey, issueStudentEmergencyKey } from '../../services/emergencyKeyService';
import { SimpleSelect } from '../watermelon/Select';

interface AdminTestStationsViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  selectedLabId: string;
  setSelectedLabId: (labId: string) => void;
  onInspectStation: (station: CandidateStation) => void;
  onLockStation: (stationId: string) => void;
  onUnlockStation: (stationId: string) => void;
  onConcludeAndFree: (station: CandidateStation) => void;
}

export const AdminTestStationsView: React.FC<AdminTestStationsViewProps> = ({
  stations,
  allLabs,
  selectedLabId,
  setSelectedLabId,
  onInspectStation,
  onLockStation,
  onUnlockStation,
  onConcludeAndFree,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'in_use' | 'locked'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const inUseCount = stations.filter((s) => s.status !== 'Submitted & Done').length;
  const lockedCount = stations.filter((s) => s.isLockedByProctor).length;

  const filteredStations = stations.filter((s) => {
    if (selectedLabId !== 'all' && s.labId !== selectedLabId) return false;
    if (filterMode === 'in_use' && s.status === 'Submitted & Done') return false;
    if (filterMode === 'locked' && !s.isLockedByProctor) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.stationNumber.toLowerCase().includes(q) ||
      (s.ipAddress || '').toLowerCase().includes(q) ||
      (s.student?.name || '').toLowerCase().includes(q) ||
      (s.student?.rollNumber || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* â”€â”€ HEADER SUMMARY CARDS â”€â”€ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
          gap: '12px',
          width: '100%'
        }}
      >
        <div
          onClick={() => {
            playSound('click');
            setFilterMode('all');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: filterMode === 'all' ? '1px solid #3b82f6' : '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            cursor: 'pointer'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Monitor size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Total Test Stations
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{stations.length}</div>
          </div>
        </div>

        <div
          onClick={() => {
            playSound('click');
            setFilterMode('in_use');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: filterMode === 'in_use' ? '1px solid #22c55e' : '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            cursor: 'pointer'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Radio size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Active Sessions
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{inUseCount}</div>
          </div>
        </div>

        <div
          onClick={() => {
            playSound('click');
            setFilterMode('locked');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: filterMode === 'locked' ? '1px solid #ef4444' : '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            cursor: 'pointer'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Lock size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Locked Workstations
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{lockedCount}</div>
          </div>
        </div>
      </div>

      {/* â”€â”€ TOOLBAR & SEARCH â”€â”€ */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 'min(100%, 200px)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 'min(100%, 180px)', maxWidth: '360px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              placeholder="Search station number, IP subnet, or candidate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 32px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

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

      {/* â”€â”€ WORKSTATIONS INVENTORY TABLE â”€â”€ */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}
      >
        <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table className="ledger-table" style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Workstation ID
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Laboratory
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  IP & Network Ping
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Hardware Checks
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Assigned Candidate
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Lock State
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No test stations found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredStations.map((station) => {
                  const isLocked = Boolean(station.isLockedByProctor);
                  const isSubmitted = station.status === 'Submitted & Done';

                  return (
                    <tr
                      key={station.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'transparent'
                      }}
                    >
                      {/* Station ID */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {station.stationNumber}
                          </span>
                        </div>
                      </td>

                      {/* Laboratory */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {station.labName || station.labId}
                      </td>

                      {/* IP & Network Ping */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Wifi size={12} color="#22c55e" />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--text-primary)' }}>
                            {station.ipAddress || '10.77.210.12'}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Â· 18ms</span>
                        </div>
                      </td>

                      {/* Hardware Diagnostics */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: station.screenImageData ? 'rgba(34, 197, 94, 0.12)' : 'var(--bg-surface)',
                              color: station.screenImageData ? '#22c55e' : 'var(--text-muted)',
                              border: '1px solid var(--border)'
                            }}
                          >
                            CAM: {station.screenImageData ? 'ACTIVE' : 'READY'}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: station.screenImageData ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-surface)',
                              color: station.screenImageData ? '#3b82f6' : 'var(--text-muted)',
                              border: '1px solid var(--border)'
                            }}
                          >
                            SCREEN: {station.screenImageData ? 'STREAMING' : 'IDLE'}
                          </span>
                        </div>
                      </td>

                      {/* Assigned Candidate */}
                      <td style={{ padding: '10px 14px' }}>
                        {station.student?.name ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {station.student.name}
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {station.student.rollNumber}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Vacant / Idle</span>
                        )}
                      </td>

                      {/* Lock State */}
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: isLocked ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                            color: isLocked ? '#ef4444' : '#22c55e',
                            border: isLocked
                              ? '1px solid rgba(239, 68, 68, 0.3)'
                              : '1px solid rgba(34, 197, 94, 0.25)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                          <span>{isLocked ? 'LOCKED' : 'UNLOCKED'}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => onInspectStation(station)}
                            title="Inspect hardware diagnostics"
                            style={{
                              padding: '5px 8px',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            <Eye size={12} />
                            <span>Telemetry</span>
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
                            title={isLocked ? 'Unlock workstation' : 'Lock workstation'}
                            style={{
                              padding: '5px 8px',
                              background: isLocked ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              border: isLocked
                                ? '1px solid rgba(34, 197, 94, 0.3)'
                                : '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: isLocked ? '#22c55e' : '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                            <span>{isLocked ? 'Unlock' : 'Lock'}</span>
                          </button>

                          {isLocked && (() => {
                            const stKey = getStudentBoundKey(station.student?.rollNumber, station.id);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  playSound('click');
                                  const newK = issueStudentEmergencyKey({
                                    studentRoll: station.student?.rollNumber,
                                    studentName: station.student?.name,
                                    stationId: station.id,
                                    labId: station.labId,
                                    issuedBy: 'Station Manager'
                                  });
                                  try {
                                    navigator.clipboard.writeText(newK.code);
                                    setCopiedKey(newK.code);
                                    setTimeout(() => setCopiedKey(null), 2500);
                                  } catch {}
                                  playSound('success');
                                }}
                                title="Issue / Copy 5-character emergency key strictly for this student"
                                style={{
                                  padding: '5px 8px',
                                  background: stKey?.status === 'ACTIVE' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-surface)',
                                  border: stKey?.status === 'ACTIVE' ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid var(--border)',
                                  borderRadius: '6px',
                                  color: stKey?.status === 'ACTIVE' ? '#3b82f6' : 'var(--text-primary)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}
                              >
                                <KeyRound size={12} />
                                <span>{stKey?.status === 'ACTIVE' ? (copiedKey === stKey.code ? 'Copied' : stKey.code) : 'Key'}</span>
                              </button>
                            );
                          })()}

                          {isSubmitted && (
                            <button
                              type="button"
                              onClick={() => onConcludeAndFree(station)}
                              title="Free workstation for next batch"
                              style={{
                                padding: '5px 8px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px'
                              }}
                            >
                              <Trash2 size={12} />
                              <span>Free</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
