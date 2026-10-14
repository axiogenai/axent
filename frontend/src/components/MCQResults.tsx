import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart2, Users, Award, CheckCircle, XCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Download, Eye, Filter,
  MessageCircle, Copy, Check, ExternalLink, X
} from 'lucide-react';
import { MCQAttempt, MCQExamConfig } from '../types/mcq';
import { getAllAttempts, getAllExams, gradeAttempt, onMcqDataChanged } from '../services/mcqService';
import { SimpleSelect } from './watermelon/Select';

// ── Attempt row ───────────────────────────────────────────────────────────────
const AttemptRow: React.FC<{ attempt: MCQAttempt; showExplanations: boolean }> = ({ attempt, showExplanations }) => {
  const [expanded, setExpanded] = useState(false);

  const pct = attempt.percentageScore ?? 0;
  const score = attempt.score ?? 0;
  const maxScore = attempt.maxScore;
  const scoreColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  const isDisqualified = attempt.status === 'ABANDONED' &&
    attempt.infractionLog?.some((item) => item.event === 'DISQUALIFIED_BY_PROCTOR');
  const displayStatus = isDisqualified ? 'DISQUALIFIED' : attempt.status;
  const statusColor = displayStatus === 'SUBMITTED' ? 'var(--success)' : displayStatus === 'TIMED_OUT' || isDisqualified ? 'var(--warning)' : 'var(--text-muted)';

  // Compute per-question detail if submitted
  const grade = useMemo(() => {
    if (attempt.status === 'IN_PROGRESS') return null;
    return gradeAttempt(attempt);
  }, [attempt]);

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px' }}>
        {/* Student info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{attempt.studentName}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{attempt.studentRoll}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {attempt.studentDept} · {attempt.studentSem} · Div {attempt.studentDiv || 'A'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: statusColor, fontWeight: 600, textTransform: 'uppercase' }}>{displayStatus}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{new Date(attempt.startTime).toLocaleString()}</span>
            {attempt.tabSwitchCount > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--warning)' }}>
                <AlertTriangle size={10} style={{ verticalAlign: 'middle' }} /> {attempt.tabSwitchCount} violations
              </span>
            )}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: scoreColor }}>{score}/{maxScore}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pct}%</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-pill)', padding: '2px 8px', color: 'var(--success)' }}>
            {attempt.correctCount ?? 0}✓
          </span>
          <span style={{ fontSize: '11px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-pill)', padding: '2px 8px', color: 'var(--danger)' }}>
            {attempt.wrongCount ?? 0}✗
          </span>
        </div>

        <button onClick={() => setExpanded((e) => !e)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && grade && showExplanations && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {grade.perQuestion.map((pq, idx) => (
            <div key={pq.questionId} style={{
              padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              background: pq.isCorrect ? 'var(--success-bg)' : pq.selectedOptionId ? 'var(--danger-bg)' : 'var(--bg-elevated)',
              border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', flex: 1 }}>
                  Q{idx + 1}. {pq.question}
                </p>
                <span style={{ fontSize: '12px', fontWeight: 700, color: pq.marksAwarded > 0 ? 'var(--success)' : pq.marksAwarded < 0 ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }}>
                  {pq.marksAwarded > 0 ? `+${pq.marksAwarded}` : String(pq.marksAwarded)}
                </span>
              </div>
              {!pq.isCorrect && pq.selectedOptionId && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--danger)' }}>Answered: {pq.selectedText}</p>
              )}
              {!pq.selectedOptionId && <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Not answered</p>}
              {!pq.isCorrect && <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--success)' }}>Correct: {pq.correctText}</p>}
            </div>
          ))}
        </div>
      )}

      {expanded && attempt.status === 'IN_PROGRESS' && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-surface)' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>This attempt is still in progress. Detailed results will be available after submission.</p>
        </div>
      )}
    </div>
  );
};

// ── Main Results Component ────────────────────────────────────────────────────
export const MCQResults: React.FC = () => {
  const [selectedExamId, setSelectedExamId] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedSem, setSelectedSem] = useState<string>('ALL');
  const [selectedDiv, setSelectedDiv] = useState<string>('ALL');

  const [exams, setExams] = useState<MCQExamConfig[]>(() => getAllExams());
  const [allAttempts, setAllAttempts] = useState<MCQAttempt[]>(() => getAllAttempts());

  useEffect(() => {
    const refresh = () => {
      setExams(getAllExams());
      setAllAttempts(getAllAttempts());
    };
    const unsubscribe = onMcqDataChanged(refresh);
    window.addEventListener('storage', refresh);
    refresh();
    return () => {
      unsubscribe();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filteredAttempts = useMemo(() => {
    return allAttempts.filter((a) => {
      if (selectedExamId !== 'ALL' && a.examId !== selectedExamId) return false;
      if (selectedDept !== 'ALL' && a.studentDept !== selectedDept) return false;
      if (selectedSem !== 'ALL' && a.studentSem !== selectedSem) return false;
      if (selectedDiv !== 'ALL' && (a.studentDiv || 'A') !== selectedDiv) return false;
      return true;
    });
  }, [allAttempts, selectedExamId, selectedDept, selectedSem, selectedDiv]);

  const submittedAttempts = filteredAttempts.filter((a) => a.status !== 'IN_PROGRESS');

  const stats = useMemo(() => {
    if (submittedAttempts.length === 0) return null;
    const scores = submittedAttempts.map((a) => a.percentageScore ?? 0);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const passed = submittedAttempts.filter((a) => (a.percentageScore ?? 0) >= 40).length;
    const violations = submittedAttempts.reduce((s, a) => s + a.tabSwitchCount, 0);
    return { avg: Math.round(avg * 10) / 10, highest, lowest, passed, violations };
  }, [submittedAttempts]);

  const showExplanations = useMemo(() => {
    if (selectedExamId === 'ALL') return true;
    return exams.find((e) => e.id === selectedExamId)?.showExplanationsAfterSubmit ?? true;
  }, [exams, selectedExamId]);

  // Export CSV with Dept, Semester, Division
  const exportCSV = () => {
    if (submittedAttempts.length === 0) return;
    const header = 'Name,Roll,Dept,Semester,Division,Exam,Score,MaxScore,Percentage,Correct,Wrong,Unanswered,TabSwitches,UnfocusedSec,Status,SubmitTime';
    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = submittedAttempts.map((a) => [
      a.studentName, a.studentRoll, a.studentDept, a.studentSem, a.studentDiv || 'A', a.examTitle,
      a.score ?? 0, a.maxScore, a.percentageScore ?? 0,
      a.correctCount ?? 0, a.wrongCount ?? 0, a.unansweredCount ?? 0,
      a.tabSwitchCount, Math.round(a.unfocusedSeconds),
      a.status === 'ABANDONED' && a.infractionLog?.some((item) => item.event === 'DISQUALIFIED_BY_PROCTOR') ? 'DISQUALIFIED' : a.status,
      a.submitTime ? new Date(a.submitTime).toISOString() : '',
    ].map(csvCell).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mcq-results-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const selectedExam = useMemo(() => {
    if (selectedExamId === 'ALL') return null;
    return exams.find((e) => e.id === selectedExamId) || null;
  }, [exams, selectedExamId]);

  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  const whatsAppText = useMemo(() => {
    if (submittedAttempts.length === 0) return '';
    const examTitle = selectedExam ? selectedExam.title : (submittedAttempts[0]?.examTitle || 'MCQ Examination');
    const deptStr = selectedDept !== 'ALL' ? selectedDept : 'All Depts';
    const semStr = selectedSem !== 'ALL' ? selectedSem : 'All Sems';
    const divStr = selectedDiv !== 'ALL' ? `Div ${selectedDiv}` : '';
    const classTag = [deptStr, semStr, divStr].filter(Boolean).join(' · ');

    const scores = submittedAttempts.map((a) => a.percentageScore ?? 0);
    const avg = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;
    const highest = Math.max(...scores);
    const passed = submittedAttempts.filter((a) => (a.percentageScore ?? 0) >= 40).length;
    const passRate = Math.round((passed / submittedAttempts.length) * 100);

    // Sort by score desc for ranking
    const sorted = [...submittedAttempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topPerformers = sorted.slice(0, 5);

    let msg = `🎓 *EXAMINATION RESULTS: ${examTitle.toUpperCase()}*\n`;
    msg += `🏛️ *Batch:* ${classTag}\n`;
    msg += `📅 *Date:* ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}\n`;
    msg += `👥 *Total Submissions:* ${submittedAttempts.length} Candidates\n`;
    msg += `📊 *Average Score:* ${avg}% | *Highest:* ${highest}%\n`;
    msg += `✅ *Pass Percentage:* ${passRate}% (${passed}/${submittedAttempts.length})\n\n`;

    msg += `🏆 *TOP PERFORMERS:*\n`;
    topPerformers.forEach((p, idx) => {
      msg += `${idx + 1}. *${p.studentName}* (${p.studentRoll}) — ${p.score}/${p.maxScore} (${p.percentageScore}%)\n`;
    });

    msg += `\n📋 *CANDIDATE SCORECARD LEDGER:*\n`;
    sorted.forEach((p) => {
      const isPass = (p.percentageScore ?? 0) >= 40;
      msg += `• *${p.studentRoll}* | ${p.studentName}: ${p.score}/${p.maxScore} (${p.percentageScore}%) ${isPass ? '✓' : '✗'}\n`;
    });

    msg += `\n_Official Examination Ledger · CODE-DNA Academic Platform_`;
    return msg;
  }, [submittedAttempts, selectedExam, selectedDept, selectedSem, selectedDiv]);

  const handleCopyWhatsApp = () => {
    navigator.clipboard.writeText(whatsAppText);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(whatsAppText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handleDownloadWhatsAppText = () => {
    const blob = new Blob([whatsAppText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-results-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const examOptions = [
    { value: 'ALL', label: 'All Exams' },
    ...exams.map((e) => ({ value: e.id, label: e.title }))
  ];

  const deptOptions = [
    { value: 'ALL', label: 'All Departments' },
    { value: 'CSE', label: 'CSE' },
    { value: 'AIML', label: 'AIML' },
    { value: 'AIDS', label: 'AIDS' },
    { value: 'ECE', label: 'ECE' },
    { value: 'EEE', label: 'EEE' },
    { value: 'MECH', label: 'MECH' },
    { value: 'CIVIL', label: 'CIVIL' }
  ];

  const semOptions = [
    { value: 'ALL', label: 'All Semesters' },
    { value: '1st Sem', label: '1st Sem' },
    { value: '2nd Sem', label: '2nd Sem' },
    { value: '3rd Sem', label: '3rd Sem' },
    { value: '4th Sem', label: '4th Sem' },
    { value: '5th Sem', label: '5th Sem' },
    { value: '6th Sem', label: '6th Sem' },
    { value: '7th Sem', label: '7th Sem' },
    { value: '8th Sem', label: '8th Sem' }
  ];

  const divOptions = [
    { value: 'ALL', label: 'All Divisions' },
    { value: 'A', label: 'Div A' },
    { value: 'B', label: 'Div B' },
    { value: 'C', label: 'Div C' },
    { value: 'D', label: 'Div D' },
    { value: 'E', label: 'Div E' },
    { value: 'F', label: 'Div F' }
  ];

  return (
    <div>
      {/* Filter & Export Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>MCQ Exam Results</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>{filteredAttempts.length} candidate attempts matching filters</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowWhatsAppModal(true)}
              disabled={submittedAttempts.length === 0}
              title="Export and format results to send on class WhatsApp group"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 14px',
                cursor: submittedAttempts.length === 0 ? 'not-allowed' : 'pointer',
                color: submittedAttempts.length === 0 ? 'var(--text-dim)' : 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <MessageCircle size={14} color="var(--accent)" />
              <span>Export for WhatsApp</span>
            </button>
            <button onClick={exportCSV} disabled={submittedAttempts.length === 0} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '8px 14px',
              cursor: submittedAttempts.length === 0 ? 'not-allowed' : 'pointer',
              color: submittedAttempts.length === 0 ? 'var(--text-dim)' : 'var(--text-secondary)', fontSize: '13px',
            }}>
              <Download size={13} /> Export Filtered CSV
            </button>
          </div>
        </div>

        {selectedExam?.resultDeclarationMode === 'WHATSAPP_GROUP' && (
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircle size={15} color="var(--accent)" />
              <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 600 }}>
                This exam is configured for WhatsApp Group Release.
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Candidate scores are held on screen ("Hold tight, results will be deployed soon"). Export and send results to your class WhatsApp group.
              </span>
            </div>
            <button
              onClick={() => setShowWhatsAppModal(true)}
              disabled={submittedAttempts.length === 0}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 12px',
                color: 'var(--accent-contrast)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: submittedAttempts.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <MessageCircle size={12} /> Send on WhatsApp
            </button>
          </div>
        )}

        {/* Filter controls with SimpleSelect */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Filter by Exam</label>
            <SimpleSelect
              value={selectedExamId}
              onChange={(val) => setSelectedExamId(String(val))}
              options={examOptions}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Department</label>
            <SimpleSelect
              value={selectedDept}
              onChange={(val) => setSelectedDept(String(val))}
              options={deptOptions}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Semester</label>
            <SimpleSelect
              value={selectedSem}
              onChange={(val) => setSelectedSem(String(val))}
              options={semOptions}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Division</label>
            <SimpleSelect
              value={selectedDiv}
              onChange={(val) => setSelectedDiv(String(val))}
              options={divOptions}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Avg Score', value: `${stats.avg}%`, color: 'var(--text-primary)' },
            { label: 'Highest', value: `${stats.highest}%`, color: 'var(--success)' },
            { label: 'Lowest', value: `${stats.lowest}%`, color: 'var(--danger)' },
            { label: 'Passed', value: `${stats.passed}/${submittedAttempts.length}`, color: 'var(--success)' },
            { label: 'Violations', value: String(stats.violations), color: stats.violations > 0 ? 'var(--warning)' : 'var(--text-dim)' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Attempts list */}
      {filteredAttempts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <BarChart2 size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>No attempts yet</p>
          <p style={{ fontSize: '13px' }}>Students haven't taken any MCQ exams yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredAttempts
            .slice()
            .sort((a, b) => b.startTime - a.startTime)
            .map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} showExplanations={showExplanations} />
            ))}
        </div>
      )}

      {/* WhatsApp Export Modal */}
      {showWhatsAppModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '640px',
              width: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}
          >
            {/* Header */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={18} color="var(--accent)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Export Results for WhatsApp Group
                  </h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                    Formatted for direct posting into your department or semester class group
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWhatsAppModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Preview Box */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                  WhatsApp Message Preview ({submittedAttempts.length} candidate submissions)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  Formatted with WhatsApp bold (*) and bullet points
                </span>
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: '14px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                  maxHeight: '360px',
                  overflowY: 'auto'
                }}
              >
                {whatsAppText}
              </pre>
            </div>

            {/* Footer Actions */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                background: 'var(--bg-surface)'
              }}
            >
              <button
                onClick={handleDownloadWhatsAppText}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 14px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <Download size={13} />
                <span>Save as .txt</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCopyWhatsApp}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: copiedWhatsApp ? 'var(--success-bg)' : 'var(--bg-elevated)',
                    border: `1px solid ${copiedWhatsApp ? 'var(--success-border)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: copiedWhatsApp ? 'var(--success)' : 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  {copiedWhatsApp ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedWhatsApp ? 'Copied to Clipboard!' : 'Copy Formatted Text'}</span>
                </button>

                <button
                  onClick={handleOpenWhatsApp}
                  className="btn btn-primary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                >
                  <ExternalLink size={13} />
                  <span>Open in WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCQResults;
