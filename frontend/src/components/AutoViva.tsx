import React, { useState, useEffect } from 'react';
import {
  VivaQuestion,
  VivaAnswer,
  VivaEvaluation,
  AnalysisReport
} from '../types/dna';
import {
  generateVivaQuestions,
  evaluateVivaAnswers
} from '../services/groqService';
import { playSound } from '../utils/sounds';
import {
  MessageSquare,
  Send,
  RefreshCw,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Award,
  ChevronRight
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AutoVivaProps {
  code: string;
  language: string;
  analysisReport: AnalysisReport | null;
  onVivaComplete?: (evaluation: VivaEvaluation) => void;
  isLocked?: boolean;
}

// ---------------------------------------------------------------------------
// Inline style helpers (bento-card & metric-tag — no external imports)
// ---------------------------------------------------------------------------
const bentoCard: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
};

const accentBentoCard = (_accentColor?: string): React.CSSProperties => ({
  ...bentoCard
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricTagProps {
  label: string;
  value: string | number;
  color?: string;
}

const MetricTag: React.FC<MetricTagProps> = ({ label, value, color = 'var(--text-primary)' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      gap: '12px'
    }}
  >
    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
    <span
      style={{
        fontSize: '13px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color
      }}
    >
      {value}
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Progress dots
// ---------------------------------------------------------------------------
interface ProgressDotsProps {
  total: number;
  current: number;
}

const ProgressDots: React.FC<ProgressDotsProps> = ({ total, current }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        style={{
          width: i === current ? '20px' : '7px',
          height: '7px',
          borderRadius: '9999px',
          background: i < current
            ? 'var(--success)'
            : i === current
            ? 'var(--accent)'
            : 'var(--border-strong)',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const AutoViva: React.FC<AutoVivaProps> = ({
  code,
  language,
  analysisReport,
  onVivaComplete,
  isLocked = false
}) => {
  const [questions, setQuestions] = useState<VivaQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentInput, setCurrentInput] = useState<string>('');
  const [showHint, setShowHint] = useState<boolean>(false);

  const [isLoadingQuestions, setIsLoadingQuestions] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<VivaEvaluation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadQuestions = async () => {
    if (!code || code.trim().length === 0) return;
    setIsLoadingQuestions(true);
    setErrorMessage('');
    setEvaluation(null);
    setAnswers({});
    setCurrentInput('');
    setCurrentQuestionIndex(0);

    try {
      const { questions: fetchedQuestions } = await generateVivaQuestions(
        code,
        language,
        analysisReport || undefined
      );
      setQuestions(fetchedQuestions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to load Viva questions: ${msg}`);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  useEffect(() => {
    if (questions.length === 0 && code.trim().length > 10) {
      loadQuestions();
    }
  }, [code, language]);

  const handleNextAnswer = async () => {
    if (!currentInput.trim()) return;

    const currentQ = questions[currentQuestionIndex];
    const updatedAnswers = {
      ...answers,
      [currentQ.id]: currentInput.trim()
    };
    setAnswers(updatedAnswers);
    setCurrentInput('');
    setShowHint(false);
    playSound('click');

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((idx) => idx + 1);
    } else {
      setIsEvaluating(true);
      setErrorMessage('');

      try {
        const answersList: VivaAnswer[] = questions.map((q) => ({
          questionId: q.id,
          question: q.question,
          studentAnswer: updatedAnswers[q.id] || ''
        }));

        const { evaluation: evalResult } = await evaluateVivaAnswers(
          code,
          language,
          answersList
        );
        setEvaluation(evalResult);
        playSound(evalResult.score >= 70 ? 'success' : 'warning');
        if (onVivaComplete) {
          onVivaComplete(evalResult);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Grading failed: ${msg}`);
        playSound('error');
      } finally {
        setIsEvaluating(false);
      }
    }
  };

  // ---- Panel header (always shown) ----
  const PanelHeader = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--accent-subtle)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <MessageSquare size={14} color="var(--accent)" />
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
          AI Oral Viva Voce Defense
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Adaptive code comprehension interview
        </div>
      </div>
    </div>
  );

  // ---- Empty state ----
  if (!code || code.trim().length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PanelHeader />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: '32px 24px',
            textAlign: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <BookOpen size={22} color="var(--text-muted)" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              No Code Detected
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '300px', lineHeight: 1.6, margin: 0 }}>
              Write or paste your code in the editor and run it — custom viva questions will be generated automatically to test your understanding.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loading questions ----
  if (isLoadingQuestions) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PanelHeader />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: '32px 24px',
            textAlign: 'center',
            gap: '12px'
          }}
        >
          <RefreshCw size={24} className="spinner-icon" color="var(--accent)" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Preparing Viva Questions...
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '300px', lineHeight: 1.6, margin: 0 }}>
              Examining your code logic and functions to craft 3 targeted oral questions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Evaluating ----
  if (isEvaluating) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PanelHeader />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: '32px 24px',
            textAlign: 'center',
            gap: '12px'
          }}
        >
          <RefreshCw size={24} className="spinner-icon" color="var(--accent)" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Evaluating Your Answers...
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '300px', lineHeight: 1.6, margin: 0 }}>
              Comparing your explanations with the program logic to calculate your Viva score.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Evaluation result ----
  if (evaluation) {
    const isPassing = evaluation.score >= 70;
    const isOkay = evaluation.score >= 50;
    const scoreColor = isPassing
      ? 'var(--success)'
      : isOkay
      ? 'var(--warning)'
      : 'var(--danger)';
    const ScoreIcon = isPassing ? ShieldCheck : ShieldAlert;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PanelHeader />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '14px',
            overflowY: 'auto',
            gap: '10px'
          }}
        >
          {/* Score hero card */}
          <div style={{ ...accentBentoCard(scoreColor), padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: 'var(--radius-md)',
                    background: isPassing ? 'var(--success-bg)' : isOkay ? 'var(--warning-bg)' : 'var(--danger-bg)',
                    border: `1px solid ${scoreColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <ScoreIcon size={20} color={scoreColor} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: '3px'
                    }}
                  >
                    Oral Viva Evaluation
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {evaluation.verdict}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '30px',
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono)',
                    color: scoreColor,
                    lineHeight: 1
                  }}
                >
                  {evaluation.score}
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>/100</span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Viva Score
                </div>
              </div>
            </div>
          </div>

          {/* Teacher feedback */}
          <div style={{ ...bentoCard, padding: '13px 15px' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Award size={11} color="var(--text-muted)" />
              Teacher's Assessment
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              {evaluation.teacherFeedback}
            </p>
          </div>

          {/* Score breakdown */}
          <div style={{ ...bentoCard, padding: '13px 15px' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '8px'
              }}
            >
              Score Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <MetricTag
                label="Logic Grasp"
                value={`${evaluation.breakdown.logicGrasp}%`}
                color={evaluation.breakdown.logicGrasp >= 70 ? 'var(--success)' : evaluation.breakdown.logicGrasp >= 50 ? 'var(--warning)' : 'var(--danger)'}
              />
              <MetricTag
                label="Efficiency Awareness"
                value={`${evaluation.breakdown.efficiencyAwareness}%`}
                color={evaluation.breakdown.efficiencyAwareness >= 70 ? 'var(--success)' : evaluation.breakdown.efficiencyAwareness >= 50 ? 'var(--warning)' : 'var(--danger)'}
              />
              <MetricTag
                label="Edge Case Knowledge"
                value={`${evaluation.breakdown.edgeCaseHandling}%`}
                color={evaluation.breakdown.edgeCaseHandling >= 70 ? 'var(--success)' : evaluation.breakdown.edgeCaseHandling >= 50 ? 'var(--warning)' : 'var(--danger)'}
              />
            </div>
          </div>

          {/* Good & missing points */}
          {(evaluation.goodPoints.length > 0 || evaluation.missingPoints.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {evaluation.goodPoints.length > 0 && (
                <div style={{ ...bentoCard, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                    <CheckCircle2 size={12} color="var(--success)" />
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--success)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em'
                      }}
                    >
                      Strong Answers
                    </span>
                  </div>
                  <ul style={{ paddingLeft: '14px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {evaluation.goodPoints.map((p: string, i: number) => (
                      <li key={i} style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.missingPoints.length > 0 && (
                <div style={{ ...bentoCard, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                    <AlertTriangle size={12} color="var(--warning)" />
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--warning)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em'
                      }}
                    >
                      Improve On
                    </span>
                  </div>
                  <ul style={{ paddingLeft: '14px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {evaluation.missingPoints.map((p: string, i: number) => (
                      <li key={i} style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
          {errorMessage && (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                color: 'var(--danger)'
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Retake */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadQuestions}>
              <RotateCcw size={12} />
              Retake Viva
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Question answering view ----
  const currentQ = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader />

      {/* Locked overlay */}
      {isLocked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            gap: '10px',
            borderRadius: 'inherit'
          }}
        >
          <Lock size={28} color="var(--danger)" />
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Viva Locked</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '240px', textAlign: 'center', lineHeight: 1.5 }}>
            Workstation is frozen by proctor. Responses are disabled.
          </div>
        </div>
      )}

      {/* Progress & topic bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        <ProgressDots total={questions.length} current={currentQuestionIndex} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BookOpen size={11} color="var(--text-muted)" />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em'
            }}
          >
            {currentQ?.topic}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '14px',
          overflowY: 'auto',
          gap: '12px'
        }}
      >
        {/* Question card */}
        <div style={{ ...accentBentoCard('var(--accent)'), padding: '16px' }}>
          {/* Question number badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span className="badge badge-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              Q{currentQuestionIndex + 1} / {questions.length}
            </span>
            <ChevronRight size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Oral Question
            </span>
          </div>

          {/* Question text */}
          <p
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.6
            }}
          >
            {currentQ?.question}
          </p>

          {/* Hint toggle */}
          {currentQ?.hint && (
            <div style={{ marginTop: '12px' }}>
              {!showHint ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowHint(true)}
                  disabled={isLocked}
                  style={{ fontSize: '11px', color: 'var(--text-muted)', gap: '5px', padding: '3px 8px' }}
                >
                  <HelpCircle size={12} />
                  Show Hint
                </button>
              ) : (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--accent)',
                    lineHeight: 1.6,
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--accent)', marginRight: '4px' }}>Hint:</span>
                  {currentQ.hint}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: 'var(--danger)'
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Answer area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <label
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em'
            }}
          >
            Your Answer
          </label>
          <textarea
            value={currentInput}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCurrentInput(e.target.value)}
            disabled={isLocked}
            placeholder={
              isLocked
                ? 'Workstation is frozen by proctor. Viva responses are locked.'
                : 'Explain your program logic, data structures, and approach in your own words...'
            }
            style={{
              flex: 1,
              minHeight: '120px',
              background: 'var(--bg-elevated)',
              border: isLocked ? '1px solid var(--danger)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              lineHeight: 1.6,
              padding: '12px',
              outline: 'none',
              resize: 'none',
              opacity: isLocked ? 0.55 : 1,
              cursor: isLocked ? 'not-allowed' : 'text',
              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
        </div>

        {/* Action row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '2px',
            gap: '8px'
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadQuestions}
            disabled={isLocked}
            style={{ fontSize: '11px', opacity: isLocked ? 0.5 : 1 }}
          >
            <RefreshCw size={11} />
            New Questions
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={handleNextAnswer}
            disabled={isLocked || !currentInput.trim()}
            style={{ opacity: isLocked ? 0.5 : 1, gap: '6px' }}
          >
            {isLastQuestion ? 'Finish Oral Test' : 'Submit & Next'}
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
