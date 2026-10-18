import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart2, Users, Award, CheckCircle2, XCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Download, Eye, Filter,
  MessageCircle, Copy, Check, ExternalLink, X, BookOpen,
  ShieldCheck, ShieldAlert, Search, RefreshCw, Calendar, ArrowUpDown
} from 'lucide-react';
import { MCQAttempt, MCQExamConfig } from '../types/mcq';
import { getAllAttempts, getAllExams, gradeAttempt, onMcqDataChanged, syncFromSupabase } from '../services/mcqService';
import { SimpleSelect } from './watermelon/Select';

// ── Enhanced Attempt Row ───────────────────────────────────────────────────────
const AttemptRow: React.FC<{ attempt: MCQAttempt }> = ({ attempt }) => {
  const [expanded, setExpanded] = useState(false);

  const pct = attempt.percentageScore ?? 0;
  const score = attempt.score ?? 0;
  const maxScore = attempt.maxScore;
  const scoreColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  const isDisqualified = attempt.status === 'ABANDONED' &&
    attempt.infractionLog?.some((item) => item.event === 'DISQUALIFIED_BY_PROCTOR');
  const displayStatus = isDisqualified ? 'DISQUALIFIED' : attempt.status;
  const statusColor = displayStatus === 'SUBMITTED' ? 'var(--success)' : displayStatus === 'TIMED_OUT' || isDisqualified ? 'var(--danger)' : displayStatus === 'IN_PROGRESS' ? 'var(--accent)' : 'var(--text-muted)';

  // Grade computation (always available for review in paper setter / ledger)
  const grade = useMemo(() => {
    return gradeAttempt(attempt);
  }, [attempt]);

  const initials = (attempt.studentName || 'ST')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Duration taken
  const durationMs = (attempt.submitTime || Date.now()) - attempt.startTime;
  const durationMins = Math.max(0, Math.floor(durationMs / 60000));
  const durationSecs = Math.max(0, Math.floor((durationMs % 60000) / 1000));
  const durationStr = `${durationMins}m ${durationSecs}s`;

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', transition: 'border-color 0.15s ease' }}>
      {/* Primary Row Grid */}
      <div className="mcq-attempt-grid">
        {/* 1. Candidate Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12.5px',
              fontWeight: 800,
              color: 'var(--accent)',
              flexShrink: 0
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {attempt.studentName}
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  padding: '1px 5px',
                  borderRadius: '3px'
                }}
              >
                USN: {attempt.studentRoll || 'N/A'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '5px', alignItems: 'center' }}>
              <span>{attempt.studentDept}</span>
              <span>•</span>
              <span>{attempt.studentSem}</span>
              <span>•</span>
              <span>Div {attempt.studentDiv || 'A'}</span>
            </div>
          </div>
        </div>

        {/* 2. Examination Session */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '2px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden'
            }}
          >
            <BookOpen size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{attempt.examTitle || 'MCQ Exam'}</span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            Exam ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{attempt.examId}</span>
          </div>
        </div>

        {/* 3. Session Timing & Duration */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '2px 6px',
                borderRadius: 'var(--radius-pill)',
                color: statusColor,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)'
              }}
            >
              {displayStatus}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={10} /> {durationStr}
            </span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            {new Date(attempt.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* 4. Proctoring / Anti-Cheat Audit */}
        <div>
          {isDisqualified ? (
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ShieldAlert size={11} /> Disqualified
            </span>
          ) : attempt.tabSwitchCount > 0 ? (
            <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={11} /> {attempt.tabSwitchCount} {attempt.tabSwitchCount === 1 ? 'Strike' : 'Strikes'} ({Math.round(attempt.unfocusedSeconds || 0)}s)
            </span>
          ) : (
            <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={11} /> Clean Session
            </span>
          )}
        </div>

        {/* 5. Score & Performance */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '3px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: scoreColor }}>
              {score}/{maxScore}
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: scoreColor, background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 'var(--radius-pill)' }}>
              {pct}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 600, background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-xs)', padding: '1px 5px', color: 'var(--success)' }}>
              {attempt.correctCount ?? 0} Correct
            </span>
            <span style={{ fontSize: '9.5px', fontWeight: 600, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-xs)', padding: '1px 5px', color: 'var(--danger)' }}>
              {attempt.wrongCount ?? 0} Wrong
            </span>
            {(attempt.unansweredCount ?? 0) > 0 && (
              <span style={{ fontSize: '9.5px', fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '1px 5px', color: 'var(--text-muted)' }}>
                {attempt.unansweredCount} Skipped
              </span>
            )}
          </div>
        </div>

        {/* 6. Expand / Inspect Button */}
        <div style={{ textAlign: 'right' }}>
          <button
            onClick={() => setExpanded((e) => !e)}
            title="Inspect Question-by-Question Audit"
            style={{
              background: expanded ? 'var(--bg-surface)' : 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 8px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            <Eye size={12} color="var(--accent)" />
            <span>{expanded ? 'Hide' : 'Audit'}</span>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* Expanded Question Breakdown Drawer */}
      {expanded && grade && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              Candidate Question Response Audit ({grade.perQuestion.length} Questions)
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Full Paper Setter Audit Key
            </span>
          </div>

          {grade.perQuestion.map((pq, idx) => (
            <div
              key={pq.questionId}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: pq.isCorrect ? 'var(--success-bg)' : pq.selectedOptionId ? 'var(--danger-bg)' : 'var(--bg-elevated)',
                border: `1px solid ${pq.isCorrect ? 'var(--success-border)' : pq.selectedOptionId ? 'var(--danger-border)' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '5px' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.4 }}>
                  Q{idx + 1}. {pq.question}
                </p>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: pq.marksAwarded > 0 ? 'var(--success)' : pq.marksAwarded < 0 ? 'var(--danger)' : 'var(--text-muted)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-xs)',
                    flexShrink: 0
                  }}
                >
                  {pq.marksAwarded > 0 ? `+${pq.marksAwarded} Marks` : `${pq.marksAwarded} Marks`}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                {pq.selectedOptionId ? (
                  <div style={{ color: pq.isCorrect ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {pq.isCorrect ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    <span><strong>Candidate Choice:</strong> {pq.selectedText}</span>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Candidate skipped this question (unanswered)
                  </div>
                )}

                {!pq.isCorrect && (
                  <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CheckCircle2 size={12} />
                    <span><strong>Official Correct Answer:</strong> {pq.correctText}</span>
                  </div>
                )}

                {pq.explanation && (
                  <div style={{ marginTop: '4px', padding: '5px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--text-secondary)', fontSize: '10.5px', lineHeight: 1.4 }}>
                    <strong>Explanation:</strong> {pq.explanation}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Infraction log if any */}
          {attempt.infractionLog && attempt.infractionLog.length > 0 && (
            <div style={{ marginTop: '6px', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--warning)', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <AlertTriangle size={12} /> Proctoring Violation Audit Log ({attempt.infractionLog.length} Events)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {attempt.infractionLog.map((log, i) => (
                  <div key={i} style={{ fontSize: '10.5px', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span style={{ fontWeight: 600 }}>{log.event}:</span>
                    <span>{log.details || 'Window unfocused or fullscreen exited'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {expanded && attempt.status === 'IN_PROGRESS' && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg-surface)' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            This attempt is currently active. Real-time scores and response breakdown will finalize upon student submission or session time-out.
          </p>
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [exams, setExams] = useState<MCQExamConfig[]>(() => getAllExams());
  const [allAttempts, setAllAttempts] = useState<MCQAttempt[]>(() => getAllAttempts());

  const handleSyncCloud = async () => {
    setIsSyncing(true);
    try {
      await syncFromSupabase();
      setExams(getAllExams());
      setAllAttempts(getAllAttempts());
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const refresh = () => {
      setExams(getAllExams());
      setAllAttempts(getAllAttempts());
    };
    const unsubscribe = onMcqDataChanged(refresh);
    window.addEventListener('storage', refresh);
    
    // Auto-sync from Supabase on mount
    void handleSyncCloud();

    return () => {
      unsubscribe();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filteredAttempts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAttempts.filter((a) => {
      if (selectedExamId !== 'ALL' && a.examId !== selectedExamId) return false;
      if (selectedDept !== 'ALL' && a.studentDept !== selectedDept) return false;
      if (selectedSem !== 'ALL' && a.studentSem !== selectedSem) return false;
      if (selectedDiv !== 'ALL' && (a.studentDiv || 'A') !== selectedDiv) return false;
      if (q) {
        const matchesName = a.studentName.toLowerCase().includes(q);
        const matchesRoll = a.studentRoll.toLowerCase().includes(q);
        const matchesExam = (a.examTitle || '').toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesExam) return false;
      }
      return true;
    });
  }, [allAttempts, selectedExamId, selectedDept, selectedSem, selectedDiv, searchQuery]);

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

  // Export CSV
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

    const sorted = [...submittedAttempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topPerformers = sorted.slice(0, 5);

    let msg = `*EXAMINATION RESULTS: ${examTitle.toUpperCase()}*\n`;
    msg += `*Batch:* ${classTag}\n`;
    msg += `*Date:* ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}\n`;
    msg += `*Total Submissions:* ${submittedAttempts.length} Candidates\n`;
    msg += `*Average Score:* ${avg}% | *Highest:* ${highest}%\n`;
    msg += `*Pass Percentage:* ${passRate}% (${passed}/${submittedAttempts.length})\n\n`;

    msg += `*TOP PERFORMERS:*\n`;
    topPerformers.forEach((p, idx) => {
      msg += `${idx + 1}. *${p.studentName}* (${p.studentRoll}) — ${p.score}/${p.maxScore} (${p.percentageScore}%)\n`;
    });

    msg += `\n*CANDIDATE SCORECARD LEDGER:*\n`;
    sorted.forEach((p) => {
      const isPass = (p.percentageScore ?? 0) >= 40;
      msg += `• *${p.studentRoll}* | ${p.studentName}: ${p.score}/${p.maxScore} (${p.percentageScore}%) ${isPass ? 'PASS' : 'FAIL'}\n`;
    });

    msg += `\n_Official Examination Ledger · Axent Academic Platform_`;
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

  const deptOptions = useMemo(() => {
    const setDepts = new Set<string>();
    allAttempts.forEach((a) => {
      if (a.studentDept?.trim()) setDepts.add(a.studentDept.trim());
    });
    const sorted = Array.from(setDepts).sort();
    return [
      { value: 'ALL', label: 'All Departments' },
      ...sorted.map((d) => ({ value: d, label: d }))
    ];
  }, [allAttempts]);

  const semOptions = useMemo(() => {
    const setSems = new Set<string>();
    allAttempts.forEach((a) => {
      if (a.studentSem?.trim()) setSems.add(a.studentSem.trim());
    });
    const sorted = Array.from(setSems).sort();
    return [
      { value: 'ALL', label: 'All Semesters' },
      ...sorted.map((s) => ({ value: s, label: s }))
    ];
  }, [allAttempts]);

  const divOptions = useMemo(() => {
    const setDivs = new Set<string>();
    allAttempts.forEach((a) => {
      if (a.studentDiv?.trim()) setDivs.add(a.studentDiv.trim());
    });
    const sorted = Array.from(setDivs).sort();
    return [
      { value: 'ALL', label: 'All Divisions' },
      ...sorted.map((div) => ({ value: div, label: `Div ${div}` }))
    ];
  }, [allAttempts]);

  return (
    <div>
      {/* Filter & Export Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Official Examination Ledger
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
              {filteredAttempts.length} candidate attempts recorded • Real-time score verification & audit
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSyncCloud}
              disabled={isSyncing}
              title="Synchronize latest attempts from Supabase Cloud"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', fontSize: '12.5px' }}
            >
              <RefreshCw size={13} className={isSyncing ? 'spinner-icon' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
            </button>

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
                padding: '0 14px',
                height: '34px',
                cursor: submittedAttempts.length === 0 ? 'not-allowed' : 'pointer',
                color: submittedAttempts.length === 0 ? 'var(--text-dim)' : 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <MessageCircle size={14} color="var(--accent)" />
              <span>Export for WhatsApp</span>
            </button>

            <button
              onClick={exportCSV}
              disabled={submittedAttempts.length === 0}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', fontSize: '12.5px' }}
            >
              <Download size={13} />
              <span>Export CSV</span>
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
                Candidate scores are held on terminal. Use the Export button above to announce results.
              </span>
            </div>
            <button
              onClick={() => setShowWhatsAppModal(true)}
              disabled={submittedAttempts.length === 0}
              className="btn btn-primary btn-sm"
              style={{ padding: '4px 12px', fontSize: '11.5px', gap: '4px' }}
            >
              <MessageCircle size={12} /> Send on WhatsApp
            </button>
          </div>
        )}

        {/* Search & Filter Controls Grid */}
        <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Search bar */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search candidate name, USN / Roll number, or exam title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 12px 0 34px',
                fontSize: '12.5px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Filter dropdowns with SimpleSelect */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Filter by Exam
              </label>
              <SimpleSelect
                value={selectedExamId}
                onChange={(val) => setSelectedExamId(String(val))}
                options={examOptions}
              />
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Department
              </label>
              <SimpleSelect
                value={selectedDept}
                onChange={(val) => setSelectedDept(String(val))}
                options={deptOptions}
              />
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Semester
              </label>
              <SimpleSelect
                value={selectedSem}
                onChange={(val) => setSelectedSem(String(val))}
                options={semOptions}
              />
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Division
              </label>
              <SimpleSelect
                value={selectedDiv}
                onChange={(val) => setSelectedDiv(String(val))}
                options={divOptions}
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '18px' }}>
          {[
            { label: 'Avg Score', value: `${stats.avg}%`, color: 'var(--text-primary)' },
            { label: 'Highest', value: `${stats.highest}%`, color: 'var(--success)' },
            { label: 'Lowest', value: `${stats.lowest}%`, color: 'var(--danger)' },
            { label: 'Passed', value: `${stats.passed}/${submittedAttempts.length}`, color: 'var(--success)' },
            { label: 'Violations', value: String(stats.violations), color: stats.violations > 0 ? 'var(--warning)' : 'var(--text-dim)' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Attempts Ledger List */}
      {filteredAttempts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <BarChart2 size={36} style={{ marginBottom: '12px', opacity: 0.35, color: 'var(--text-muted)' }} />
          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            No matching candidate attempts found
          </p>
          <p style={{ fontSize: '12.5px', margin: 0 }}>
            {searchQuery ? 'Try clearing your search query or reset filter dropdowns.' : 'Students have not taken or submitted this examination sitting yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Table Header Row */}
          <div className="mcq-ledger-header">
            <span>Candidate & USN</span>
            <span>Exam Session</span>
            <span>Timing & Duration</span>
            <span>Integrity / Audit</span>
            <span>Score & Accuracy</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {filteredAttempts
            .slice()
            .sort((a, b) => b.startTime - a.startTime)
            .map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
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
                  Plain text formatted with bold (*)
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
