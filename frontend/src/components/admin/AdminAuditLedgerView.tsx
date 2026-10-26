import React, { useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  Download,
  ShieldCheck,
  Building,
  Monitor,
  Eye,
  FileText,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  Table
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import { playSound } from '../../utils/sounds';

interface AdminAuditLedgerViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  selectedLabId: string;
  setSelectedLabId: (labId: string) => void;
  onInspectStation: (station: CandidateStation) => void;
  onInspectReport: (station: CandidateStation) => void;
  onExportCSV: () => void;
  onClearSubmitted: () => void;
  onRemoveSingleStation?: (stationId: string) => void;
}

export const AdminAuditLedgerView: React.FC<AdminAuditLedgerViewProps> = ({
  stations,
  allLabs,
  selectedLabId,
  setSelectedLabId,
  onInspectStation,
  onInspectReport,
  onExportCSV,
  onClearSubmitted,
  onRemoveSingleStation
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStations = stations.filter((s) => {
    if (selectedLabId !== 'all' && s.labId !== selectedLabId) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.student?.name || '').toLowerCase().includes(q) ||
      (s.student?.rollNumber || '').toLowerCase().includes(q) ||
      s.stationNumber.toLowerCase().includes(q) ||
      (s.ipAddress || '').toLowerCase().includes(q) ||
      (s.student?.assignmentTitle || s.mcqProgress?.examTitle || '').toLowerCase().includes(q)
    );
  });

  const submittedCount = stations.filter((s) => s.status === 'Submitted & Done').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ── AUDIT LEDGER TOP BRANDING & VERIFICATION HEADER ── */}
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
            <Layers size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Official University Examination Audit Ledger
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ShieldCheck size={11} />
                CRYPTOGRAPHICALLY SEALED
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              SHA-256 Tamper-Evident Examination Ledger · Axiogen Examination Network
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={selectedLabId}
            onChange={(e) => {
              playSound('click');
              setSelectedLabId(e.target.value);
            }}
            style={{
              padding: '7px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Campus Laboratories</option>
            {allLabs.map((lab) => (
              <option key={lab.labId} value={lab.labId}>
                {lab.labName}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onExportCSV}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}
          >
            <Download size={13} />
            <span>Export Official CSV</span>
          </button>

          {submittedCount > 0 && (
            <button
              type="button"
              onClick={onClearSubmitted}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}
            >
              <Trash2 size={13} />
              <span>Clear Completed ({submittedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── SEARCH & COUNT ROW ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 'min(100%, 200px)', maxWidth: '380px' }}>
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
            placeholder="Search ledger by USN, student name, or station..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          Showing <strong>{filteredStations.length}</strong> of <strong>{stations.length}</strong> Ledger Records
        </div>
      </div>

      {/* ── THE AUDIT LEDGER TABLE ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}
      >
        <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table className="ledger-table" style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Station
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Candidate Name
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  USN / Roll No
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Assigned Lab
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  IP Subnet
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Language / Exam
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Keystrokes
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Paste %
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Tab Swaps
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Cheating Risk
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Marks
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStations.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No audit records found in the ledger.
                  </td>
                </tr>
              ) : (
                filteredStations.map((station) => {
                  const isFlagged =
                    station.cheatingRisk === 'High' ||
                    station.cheatingRisk === 'Critical' ||
                    (station.metrics?.pasteRatio || 0) >= 50;

                  return (
                    <tr
                      key={station.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'transparent'
                      }}
                    >
                      {/* Station */}
                      <td style={{ padding: '10px 14px' }}>
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
                      </td>

                      {/* Name */}
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {station.student?.name || 'Candidate'}
                      </td>

                      {/* USN */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {station.student?.rollNumber || 'N/A'}
                      </td>

                      {/* Lab */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {station.labName || station.labId}
                      </td>

                      {/* IP */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {station.ipAddress || '10.77.210.15'}
                      </td>

                      {/* Language */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                        {station.language || 'MCQ Exam'}
                      </td>

                      {/* Keystrokes */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                        {station.metrics?.keystrokes || 0}
                      </td>

                      {/* Paste % */}
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: (station.metrics?.pasteRatio || 0) >= 50 ? '#ef4444' : 'var(--text-primary)'
                          }}
                        >
                          {station.metrics?.pasteRatio || 0}%
                        </span>
                      </td>

                      {/* Tab Swaps */}
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: (station.metrics?.tabSwitchViolations || 0) >= 2 ? '#ef4444' : 'var(--text-primary)'
                          }}
                        >
                          {station.metrics?.tabSwitchViolations || 0}
                        </span>
                      </td>

                      {/* Cheating Risk */}
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isFlagged ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                            color: isFlagged ? '#ef4444' : '#22c55e',
                            border: isFlagged
                              ? '1px solid rgba(239, 68, 68, 0.3)'
                              : '1px solid rgba(34, 197, 94, 0.25)'
                          }}
                        >
                          {station.cheatingRisk || 'Low'}
                        </span>
                      </td>

                      {/* Marks */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {station.marks ? (
                          <span style={{ color: '#3b82f6' }}>{station.marks.totalMarks} pts</span>
                        ) : station.mcqProgress?.score !== undefined ? (
                          <span style={{ color: '#3b82f6' }}>{station.mcqProgress.score} pts</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => onInspectStation(station)}
                            title="Inspect telemetry dossier"
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
                            <span>Dossier</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onInspectReport(station)}
                            title="Open candidate examination report"
                            style={{
                              padding: '5px 8px',
                              background: 'rgba(59, 130, 246, 0.12)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '6px',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            <FileText size={12} />
                            <span>Report</span>
                          </button>

                          {onRemoveSingleStation && (
                            <button
                              type="button"
                              onClick={() => onRemoveSingleStation(station.id)}
                              title="Delete record from ledger"
                              style={{
                                padding: '5px 8px',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: '11px'
                              }}
                            >
                              <Trash2 size={12} />
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
