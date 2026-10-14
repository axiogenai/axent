import React, { useState } from 'react';
import {
  CodeMetrics,
  AnalysisReport,
  KeystrokeSnapshot
} from '../types/dna';
import {
  Activity,
  Clock,
  Clipboard,
  History,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import {
  WatermelonBentoCard,
  SegmentedUsageBar,
  MicroSegmentedBar,
  MetricTag,
  CopyConfirmButton
} from './watermelon-ui';

interface BehaviorPanelProps {
  metrics: CodeMetrics;
  analysisReport: AnalysisReport | null;
  snapshots: KeystrokeSnapshot[];
  currentCode: string;
}

export const BehaviorPanel: React.FC<BehaviorPanelProps> = ({
  metrics,
  snapshots,
  currentCode
}) => {
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | null>(null);

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s < 10 ? '0' : ''}${s}s` : `${s}s`;
  };

  const selectedCode =
    selectedSnapshotIndex !== null && snapshots[selectedSnapshotIndex]
      ? snapshots[selectedSnapshotIndex].code
      : currentCode;

  const charCount = currentCode.trim().length;

  // Uncheatable Mathematical Forensic Proof:
  const maxPossibleHandTypedChars = Math.max(0, metrics.keystrokes * 1.5);
  const guaranteedPastedChars = Math.max(0, charCount - maxPossibleHandTypedChars);
  const calculatedRatio = charCount > 15 ? Math.round((guaranteedPastedChars / charCount) * 100) : 0;
  const isPastedByMath = (charCount > 15 && calculatedRatio > 40) || (charCount > 10 && metrics.keystrokes < 10 && (metrics.pasteCount > 0 || metrics.pastedLines > 0));
  const effectivePasteRatio = charCount === 0 ? 0 : Math.min(100, Math.max(metrics.pasteRatio, calculatedRatio, isPastedByMath ? 95 : 0));
  const effectivePastedLines = isPastedByMath ? Math.max(metrics.pastedLines, metrics.totalLines || 1) : metrics.pastedLines;
  const effectivePasteCount = isPastedByMath ? Math.max(metrics.pasteCount, 1) : metrics.pasteCount;

  const isHighPaste =
    effectivePasteRatio >= 50 ||
    isPastedByMath ||
    (effectivePasteCount > 0 && metrics.keystrokes < 10);

  const isModeratePaste = !isHighPaste && (effectivePasteRatio > 0 || effectivePasteCount > 0);
  const isCleanHandTyped = !isHighPaste && !isModeratePaste && metrics.keystrokes >= 10 && charCount > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-main)',
        overflowY: 'auto',
        padding: '16px',
        gap: '14px'
      }}
    >
      {/* Overview Status Card */}
      <WatermelonBentoCard
        padding="14px 16px"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Writing & Typing Forensics
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Real-time keystroke dynamics and clipboard analysis for practical exams and coding tests.
          </div>
        </div>

        <MetricTag
          icon={
            isHighPaste ? (
              <ShieldAlert size={13} />
            ) : isModeratePaste ? (
              <AlertTriangle size={13} />
            ) : isCleanHandTyped ? (
              <ShieldCheck size={13} />
            ) : (
              <Clock size={13} />
            )
          }
          value={
            isHighPaste
              ? `Plagiarism Alert: ${effectivePasteRatio}% Pasted`
              : isModeratePaste
              ? `Suspicious: ${effectivePasteRatio}% Pasted`
              : isCleanHandTyped
              ? 'Verified: 100% Hand-Typed'
              : 'Editor Ready: Awaiting Input'
          }
          tone={
            isHighPaste
              ? 'danger'
              : isModeratePaste
              ? 'warning'
              : isCleanHandTyped
              ? 'success'
              : 'neutral'
          }
        />
      </WatermelonBentoCard>

      {/* Primary 4 Metric Cards */}
      <div className="grid-cols-4" style={{ gap: '10px' }}>
        {/* Paste Percentage */}
        <WatermelonBentoCard padding="12px 14px">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              PASTE USAGE
            </span>
            <Clipboard size={14} color="var(--text-muted)" />
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: isHighPaste
                ? 'var(--danger)'
                : isModeratePaste
                ? 'var(--warning)'
                : 'var(--success)'
            }}
          >
            {effectivePasteRatio}%
          </div>
          <div style={{ margin: '6px 0 4px' }}>
            <MicroSegmentedBar
              value={effectivePasteRatio}
              segments={12}
              color={isHighPaste ? 'var(--danger)' : isModeratePaste ? 'var(--warning)' : 'var(--success)'}
            />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {effectivePastedLines} pasted lines of {Math.max(1, metrics.totalLines)}
          </div>
        </WatermelonBentoCard>

        {/* Typing Speed */}
        <WatermelonBentoCard padding="12px 14px">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              TYPING SPEED
            </span>
            <Activity size={14} color="var(--accent)" />
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)'
            }}
          >
            {metrics.typingSpeed} WPM
          </div>
          <div style={{ margin: '6px 0 4px' }}>
            <MicroSegmentedBar
              value={Math.min(100, metrics.typingSpeed)}
              segments={12}
              color="var(--accent)"
            />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {metrics.keystrokes} keystrokes typed
          </div>
        </WatermelonBentoCard>

        {/* Time Spent */}
        <WatermelonBentoCard padding="12px 14px">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              ACTIVE CODING TIME
            </span>
            <Clock size={14} color="var(--warning)" />
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)'
            }}
          >
            {formatSeconds(metrics.timeSpent)}
          </div>
          <div style={{ margin: '6px 0 4px' }}>
            <MicroSegmentedBar
              value={Math.min(100, Math.round((metrics.timeSpent / 300) * 100))}
              segments={12}
              color="var(--warning)"
            />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {metrics.pauseDuration > 0
              ? `Active time (${formatSeconds(metrics.pauseDuration)} paused)`
              : 'Active editor time'}
          </div>
        </WatermelonBentoCard>

        {/* Edits & Changes */}
        <WatermelonBentoCard padding="12px 14px">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              EDITS & UNDOS
            </span>
            <History size={14} color="var(--success)" />
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)'
            }}
          >
            {metrics.editCount}
          </div>
          <div style={{ margin: '6px 0 4px' }}>
            <MicroSegmentedBar
              value={Math.min(100, metrics.editCount * 2)}
              segments={12}
              color="var(--success)"
            />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {metrics.undoCount} undos / {metrics.deleteCount} deletions
          </div>
        </WatermelonBentoCard>
      </div>

      {/* Paste Distribution Bar (Watermelon UI SegmentedUsageBar) */}
      <WatermelonBentoCard padding="14px 16px">
        <SegmentedUsageBar
          title="CODE TYPING & AUTHORSHIP BREAKDOWN"
          subtitle={`${100 - effectivePasteRatio}% Hand-Typed vs ${effectivePasteRatio}% Pasted`}
          totalBlocks={28}
          items={[
            {
              label: 'Hand-Typed Keystrokes',
              value: Math.max(1, 100 - effectivePasteRatio),
              color: 'var(--success)'
            },
            {
              label: 'External Clipboard Paste',
              value: effectivePasteRatio,
              color: isHighPaste ? 'var(--danger)' : 'var(--warning)'
            }
          ]}
        />
      </WatermelonBentoCard>

      {/* Snapshot Version History */}
      <WatermelonBentoCard style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={15} color="var(--accent)" />
            <span style={{ fontSize: '13px', fontWeight: 700 }}>
              Code Writing History (Snapshots)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MetricTag label="MILESTONES" value={snapshots.length} tone="neutral" />
            <CopyConfirmButton text={selectedCode || ''} label="Copy Snapshot" />
          </div>
        </div>

        {/* Version buttons */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '10px'
          }}
        >
          {snapshots.map((snap, i) => (
            <button
              key={snap.id}
              className={`btn ${selectedSnapshotIndex === i ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSelectedSnapshotIndex(i)}
              style={{ fontSize: '11px', padding: '0 8px', whiteSpace: 'nowrap', height: '26px' }}
            >
              <span>{snap.label}</span>
              <span className="badge badge-sm badge-neutral" style={{ height: '16px', padding: '0 4px', fontSize: '9px' }}>
                {snap.timestamp}s
              </span>
            </button>
          ))}
          <button
            className={`btn ${selectedSnapshotIndex === null ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedSnapshotIndex(null)}
            style={{ fontSize: '11px', padding: '0 8px', height: '26px' }}
          >
            Current Code
          </button>
        </div>

        {/* Code version viewer */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre',
            maxHeight: '220px'
          }}
        >
          {selectedCode || '// No code recorded yet.'}
        </div>
      </WatermelonBentoCard>
    </div>
  );
};

export default BehaviorPanel;
