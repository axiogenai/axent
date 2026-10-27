import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Upload,
  Check,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  X,
  Plus,
  HelpCircle,
  FileCode
} from 'lucide-react';
import { playSound } from '../../utils/sounds';
import { createQuestion } from '../../services/mcqService';
import {
  parseGoogleFormQuizText,
  ParsedGoogleFormQuestion,
  GoogleFormParseResult
} from '../../utils/googleFormParser';
import { MCQQuestion } from '../../types/mcq';

interface GoogleFormImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuestionsImported: (createdQuestions: MCQQuestion[]) => void;
  defaultSubject?: string;
  defaultTopic?: string;
}

const SAMPLE_TEMPLATES = {
  googleForm: `1. What is the time complexity of binary search on a sorted array?
* O(log n)
O(n)
O(n^2)
O(1)
Points: 1

2. Which of the following is NOT an Object-Oriented Programming pillar?
A) Encapsulation
B) Polymorphism
C) Compilation
D) Inheritance
Answer: C
Explanation: Compilation is a build process, not an OOP paradigm.

3. In Python, which collection type is immutable?
* Tuple
List
Dictionary
Set
Points: 1`,

  numbered: `What is the default port for HTTP traffic?
A. 21
B. 22
C. 80
D. 443
Answer: C

Which data structure follows the Last-In First-Out (LIFO) principle?
A) Queue
B) Stack
C) Tree
D) Graph
Answer: B`,

  csv: `Question,Option A,Option B,Option C,Option D,Correct Answer,Marks
Which HTML tag is used for the largest heading?,<h1>,<h6>,<header>,<head>,A,1
What does CSS stand for?,Computer Style Sheets,Cascading Style Sheets,Creative Style Sheets,Colorful Style Sheets,B,1`
};

