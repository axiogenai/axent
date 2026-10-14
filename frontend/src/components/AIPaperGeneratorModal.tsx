import React, { useState, useMemo } from 'react';
import {
  GraduationCap,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  Sliders,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  ArrowRight,
  Trash2,
  Plus,
  AlertTriangle,
  FileText,
  Filter,
  CheckSquare,
  Save,
  Send,
  HelpCircle,
  MessageCircle
} from 'lucide-react';
import {
  generateFullExamPaperWithAI,
  AIPaperGenerationRequest,
  AIPaperGenerationResult
} from '../services/groqService';
import {
  saveExam,
  publishExam,
  saveQuestion,
  deleteQuestion,
  deleteExam
} from '../services/mcqService';
import { MCQExamConfig, MCQQuestion, MCQResultDeclarationMode } from '../types/mcq';
import { playSound } from '../utils/sounds';

interface AIPaperGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaperGenerated: (result: AIPaperGenerationResult) => void;
}

type ModalStep = 'config' | 'loading' | 'review' | 'published';

export const AIPaperGeneratorModal: React.FC<AIPaperGeneratorModalProps> = ({
  isOpen,
  onClose,
  onPaperGenerated
}) => {
  // Step state
  const [step, setStep] = useState<ModalStep>('config');

  // Generator Form State
  const [title, setTitle] = useState('');
  const [examCategory, setExamCategory] = useState<'Aptitude' | 'ISE'>('Aptitude');
  const [subject, setSubject] = useState('General Aptitude & Reasoning');
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);

  // Difficulty & Question Counts
  const [easyCount, setEasyCount] = useState(5);
  const [easyMarks, setEasyMarks] = useState(1);
  const [mediumCount, setMediumCount] = useState(10);
  const [mediumMarks, setMediumMarks] = useState(2);
  const [hardCount, setHardCount] = useState(5);
  const [hardMarks, setHardMarks] = useState(3);

  // Negative Marking & Settings
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(true);
  const [negativeMarkPenalty, setNegativeMarkPenalty] = useState(0.25);
  const [resultDeclarationMode, setResultDeclarationMode] = useState<MCQResultDeclarationMode>('IMMEDIATE');

  // Progress & Error
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Review Stage State
  const [reviewedExam, setReviewedExam] = useState<MCQExamConfig | null>(null);
  const [reviewedQuestions, setReviewedQuestions] = useState<MCQQuestion[]>([]);
  const [expandedQIds, setExpandedQIds] = useState<Set<string>>(new Set());
  const [activeDifficultyFilter, setActiveDifficultyFilter] = useState<'ALL' | 'EASY' | 'MEDIUM' | 'HARD'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const totalQuestionsConfigured = easyCount + mediumCount + hardCount;
  const totalMarksConfigured =
    easyCount * easyMarks + mediumCount * mediumMarks + hardCount * hardMarks;

  // ── 1. GENERATE DRAFT WITH AI ────────────────────────────────────────────────
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!topic.trim()) {
      setError('Please provide at least one topic or syllabus theme.');
      return;
    }

    if (totalQuestionsConfigured <= 0) {
      setError('Total questions must be greater than zero.');
      return;
    }

    setStep('loading');
    setProgressMsg('Initializing Autonomous Reasoning Models...');
    playSound('click');

    try {
      const payload: AIPaperGenerationRequest = {
        title: title.trim() || `${topic.trim()} Examination`,
        subject: subject.trim() || (examCategory === 'Aptitude' ? 'General Aptitude & Reasoning' : 'Computer Science'),
        topic: topic.trim(),
        examCategory,
        instructions: instructions.trim(),
        durationMinutes,
        easyCount,
        mediumCount,
        hardCount,
        easyMarks,
        mediumMarks,
        hardMarks,
        negativeMarkingEnabled,
        negativeMarkPenalty,
        autoPublish: false // Explicitly DRAFT: Faculty must review and confirm before publishing
      };

      const res = await generateFullExamPaperWithAI(payload, (status) => {
        setProgressMsg(status);
      });

      setReviewedExam({ ...res.exam, resultDeclarationMode });
      setReviewedQuestions(res.questions);
      // Expand all questions by default for quick review
      setExpandedQIds(new Set(res.questions.map((q) => q.id)));
      setStep('review');
      playSound('success');
    } catch (err: any) {
      setError(err?.message || 'Failed to generate exam paper via AI. Please try again.');
      setStep('config');
      playSound('warning');
    }
  };

  // ── 2. REVIEW STAGE HELPERS ──────────────────────────────────────────────────
  const liveTotalMarks = useMemo(() => {
    return reviewedQuestions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0);
  }, [reviewedQuestions]);

  const liveEasyCount = useMemo(
    () => reviewedQuestions.filter((q) => q.difficulty === 'EASY').length,
    [reviewedQuestions]
  );
  const liveMedCount = useMemo(
    () => reviewedQuestions.filter((q) => q.difficulty === 'MEDIUM').length,
    [reviewedQuestions]
  );
  const liveHardCount = useMemo(
    () => reviewedQuestions.filter((q) => q.difficulty === 'HARD').length,
    [reviewedQuestions]
  );

  const filteredQuestions = useMemo(() => {
    return reviewedQuestions.filter((q) => {
      const matchesDiff =
        activeDifficultyFilter === 'ALL' || q.difficulty === activeDifficultyFilter;
      if (!matchesDiff) return false;

      if (!searchQuery.trim()) return true;
      const qLower = searchQuery.toLowerCase();
      const textMatch = q.text.toLowerCase().includes(qLower);
      const optMatch = q.options.some((opt) => opt.text.toLowerCase().includes(qLower));
      return textMatch || optMatch;
    });
  }, [reviewedQuestions, activeDifficultyFilter, searchQuery]);

  // Validation: Each question must have non-empty text, >= 2 options, and exactly 1 correct key
  const validationIssues = useMemo(() => {
    const issues: { qIndex: number; qId: string; message: string }[] = [];
    if (reviewedQuestions.length === 0) {
      issues.push({ qIndex: 0, qId: '', message: 'At least 1 question is required in the exam paper.' });
      return issues;
    }

    reviewedQuestions.forEach((q, idx) => {
      if (!q.text.trim()) {
        issues.push({ qIndex: idx + 1, qId: q.id, message: `Question #${idx + 1} has empty text.` });
      }
      if (q.options.length < 2) {
        issues.push({ qIndex: idx + 1, qId: q.id, message: `Question #${idx + 1} has fewer than 2 options.` });
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount === 0) {
        issues.push({
          qIndex: idx + 1,
          qId: q.id,
          message: `Question #${idx + 1} has no correct answer selected. Click an option key to designate it as correct.`
        });
      } else if (correctCount > 1) {
        issues.push({
          qIndex: idx + 1,
          qId: q.id,
          message: `Question #${idx + 1} has multiple options marked correct. Please select exactly 1 correct key.`
        });
      }
    });

    return issues;
  }, [reviewedQuestions]);

  const toggleExpand = (qId: string) => {
    setExpandedQIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleToggleExpandAll = () => {
    if (expandedQIds.size === reviewedQuestions.length) {
      setExpandedQIds(new Set());
    } else {
      setExpandedQIds(new Set(reviewedQuestions.map((q) => q.id)));
    }
  };

  // Modify question field
  const handleUpdateQuestion = (qId: string, updates: Partial<MCQQuestion>) => {
    setReviewedQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, ...updates, updatedAt: Date.now() } : q))
    );
  };

  // Modify option text
  const handleUpdateOptionText = (qId: string, optId: string, newText: string) => {
    setReviewedQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          options: q.options.map((opt) => (opt.id === optId ? { ...opt, text: newText } : opt)),
          updatedAt: Date.now()
        };
      })
    );
  };

  // Set single correct option
  const handleSetCorrectOption = (qId: string, correctOptId: string) => {
    setReviewedQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          options: q.options.map((opt) => ({
            ...opt,
            isCorrect: opt.id === correctOptId
          })),
          updatedAt: Date.now()
        };
      })
    );
    playSound('click');
  };

  // Delete question
  const handleDeleteQuestion = (qId: string) => {
    deleteQuestion(qId);
    setReviewedQuestions((prev) => prev.filter((q) => q.id !== qId));
    playSound('click');
  };

  // Add custom question
  const handleAddCustomQuestion = () => {
    if (!reviewedExam) return;
    const now = Date.now();
    const newQId = `q_rev_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const newQuestion: MCQQuestion = {
      id: newQId,
      text: 'New question prompt...',
      options: [
        { id: `opt_1_${Math.random().toString(36).substring(2, 6)}`, text: 'Option A', isCorrect: true },
        { id: `opt_2_${Math.random().toString(36).substring(2, 6)}`, text: 'Option B', isCorrect: false },
        { id: `opt_3_${Math.random().toString(36).substring(2, 6)}`, text: 'Option C', isCorrect: false },
        { id: `opt_4_${Math.random().toString(36).substring(2, 6)}`, text: 'Option D', isCorrect: false }
      ],
      subject: reviewedExam.subject,
      topic: reviewedExam.topic,
      difficulty: 'MEDIUM',
      marks: 2,
      negativeMarks: reviewedExam.negativeMarkingEnabled ? 0.25 : 0,
      explanation: '',
      status: 'PUBLISHED',
      tags: [reviewedExam.topic],
      createdAt: now,
      updatedAt: now,
      createdBy: 'Faculty Reviewer',
      bankGroup: reviewedExam.title
    };

    saveQuestion(newQuestion);
    setReviewedQuestions((prev) => [...prev, newQuestion]);
    setExpandedQIds((prev) => new Set([...prev, newQId]));
    playSound('click');
  };

  // Save as Draft (Review Later)
  const handleSaveAsDraft = () => {
    if (!reviewedExam) return;
    setError(null);

    // Persist all modified questions
    reviewedQuestions.forEach((q) => saveQuestion(q));

    const updatedExam: MCQExamConfig = {
      ...reviewedExam,
      title: reviewedExam.title.trim() || 'MCQ Exam Draft',
      durationMinutes: Math.max(5, reviewedExam.durationMinutes || 30),
      questionCount: reviewedQuestions.length,
      questionIds: reviewedQuestions.map((q) => q.id),
      totalMarks: liveTotalMarks,
      status: 'DRAFT',
      updatedAt: Date.now()
    };

    saveExam(updatedExam);
    onPaperGenerated({
      exam: updatedExam,
      questions: reviewedQuestions,
      modelUsed: 'Autonomous-Faculty-Review',
      totalMarks: liveTotalMarks,
      questionCount: reviewedQuestions.length
    });

    playSound('success');
    onClose();
  };

  // Confirm and Publish
  const handleConfirmAndPublish = () => {
    if (!reviewedExam) return;
    setError(null);

    if (validationIssues.length > 0) {
      setError(validationIssues[0].message);
      playSound('warning');
      return;
    }

    setIsPublishing(true);
    playSound('click');

    try {
      // 1. Save all edited questions
      reviewedQuestions.forEach((q) => saveQuestion(q));

      // 2. Prepare updated exam config
      const updatedExam: MCQExamConfig = {
        ...reviewedExam,
        title: reviewedExam.title.trim() || 'MCQ Examination',
        durationMinutes: Math.max(5, reviewedExam.durationMinutes || 30),
        questionCount: reviewedQuestions.length,
        questionIds: reviewedQuestions.map((q) => q.id),
        totalMarks: liveTotalMarks,
        status: 'PUBLISHED',
        publishedAt: Date.now(),
        updatedAt: Date.now()
      };

      saveExam(updatedExam);
      const pubErrors = publishExam(updatedExam.id);

      if (pubErrors.length > 0) {
        setError(`Publishing error: ${pubErrors.join('; ')}`);
        setIsPublishing(false);
        playSound('warning');
        return;
      }

      setReviewedExam(updatedExam);
      onPaperGenerated({
        exam: updatedExam,
        questions: reviewedQuestions,
        modelUsed: 'Autonomous-Faculty-Verified',
        totalMarks: liveTotalMarks,
        questionCount: reviewedQuestions.length
      });

      setStep('published');
      playSound('success');
    } catch (err: any) {
      setError(err?.message || 'Failed to publish exam. Please retry.');
      playSound('warning');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDiscardDraft = () => {
    if (window.confirm('Discard this draft exam paper? Unsaved questions and changes will be permanently removed.')) {
      if (reviewedExam) {
        deleteExam(reviewedExam.id);
        reviewedQuestions.forEach((q) => deleteQuestion(q.id));
      }
      playSound('click');
      onClose();
    }
  };

  const handleCopyStudentLink = () => {
    const studentUrl = `${window.location.origin}/mcq`;
    navigator.clipboard.writeText(studentUrl);
    setCopiedLink(true);
    playSound('click');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => e.target === e.currentTarget && step !== 'loading' && onClose()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: step === 'review' ? '1060px' : '820px',
          maxHeight: '94vh',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          transition: 'max-width 0.2s ease'
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <GraduationCap size={16} color="var(--accent)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {step === 'review'
                    ? 'Review & Verify AI Exam Paper'
                    : step === 'published'
                    ? 'Exam Paper Published & Live'
                    : 'AI Autonomous Exam Paper Generator'}
                </h2>
                {step === 'review' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--warning-bg)',
                      border: '1px solid var(--warning-border)',
                      color: 'var(--warning)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    Draft · Pending Confirmation
                  </span>
                )}
                {step === 'published' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--success-bg)',
                      border: '1px solid var(--success-border)',
                      color: 'var(--success)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    Published
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                {step === 'review'
                  ? 'Verify question accuracy, answer keys, marks, and options before confirming release to students.'
                  : step === 'published'
                  ? 'Candidate link active. Students can now access and take this paper.'
                  : 'Specify syllabus topics and difficulty breakdown to autonomously synthesize calibrated exam papers.'}
              </p>
            </div>
          </div>

          {step !== 'loading' && (
            <button
              onClick={step === 'review' ? handleDiscardDraft : onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: 'var(--radius-sm)'
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--danger)',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1: CONFIG FORM ── */}
          {step === 'config' && (
            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Exam Category *
                  </label>
                  <select
                    value={examCategory}
                    onChange={(e) => {
                      const newCat = e.target.value as 'Aptitude' | 'ISE';
                      setExamCategory(newCat);
                      if (newCat === 'Aptitude') {
                        setSubject('General Aptitude & Reasoning');
                        if (!topic.trim() || topic.includes('Data Structures')) {
                          setTopic('Logical Reasoning, Quantitative, Verbal Aptitude');
                          setTitle('General Aptitude & Reasoning Assessment');
                        }
                      } else {
                        setSubject('Computer Science');
                        if (!topic.trim() || topic.includes('Aptitude')) {
                          setTopic('Data Structures & Algorithms');
                          setTitle('Data Structures & Algorithms Examination');
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Aptitude">Aptitude & Logical Reasoning (Non-Tech)</option>
                    <option value="ISE">ISE / Computer Science (Technical)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Subject / Domain *
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={examCategory === 'Aptitude' ? 'General Aptitude & Reasoning' : 'Computer Science (CS201)'}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Syllabus Topic or Theme *
                  </label>
                  <input
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value);
                      if (!title) setTitle(`${e.target.value} Examination`);
                    }}
                    placeholder={
                      examCategory === 'Aptitude'
                        ? 'e.g. Logical Reasoning, Quantitative, Verbal Aptitude'
                        : 'e.g. Data Structures, Arrays, Stacks, Trees'
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Quick Topic Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '-6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Presets:</span>
                {(examCategory === 'Aptitude'
                  ? [
                      'Logical Reasoning, Quantitative, Verbal Aptitude',
                      'Quantitative: Percentages, Profit & Loss, Speed & Time',
                      'Logical Reasoning: Syllogisms, Blood Relations, Series',
                      'Verbal: Reading Comprehension & Vocabulary'
                    ]
                  : [
                      'Data Structures & Algorithms',
                      'Operating Systems & Concurrency',
                      'DBMS & SQL Queries',
                      'Computer Networks & Protocols'
                    ]
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTopic(preset);
                      setTitle(`${preset} Assessment`);
                    }}
                    style={{
                      background: topic === preset ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      border: `1px solid ${topic === preset ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-pill)',
                      padding: '2px 8px',
                      fontSize: '10px',
                      color: topic === preset ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Official Exam Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Data Structures CIE Mid-Term Assessment"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
              </div>

              {/* Difficulty Breakdown Matrix */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sliders size={13} />
                  <span>Question Difficulty Breakdown & Mark Allocation</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
                  {/* Easy */}
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)' }}>EASY</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Definitions & syntax</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div>
                        <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Count</label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={easyCount}
                          onChange={(e) => setEasyCount(parseInt(e.target.value, 10) || 0)}
                          style={{ width: '100%', padding: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Marks/Q</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={easyMarks}
                          onChange={(e) => setEasyMarks(parseInt(e.target.value, 10) || 1)}
                          style={{ width: '100%', padding: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Medium */}
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--warning)' }}>MEDIUM</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Algorithms & tracing</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div>
                        <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Count</label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={mediumCount}
                          onChange={(e) => setMediumCount(parseInt(e.target.value, 10) || 0)}
                          style={{ width: '100%', padding: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Marks/Q</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={mediumMarks}
                          onChange={(e) => setMediumMarks(parseInt(e.target.value, 10) || 2)}
                          style={{ width: '100%', padding: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Hard */}
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--danger)' }}>HARD</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Edge cases & complexities</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div>
                        <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Count</label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={hardCount}
                          onChange={(e) => setHardCount(parseInt(e.target.value, 10) || 0)}
                          style={{ width: '100%', padding: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Marks/Q</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={hardMarks}
                          onChange={(e) => setHardMarks(parseInt(e.target.value, 10) || 3)}
                          style={{ width: '100%', padding: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    fontSize: '11px'
                  }}
                >
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Total Questions: <strong style={{ color: 'var(--text-primary)' }}>{totalQuestionsConfigured}</strong>
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Total Marks: <strong style={{ color: 'var(--accent)' }}>{totalMarksConfigured} pts</strong>
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {easyCount} Easy · {mediumCount} Med · {hardCount} Hard
                  </div>
                </div>
              </div>

              {/* Duration & Negative Penalty */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Exam Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 30)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Negative Marking Penalty
                  </label>
                  <select
                    value={negativeMarkingEnabled ? String(negativeMarkPenalty) : '0'}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val === 0) {
                        setNegativeMarkingEnabled(false);
                      } else {
                        setNegativeMarkingEnabled(true);
                        setNegativeMarkPenalty(val);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  >
                    <option value="0">Disabled (0 Penalty)</option>
                    <option value="0.25">-0.25 Mark per wrong answer</option>
                    <option value="0.5">-0.50 Mark per wrong answer</option>
                    <option value="1.0">-1.00 Mark per wrong answer</option>
                  </select>
                </div>
              </div>

              {/* Focus Instructions */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Specific Focus Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Focus on recursive tree traversals and worst-case complexity edge cases."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '11px'
                  }}
                />
              </div>

              {/* Result Declaration Option */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Result Declaration & Score Release
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setResultDeclarationMode('IMMEDIATE')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${resultDeclarationMode === 'IMMEDIATE' ? 'var(--accent)' : 'var(--border)'}`,
                      background: resultDeclarationMode === 'IMMEDIATE' ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      color: resultDeclarationMode === 'IMMEDIATE' ? 'var(--text-primary)' : 'var(--text-muted)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>Declare Results After Over</span>
                    {resultDeclarationMode === 'IMMEDIATE' && <Check size={12} color="var(--accent)" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultDeclarationMode('WHATSAPP_GROUP')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--accent)' : 'var(--border)'}`,
                      background: resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      color: resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--text-primary)' : 'var(--text-muted)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MessageCircle size={12} color={resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--accent)' : 'inherit'} />
                      Send on WhatsApp Group
                    </span>
                    {resultDeclarationMode === 'WHATSAPP_GROUP' && <Check size={12} color="var(--accent)" />}
                  </button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '10.5px', color: 'var(--text-dim)' }}>
                  {resultDeclarationMode === 'WHATSAPP_GROUP'
                    ? 'Students will see "Hold tight, results will be deployed soon" on submit. Paper setters export results and share on the class WhatsApp group.'
                    : 'Students will see their score, marks, and detailed question explanations immediately upon submit.'}
                </p>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  paddingTop: '12px',
                  marginTop: '8px',
                  borderTop: '1px solid var(--border)'
                }}
              >
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                  Questions will be generated as <strong>Draft</strong> for mandatory faculty review before publishing.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    style={{
                      height: '36px',
                      padding: '0 18px',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-contrast)',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <GraduationCap size={15} style={{ flexShrink: 0 }} />
                    <span>Generate Questions for Review ({totalQuestionsConfigured})</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ── STEP 2: LOADING PROGRESS ── */}
          {step === 'loading' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                textAlign: 'center'
              }}
            >
              <RefreshCw size={36} color="var(--accent)" className="spin" style={{ marginBottom: '16px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                Generating Complete Exam Paper with Autonomous Engine...
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 0 16px', lineHeight: 1.5 }}>
                {progressMsg}
              </p>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-surface)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border)'
                }}
              >
                Paper will open in interactive review mode once questions are formulated.
              </div>
            </div>
          )}

          {/* ── STEP 3: INTERACTIVE REVIEW WORKSPACE ── */}
          {step === 'review' && reviewedExam && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Paper Metadata Bar */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 100px 125px 145px', gap: '10px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Exam Paper Title
                    </label>
                    <input
                      value={reviewedExam.title}
                      onChange={(e) => setReviewedExam({ ...reviewedExam, title: e.target.value })}
                      style={{
                        width: '100%',
                        height: '36px',
                        boxSizing: 'border-box',
                        padding: '0 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontWeight: 700,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Topic & Subject
                    </label>
                    <div
                      title={`${reviewedExam.topic} (${reviewedExam.subject})`}
                      style={{
                        width: '100%',
                        height: '36px',
                        boxSizing: 'border-box',
                        padding: '0 10px',
                        fontSize: '11.5px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {reviewedExam.topic}
                      </span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '4px', flexShrink: 0, fontSize: '10.5px' }}>
                        · {reviewedExam.subject}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Duration (Min)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="180"
                      value={reviewedExam.durationMinutes}
                      onChange={(e) =>
                        setReviewedExam({
                          ...reviewedExam,
                          durationMinutes: parseInt(e.target.value, 10) || 30
                        })
                      }
                      style={{
                        width: '100%',
                        height: '36px',
                        boxSizing: 'border-box',
                        padding: '0 8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'center',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Negative Marking
                    </label>
                    <div
                      style={{
                        width: '100%',
                        height: '36px',
                        boxSizing: 'border-box',
                        padding: '0 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                        color: reviewedExam.negativeMarkingEnabled ? 'var(--warning)' : 'var(--text-muted)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {reviewedExam.negativeMarkingEnabled ? `-0.25 pt / wrong` : 'Disabled'}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Result Release
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ? 'IMMEDIATE' : 'WHATSAPP_GROUP';
                        setReviewedExam({ ...reviewedExam, resultDeclarationMode: next });
                        playSound('click');
                      }}
                      title="Click to toggle: Immediate Results vs WhatsApp Group Release"
                      style={{
                        width: '100%',
                        height: '36px',
                        boxSizing: 'border-box',
                        padding: '0 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'var(--bg-elevated)',
                        border: `1px solid ${reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        color: reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <MessageCircle size={12} color={reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ? 'var(--accent)' : 'var(--text-muted)'} />
                      {reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ? 'WhatsApp Group' : 'Immediate'}
                    </button>
                  </div>
                </div>

                {/* Live KPI Tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {[
                    { value: `${reviewedQuestions.length}`, label: 'Questions', color: 'var(--text-primary)' },
                    { value: `${liveTotalMarks} pts`, label: 'Total Marks', color: 'var(--accent)' },
                    { value: `${liveEasyCount}`, label: 'Easy', color: 'var(--success)' },
                    { value: `${liveMedCount}`, label: 'Medium', color: 'var(--warning)' },
                    { value: `${liveHardCount}`, label: 'Hard', color: 'var(--danger)' },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        height: '46px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 800, color: kpi.color, lineHeight: 1.1 }}>{kpi.value}</div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '3px' }}>{kpi.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validation Warnings Callout */}
              {validationIssues.length > 0 && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--warning-bg)',
                    border: '1px solid var(--warning-border)',
                    color: 'var(--warning)',
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ display: 'block', marginBottom: '2px' }}>
                      Review Checklist: {validationIssues.length} issue(s) need your confirmation before publishing:
                    </strong>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      {validationIssues.slice(0, 3).map((issue, i) => (
                        <li key={i}>{issue.message}</li>
                      ))}
                      {validationIssues.length > 3 && (
                        <li>...and {validationIssues.length - 3} more issue(s).</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Questions Toolbar (Search, Filter, Expand/Collapse, Add) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {(['ALL', 'EASY', 'MEDIUM', 'HARD'] as const).map((diff) => {
                    const count =
                      diff === 'ALL'
                        ? reviewedQuestions.length
                        : reviewedQuestions.filter((q) => q.difficulty === diff).length;
                    const isActive = activeDifficultyFilter === diff;
                    return (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setActiveDifficultyFilter(diff)}
                        style={{
                          background: isActive ? 'var(--bg-elevated)' : 'transparent',
                          border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        {diff} ({count})
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search questions..."
                    style={{
                      padding: '4px 8px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                      width: '160px'
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleToggleExpandAll}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {expandedQIds.size === reviewedQuestions.length ? 'Collapse All' : 'Expand All'}
                  </button>

                  <button
                    type="button"
                    onClick={handleAddCustomQuestion}
                    style={{
                      padding: '4px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={12} />
                    <span>Add Question</span>
                  </button>
                </div>
              </div>

              {/* Question Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredQuestions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No questions match the current filter.
                  </div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const isExpanded = expandedQIds.has(q.id);
                    const correctOpt = q.options.find((o) => o.isCorrect);
                    const correctCount = q.options.filter((o) => o.isCorrect).length;

                    return (
                      <div
                        key={q.id}
                        style={{
                          background: 'var(--bg-surface)',
                          border: `1px solid ${
                            correctCount !== 1 ? 'var(--warning-border)' : 'var(--border)'
                          }`,
                          borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Question Card Header */}
                        <div
                          style={{
                            padding: '8px 12px',
                            background: 'var(--bg-elevated)',
                            borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                              #{idx + 1}
                            </span>

                            {/* Difficulty Selector */}
                            <select
                              value={q.difficulty}
                              onChange={(e) =>
                                handleUpdateQuestion(q.id, {
                                  difficulty: e.target.value as any
                                })
                              }
                              style={{
                                padding: '2px 6px',
                                fontSize: '10px',
                                fontWeight: 700,
                                borderRadius: 'var(--radius-pill)',
                                background:
                                  q.difficulty === 'EASY'
                                    ? 'var(--success-bg)'
                                    : q.difficulty === 'MEDIUM'
                                    ? 'var(--warning-bg)'
                                    : 'var(--danger-bg)',
                                color:
                                  q.difficulty === 'EASY'
                                    ? 'var(--success)'
                                    : q.difficulty === 'MEDIUM'
                                    ? 'var(--warning)'
                                    : 'var(--danger)',
                                border: `1px solid ${
                                  q.difficulty === 'EASY'
                                    ? 'var(--success-border)'
                                    : q.difficulty === 'MEDIUM'
                                    ? 'var(--warning-border)'
                                    : 'var(--danger-border)'
                                }`,
                                cursor: 'pointer'
                              }}
                            >
                              <option value="EASY">EASY</option>
                              <option value="MEDIUM">MEDIUM</option>
                              <option value="HARD">HARD</option>
                            </select>

                            {/* Marks Input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Pts:</label>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={q.marks}
                                onChange={(e) =>
                                  handleUpdateQuestion(q.id, {
                                    marks: Math.max(1, parseInt(e.target.value, 10) || 1)
                                  })
                                }
                                style={{
                                  width: '42px',
                                  padding: '2px 4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-primary)',
                                  textAlign: 'center'
                                }}
                              />
                            </div>

                            {/* Answer Key Badge */}
                            {correctCount === 1 ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--success)',
                                  background: 'var(--success-bg)',
                                  border: '1px solid var(--success-border)',
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-pill)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <Check size={10} />
                                <span>Key verified</span>
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--danger)',
                                  background: 'var(--danger-bg)',
                                  border: '1px solid var(--danger-border)',
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-pill)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <AlertCircle size={10} />
                                <span>{correctCount === 0 ? 'No key selected' : 'Multiple keys'}</span>
                              </span>
                            )}

                            {/* Text preview if collapsed */}
                            {!isExpanded && (
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--text-secondary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1
                                }}
                              >
                                {q.text}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => toggleExpand(q.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '4px'
                              }}
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--danger-border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10px'
                              }}
                              title="Delete question from paper"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Question Card Content (Editable) */}
                        {isExpanded && (
                          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Question Text */}
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                                Question Prompt
                              </label>
                              <textarea
                                rows={2}
                                value={q.text}
                                onChange={(e) => handleUpdateQuestion(q.id, { text: e.target.value })}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-primary)',
                                  fontSize: '12px',
                                  lineHeight: 1.4
                                }}
                                placeholder="Enter question wording..."
                              />
                            </div>

                            {/* Options Grid (Click to designate correct key) */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                  Answer Choices (Click radio icon to designate correct key)
                                </label>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Green = Active Correct Key
                                </span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {q.options.map((opt, optI) => {
                                  const optLetter = String.fromCharCode(65 + optI);
                                  return (
                                    <div
                                      key={opt.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        background: opt.isCorrect ? 'var(--success-bg)' : 'var(--bg-elevated)',
                                        border: `1px solid ${opt.isCorrect ? 'var(--success-border)' : 'var(--border)'}`,
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      {/* Clickable radio button */}
                                      <button
                                        type="button"
                                        onClick={() => handleSetCorrectOption(q.id, opt.id)}
                                        style={{
                                          width: '18px',
                                          height: '18px',
                                          borderRadius: '50%',
                                          background: opt.isCorrect ? 'var(--success)' : 'transparent',
                                          border: `2px solid ${opt.isCorrect ? 'var(--success)' : 'var(--border)'}`,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          flexShrink: 0,
                                          padding: 0
                                        }}
                                        title={opt.isCorrect ? 'Correct Answer' : 'Click to set as correct answer'}
                                      >
                                        {opt.isCorrect && <Check size={11} color="#ffffff" />}
                                      </button>

                                      <strong style={{ fontSize: '11px', color: opt.isCorrect ? 'var(--success)' : 'var(--text-secondary)', flexShrink: 0 }}>
                                        {optLetter}.
                                      </strong>

                                      <input
                                        value={opt.text}
                                        onChange={(e) => handleUpdateOptionText(q.id, opt.id, e.target.value)}
                                        placeholder={`Option ${optLetter} text`}
                                        style={{
                                          flex: 1,
                                          background: 'transparent',
                                          border: 'none',
                                          fontSize: '11.5px',
                                          color: 'var(--text-primary)',
                                          outline: 'none'
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Explanation (Optional) */}
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px' }}>
                                Answer Explanation & Rationale
                              </label>
                              <input
                                value={q.explanation || ''}
                                onChange={(e) => handleUpdateQuestion(q.id, { explanation: e.target.value })}
                                placeholder="Detailed reasoning for candidates and post-exam review..."
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-secondary)',
                                  fontSize: '11px'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Review Workspace Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border)',
                  marginTop: '8px',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    border: '1px solid var(--danger-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--danger)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Discard Draft
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSaveAsDraft}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Save size={13} />
                    <span>Save as Draft (Review Later)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmAndPublish}
                    disabled={isPublishing || validationIssues.length > 0}
                    style={{
                      padding: '8px 20px',
                      background: validationIssues.length > 0 ? 'var(--text-dim)' : 'var(--accent)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-contrast)',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: validationIssues.length > 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: validationIssues.length > 0 ? 0.6 : 1
                    }}
                  >
                    {isPublishing ? (
                      <>
                        <RefreshCw size={13} className="spin" />
                        <span>Publishing Exam...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} />
                        <span>Confirm & Publish Exam Paper</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ── STEP 4: SUCCESS PUBLISHED VIEW ── */}
          {step === 'published' && reviewedExam && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '18px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', marginBottom: '8px' }}>
                  <CheckCircle2 size={20} />
                  <strong style={{ fontSize: '15px' }}>Exam Paper Successfully Confirmed & Published!</strong>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {reviewedExam.title}
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {reviewedExam.subject} · {reviewedExam.topic} · {reviewedQuestions.length} Questions · {liveTotalMarks} Total Marks
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{reviewedQuestions.length}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Questions</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{liveTotalMarks}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Marks</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{reviewedExam.durationMinutes}m</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--success)' }}>PUBLISHED</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href="/mcq"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--accent-contrast)',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>Launch Student Exam Screen</span>
                    <ArrowRight size={13} />
                  </a>

                  <button
                    onClick={handleCopyStudentLink}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedLink ? 'Copied Student Link!' : 'Copy Student Link'}</span>
                  </button>

                  <button
                    onClick={onClose}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Done & Return to Exam Manager
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}
        >
          <span>Powered by Axent Autonomous Reasoning Engine</span>
          <span>
            {step === 'review'
              ? 'Draft state · All edits autosaved locally and sync to Question Bank'
              : 'University Academic Integrity & Proctored Examination Standards'}
          </span>
        </div>
      </div>
    </div>
  );
};
