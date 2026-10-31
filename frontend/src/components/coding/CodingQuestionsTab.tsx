import React, { useState, useEffect } from 'react';
import {
  Plus, Code2, EyeOff, CheckCircle2, Clock, Cpu,
  Trash2, Edit2, Tag, ChevronRight, Search, Filter
} from 'lucide-react';
import { CodingQuestion, CodingDifficulty } from '../../types/codingQuestion';
import {
  getAllCodingQuestions, deleteCodingQuestion,
  publishCodingQuestion, onCodingDataChanged, DIFFICULTY_MARKS
} from '../../services/codingQuestionService';
import { CodingQuestionBuilder } from './CodingQuestionBuilder';
import { SimpleSelect } from '../watermelon/Select';

interface CodingQuestionsTabProps {
  createdBy?: string;
}

const difficultyColors: Record<CodingDifficulty, string> = {
  EASY: '#4ade80',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
};

const statusColors: Record<string, string> = {
  DRAFT: '#71717a',
  PUBLISHED: '#4ade80',
  ARCHIVED: '#a1a1aa',
};

export const CodingQuestionsTab: React.FC<CodingQuestionsTabProps> = ({ createdBy = 'admin' }) => {
  const [questions, setQuestions] = useState<CodingQuestion[]>(() => getAllCodingQuestions());
  const [editingQuestion, setEditingQuestion] = useState<CodingQuestion | null | undefined>(undefined);
  // undefined = list view, null = new question, CodingQuestion = editing
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<CodingDifficulty | 'ALL'>('ALL');

  useEffect(() => {
    const unsub = onCodingDataChanged(() => setQuestions(getAllCodingQuestions()));
    return unsub;
  }, []);

  const filtered = questions.filter((q) => {
    const matchSearch = !searchQuery || q.title.toLowerCase().includes(searchQuery.toLowerCase()) || q.tags.some((t) => t.includes(searchQuery.toLowerCase()));
    const matchDiff = filterDifficulty === 'ALL' || q.difficulty === filterDifficulty;
    return matchSearch && matchDiff;
  });

  // â”€â”€ Builder view â”€â”€
  if (editingQuestion !== undefined) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CodingQuestionBuilder
          existing={editingQuestion}
          createdBy={createdBy}
          onSaved={() => { setEditingQuestion(undefined); setQuestions(getAllCodingQuestions()); }}
          onCancel={() => setEditingQuestion(undefined)}
        />
      </div>
    );
  }

  // â”€â”€ List view â”€â”€
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 0' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box' }}
            placeholder="Search by title or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ minWidth: '150px' }}>
          <SimpleSelect<CodingDifficulty | 'ALL'>
            value={filterDifficulty}
            onChange={(val) => setFilterDifficulty(val)}
            size="sm"
            options={[
              { value: 'ALL', label: 'All Difficulties' },
              { value: 'EASY', label: 'Easy' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HARD', label: 'Hard' }
            ]}
          />
        </div>
        <button
          onClick={() => setEditingQuestion(null)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#000', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Plus size={13} /> New Question
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['ALL', 'EASY', 'MEDIUM', 'HARD'] as const).map((d) => {
          const count = d === 'ALL' ? questions.length : questions.filter((q) => q.difficulty === d).length;
          return (
            <div key={d} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: '12px' }}>
              <span style={{ color: d === 'ALL' ? 'var(--text-secondary)' : difficultyColors[d as CodingDifficulty], fontWeight: 700 }}>{count}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>{d === 'ALL' ? 'Total' : d.charAt(0) + d.slice(1).toLowerCase()}</span>
            </div>
          );
        })}
        <div style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: '12px' }}>
          <span style={{ color: '#4ade80', fontWeight: 700 }}>{questions.filter((q) => q.status === 'PUBLISHED').length}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>Published</span>
        </div>
      </div>

      {/* Question list */}
      {filtered.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px' }}>
          <Code2 size={28} color="var(--text-muted)" style={{ marginBottom: '10px' }} />
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {questions.length === 0
              ? 'No coding questions yet. Click "New Question" to create one.'
              : 'No questions match your search/filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map((q) => (
            <div
              key={q.id}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', transition: 'border-color 0.15s' }}
            >
              {/* Difficulty badge */}
              <div style={{ width: '4px', height: '40px', borderRadius: '2px', background: difficultyColors[q.difficulty], flexShrink: 0 }} />

              {/* Main info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: statusColors[q.status], background: `${statusColors[q.status]}15`, padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>
                    {q.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{ color: difficultyColors[q.difficulty], fontWeight: 600 }}>{q.difficulty}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} />{q.timeLimitMs}ms</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Cpu size={10} />{q.memoryLimitMb}MB</span>
                  <span>{q.marks}pts</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <EyeOff size={10} />{q.hiddenTestCases.length} hidden
                  </span>
                  {q.tags.slice(0, 3).map((t) => (
                    <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Tag size={9} />{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {q.status === 'DRAFT' && (
                  <button
                    onClick={() => { publishCodingQuestion(q.id); setQuestions(getAllCodingQuestions()); }}
                    title="Publish question"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '5px', border: '1px solid #4ade80', background: 'rgba(74,222,128,0.08)', color: '#4ade80', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    <CheckCircle2 size={11} /> Publish
                  </button>
                )}
                <button
                  onClick={() => setEditingQuestion(q)}
                  title="Edit question"
                  style={{ padding: '6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${q.title}"?`)) { deleteCodingQuestion(q.id); setQuestions(getAllCodingQuestions()); } }}
                  title="Delete question"
                  style={{ padding: '6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
