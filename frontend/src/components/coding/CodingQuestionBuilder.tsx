import React, { useState, useCallback } from 'react';
import {
  Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronUp,
  Code2, Terminal, CheckCircle2, Clock, Cpu, Tag,
  AlertTriangle, Save, X, GripVertical, BookOpen
} from 'lucide-react';
import { CodingQuestion, TestCase, CodingDifficulty, AllowedLanguage } from '../../types/codingQuestion';
import {
  createCodingQuestion, updateCodingQuestion, makeTestCase,
  DEFAULT_ALLOWED_LANGUAGES, DIFFICULTY_MARKS
} from '../../services/codingQuestionService';
import { SimpleSelect } from '../watermelon/Select';

interface CodingQuestionBuilderProps {
  existing?: CodingQuestion | null;
  onSaved: (q: CodingQuestion) => void;
  onCancel: () => void;
  createdBy?: string;
}

const FONT_MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const difficultyColors: Record<CodingDifficulty, string> = {
  EASY: '#4ade80',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
};

export const CodingQuestionBuilder: React.FC<CodingQuestionBuilderProps> = ({
  existing, onSaved, onCancel, createdBy = 'admin'
}) => {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [problemStatement, setProblemStatement] = useState(existing?.problemStatement ?? '');
  const [inputFormat, setInputFormat] = useState(existing?.inputFormat ?? '');
  const [outputFormat, setOutputFormat] = useState(existing?.outputFormat ?? '');
  const [difficulty, setDifficulty] = useState<CodingDifficulty>(existing?.difficulty ?? 'MEDIUM');
  const [marks, setMarks] = useState(existing?.marks ?? DIFFICULTY_MARKS.MEDIUM);
  const [timeLimitMs, setTimeLimitMs] = useState(existing?.timeLimitMs ?? 2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(existing?.memoryLimitMb ?? 256);
  const [topic, setTopic] = useState(existing?.topic ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? 'Computer Science');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [constraintInput, setConstraintInput] = useState('');
  const [constraints, setConstraints] = useState(existing?.constraints ?? [{ label: '' }]);
  const [sampleTestCases, setSampleTestCases] = useState<TestCase[]>(
    existing?.sampleTestCases?.length ? existing.sampleTestCases : [makeTestCase({ isSample: true, isHidden: false })]
  );
  const [hiddenTestCases, setHiddenTestCases] = useState<TestCase[]>(
    existing?.hiddenTestCases ?? []
  );
  const [allowedLanguages, setAllowedLanguages] = useState<AllowedLanguage[]>(
    existing?.allowedLanguages?.length ? existing.allowedLanguages : DEFAULT_ALLOWED_LANGUAGES
  );
  const [starterCode, setStarterCode] = useState<Record<string, string>>(existing?.starterCode ?? {});
  const [activeStarterLang, setActiveStarterLang] = useState<string>(DEFAULT_ALLOWED_LANGUAGES[0].language);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'problem' | 'testcases' | 'config' | 'starter'>('problem');

  const validate = useCallback((): string[] => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Question title is required');
    if (!problemStatement.trim()) errs.push('Problem statement is required');
    if (!inputFormat.trim()) errs.push('Input format is required');
    if (!outputFormat.trim()) errs.push('Output format is required');
    if (sampleTestCases.length === 0) errs.push('At least one sample test case is required');
    for (const tc of sampleTestCases) {
      if (!tc.expectedOutput.trim()) errs.push('All sample test cases must have expected output');
    }
    if (hiddenTestCases.length === 0) errs.push('At least one hidden test case is required for grading');
    return errs;
  }, [title, problemStatement, inputFormat, outputFormat, sampleTestCases, hiddenTestCases]);

  const handleSave = async (status: 'DRAFT' | 'PUBLISHED') => {
    const errs = validate();
    if (status === 'PUBLISHED' && errs.length > 0) {
      setErrors(errs);
      return;
    }
    setIsSaving(true);
    setErrors([]);
    const payload = {
      title: title.trim(),
      problemStatement: problemStatement.trim(),
      inputFormat: inputFormat.trim(),
      outputFormat: outputFormat.trim(),
      constraints: constraints.filter((c) => c.label.trim()),
      sampleTestCases,
      hiddenTestCases,
      difficulty,
      marks,
      timeLimitMs,
      memoryLimitMb,
      allowedLanguages,
      tags,
      topic: topic.trim(),
      subject: subject.trim(),
      status,
      starterCode,
      createdBy,
    };
    const saved = existing
      ? updateCodingQuestion(existing.id, payload)
      : createCodingQuestion(payload);
    setIsSaving(false);
    if (saved) onSaved(saved);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setTagInput('');
  };

  const updateTestCase = (
    list: TestCase[], setList: React.Dispatch<React.SetStateAction<TestCase[]>>,
    idx: number, field: keyof TestCase, value: unknown
  ) => {
    setList((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeTestCase = (
    list: TestCase[], setList: React.Dispatch<React.SetStateAction<TestCase[]>>, idx: number
  ) => setList((prev) => prev.filter((_, i) => i !== idx));

  const sectionStyle = (s: string): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: '6px',
    border: activeSection === s ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: activeSection === s ? 'var(--bg-surface)' : 'transparent',
    color: activeSection === s ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    fontFamily: FONT_MONO,
    fontSize: '12.5px',
    resize: 'vertical',
    minHeight: '80px',
  };

  const label = (text: string, required = false) => (
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {text}{required && <span style={{ color: 'var(--danger)', marginLeft: '3px' }}>*</span>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <Code2 size={18} color="var(--accent)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {existing ? 'Edit Coding Question' : 'New Coding Question'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Code Spark — Paper Setter</div>
        </div>
        {/* Difficulty selector */}
        <div style={{ minWidth: '120px' }}>
          <SimpleSelect<CodingDifficulty>
            value={difficulty}
            onChange={(d) => {
              setDifficulty(d);
              setMarks(DIFFICULTY_MARKS[d]);
            }}
            size="sm"
            options={[
              { value: 'EASY', label: 'Easy' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HARD', label: 'Hard' }
            ]}
          />
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <X size={18} />
        </button>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '6px', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', overflowX: 'auto' }}>
        <button style={sectionStyle('problem')} onClick={() => setActiveSection('problem')}><BookOpen size={12} style={{ marginRight: 5 }} />Problem</button>
        <button style={sectionStyle('testcases')} onClick={() => setActiveSection('testcases')}><Terminal size={12} style={{ marginRight: 5 }} />Test Cases</button>
        <button style={sectionStyle('config')} onClick={() => setActiveSection('config')}><Cpu size={12} style={{ marginRight: 5 }} />Config</button>
        <button style={sectionStyle('starter')} onClick={() => setActiveSection('starter')}><Code2 size={12} style={{ marginRight: 5 }} />Starter Code</button>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ margin: '12px 20px 0', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)' }}>
          {errors.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--danger)', marginBottom: i < errors.length - 1 ? '4px' : 0 }}>
              <AlertTriangle size={11} />{e}
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ─── PROBLEM SECTION ─── */}
        {activeSection === 'problem' && (
          <>
            <div>
              {label('Question Title', true)}
              <input style={inputStyle} placeholder="e.g. Two Sum, Fibonacci Sequence, Palindrome Check" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              {label('Problem Statement', true)}
              <textarea style={{ ...textareaStyle, minHeight: '140px' }}
                placeholder="Describe the problem clearly. You can use plain text. E.g.:\n\nGiven an array of integers and a target sum, find two numbers that add up to the target..."
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                {label('Input Format', true)}
                <textarea style={textareaStyle} placeholder="Describe input format line by line. E.g.:\nLine 1: N (number of elements)\nLine 2: N space-separated integers" value={inputFormat} onChange={(e) => setInputFormat(e.target.value)} />
              </div>
              <div>
                {label('Output Format', true)}
                <textarea style={textareaStyle} placeholder="Describe output format. E.g.:\nPrint two integers — the indices (0-based) of the two numbers, separated by a space." value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} />
              </div>
            </div>

            {/* Constraints */}
            <div>
              {label('Constraints')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {constraints.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      style={{ ...inputStyle, fontFamily: FONT_MONO }}
                      placeholder={`e.g. 1 ≤ N ≤ 10^5`}
                      value={c.label}
                      onChange={(e) => {
                        const next = [...constraints];
                        next[i] = { label: e.target.value };
                        setConstraints(next);
                      }}
                    />
                    <button
                      onClick={() => setConstraints((p) => p.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
                    ><Trash2 size={14} /></button>
                  </div>
                ))}
                <button
                  onClick={() => setConstraints((p) => [...p, { label: '' }])}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '5px', border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}
                >
                  <Plus size={12} /> Add Constraint
                </button>
              </div>
            </div>

            {/* Tags */}
            <div>
              {label('Tags')}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {tags.map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <Tag size={9} />{t}
                    <button onClick={() => setTags((p) => p.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}><X size={10} /></button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. arrays, binary-search, dp" value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                />
                <button onClick={addTag} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '12px' }}>Add</button>
              </div>
            </div>
          </>
        )}

        {/* ─── TEST CASES SECTION ─── */}
        {activeSection === 'testcases' && (
          <>
            {/* Sample Test Cases */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={14} color="var(--accent)" />
                  Sample Test Cases <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>(shown to candidates)</span>
                </div>
                <button onClick={() => setSampleTestCases((p) => [...p, makeTestCase({ isSample: true, isHidden: false })])}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  <Plus size={12} /> Add Sample
                </button>
              </div>
              {sampleTestCases.map((tc, i) => (
                <TestCaseEditor key={tc.id} tc={tc} index={i} label={`Sample ${i + 1}`}
                  onChange={(field, val) => updateTestCase(sampleTestCases, setSampleTestCases, i, field, val)}
                  onDelete={() => removeTestCase(sampleTestCases, setSampleTestCases, i)}
                  showHiddenToggle={false}
                />
              ))}
              {sampleTestCases.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                  No sample test cases yet. Add at least one to show candidates.
                </div>
              )}
            </div>

            {/* Hidden Test Cases */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <EyeOff size={14} color="var(--warning)" />
                  Hidden Test Cases <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>(used for grading only)</span>
                </div>
                <button onClick={() => setHiddenTestCases((p) => [...p, makeTestCase({ isHidden: true, isSample: false })])}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  <Plus size={12} /> Add Hidden
                </button>
              </div>
              {hiddenTestCases.map((tc, i) => (
                <TestCaseEditor key={tc.id} tc={tc} index={i} label={`Hidden ${i + 1}`}
                  onChange={(field, val) => updateTestCase(hiddenTestCases, setHiddenTestCases, i, field, val)}
                  onDelete={() => removeTestCase(hiddenTestCases, setHiddenTestCases, i)}
                  showHiddenToggle
                />
              ))}
              {hiddenTestCases.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                  No hidden test cases yet. Add at least one for grading.
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── CONFIG SECTION ─── */}
        {activeSection === 'config' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                {label('Marks')}
                <input style={inputStyle} type="number" min={1} max={100} value={marks} onChange={(e) => setMarks(Number(e.target.value))} />
              </div>
              <div>
                {label('Time Limit (ms)')}
                <input style={inputStyle} type="number" min={100} max={10000} step={100} value={timeLimitMs} onChange={(e) => setTimeLimitMs(Number(e.target.value))} />
              </div>
              <div>
                {label('Memory Limit (MB)')}
                <input style={inputStyle} type="number" min={32} max={2048} step={32} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(Number(e.target.value))} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                {label('Subject')}
                <input style={inputStyle} placeholder="e.g. Computer Science" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                {label('Topic')}
                <input style={inputStyle} placeholder="e.g. Data Structures, Algorithms" value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>
            </div>

            {/* Allowed Languages */}
            <div>
              {label('Allowed Languages')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {DEFAULT_ALLOWED_LANGUAGES.map((lang) => {
                  const isAllowed = allowedLanguages.some((l) => l.language === lang.language);
                  return (
                    <div key={lang.language} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${isAllowed ? 'var(--border-strong)' : 'var(--border)'}`, background: isAllowed ? 'var(--bg-surface)' : 'transparent' }}>
                      <input type="checkbox" checked={isAllowed} onChange={(e) => {
                        if (e.target.checked) setAllowedLanguages((p) => [...p, lang]);
                        else setAllowedLanguages((p) => p.filter((l) => l.language !== lang.language));
                      }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>{lang.language}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lang.timeMultiplier}Ã— time</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── STARTER CODE SECTION ─── */}
        {activeSection === 'starter' && (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Provide starter code templates for each language. Candidates will see this pre-filled in the editor.
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {allowedLanguages.map((l) => (
                <button key={l.language}
                  onClick={() => setActiveStarterLang(l.language)}
                  style={{ padding: '5px 12px', borderRadius: '5px', border: `1px solid ${activeStarterLang === l.language ? 'var(--accent)' : 'var(--border)'}`, background: activeStarterLang === l.language ? 'var(--bg-surface)' : 'transparent', color: activeStarterLang === l.language ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                  {l.language}
                </button>
              ))}
            </div>
            <textarea
              style={{ ...textareaStyle, minHeight: '220px', fontSize: '12px' }}
              placeholder={`# Starter code for ${activeStarterLang}\n\n# Write your solution here\n`}
              value={starterCode[activeStarterLang] ?? ''}
              onChange={(e) => setStarterCode((p) => ({ ...p, [activeStarterLang]: e.target.value }))}
            />
          </>
        )}
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={() => handleSave('DRAFT')} disabled={isSaving}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer' }}>
          <Save size={13} /> Save Draft
        </button>
        <button onClick={() => handleSave('PUBLISHED')} disabled={isSaving}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 18px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#000', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
          <CheckCircle2 size={13} /> Publish Question
        </button>
      </div>
    </div>
  );
};

// ── TestCase Editor sub-component ─────────────────────────────────────────────
interface TestCaseEditorProps {
  tc: TestCase;
  index: number;
  label: string;
  onChange: (field: keyof TestCase, value: unknown) => void;
  onDelete: () => void;
  showHiddenToggle: boolean;
}

const TestCaseEditor: React.FC<TestCaseEditorProps> = ({ tc, index, label, onChange, onDelete, showHiddenToggle }) => {
  const [expanded, setExpanded] = useState(true);
  const monoArea: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-base)',
    color: '#e4e4e7',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    resize: 'vertical',
    minHeight: '64px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-surface)', cursor: 'pointer' }}
        onClick={() => setExpanded((p) => !p)}>
        <GripVertical size={13} color="var(--text-muted)" />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{label}</span>
        {showHiddenToggle && (
          <button onClick={(e) => { e.stopPropagation(); onChange('isHidden', !tc.isHidden); }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '11px', color: tc.isHidden ? 'var(--warning)' : 'var(--text-muted)' }}>
            {tc.isHidden ? <><EyeOff size={10} /> Hidden</> : <><Eye size={10} /> Visible</>}
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <Trash2 size={13} />
        </button>
        {expanded ? <ChevronUp size={13} color="var(--text-muted)" /> : <ChevronDown size={13} color="var(--text-muted)" />}
      </div>
      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Input (stdin)</div>
            <textarea style={monoArea} placeholder="Input to feed to the program via stdin" value={tc.input}
              onChange={(e) => onChange('input', e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expected Output</div>
            <textarea style={monoArea} placeholder="Exact expected stdout output" value={tc.expectedOutput}
              onChange={(e) => onChange('expectedOutput', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Explanation (optional)</div>
            <input style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Explain this test case (shown post-submission)" value={tc.explanation ?? ''}
              onChange={(e) => onChange('explanation', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
};
