import React, { useState } from 'react';
import {
  BarChart2,
  Search,
  Filter,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Award,
  Eye,
  GraduationCap,
  Building,
  TrendingUp,
  Printer
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import { playSound } from '../../utils/sounds';
import { SimpleSelect } from '../watermelon/Select';

interface AdminReportsViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  selectedLabId: string;
  setSelectedLabId: (labId: string) => void;
  onInspectReport: (station: CandidateStation) => void;
  onInspectStation: (station: CandidateStation) => void;
  onExportCSV: () => void;
}

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({
  stations,
  allLabs,
  selectedLabId,
  setSelectedLabId,
  onInspectReport,
  onInspectStation,
  onExportCSV
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Candidates who have submitted their exam or have evaluation marks
  const evaluatedCandidates = stations.filter(
    (s) => s.status === 'Submitted & Done' || s.marks || s.mcqProgress?.score !== undefined
  );

  const displayedReports = evaluatedCandidates.filter((s) => {
    if (selectedLabId !== 'all' && s.labId !== selectedLabId) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.student?.name || '').toLowerCase().includes(q) ||
      (s.student?.rollNumber || '').toLowerCase().includes(q) ||
      (s.student?.assignmentTitle || s.mcqProgress?.examTitle || '').toLowerCase().includes(q) ||
      s.stationNumber.toLowerCase().includes(q)
    );
  });

  // Calculate academic metrics
  const totalEvaluated = evaluatedCandidates.length;
  const totalScoreSum = evaluatedCandidates.reduce((acc, s) => {
    const score = s.marks ? s.marks.totalMarks : s.mcqProgress?.score ?? 0;
    return acc + score;
  }, 0);
  const avgScore = totalEvaluated > 0 ? (totalScoreSum / totalEvaluated).toFixed(1) : '0';

  const cleanIntegrityCount = evaluatedCandidates.filter(
    (s) => s.cheatingRisk !== 'High' && s.cheatingRisk !== 'Critical' && (s.metrics?.pasteRatio || 0) < 50
  ).length;
  const integrityPassRate = totalEvaluated > 0 ? Math.round((cleanIntegrityCount / totalEvaluated) * 100) : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ── ACADEMIC ANALYTICS SUMMARY ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
          gap: '12px',
          width: '100%'
        }}
      >
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
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
            <FileText size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Evaluated Tests
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{totalEvaluated}</div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
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
            <TrendingUp size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Average Score
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{avgScore} pts</div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
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
              Integrity Index
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{integrityPassRate}%</div>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR & SEARCH ── */}
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
              placeholder="Search reports by candidate name or USN..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onExportCSV}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}
          >
            <Download size={13} />
            <span>Export Batch CSV</span>
          </button>
        </div>
      </div>

      {/* ── REPORTS & EVALUATION TABLE ── */}
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
                  Examination Subject
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Score Obtained
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Anti-Cheat Verdict
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Submission Timestamp
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedReports.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No evaluated exam reports found yet. Reports appear here once candidates submit.
                  </td>
                </tr>
              ) : (
                displayedReports.map((station) => {
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
                      {/* Candidate Name */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {station.student?.name || 'Candidate'}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          {station.labName || station.labId} · {station.stationNumber}
                        </div>
                      </td>

                      {/* USN / Roll No */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {station.student?.rollNumber || 'N/A'}
                      </td>

                      {/* Examination Subject */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                        {station.student?.assignmentTitle || station.mcqProgress?.examTitle || 'University Examination'}
                      </td>

                      {/* Score Obtained */}
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

                      {/* Anti-Cheat Verdict */}
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
                          {isFlagged ? 'FLAGGED AUDIT' : 'CLEAN INTEGRITY'}
                        </span>
                      </td>

                      {/* Submission Timestamp */}
                      <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {station.lastActive || 'Today, 11:30 AM'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => onInspectReport(station)}
                            title="Open comprehensive student report"
                            style={{
                              padding: '5px 10px',
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
                            <span>Full Report</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onInspectStation(station)}
                            title="Inspect recorded keystrokes & telemetry"
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
                            <Eye size={12} />
                          </button>
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
