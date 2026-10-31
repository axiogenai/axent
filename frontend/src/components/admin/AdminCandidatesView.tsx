import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  FileText,
  Send,
  Trash2,
  UserCheck,
  Building,
  Monitor,
  PlusCircle,
  Download
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import { playSound } from '../../utils/sounds';
import { SimpleSelect } from '../watermelon/Select';

interface AdminCandidatesViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  selectedLabId: string;
  setSelectedLabId: (labId: string) => void;
  onInspectStation: (station: CandidateStation) => void;
  onInspectReport: (station: CandidateStation) => void;
  onSendWarning: (station: CandidateStation) => void;
  onConcludeAndFree: (station: CandidateStation) => void;
}

export const AdminCandidatesView: React.FC<AdminCandidatesViewProps> = ({
  stations,
  allLabs,
  selectedLabId,
  setSelectedLabId,
  onInspectStation,
  onInspectReport,
  onSendWarning,
  onConcludeAndFree,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'submitted' | 'flagged'>('all');

  const activeCount = stations.filter((s) => s.status !== 'Submitted & Done').length;
  const submittedCount = stations.filter((s) => s.status === 'Submitted & Done').length;
  const flaggedCount = stations.filter(
    (s) => s.cheatingRisk === 'High' || s.cheatingRisk === 'Critical' || (s.metrics?.pasteRatio || 0) >= 50
  ).length;

  const filteredCandidates = stations.filter((s) => {
    if (selectedLabId !== 'all' && s.labId !== selectedLabId) return false;

    if (statusFilter === 'active' && s.status === 'Submitted & Done') return false;
    if (statusFilter === 'submitted' && s.status !== 'Submitted & Done') return false;
    if (statusFilter === 'flagged') {
      const isFlagged =
        s.cheatingRisk === 'High' || s.cheatingRisk === 'Critical' || (s.metrics?.pasteRatio || 0) >= 50;
      if (!isFlagged) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.student?.name || '').toLowerCase().includes(q) ||
      (s.student?.rollNumber || '').toLowerCase().includes(q) ||
      s.stationNumber.toLowerCase().includes(q) ||
      (s.student?.department || '').toLowerCase().includes(q) ||
      (s.student?.assignmentTitle || s.mcqProgress?.examTitle || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* â”€â”€ TOP KPI METRIC CARDS â”€â”€ */}
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
            setStatusFilter('all');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: statusFilter === 'all' ? '1px solid #3b82f6' : '1px solid var(--border)',
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
            <Users size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Total Candidates
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{stations.length}</div>
          </div>
        </div>

        <div
          onClick={() => {
            playSound('click');
            setStatusFilter('active');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: statusFilter === 'active' ? '1px solid #22c55e' : '1px solid var(--border)',
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
            <Clock size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              In-Exam Active
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{activeCount}</div>
          </div>
        </div>

        <div
          onClick={() => {
            playSound('click');
            setStatusFilter('submitted');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: statusFilter === 'submitted' ? '1px solid #6366f1' : '1px solid var(--border)',
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
              background: 'rgba(99, 102, 241, 0.12)',
              color: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Submitted Tests
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{submittedCount}</div>
          </div>
        </div>

        <div
          onClick={() => {
            playSound('click');
            setStatusFilter('flagged');
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: statusFilter === 'flagged' ? '1px solid #ef4444' : '1px solid var(--border)',
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
            <AlertTriangle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Security Flags
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{flaggedCount}</div>
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
              placeholder="Search by student name, USN, or department..."
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

      {/* â”€â”€ CANDIDATE ROSTER TABLE â”€â”€ */}
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
                  Candidate
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  USN / Roll No
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Assigned Lab & Station
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Subject / Examination
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Status
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Cheating Risk
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Evaluation / Score
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No candidates found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((station) => {
                  const isSubmitted = station.status === 'Submitted & Done';
                  const isFlagged =
                    station.cheatingRisk === 'High' ||
                    station.cheatingRisk === 'Critical' ||
                    (station.metrics?.pasteRatio || 0) >= 50;

                  return (
                    <tr
                      key={station.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'transparent',
                        transition: 'background 0.1s ease'
                      }}
                    >
                      {/* Candidate Name */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: 'var(--text-primary)'
                            }}
                          >
                            {(station.student?.name || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {station.student?.name || 'Unassigned'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                              {station.student?.department || 'Computer Science'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* USN / Roll Number */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {station.student?.rollNumber || 'N/A'}
                      </td>

                      {/* Lab & Station */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontFamily: 'var(--font-mono)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {station.stationNumber}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {station.labName || station.labId}
                          </span>
                        </div>
                      </td>

                      {/* Subject / Examination */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {station.student?.assignmentTitle || station.mcqProgress?.examTitle || 'Semester Examination'}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          {station.language || 'MCQ Exam'}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: isSubmitted ? 'rgba(59, 130, 246, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                            color: isSubmitted ? '#3b82f6' : '#22c55e',
                            border: isSubmitted
                              ? '1px solid rgba(59, 130, 246, 0.25)'
                              : '1px solid rgba(34, 197, 94, 0.25)'
                          }}
                        >
                          {isSubmitted ? 'SUBMITTED' : 'IN-EXAM'}
                        </span>
                      </td>

                      {/* Cheating Risk */}
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: isFlagged ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                            color: isFlagged ? '#ef4444' : '#22c55e',
                            border: isFlagged
                              ? '1px solid rgba(239, 68, 68, 0.3)'
                              : '1px solid rgba(34, 197, 94, 0.25)'
                          }}
                        >
                          {station.cheatingRisk || 'Low'} ({station.metrics?.pasteRatio || 0}% Paste)
                        </span>
                      </td>

                      {/* Score / Evaluation */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {station.marks ? (
                          <span style={{ color: 'var(--text-primary)' }}>
                            {station.marks.totalMarks} pts
                          </span>
                        ) : station.mcqProgress?.score !== undefined ? (
                          <span style={{ color: 'var(--text-primary)' }}>
                            {station.mcqProgress.score} pts
                          </span>
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
                            title="Inspect candidate telemetry"
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
                            <span>Inspect</span>
                          </button>

                          {isSubmitted ? (
                            <button
                              type="button"
                              onClick={() => onInspectReport(station)}
                              title="View official candidate report"
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
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSendWarning(station)}
                              title="Send proctor warning notice"
                              style={{
                                padding: '5px 8px',
                                background: 'rgba(234, 179, 8, 0.1)',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                borderRadius: '6px',
                                color: '#eab308',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 600
                              }}
                            >
                              <Send size={12} />
                              <span>Warn</span>
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
