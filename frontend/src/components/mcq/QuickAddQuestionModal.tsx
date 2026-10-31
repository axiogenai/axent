import React, { useState } from 'react';
import { Plus, X, Check, AlertTriangle } from 'lucide-react';
import { playSound } from '../../utils/sounds';
import { createQuestion } from '../../services/mcqService';
import { MCQQuestion, MCQDifficulty } from '../../types/mcq';
import { SimpleSelect } from '../watermelon/Select';

interface QuickAddQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuestionCreated: (createdQuestion: MCQQuestion) => void;
  defaultSubject?: string;
  defaultTopic?: string;
}

export const QuickAddQuestionModal: React.FC<QuickAddQuestionModalProps> = ({
  isOpen,
  onClose,
  onQuestionCreated,
  defaultSubject = 'Computer Science',
  defaultTopic = 'Technical'
}) => {
  const [text, setText] = useState('');
  const [options, setOptions] = useState([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false }
  ]);
  const [marks, setMarks] = useState(1);
  const [negativeMarks, setNegativeMarks] = useState(0);
  const [difficulty, setDifficulty] = useState<MCQDifficulty>('MEDIUM');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSetCorrect = (idx: number) => {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === idx })));
    playSound('click');
  };

  const handleOptionChange = (idx: number, val: string) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], text: val };
      return copy;
    });
  };

  const handleSave = () => {
    if (!text.trim()) {
      setError('Question prompt is required.');
      playSound('warning');
      return;
    }

    const filledOptions = options.filter((o) => o.text.trim().length > 0);
    if (filledOptions.length < 2) {
      setError('Please provide at least 2 non-empty options.');
      playSound('warning');
      return;
    }

    const hasCorrect = filledOptions.some((o) => o.isCorrect);
    if (!hasCorrect) {
      filledOptions[0].isCorrect = true;
    }

    const created = createQuestion({
      text: text.trim(),
      options: filledOptions.map((o) => ({
        id: crypto.randomUUID(),
        text: o.text.trim(),
        isCorrect: o.isCorrect
      })),
      subject: defaultSubject || 'General',
      topic: defaultTopic || 'Technical',
      difficulty,
      marks: Number(marks) || 1,
      negativeMarks: Number(negativeMarks) || 0,
      explanation: explanation.trim(),
      status: 'PUBLISHED',
      tags: [defaultTopic || 'Technical'],
      createdBy: 'Paper Setter Quick Add'
    });

    playSound('success');
    onQuestionCreated(created);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden'
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
            <Plus size={16} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Add Question Directly to Exam
            </h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: '28px', height: '28px', padding: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
              Question Prompt *
            </label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              placeholder="e.g. Which of the following data structures operates on a FIFO basis?"
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Options (Click circle to set correct answer) *
              </label>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Green = Correct Answer
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSetCorrect(idx)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: opt.isCorrect ? '2px solid var(--success)' : '1px solid var(--border)',
                        background: opt.isCorrect ? 'var(--success)' : 'var(--bg-surface)',
                        color: opt.isCorrect ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                      title="Set as correct option"
                    >
                      {opt.isCorrect ? <Check size={14} color="#ffffff" /> : letter}
                    </button>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${letter}`}
                      style={{
                        flex: 1,
                        background: 'var(--bg-surface)',
                        border: opt.isCorrect ? '1px solid var(--success)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 12px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Marks
              </label>
              <input
                type="number"
                min={1}
                value={marks}
                onChange={(e) => setMarks(parseInt(e.target.value, 10) || 1)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Negative Marks
              </label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={negativeMarks}
                onChange={(e) => setNegativeMarks(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Difficulty
              </label>
              <SimpleSelect<MCQDifficulty>
                value={difficulty}
                onChange={(val) => setDifficulty(val)}
                size="sm"
                options={[
                  { value: 'EASY', label: 'EASY' },
                  { value: 'MEDIUM', label: 'MEDIUM' },
                  { value: 'HARD', label: 'HARD' }
                ]}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Explanation / Solution (Optional)
            </label>
            <input
              type="text"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="e.g. Queue works on First-In-First-Out (FIFO) principle."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            background: 'var(--bg-surface)'
          }}
        >
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '0 14px', height: '32px' }}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary btn-sm" style={{ padding: '0 16px', height: '32px', fontWeight: 700 }}>
            <Check size={13} /> Add to Exam
          </button>
        </div>
      </div>
    </div>
  );
};
