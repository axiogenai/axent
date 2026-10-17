import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, Edit2, Trash2, Copy, Archive, CheckCircle, ChevronDown, ChevronUp,
  Tag, BookOpen, Filter, X, Eye, BarChart2, Check, Upload, Download, GraduationCap,
  RefreshCw, AlertTriangle, FileText, CheckCheck, Database
} from 'lucide-react';
import {
  MCQQuestion, MCQOption, MCQDifficulty, MCQQuestionStatus
} from '../types/mcq';
import {
  getAllQuestions, saveQuestion, createQuestion, deleteQuestion, clearAllQuestions,
  duplicateQuestion, archiveQuestion, publishQuestion, validateQuestion, buildOption, onMcqDataChanged
} from '../services/mcqService';
import {
  generateMCQQuestionsWithAI,
  GeneratedMCQQuestion
} from '../services/groqService';
import { isSupabaseConnected } from '../services/supabaseService';
import { playSound } from '../utils/sounds';
import { ConfirmationModal } from './ConfirmationModal';

// ── Constants ─────────────────────────────────────────────────────────────────
const DIFFICULTY_COLORS: Record<MCQDifficulty, string> = {
  EASY: 'var(--success)',
  MEDIUM: 'var(--warning)',
  HARD: 'var(--danger)',
};

const STATUS_COLORS: Record<MCQQuestionStatus, string> = {
  DRAFT: 'var(--text-muted)',
  PUBLISHED: 'var(--success)',
  ARCHIVED: 'var(--text-dim)',
};

function emptyQuestion(): Omit<MCQQuestion, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    text: '',
    options: [buildOption('', false), buildOption('', false), buildOption('', false), buildOption('', false)],
    subject: '',
    topic: '',
    difficulty: 'MEDIUM',
    marks: 1,
    negativeMarks: 0,
    explanation: '',
    status: 'DRAFT',
    tags: [],
    createdBy: 'admin',
    bankGroup: '',
  };
}

// ── Question Editor Modal ─────────────────────────────────────────────────────
interface QuestionEditorProps {
  initial?: MCQQuestion;
  onSave: (q: MCQQuestion) => void;
  onClose: () => void;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({ initial, onSave, onClose }) => {
  const [form, setForm] = useState<Omit<MCQQuestion, 'id' | 'createdAt' | 'updatedAt'>>(
    initial ? { ...initial } : emptyQuestion()
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setOption = (idx: number, field: keyof MCQOption, value: string | boolean) => {
    const opts = form.options.map((o, i) => (i === idx ? { ...o, [field]: value } : o));
    setForm((f) => ({ ...f, options: opts }));
  };

  const setCorrect = (idx: number) => {
    const opts = form.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
    setForm((f) => ({ ...f, options: opts }));
  };

  const addOption = () => {
    if (form.options.length >= 6) return;
    setForm((f) => ({ ...f, options: [...f.options, buildOption('', false)] }));
  };

  const removeOption = (idx: number) => {
    if (form.options.length <= 2) return;
    const opts = form.options.filter((_, i) => i !== idx);
    setForm((f) => ({ ...f, options: opts }));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) =>
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

  const handleSave = () => {
    const errs = validateQuestion(form);
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    if (initial) {
      const updated = saveQuestion({ ...initial, ...form, updatedAt: Date.now() });
      onSave(updated);
    } else {
      const created = createQuestion(form);
      onSave(created);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '28px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {initial ? 'Edit Question' : 'New Question'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px',
          }}>
            {errors.map((e, i) => (
              <p key={i} style={{ color: 'var(--danger)', fontSize: '13px', margin: '2px 0' }}>• {e}</p>
            ))}
          </div>
        )}