export const GoogleFormImportModal: React.FC<GoogleFormImportModalProps> = ({
  isOpen,
  onClose,
  onQuestionsImported,
  defaultSubject = 'Computer Science',
  defaultTopic = 'Technical'
}) => {
  const [inputText, setInputText] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [topic, setTopic] = useState(defaultTopic);
  const [defaultMarks, setDefaultMarks] = useState<number>(1);
  const [questionsList, setQuestionsList] = useState<ParsedGoogleFormQuestion[]>([]);
  const [errorsList, setErrorsList] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'paste' | 'preview'>('paste');

  useEffect(() => {
    if (defaultSubject) setSubject(defaultSubject);
    if (defaultTopic) setTopic(defaultTopic);
  }, [defaultSubject, defaultTopic]);

  // Live parse whenever input text changes
  useEffect(() => {
    if (!inputText.trim()) {
      setQuestionsList([]);
      setErrorsList([]);
      return;
    }

    const result = parseGoogleFormQuizText(inputText, subject, topic);
    // Apply default marks if question didn't specify
    const adjusted = result.questions.map((q) => ({
      ...q,
      marks: q.marks || defaultMarks,
      subject,
      topic
    }));

    setQuestionsList(adjusted);
    setErrorsList(result.errors);
  }, [inputText, subject, topic, defaultMarks]);

  if (!isOpen) return null;

  const handleToggleOptionCorrect = (qIndex: number, optIndex: number) => {
    setQuestionsList((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIndex] };
      const options = q.options.map((opt, i) => ({
        ...opt,
        isCorrect: i === optIndex
      }));
      q.options = options;
      q.hasExplicitAnswer = true;
      copy[qIndex] = q;
      return copy;
    });
    playSound('click');
  };

  const handleDeleteQuestion = (qIndex: number) => {
    setQuestionsList((prev) => prev.filter((_, i) => i !== qIndex));
    playSound('click');
  };

  const handleLoadTemplate = (type: 'googleForm' | 'numbered' | 'csv') => {
    setInputText(SAMPLE_TEMPLATES[type]);
    playSound('click');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setInputText(text);
      playSound('success');
    };
    reader.readAsText(file);
  };

  const handleCommitImport = () => {
    if (questionsList.length === 0) return;

    const createdList: MCQQuestion[] = [];

    questionsList.forEach((pq) => {
      // Ensure at least 1 correct option
      const hasCorrect = pq.options.some((o) => o.isCorrect);
      const safeOptions = pq.options.map((o, idx) => ({
        id: o.id || crypto.randomUUID(),
        text: o.text,
        isCorrect: hasCorrect ? o.isCorrect : idx === 0
      }));

      const created = createQuestion({
        text: pq.text,
        options: safeOptions,
        subject: pq.subject || subject,
        topic: pq.topic || topic,
        difficulty: pq.difficulty || 'MEDIUM',
        marks: pq.marks || defaultMarks,
        negativeMarks: pq.negativeMarks || 0,
        explanation: pq.explanation || '',
        status: 'PUBLISHED',
        tags: [pq.topic || topic, 'Google Form Import'],
        createdBy: 'Paper Setter Form Import'
      });

      createdList.push(created);
    });

    playSound('success');
    onQuestionsImported(createdList);
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
          maxWidth: '820px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <FileText size={16} color="var(--accent)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Import Questions Directly (Google Form / Text / Quiz)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Paste questions directly from Google Forms, Docs, or Sheets to add them straight into this exam.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ width: '28px', height: '28px', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            padding: '0 20px',
            background: 'var(--bg-elevated)',
            gap: '8px'
          }}
        >
          <button
            onClick={() => setActiveTab('paste')}
            style={{
              padding: '10px 14px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'paste' ? 700 : 500,
              color: activeTab === 'paste' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'paste' ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            1. Paste or Upload Text
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            style={{
              padding: '10px 14px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'preview' ? 700 : 500,
              color: activeTab === 'preview' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'preview' ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>2. Live Review & Edit</span>
            {questionsList.length > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)'
                }}
              >
                {questionsList.length}
              </span>
            )}
          </button>
        </div>

        {/* Body Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {activeTab === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Quick Template Fillers */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Load Sample Formats:
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleLoadTemplate('googleForm')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px', height: '24px', padding: '0 8px' }}
                  >
                    Google Form (* for correct)
                  </button>
                  <button
                    onClick={() => handleLoadTemplate('numbered')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px', height: '24px', padding: '0 8px' }}
                  >
                    A/B/C/D + Answer Line
                  </button>
                  <button
                    onClick={() => handleLoadTemplate('csv')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px', height: '24px', padding: '0 8px' }}
                  >
                    CSV / Sheets TSV
                  </button>
                  {inputText && (
                    <button
                      onClick={() => setInputText('')}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', height: '24px', padding: '0 8px', color: 'var(--danger)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Main Text Area */}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Paste your Google Form questions here...

Format Examples:
1. What is the time complexity of binary search?
* O(log n)
O(n)
O(n^2)
O(1)
Points: 1

Q2. What is the capital of France?
A) Berlin
B) Paris
C) Madrid
D) Rome
Answer: B`}
                rows={12}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />

              {/* File Upload Zone */}
              <div
                style={{
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-surface)',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Upload size={14} color="var(--accent)" />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Or import directly from text or spreadsheet file (.txt, .csv, .tsv):
                  </span>
                </div>
                <label
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', height: '26px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                >
                  Browse File
                  <input
                    type="file"
                    accept=".txt,.csv,.tsv,.json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Meta Config Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  padding: '12px',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)'
                }}
              >
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Assign Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Computer Science"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Assign Topic
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Data Structures"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Default Marks Per Question
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={defaultMarks}
                    onChange={(e) => setDefaultMarks(parseInt(e.target.value, 10) || 1)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {questionsList.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <FileText size={28} style={{ opacity: 0.4, margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    No questions detected yet. Switch to "1. Paste or Upload Text" to paste your questions.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {questionsList.length} Questions Ready to Import (Total: {questionsList.reduce((s, q) => s + q.marks, 0)} marks)
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Click any option pill to set or change the correct answer.
                    </span>
                  </div>

                  {questionsList.map((q, qIdx) => (
                    <div
                      key={q.id || qIdx}
                      style={{
                        padding: '12px 14px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--accent)',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              height: 'fit-content'
                            }}
                          >
                            Q{qIdx + 1}
                          </span>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                            {q.text}
                          </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span className="badge badge-sm badge-neutral" style={{ fontSize: '10.5px' }}>
                            {q.marks} pt
                          </span>
                          <button
                            onClick={() => handleDeleteQuestion(qIdx)}
                            className="btn btn-ghost btn-sm"
                            style={{ width: '24px', height: '24px', padding: 0, color: 'var(--danger)' }}
                            title="Remove question"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Option Pills */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px', marginTop: '4px' }}>
                        {q.options.map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect = opt.isCorrect;

                          return (
                            <div
                              key={opt.id || optIdx}
                              onClick={() => handleToggleOptionCorrect(qIdx, optIdx)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '4px',
                                border: isCorrect ? '1.5px solid var(--success)' : '1px solid var(--border)',
                                background: isCorrect ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-elevated)',
                                color: isCorrect ? 'var(--success)' : 'var(--text-secondary)',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Click to toggle as correct answer"
                            >
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  background: isCorrect ? 'var(--success)' : 'var(--bg-surface)',
                                  color: isCorrect ? '#ffffff' : 'var(--text-muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                {isCorrect ? <Check size={10} color="#ffffff" /> : letter}
                              </span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {opt.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                          Note: {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Detected: <strong style={{ color: 'var(--text-primary)' }}>{questionsList.length}</strong> questions
            </span>
            {errorsList.length > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <AlertTriangle size={11} /> {errorsList.length} warnings
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0 14px', height: '32px' }}
            >
              Cancel
            </button>

            {activeTab === 'paste' && questionsList.length > 0 && (
              <button
                onClick={() => setActiveTab('preview')}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0 14px', height: '32px' }}
              >
                Review ({questionsList.length}) →
              </button>
            )}

            <button
              onClick={handleCommitImport}
              disabled={questionsList.length === 0}
              className="btn btn-primary btn-sm"
              style={{
                padding: '0 16px',
                height: '32px',
                fontWeight: 700,
                opacity: questionsList.length === 0 ? 0.5 : 1,
                cursor: questionsList.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <Check size={13} />
              <span>Import & Add to this Exam ({questionsList.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
