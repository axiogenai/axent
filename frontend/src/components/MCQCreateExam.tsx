import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Save, Trash2, ChevronLeft, ChevronRight, CheckSquare,
  Clock, List, Settings, Eye, AlertCircle, BookOpen, X, Check, GraduationCap, MessageCircle, Copy
} from 'lucide-react';
import { MCQExamConfig, MCQExamStatus } from '../types/mcq';
import { MCQQuestion } from '../types/mcq';
import {
  getAllQuestions, getAllExams, createExam, saveExam, deleteExam,
  publishExam, closeExam, validateExamForPublish, onMcqDataChanged
} from '../services/mcqService';
import { AIPaperGeneratorModal } from './AIPaperGeneratorModal';
import { ConfirmationModal } from './ConfirmationModal';
import { playSound } from '../utils/sounds';

// ── Exam List View ────────────────────────────────────────────────────────────
interface ExamListProps {
  onCreateNew: () => void;
  onEdit: (exam: MCQExamConfig) => void;
}

const STATUS_COLOR: Record<MCQExamStatus, string> = {
  DRAFT: 'var(--text-muted)',
  PUBLISHED: 'var(--success)',
  CLOSED: 'var(--warning)',
  ARCHIVED: 'var(--text-dim)',
};

const ExamList: React.FC<ExamListProps> = ({ onCreateNew, onEdit }) => {
  const [exams, setExams] = useState<MCQExamConfig[]>(() => getAllExams());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<Record<string, string[]>>({});
  const [showAIModal, setShowAIModal] = useState(false);
  const [copiedExamId, setCopiedExamId] = useState<string | null>(null);

  const handleCopyLink = (examId: string) => {
    const url = `${window.location.origin}/mcq?examId=${encodeURIComponent(examId)}`;
    navigator.clipboard.writeText(url);
    setCopiedExamId(examId);
    playSound('click');
    setTimeout(() => setCopiedExamId(null), 2500);
  };

  const reload = () => setExams(getAllExams());

  useEffect(() => {
    const refresh = () => setExams(getAllExams());
    const unsubscribe = onMcqDataChanged(refresh);
    window.addEventListener('storage', refresh);
    refresh();
    return () => {
      unsubscribe();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const handlePublish = (id: string) => {
    const errors = publishExam(id);
    if (errors.length > 0) {
      setPublishErrors((prev) => ({ ...prev, [id]: errors }));
    } else {
      setPublishErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
      reload();
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>MCQ Exams</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>{exams.length} exam{exams.length !== 1 ? 's' : ''} configured</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowAIModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 14px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <GraduationCap size={15} color="var(--accent)" />
            <span>Generate Paper with AI</span>
          </button>

          <button
            onClick={onCreateNew}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 16px',
              cursor: 'pointer',
              color: 'var(--accent-contrast)',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <Plus size={14} />
            <span>Create Manual Exam</span>
          </button>
        </div>
      </div>

      {exams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <BookOpen size={36} style={{ marginBottom: '12px', opacity: 0.4, color: 'var(--text-muted)' }} />
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>No MCQ Exams Yet</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Create your first MCQ exam to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {exams.map((exam) => (
            <div key={exam.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{exam.title}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: STATUS_COLOR[exam.status], textTransform: 'uppercase', letterSpacing: '0.05em' }}>{exam.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exam.questionCount} questions</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exam.durationMinutes} min</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exam.totalMarks} marks</span>
                    {exam.subject && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exam.subject}</span>}
                    {exam.shuffleQuestions && <span style={{ fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--border)' }}>Shuffled Q</span>}
                    {exam.shuffleOptions && <span style={{ fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--border)' }}>Shuffled Options</span>}
                    {exam.negativeMarkingEnabled && <span style={{ fontSize: '11px', color: 'var(--warning)', background: 'var(--warning-bg)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--warning-border)' }}>Negative Marking</span>}
                    {exam.startTime && (
                      <span style={{ fontSize: '11px', color: 'var(--accent)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--border)' }}>
                        Opens: {new Date(exam.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {exam.endTime && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--border)' }}>
                        Closes: {new Date(exam.endTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {exam.resultDeclarationMode === 'WHATSAPP_GROUP' ? (
                      <span style={{ fontSize: '11px', color: 'var(--accent)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <MessageCircle size={11} /> WhatsApp Group Release
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', border: '1px solid var(--border)' }}>
                        Immediate Results
                      </span>
                    )}
                  </div>

                  {publishErrors[exam.id] && (
                    <div style={{ marginTop: '8px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                      {publishErrors[exam.id].map((e, i) => (
                        <p key={i} style={{ color: 'var(--danger)', fontSize: '12px', margin: '2px 0' }}>• {e}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {exam.status === 'DRAFT' && (
                    <button onClick={() => handlePublish(exam.id)} title="Publish exam" style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                      borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                      cursor: 'pointer', color: 'var(--success)', fontSize: '12px', fontWeight: 600,
                    }}>
                      <Check size={12} /> Publish
                    </button>
                  )}
                  {exam.status === 'PUBLISHED' && (
                    <>
                      <button
                        onClick={() => handleCopyLink(exam.id)}
                        title="Copy universal student examination link for this paper"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                          cursor: 'pointer', color: copiedExamId === exam.id ? 'var(--success)' : 'var(--text-primary)',
                          fontSize: '12px', fontWeight: 600,
                        }}
                      >
                        {copiedExamId === exam.id ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                        <span>{copiedExamId === exam.id ? 'Link Copied!' : 'Copy Student Link'}</span>
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm(`Close exam "${exam.title}"? This will conclude the examination and permanently purge its questions from the central database.`)) {
                            closeExam(exam.id);
                            reload();
                          }
                        }}
                        title="Conclude and close exam"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                          borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                          cursor: 'pointer', color: 'var(--warning)', fontSize: '12px', fontWeight: 600,
                        }}
                      >
                        Close Exam
                      </button>
                    </>
                  )}
                  <button onClick={() => onEdit(exam)} title="Edit exam" style={{
                    background: 'none', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                    cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px',
                  }}>
                    Edit
                  </button>
                  <button onClick={() => setConfirmDelete(exam.id)} title="Delete exam" style={{
                    background: 'none', border: '1px solid var(--danger-border)',
                    borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                    cursor: 'pointer', color: 'var(--danger)', fontSize: '12px',
                  }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmDelete !== null}
        title="Delete Examination?"
        message="This will permanently delete this examination paper, erase all its questions from the central cloud database, and purge all attached sessions immediately."
        confirmText="Yes, Delete Examination"
        cancelText="Cancel"
        tone="danger"
        icon="danger"
        onConfirm={async () => {
          if (confirmDelete) {
            const idToDelete = confirmDelete;
            setConfirmDelete(null);
            await deleteExam(idToDelete);
            reload();
            playSound('trash');
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* AI Exam Paper Generator Modal */}
      {showAIModal && (
        <AIPaperGeneratorModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          onPaperGenerated={() => {
            reload();
          }}
        />
      )}
    </div>
  );
};

// ── Question Selector ─────────────────────────────────────────────────────────
interface QuestionSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const QuestionSelector: React.FC<QuestionSelectorProps> = ({ selectedIds, onChange }) => {
  const [search, setSearch] = useState('');
  const allQuestions = useMemo(() => getAllQuestions().filter((q) => q.status !== 'ARCHIVED'), []);

  const filtered = useMemo(() =>
    allQuestions.filter((q) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return q.text.toLowerCase().includes(s) || q.subject.toLowerCase().includes(s) || q.topic.toLowerCase().includes(s);
    }), [allQuestions, search]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]);
  };

  const totalMarks = allQuestions.filter((q) => selectedIds.includes(q.id)).reduce((s, q) => s + q.marks, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {selectedIds.length} selected · {totalMarks} marks
        </span>
        {selectedIds.length > 0 && (
          <button onClick={() => onChange([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '12px' }}>
            Clear All
          </button>
        )}
      </div>
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter questions..."
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
      </div>
      <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            {allQuestions.length === 0 ? 'No published questions. Create questions in the Question Bank first.' : 'No matches found.'}
          </div>
        ) : (
          filtered.map((q, i) => {
            const sel = selectedIds.includes(q.id);
            return (
              <div key={q.id} onClick={() => toggle(q.id)} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer',
                background: sel ? 'var(--accent-subtle)' : 'transparent',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <Check size={11} color="var(--accent-contrast)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.text}</p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{q.subject}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>· {q.difficulty}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>· {q.marks}pt</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: q.status === 'PUBLISHED' ? 'var(--success)' : 'var(--text-muted)' }}>{q.status}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ── Exam Editor/Creator ───────────────────────────────────────────────────────
interface ExamEditorProps {
  initial?: MCQExamConfig;
  onSave: () => void;
  onBack: () => void;
}

const DEFAULT_EXAM: Omit<MCQExamConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  description: '',
  instructions: '',
  subject: '',
  topic: '',
  examCategory: 'Internal Assessment (CIE)',
  durationMinutes: 30,
  startTime: undefined,
  endTime: undefined,
  totalMarks: 0,
  questionCount: 10,
  questionIds: [],
  shuffleQuestions: true,
  shuffleOptions: true,
  negativeMarkingEnabled: false,
  allowReview: true,
  showExplanationsAfterSubmit: true,
  maxAttempts: 1,
  resultDeclarationMode: 'WHATSAPP_GROUP',
  status: 'DRAFT',
  createdBy: 'admin',
};

const ExamEditor: React.FC<ExamEditorProps> = ({ initial, onSave, onBack }) => {
  const [form, setForm] = useState<Omit<MCQExamConfig, 'id' | 'createdAt' | 'updatedAt'>>(
    initial ? { ...initial } : { ...DEFAULT_EXAM }
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [step, setStep] = useState<'basic' | 'questions' | 'settings'>('basic');

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Auto-compute totalMarks from selected questions
  const allQuestions = useMemo(() => getAllQuestions(), []);
  const availableSubjects = useMemo(
    () => Array.from(new Set(allQuestions.map((q) => q.subject).filter(Boolean))).sort(),
    [allQuestions]
  );
  const availableTopics = useMemo(
    () => Array.from(new Set(allQuestions.map((q) => q.topic).filter(Boolean))).sort(),
    [allQuestions]
  );
  const selectedQuestions = useMemo(() =>
    form.questionIds.map((id) => allQuestions.find((q) => q.id === id)).filter(Boolean) as MCQQuestion[],
    [form.questionIds, allQuestions]);

  const computedTotalMarks = useMemo(() =>
    selectedQuestions.reduce((sum, q) => sum + q.marks, 0),
    [selectedQuestions]);

  const handleSave = (publish = false) => {
    const examToValidate = { ...form, totalMarks: computedTotalMarks, questionCount: form.questionIds.length };
    const errs = validateExamForPublish({ ...examToValidate, id: initial?.id ?? '', createdAt: 0, updatedAt: 0 } as MCQExamConfig);

    if (publish && errs.length > 0) {
      setErrors(errs);
      return;
    }

    const finalForm = {
      ...form,
      totalMarks: computedTotalMarks,
      questionCount: form.questionIds.length,
      status: publish ? 'PUBLISHED' as const : (form.status === 'PUBLISHED' ? 'PUBLISHED' as const : 'DRAFT' as const),
    };

    if (initial) {
      saveExam({ ...initial, ...finalForm, updatedAt: Date.now() });
    } else {
      createExam(finalForm);
    }
    onSave();
  };

  const steps = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'questions', label: 'Questions' },
    { id: 'settings', label: 'Settings' },
  ] as const;

  return (
    <div>
      {/* Back */}
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px', padding: 0 }}>
        <ChevronLeft size={14} /> Back to Exams
      </button>

      <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
        {initial ? 'Edit Exam' : 'Create New MCQ Exam'}
      </h3>

      {/* Step tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        {steps.map((s) => (
          <button key={s.id} onClick={() => setStep(s.id)} style={{
            background: 'none', border: 'none', borderBottom: `2px solid ${step === s.id ? 'var(--accent)' : 'transparent'}`,
            cursor: 'pointer', padding: '10px 18px', fontSize: '13px', fontWeight: step === s.id ? 700 : 500,
            color: step === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
            marginBottom: '-1px',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px' }}>
          {errors.map((e, i) => <p key={i} style={{ color: 'var(--danger)', fontSize: '13px', margin: '2px 0' }}>• {e}</p>)}
        </div>
      )}

      {/* Step: Basic Info */}
      {step === 'basic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Exam Title *</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Quantitative Aptitude & Technical Assessment"
              style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select
                value={form.examCategory || 'Internal Assessment (CIE)'}
                onChange={(e) => set('examCategory', e.target.value as any)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="Internal Assessment (CIE)">Internal Assessment (CIE)</option>
                <option value="Semester End Exam (SEE)">Semester End Exam (SEE)</option>
                <option value="Mid-Term Examination">Mid-Term Examination</option>
                <option value="In-Semester Evaluation (ISE)">In-Semester Evaluation (ISE)</option>
                <option value="Aptitude">Aptitude & Placement</option>
                <option value="Weekly Lab Practical">Weekly Lab Practical</option>
                <option value="College Coding Competition">College Coding Competition</option>
                <option value="Multiple Choice Question (MCQ) Examination">General MCQ Exam</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Subject</label>
              <input
                list="mcq-available-subjects"
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
                placeholder="e.g. Computer Science, Mechanical..."
                style={inputStyle}
              />
              <datalist id="mcq-available-subjects">
                {availableSubjects.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label style={labelStyle}>Topic</label>
              <input
                list="mcq-available-topics"
                value={form.topic}
                onChange={(e) => set('topic', e.target.value)}
                placeholder="e.g. Data Structures, Thermodynamics..."
                style={inputStyle}
              />
              <datalist id="mcq-available-topics">
                {availableTopics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Duration (minutes) *</label>
              <input type="number" min={5} value={form.durationMinutes} onChange={(e) => set('durationMinutes', parseInt(e.target.value) || 30)}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Max Attempts per Student</label>
              <input type="number" min={1} value={form.maxAttempts} onChange={(e) => set('maxAttempts', parseInt(e.target.value) || 1)}
                style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Scheduled Start Window (optional — auto-unlocks exam)</label>
              <input
                type="datetime-local"
                value={form.startTime ? new Date(form.startTime - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                onChange={(e) => set('startTime', e.target.value ? new Date(e.target.value).getTime() : undefined)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Scheduled End Window (optional — auto-closes exam)</label>
              <input
                type="datetime-local"
                value={form.endTime ? new Date(form.endTime - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                onChange={(e) => set('endTime', e.target.value ? new Date(e.target.value).getTime() : undefined)}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Instructions (shown to students before exam)</label>
            <textarea value={form.instructions} onChange={(e) => set('instructions', e.target.value)} rows={3}
              placeholder="e.g. Each question carries 1 mark. There is negative marking of 0.25 marks for wrong answers..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
          </div>
          <div>
            <label style={labelStyle}>Description (internal notes)</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
              placeholder="Internal exam description for admin reference..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
          </div>
        </div>
      )}

      {/* Step: Questions */}
      {step === 'questions' && (
        <div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{form.questionIds.length}</strong> questions selected
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{computedTotalMarks}</strong> total marks (auto-computed)
              </span>
            </div>
          </div>
          <QuestionSelector
            selectedIds={form.questionIds}
            onChange={(ids) => set('questionIds', ids)}
          />
        </div>
      )}

      {/* Step: Settings */}
      {step === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Result Declaration Option */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <MessageCircle size={15} color="var(--accent)" />
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Result Declaration & Score Release
              </label>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Configure when and where candidates receive their exam scores.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* Option A: Manual / WhatsApp (Held on Server) */}
              <div
                onClick={() => set('resultDeclarationMode', 'WHATSAPP_GROUP')}
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1.5px solid ${(!form.resultDeclarationMode || form.resultDeclarationMode === 'WHATSAPP_GROUP') ? 'var(--accent)' : 'var(--border)'}`,
                  background: (!form.resultDeclarationMode || form.resultDeclarationMode === 'WHATSAPP_GROUP') ? 'var(--bg-elevated)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Manual Release & WhatsApp (Held on Server)
                  </span>
                  {(!form.resultDeclarationMode || form.resultDeclarationMode === 'WHATSAPP_GROUP') && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Scores and answers are locked on submission. Candidates receive a secure digital receipt. Paper setters manually export results (CSV) to announce on the class WhatsApp group.
                </p>
              </div>

              {/* Option B: Immediate */}
              <div
                onClick={() => set('resultDeclarationMode', 'IMMEDIATE')}
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1.5px solid ${form.resultDeclarationMode === 'IMMEDIATE' ? 'var(--accent)' : 'var(--border)'}`,
                  background: form.resultDeclarationMode === 'IMMEDIATE' ? 'var(--bg-elevated)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Immediate On-Screen Score & Solutions
                  </span>
                  {form.resultDeclarationMode === 'IMMEDIATE' && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Candidates view their score, percentage, and question solutions immediately on screen upon finishing the exam.
                </p>
              </div>
            </div>
          </div>

          {[
            { key: 'shuffleQuestions', label: 'Shuffle question order', desc: 'Each student receives questions in a different random order.' },
            { key: 'shuffleOptions', label: 'Shuffle answer options', desc: 'Each student sees options in a different random order for every question.' },
            { key: 'negativeMarkingEnabled', label: 'Negative marking', desc: 'Deduct marks for wrong answers (penalty defined per-question).' },
            { key: 'allowReview', label: 'Allow question revisit', desc: 'Students can navigate back to previous questions.' },
            { key: 'showExplanationsAfterSubmit', label: 'Show explanations after submit', desc: 'Display correct answer explanations when the student views results.' },
          ].map(({ key, label, desc }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <button
                onClick={() => set(key as keyof typeof form, !form[key as keyof typeof form] as never)}
                style={{
                  width: '42px', height: '24px', borderRadius: 'var(--radius-pill)', flexShrink: 0, marginTop: '1px',
                  background: form[key as keyof typeof form] ? 'var(--accent)' : 'var(--bg-hover)',
                  border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: 'var(--bg-elevated)',
                  position: 'absolute', top: '3px', left: form[key as keyof typeof form] ? '21px' : '3px', transition: 'left 0.2s',
                }} />
              </button>
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 20px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
          Cancel
        </button>
        <button onClick={() => handleSave(false)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 20px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
          Save Draft
        </button>
        {form.status !== 'PUBLISHED' && (
          <button onClick={() => handleSave(true)} style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', padding: '9px 20px', cursor: 'pointer', color: 'var(--success)', fontSize: '13px', fontWeight: 700 }}>
            Save & Publish
          </button>
        )}
      </div>
    </div>
  );
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  padding: '9px 12px', fontSize: '13px', outline: 'none',
};

// ── Main Export ───────────────────────────────────────────────────────────────
export const MCQCreateExam: React.FC = () => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingExam, setEditingExam] = useState<MCQExamConfig | null>(null);

  if (view === 'create') {
    return <ExamEditor onSave={() => setView('list')} onBack={() => setView('list')} />;
  }

  if (view === 'edit' && editingExam) {
    return (
      <ExamEditor
        initial={editingExam}
        onSave={() => { setView('list'); setEditingExam(null); }}
        onBack={() => { setView('list'); setEditingExam(null); }}
      />
    );
  }

  return (
    <ExamList
      onCreateNew={() => setView('create')}
      onEdit={(exam) => { setEditingExam(exam); setView('edit'); }}
    />
  );
};

export default MCQCreateExam;