        {/* Question Text */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Question Text *
          </label>
          <textarea
            value={form.text}
            onChange={(e) => set('text', e.target.value)}
            rows={3}
            placeholder="Enter the question..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              padding: '10px 12px', fontSize: '14px', resize: 'vertical', fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
        </div>

        {/* Options */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Answer Options * (click circle to set correct)
            </label>
            {form.options.length < 6 && (
              <button onClick={addOption} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '4px 10px',
                fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer',
              }}>
                <Plus size={12} /> Add Option
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {form.options.map((opt, idx) => (
              <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setCorrect(idx)}
                  title="Mark as correct answer"
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    border: opt.isCorrect ? '2px solid var(--success)' : '2px solid var(--border)',
                    background: opt.isCorrect ? 'var(--success-bg)' : 'var(--bg-surface)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {opt.isCorrect && <Check size={11} color="var(--success)" />}
                </button>
                <input
                  value={opt.text}
                  onChange={(e) => setOption(idx, 'text', e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  style={{
                    flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    padding: '8px 10px', fontSize: '13px', outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  disabled={form.options.length <= 2}
                  style={{
                    background: 'none', border: 'none', cursor: form.options.length <= 2 ? 'not-allowed' : 'pointer',
                    color: form.options.length <= 2 ? 'var(--text-dim)' : 'var(--danger)', padding: '4px',
                  }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Subject *</label>
            <input value={form.subject} onChange={(e) => set('subject', e.target.value)}
              placeholder="e.g. Data Structures"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Topic *</label>
            <input value={form.topic} onChange={(e) => set('topic', e.target.value)}
              placeholder="e.g. Binary Trees"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Difficulty</label>
            <select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as MCQDifficulty)}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Marks *</label>
            <input type="number" min={0.5} step={0.5} value={form.marks}
              onChange={(e) => set('marks', parseFloat(e.target.value) || 1)}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Negative Marks</label>
            <input type="number" min={0} step={0.25} value={form.negativeMarks}
              onChange={(e) => set('negativeMarks', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Bank Group</label>
            <input value={form.bankGroup ?? ''} onChange={(e) => set('bankGroup', e.target.value)}
              placeholder="e.g. Chapter 3"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
          </div>
        </div>

        {/* Explanation */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Explanation (shown after submission)
          </label>
          <textarea value={form.explanation} onChange={(e) => set('explanation', e.target.value)}
            rows={2} placeholder="Why is this the correct answer?"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: '13px', resize: 'vertical', fontFamily: 'var(--font-sans)', outline: 'none' }} />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Tags</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {form.tags.map((tag) => (
              <span key={tag} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)', padding: '3px 10px', fontSize: '12px', color: 'var(--text-secondary)',
              }}>
                {tag}
                <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 0 0 2px' }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="Type a tag and press Enter"
              style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '7px 10px', fontSize: '13px', outline: 'none' }} />
            <button type="button" onClick={addTag} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>
              Add
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 20px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 20px', cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '13px', fontWeight: 600 }}>
            {initial ? 'Save Changes' : 'Create Question'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── AI Question Generator Modal ───────────────────────────────────────────────
interface AiGeneratorModalProps {
  onAddQuestions: (questions: MCQQuestion[]) => void;
  onClose: () => void;
}

const AiGeneratorModal: React.FC<AiGeneratorModalProps> = ({ onAddQuestions, onClose }) => {
  const [topic, setTopic] = useState('Binary Search Trees & Balancing');
  const [subject, setSubject] = useState('Data Structures & Algorithms');
  const [difficulty, setDifficulty] = useState<MCQDifficulty>('MEDIUM');
  const [count, setCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedList, setGeneratedList] = useState<GeneratedMCQQuestion[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setErrorMsg('Please specify a topic.');
      return;
    }
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await generateMCQQuestionsWithAI({
        topic: topic.trim(),
        subject: subject.trim(),
        difficulty,
        count
      });
      setGeneratedList(res.questions);
      setSelectedIndices(res.questions.map((_, i) => i));
      playSound('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'AI generation failed. Please verify API key.');
      playSound('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCommit = () => {
    const toCommit = generatedList.filter((_, idx) => selectedIndices.includes(idx));
    const createdList: MCQQuestion[] = toCommit.map((q) => {
      return createQuestion({
        text: q.text,
        options: q.options.map((opt) => buildOption(opt.text, opt.isCorrect)),
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        explanation: q.explanation,
        status: 'PUBLISHED',
        tags: q.tags,
        createdBy: 'AI Generator'
      });
    });
    onAddQuestions(createdList);
    playSound('success');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto', padding: '26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GraduationCap size={18} color="var(--accent)" />
            <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Autonomous Question Bank Generator
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={13} />
            <span>{errorMsg}</span>
          </div>
        )}

        {generatedList.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Use the autonomous reasoning engine to synthesize university-level multiple choice questions with 4 verified options, single correct answer, and explanation.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Operating Systems"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Topic / Chapter *</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Semaphores and Deadlocks"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as MCQDifficulty)}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Number of Questions</label>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
                  <option value={3}>3 Questions</option>
                  <option value={5}>5 Questions</option>
                  <option value={8}>8 Questions</option>
                  <option value={10}>10 Questions</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button type="button" onClick={handleGenerate} disabled={isGenerating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', color: 'var(--accent-contrast)', cursor: isGenerating ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
                {isGenerating ? <RefreshCw size={13} className="spinner-icon" /> : <GraduationCap size={14} />}
                <span>{isGenerating ? 'Generating...' : 'Generate Questions'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedIndices.length} of {generatedList.length} Questions Selected
              </span>
              <button type="button" onClick={() => setSelectedIndices(selectedIndices.length === generatedList.length ? [] : generatedList.map((_, i) => i))}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                {selectedIndices.length === generatedList.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto', marginBottom: '18px' }}>
              {generatedList.map((q, idx) => {
                const isSelected = selectedIndices.includes(idx);
                return (
                  <div key={idx} onClick={() => setSelectedIndices(isSelected ? selectedIndices.filter(i => i !== idx) : [...selectedIndices, idx])}
                    style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                      border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      transition: 'all 0.15s ease'
                    }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`, background: isSelected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                        {isSelected && <Check size={11} color="var(--accent-contrast)" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{idx + 1}. {q.text}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '4px', marginBottom: '6px' }}>
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} style={{ fontSize: '11.5px', color: opt.isCorrect ? 'var(--success)' : 'var(--text-secondary)', fontWeight: opt.isCorrect ? 700 : 400 }}>
                              {String.fromCharCode(65 + oIdx)}. {opt.text} {opt.isCorrect && '✓'}
                            </div>
                          ))}
                        </div>
                        {q.explanation && (
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {q.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={() => setGeneratedList([])}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
                Regenerate
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="button" onClick={handleCommit} disabled={selectedIndices.length === 0}
                  style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', color: 'var(--accent-contrast)', cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
                  Add {selectedIndices.length} Questions to Bank
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Batch Import Modal (JSON / CSV) ───────────────────────────────────────────
interface ImportModalProps {
  onImportComplete: () => void;
  onClose: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ onImportComplete, onClose }) => {
  const [importText, setImportText] = useState('');
  const [parseResult, setParseResult] = useState<{ valid: Omit<MCQQuestion, 'id' | 'createdAt' | 'updatedAt'>[]; errors: string[] } | null>(null);

  const handleValidate = (textToValidate = importText) => {
    const raw = textToValidate.trim();
    if (!raw) {
      setParseResult(null);
      return;
    }

    const valid: Omit<MCQQuestion, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    const errors: string[] = [];

    // Try JSON format
    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        list.forEach((item, idx) => {
          if (!item.text || !item.options || item.options.length < 2) {
            errors.push(`Item #${idx + 1}: Missing question text or valid options.`);
            return;
          }
          const options: MCQOption[] = item.options.map((opt: any) => ({
            id: crypto.randomUUID(),
            text: typeof opt === 'string' ? opt : String(opt.text || ''),
            isCorrect: typeof opt === 'object' ? Boolean(opt.isCorrect) : false
          }));
          const correctCount = options.filter(o => o.isCorrect).length;
          if (correctCount !== 1) {
            options[0].isCorrect = true; // Auto-default option 0 if none flagged
          }
          valid.push({
            text: item.text,
            options,
            subject: item.subject || 'General Engineering',
            topic: item.topic || 'General',
            difficulty: item.difficulty === 'HARD' || item.difficulty === 'EASY' ? item.difficulty : 'MEDIUM',
            marks: Number(item.marks) || 1,
            negativeMarks: Number(item.negativeMarks) || 0,
            explanation: item.explanation || '',
            status: 'PUBLISHED',
            tags: Array.isArray(item.tags) ? item.tags : [],
            createdBy: 'Import'
          });
        });
      } catch (err: any) {
        errors.push(`JSON Parse Error: ${err.message}`);
      }
    } else {
      // Try CSV format: Question,OptA,OptB,OptC,OptD,Correct(A-D or 1-4),Subject,Topic
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach((line, idx) => {
        if (idx === 0 && line.toLowerCase().includes('question')) return; // Header row
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 6) {
          errors.push(`Line #${idx + 1}: Not enough columns (found ${cols.length}, need at least 6).`);
          return;
        }
        const [qText, a, b, c, d, correctCol, subj, top] = cols;
        const correctStr = (correctCol || 'A').toUpperCase();
        const correctIdx = correctStr === 'B' || correctStr === '2' ? 1 : correctStr === 'C' || correctStr === '3' ? 2 : correctStr === 'D' || correctStr === '4' ? 3 : 0;
        const options: MCQOption[] = [
          { id: crypto.randomUUID(), text: a, isCorrect: correctIdx === 0 },
          { id: crypto.randomUUID(), text: b, isCorrect: correctIdx === 1 },
          { id: crypto.randomUUID(), text: c, isCorrect: correctIdx === 2 },
          { id: crypto.randomUUID(), text: d, isCorrect: correctIdx === 3 }
        ];
        valid.push({
          text: qText,
          options,
          subject: subj || 'Computer Science',
          topic: top || 'Technical',
          difficulty: 'MEDIUM',
          marks: 1,
          negativeMarks: 0.25,
          explanation: '',
          status: 'PUBLISHED',
          tags: [top || 'Imported'],
          createdBy: 'CSV Import'
        });
      });
    }

    setParseResult({ valid, errors });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setImportText(content);
      handleValidate(content);
    };
    reader.readAsText(file);
  };

  const handleCommit = () => {
    if (!parseResult || parseResult.valid.length === 0) return;
    parseResult.valid.forEach(q => createQuestion(q));
    playSound('success');
    onImportComplete();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={18} color="var(--accent)" />
            <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Batch Import Questions (JSON / CSV)
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Upload a file (.json or .csv) or paste question data directly below:
          </p>
          <input type="file" accept=".json,.csv,.txt" onChange={handleFileUpload}
            style={{ fontSize: '12px', color: 'var(--text-muted)' }} />
        </div>

        <textarea
          rows={6}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            handleValidate(e.target.value);
          }}
          placeholder='[{"text":"What is O(1)?","options":[{"text":"Constant time","isCorrect":true},{"text":"Linear","isCorrect":false}],"subject":"DSA","topic":"Complexity"}]'
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical' }}
        />

        {parseResult && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ padding: '8px 12px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '12px', fontWeight: 700 }}>
              ✓ Found {parseResult.valid.length} valid question(s) ready to import.
            </div>
            {parseResult.errors.length > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700 }}>Errors ({parseResult.errors.length}):</p>
                {parseResult.errors.slice(0, 3).map((e, i) => <p key={i} style={{ margin: '2px 0' }}>• {e}</p>)}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button type="button" onClick={handleCommit} disabled={!parseResult || parseResult.valid.length === 0}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', color: 'var(--accent-contrast)', cursor: !parseResult || parseResult.valid.length === 0 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
            Import {parseResult?.valid.length || 0} Questions
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Question Bank Component ──────────────────────────────────────────────
export const MCQQuestionBank: React.FC = () => {
  const [questions, setQuestions] = useState<MCQQuestion[]>(() => getAllQuestions());
  const [search, setSearch] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<MCQDifficulty | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<MCQQuestionStatus | 'ALL'>('ALL');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [editing, setEditing] = useState<MCQQuestion | null | 'new'>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isClearBankModalOpen, setIsClearBankModalOpen] = useState(false);
  const [publishErrorText, setPublishErrorText] = useState<string | null>(null);

  const reload = () => setQuestions(getAllQuestions());

  useEffect(() => {
    const refresh = () => setQuestions(getAllQuestions());
    const unsubscribe = onMcqDataChanged(refresh);
    window.addEventListener('storage', refresh);
    refresh();
    return () => {
      unsubscribe();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const subjects = useMemo(() => {
    const s = new Set(questions.map((q) => q.subject).filter(Boolean));
    return Array.from(s).sort();
  }, [questions]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filterDifficulty !== 'ALL' && q.difficulty !== filterDifficulty) return false;
      if (filterStatus !== 'ALL' && q.status !== filterStatus) return false;
      if (filterSubject !== 'ALL' && q.subject !== filterSubject) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          q.text.toLowerCase().includes(s) ||
          q.subject.toLowerCase().includes(s) ||
          q.topic.toLowerCase().includes(s) ||
          q.tags.some((t) => t.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [questions, search, filterDifficulty, filterStatus, filterSubject]);

  const stats = useMemo(() => ({
    total: questions.length,
    published: questions.filter((q) => q.status === 'PUBLISHED').length,
    draft: questions.filter((q) => q.status === 'DRAFT').length,
    easy: questions.filter((q) => q.difficulty === 'EASY').length,
    medium: questions.filter((q) => q.difficulty === 'MEDIUM').length,
    hard: questions.filter((q) => q.difficulty === 'HARD').length,
  }), [questions]);

  const handleDelete = (id: string) => {
    deleteQuestion(id);
    reload();
    setConfirmDelete(null);
  };

  const handleDuplicate = (id: string) => {
    duplicateQuestion(id);
    reload();
  };

  const handleArchive = (id: string) => {
    archiveQuestion(id);
    reload();
  };

  const handlePublish = (id: string) => {
    const errors = publishQuestion(id);
    if (errors.length > 0) {
      setPublishErrorText(errors.map((error) => `• ${error}`).join('\n'));
      return;
    }
    reload();
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(questions, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `codedna_question_bank_${Date.now()}.json`);
    dlAnchorElem.click();
  };

  const handleExportCsv = () => {
    const headers = ['Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'Correct', 'Subject', 'Topic', 'Difficulty', 'Marks'];
    const rows = questions.map(q => {
      const optA = q.options[0]?.text || '';
      const optB = q.options[1]?.text || '';
      const optC = q.options[2]?.text || '';
      const optD = q.options[3]?.text || '';
      const correctIdx = q.options.findIndex(o => o.isCorrect);
      const correctLetter = String.fromCharCode(65 + Math.max(0, correctIdx));
      return [
        `"${q.text.replace(/"/g, '""')}"`,
        `"${optA.replace(/"/g, '""')}"`,
        `"${optB.replace(/"/g, '""')}"`,
        `"${optC.replace(/"/g, '""')}"`,
        `"${optD.replace(/"/g, '""')}"`,
        correctLetter,
        `"${q.subject.replace(/"/g, '""')}"`,
        `"${q.topic.replace(/"/g, '""')}"`,
        q.difficulty,
        q.marks
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers.join(','), ...rows].join('\n'));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', csvContent);
    dlAnchorElem.setAttribute('download', `codedna_question_bank_${Date.now()}.csv`);
    dlAnchorElem.click();
  };

  return (
    <div style={{ padding: '0' }}>
      {/* Cloud DB & Stats row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Question Repository</span>
          {isSupabaseConnected() && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--success-bg)', border: '1px solid var(--success-border)', fontSize: '10.5px', fontWeight: 700, color: 'var(--success)' }}>
              <Database size={10} />
              <span>Central Cloud Sync Active</span>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Published', value: stats.published, color: 'var(--success)' },
          { label: 'Draft', value: stats.draft, color: 'var(--text-muted)' },
          { label: 'Easy', value: stats.easy, color: DIFFICULTY_COLORS.EASY },
          { label: 'Medium', value: stats.medium, color: DIFFICULTY_COLORS.MEDIUM },
          { label: 'Hard', value: stats.hard, color: DIFFICULTY_COLORS.HARD },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: '14px 16px',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, subjects, tags..."
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: '32px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
          <option value="ALL">All Subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value as MCQDifficulty | 'ALL')}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
          <option value="ALL">All Difficulty</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as MCQQuestionStatus | 'ALL')}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
          <option value="ALL">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={() => setIsAiModalOpen(true)} title="Generate questions using Autonomous Engine"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600 }}>
            <GraduationCap size={13} color="var(--accent)" />
            <span>AI Generator</span>
          </button>

          <button type="button" onClick={() => setIsImportModalOpen(true)} title="Import questions from JSON or CSV"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 500 }}>
            <Upload size={13} />
            <span>Import</span>
          </button>

          <button type="button" onClick={handleExportJson} title="Export question bank as JSON"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 500 }}>
            <Download size={13} />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setIsClearBankModalOpen(true)}
            disabled={questions.length === 0}
            title="Purge all questions from question bank"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              cursor: questions.length === 0 ? 'not-allowed' : 'pointer',
              color: 'var(--danger)',
              fontSize: '12.5px',
              fontWeight: 600,
              opacity: questions.length === 0 ? 0.4 : 1
            }}
          >
            <Trash2 size={13} />
            <span>Clear Bank</span>
          </button>

          <button type="button" onClick={() => setEditing('new')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '13px', fontWeight: 600 }}>
            <Plus size={14} /> New Question
          </button>
        </div>
      </div>

      {/* Question list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <BookOpen size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            {questions.length === 0 ? 'No questions in question bank' : 'No questions match filters'}
          </p>
          <p style={{ fontSize: '13px', marginBottom: '18px' }}>
            {questions.length === 0 ? 'Create questions manually, import via JSON/CSV, or use the AI Generator.' : 'Try adjusting filters or search.'}
          </p>
          {questions.length === 0 && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button type="button" onClick={() => setIsAiModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--accent-contrast)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                <GraduationCap size={15} /> Generate 5 Sample Questions with AI
              </button>
              <button type="button" onClick={() => setEditing('new')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '13px' }}>
                <Plus size={14} /> New Question
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map((q) => {
            const isExpanded = expandedId === q.id;
            return (
              <div key={q.id} style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: DIFFICULTY_COLORS[q.difficulty], flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap' }}>
                      {q.text || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Untitled question</span>}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{q.subject}</span>
                      {q.topic && <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>• {q.topic}</span>}
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>• {q.marks}pt{q.negativeMarks > 0 ? ` / -${q.negativeMarks}` : ''}</span>
                      <span style={{ fontSize: '11px', color: STATUS_COLORS[q.status], fontWeight: 600 }}>{q.status}</span>
                      {q.tags.slice(0, 3).map((t) => (
                        <span key={t} style={{ fontSize: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '1px 7px', color: 'var(--text-dim)' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {q.status === 'DRAFT' && (
                      <button title="Publish" onClick={() => handlePublish(q.id)} style={{ background: 'none', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--success)' }}>
                        <CheckCircle size={13} />
                      </button>
                    )}
                    <button title="Edit" onClick={() => setEditing(q)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <Edit2 size={13} />
                    </button>
                    <button title="Duplicate" onClick={() => handleDuplicate(q.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <Copy size={13} />
                    </button>
                    {q.status !== 'ARCHIVED' && (
                      <button title="Archive" onClick={() => handleArchive(q.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <Archive size={13} />
                      </button>
                    )}
                    <button title="Delete" onClick={() => setConfirmDelete(q.id)} style={{ background: 'none', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--danger)' }}>
                      <Trash2 size={13} />
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : q.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px', background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                      {q.options.map((opt, i) => (
                        <div key={opt.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                          background: opt.isCorrect ? 'var(--success-bg)' : 'var(--bg-elevated)',
                          border: `1px solid ${opt.isCorrect ? 'var(--success-border)' : 'var(--border)'}`,
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', width: '16px' }}>{String.fromCharCode(65 + i)}</span>
                          <span style={{ fontSize: '13px', color: opt.isCorrect ? 'var(--success)' : 'var(--text-primary)', flex: 1 }}>{opt.text}</span>
                          {opt.isCorrect && <CheckCircle size={13} color="var(--success)" />}
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Explanation:</strong> {q.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Question editor modal */}
      {editing !== null && (
        <QuestionEditor
          initial={editing === 'new' ? undefined : editing}
          onSave={() => { reload(); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}

      {/* AI generator modal */}
      {isAiModalOpen && (
        <AiGeneratorModal
          onAddQuestions={() => reload()}
          onClose={() => setIsAiModalOpen(false)}
        />
      )}

      {/* Batch Import modal */}
      {isImportModalOpen && (
        <ImportModal
          onImportComplete={() => reload()}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}

      {/* Confirm Clear Entire Question Bank */}
      <ConfirmationModal
        isOpen={isClearBankModalOpen}
        title="Clear Entire Question Bank?"
        message="This will permanently delete ALL questions in this institution repository, both from local storage and the central cloud database. This operation is immediate and irreversible."
        confirmText="Yes, Purge Question Bank"
        cancelText="Cancel"
        tone="danger"
        icon="danger"
        badgeText="Question Repository Clearance"
        onConfirm={() => {
          setIsClearBankModalOpen(false);
          playSound('trash');
          clearAllQuestions();
          reload();
        }}
        onCancel={() => setIsClearBankModalOpen(false)}
      />

      {/* Confirm delete single question */}
      <ConfirmationModal
        isOpen={confirmDelete !== null}
        title="Delete Question?"
        message="Are you sure you want to delete this question? This action will remove it from the central question bank. Active exam attempts will not be corrupted because question snapshots are immutable."
        confirmText="Delete Question"
        cancelText="Cancel"
        tone="danger"
        icon="danger"
        badgeText="Question Deletion"
        onConfirm={() => {
          if (confirmDelete) {
            const targetId = confirmDelete;
            setConfirmDelete(null);
            handleDelete(targetId);
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Publish validation error modal */}
      {publishErrorText && (
        <ConfirmationModal
          isOpen={Boolean(publishErrorText)}
          title="Question Cannot Be Published"
          message={`Please fix the following validation issues before publishing this question:\n\n${publishErrorText}`}
          confirmText="Got It"
          cancelText="Close"
          tone="neutral"
          icon="warning"
          onConfirm={() => setPublishErrorText(null)}
          onCancel={() => setPublishErrorText(null)}
        />
      )}
    </div>
  );
};

export default MCQQuestionBank;
