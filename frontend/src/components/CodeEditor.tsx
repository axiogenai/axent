import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  CodeSubmission,
  CodeMetrics,
  KeystrokeSnapshot,
  StudentInfo,
  ExamCategory,
  ThemeMode
} from '../types/dna';
import { playSound } from '../utils/sounds';
import {
  Lock,
  Unlock,
  User,
  Hash,
  GraduationCap,
  Building,
  ChevronDown,
  ChevronUp,
  Code2,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  X,
  Plus,
  UserCheck
} from 'lucide-react';
import { COLLEGE_LABS } from '../services/adminService';
import { SimpleSelect } from './watermelon/Select';

export const DEFAULT_LANGUAGE_TEMPLATES: Record<string, string> = {
  Python: '',
  'C++': '',
  C: '',
  Java: '',
  JavaScript: '',
  TypeScript: '',
  Go: '',
  Rust: '',
  'C#': '',
  PHP: '',
  Ruby: '',
  Kotlin: '',
  Swift: '',
  Bash: ''
};

const MONACO_LANG_MAP: Record<
  string,
  { monacoLang: string; fileName: string; tag: string; compiler: string }
> = {
  Python: { monacoLang: 'python', fileName: 'solution.py', tag: 'Python', compiler: 'Python 3.8.1' },
  'C++': { monacoLang: 'cpp', fileName: 'main.cpp', tag: 'C++', compiler: 'GCC 9.2 (C++17)' },
  Java: { monacoLang: 'java', fileName: 'Main.java', tag: 'Java', compiler: 'OpenJDK 13.0' },
  C: { monacoLang: 'c', fileName: 'program.c', tag: 'C', compiler: 'GCC 9.2 (C11)' },
  JavaScript: { monacoLang: 'javascript', fileName: 'script.js', tag: 'JS', compiler: 'Node.js 12.14' },
  TypeScript: { monacoLang: 'typescript', fileName: 'solution.ts', tag: 'TS', compiler: 'TypeScript 3.7' },
  Go: { monacoLang: 'go', fileName: 'main.go', tag: 'Go', compiler: 'Go 1.13.5' },
  Rust: { monacoLang: 'rust', fileName: 'main.rs', tag: 'Rust', compiler: 'Rust 1.40.0' },
  'C#': { monacoLang: 'csharp', fileName: 'Program.cs', tag: 'C#', compiler: 'Mono 6.6.0' },
  PHP: { monacoLang: 'php', fileName: 'index.php', tag: 'PHP', compiler: 'PHP 7.4.1' },
  Ruby: { monacoLang: 'ruby', fileName: 'script.rb', tag: 'Ruby', compiler: 'Ruby 2.7.0' },
  Kotlin: { monacoLang: 'kotlin', fileName: 'Main.kt', tag: 'Kotlin', compiler: 'Kotlin 1.3' },
  Swift: { monacoLang: 'swift', fileName: 'main.swift', tag: 'Swift', compiler: 'Swift 5.2' },
  Bash: { monacoLang: 'shell', fileName: 'script.sh', tag: 'Bash', compiler: 'Bash 5.0' }
};

interface CodeEditorProps {
  initialCode?: string;
  initialLanguage?: string;
  selectedLanguage?: string;
  onSelectLanguage?: (lang: string) => void;
  initialMetrics?: CodeMetrics;
  isPasteBlocked: boolean;
  isExamSubmitted?: boolean;
  isLockedByProctor?: boolean;
  isRegistrationRequired?: boolean;
  onOpenRegistration?: () => void;
  onTogglePasteBlock: () => void;
  student: StudentInfo;
  onUpdateStudent: (info: StudentInfo) => void;
  onChange: (data: CodeSubmission) => void;
  theme?: ThemeMode;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  initialCode,
  initialLanguage = 'Python',
  selectedLanguage,
  onSelectLanguage,
  initialMetrics,
  isPasteBlocked,
  isExamSubmitted = false,
  isLockedByProctor = false,
  isRegistrationRequired = false,
  onOpenRegistration,
  onTogglePasteBlock,
  student,
  onUpdateStudent,
  onChange,
  theme = 'dark'
}) => {
  // Use provided code or default starter template for selected language
  const starterCode =
    initialCode !== undefined && initialCode !== ''
      ? initialCode
      : DEFAULT_LANGUAGE_TEMPLATES[initialLanguage] || DEFAULT_LANGUAGE_TEMPLATES['Python'];

  const [code, setCode] = useState(starterCode);
  const [language, setLanguage] = useState(initialLanguage);

  // Multi-File Tabs: 5 core college practical languages open by default
  const [openTabs, setOpenTabs] = useState<string[]>([
    'Python',
    'C++',
    'Java',
    'C',
    'JavaScript'
  ]);

  // Per-language code storage so switching tabs preserves all candidate work
  const [fileCodes, setFileCodes] = useState<Record<string, string>>(() => {
    const initialMap: Record<string, string> = {};
    for (const [lang, tpl] of Object.entries(DEFAULT_LANGUAGE_TEMPLATES)) {
      initialMap[lang] = tpl;
    }
    if (initialCode !== undefined && initialCode !== '') {
      initialMap[initialLanguage] = initialCode;
    }
    return initialMap;
  });

  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const [showStudentDetails, setShowStudentDetails] = useState(false);
  const [snapshots, setSnapshots] = useState<KeystrokeSnapshot[]>([]);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isEditorActive, setIsEditorActive] = useState(false);

  // Preserve metrics if passed from parent
  const [metrics, setMetrics] = useState<CodeMetrics>(() => {
    if (initialMetrics && (initialMetrics.keystrokes > 0 || initialMetrics.timeSpent > 0 || initialMetrics.pasteRatio > 0)) {
      return initialMetrics;
    }
    return {
      typingSpeed: 0,
      timeSpent: 0,
      pasteCount: 0,
      deleteCount: 0,
      editCount: 0,
      undoCount: 0,
      pasteRatio: 0,
      pastedLines: 0,
      pastedChars: 0,
      totalLines: starterCode ? starterCode.split('\n').length : 0,
      keystrokes: 0,
      pauseDuration: 0,
      pasteLockViolations: 0
    };
  });

  const containerRef = useRef<HTMLDivElement>(null);
  // Timer strictly starts idle (0) and only activates when candidate types/pastes code
  const lastActivityRef = useRef<number>(0);
  const keystrokesInWindowRef = useRef<number>(0);
  const codeRef = useRef<string>(starterCode);
  const lastGoodCodeRef = useRef<string>(starterCode);
  const editorRef = useRef<any>(null);
  const isExamSubmittedRef = useRef<boolean>(isExamSubmitted);
  const isPasteBlockedRef = useRef<boolean>(isPasteBlocked);
  const isLockedByProctorRef = useRef<boolean>(Boolean(isLockedByProctor));
  const isRegistrationRequiredRef = useRef<boolean>(Boolean(isRegistrationRequired));
  const isProgrammaticUpdateRef = useRef<boolean>(false);

  useEffect(() => {
    isExamSubmittedRef.current = isExamSubmitted;
    const shouldLock = Boolean(isExamSubmitted || isLockedByProctorRef.current || isRegistrationRequiredRef.current);
    if (editorRef.current) {
      editorRef.current.updateOptions({
        readOnly: shouldLock,
        domReadOnly: shouldLock
      });
    }
  }, [isExamSubmitted]);

  useEffect(() => {
    isPasteBlockedRef.current = isPasteBlocked;
  }, [isPasteBlocked]);

  useEffect(() => {
    isLockedByProctorRef.current = Boolean(isLockedByProctor);
    isRegistrationRequiredRef.current = Boolean(isRegistrationRequired);
    const shouldLock = Boolean(isExamSubmitted || isLockedByProctor || isRegistrationRequired);
    if (editorRef.current) {
      editorRef.current.updateOptions({
        readOnly: shouldLock,
        domReadOnly: shouldLock
      });
      if (shouldLock) {
        try {
          (document.activeElement as HTMLElement)?.blur();
        } catch {
          // ignore
        }
      }
    }
  }, [isLockedByProctor, isRegistrationRequired, isExamSubmitted]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Synchronize state with parent
  useEffect(() => {
    onChangeRef.current({
      code,
      language,
      student,
      metrics,
      snapshots
    });
  }, [code, language, student, metrics, snapshots]);

  // Record active user interaction (typing, pasting, code modification)
  const recordUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsEditorActive(true);
  }, []);

  const saveSnapshot = useCallback((currentCode: string) => {
    if (!currentCode.trim()) return;
    setSnapshots((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].code === currentCode) {
        return prev;
      }
      const newSnap: KeystrokeSnapshot = {
        id: prev.length + 1,
        code: currentCode,
        timestamp: metrics.timeSpent,
        label: `Snapshot ${prev.length + 1}`
      };
      return [...prev.slice(-7), newSnap];
    });
  }, [metrics.timeSpent]);

  // ── MATHEMATICAL FORENSIC INVARIANT CALCULATOR ──
  // Guarantees pasted code can NEVER magically degrade into "Hand-Typed"
  const calculateUncheatablePasteRatio = useCallback((
    charCount: number,
    totalLines: number,
    keystrokes: number,
    pastedChars: number,
    pastedLines: number,
    pasteCount: number,
    existingRatio: number
  ): number => {
    if (charCount === 0) return 0;

    // A candidate typing legitimately produces at most 1.5 characters per keystroke
    const maxPossibleHandTypedChars = Math.max(0, keystrokes * 1.5);
    const guaranteedPastedChars = Math.max(0, charCount - maxPossibleHandTypedChars);

    let ratio = 0;
    if (charCount > 15) {
      ratio = Math.round((guaranteedPastedChars / charCount) * 100);
    }

    if (pastedChars > 0) {
      const charRatio = Math.round((pastedChars / charCount) * 100);
      ratio = Math.max(ratio, charRatio);
    }

    if (pastedLines > 0 && totalLines > 0) {
      const lineRatio = Math.round((pastedLines / totalLines) * 100);
      ratio = Math.max(ratio, lineRatio);
    }

    if (pasteCount > 0 && keystrokes < Math.max(15, charCount * 0.25)) {
      ratio = Math.max(ratio, 95);
    }

    // Invariant: Once external clipboard code exists, typing subsequent keys does not wipe out prior paste history
    ratio = Math.max(ratio, existingRatio);
    return Math.min(100, Math.max(0, ratio));
  }, []);

  // ── CONTROLLED ACTIVE TIME COUNTER (STOPS WHEN IDLE OR SUBMITTED) ──
  useEffect(() => {
    const timer = setInterval(() => {
      // 1. If candidate marked exam as done / submitted, permanently stop timer!
      if (isExamSubmittedRef.current) {
        setIsEditorActive(false);
        return;
      }

      // If user hasn't typed yet at all
      if (lastActivityRef.current === 0) {
        setIsEditorActive(false);
        return;
      }

      const now = Date.now();
      const idleTimeMs = now - lastActivityRef.current;
      // Strictly considered active only within 3.5 seconds of the last keypress
      const userCurrentlyActive = idleTimeMs <= 3500;
      setIsEditorActive(userCurrentlyActive);

      const wpm = Math.round((keystrokesInWindowRef.current / 5) * 60);
      keystrokesInWindowRef.current = 0;

      setMetrics((m) => {
        // ONLY increment active time if the candidate is actively interacting!
        const updatedTimeSpent = userCurrentlyActive ? m.timeSpent + 1 : m.timeSpent;
        const updatedPauseDuration = userCurrentlyActive ? m.pauseDuration : m.pauseDuration + 1;

        return {
          ...m,
          timeSpent: updatedTimeSpent,
          pauseDuration: updatedPauseDuration,
          typingSpeed: wpm > 0 ? Math.round(m.typingSpeed * 0.7 + wpm * 0.3) : (userCurrentlyActive ? m.typingSpeed : 0)
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Periodic Snapshot every 30 seconds of active coding
  useEffect(() => {
    const timer = setInterval(() => {
      if (codeRef.current.trim().length > 0 && !isExamSubmittedRef.current) {
        saveSnapshot(codeRef.current);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [saveSnapshot]);

  // ── NATIVE DOM PASTE INTERCEPTION (CATCHES ALL CLIPBOARD INSERTS) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativePaste = (e: ClipboardEvent) => {
      recordUserActivity();
      const pastedText = e.clipboardData?.getData('text/plain') || '';

      if (isLockedByProctorRef.current) {
        e.preventDefault();
        e.stopPropagation();
        playSound('warning');
        return;
      }

      if (isPasteBlockedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        playSound('warning');
        setMetrics((m) => ({
          ...m,
          pasteLockViolations: (m.pasteLockViolations || 0) + 1
        }));
        alert('Examination Lock Active: Pasting external code is prohibited by the invigilator.');
        return;
      }

      if (pastedText.length > 0) {
        const addedLines = pastedText.split('\n').length;
        const textLen = pastedText.length;

        setMetrics((m) => {
          const newPasteCount = m.pasteCount + 1;
          const newPastedLines = m.pastedLines + addedLines;
          const newPastedChars = (m.pastedChars || 0) + textLen;
          const totalLines = Math.max(newPastedLines, m.totalLines);
          const ratio = calculateUncheatablePasteRatio(
            (codeRef.current.length || 0) + textLen,
            totalLines,
            m.keystrokes,
            newPastedChars,
            newPastedLines,
            newPasteCount,
            95
          );

          return {
            ...m,
            pasteCount: newPasteCount,
            pastedLines: newPastedLines,
            pastedChars: newPastedChars,
            totalLines,
            pasteRatio: ratio
          };
        });
      }
    };

    container.addEventListener('paste', handleNativePaste, true);
    return () => {
      container.removeEventListener('paste', handleNativePaste, true);
    };
  }, [recordUserActivity, calculateUncheatablePasteRatio]);

  // ── MONACO EDITOR MOUNT & FORENSIC EVENT BINDINGS ──
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    lastGoodCodeRef.current = editor.getValue();

    if (isLockedByProctorRef.current || isExamSubmittedRef.current) {
      editor.updateOptions({
        readOnly: true,
        domReadOnly: true
      });
      try {
        (document.activeElement as HTMLElement)?.blur();
      } catch {
        // ignore
      }
    }

    // Track Monaco onDidPaste
    editor.onDidPaste((e) => {
      recordUserActivity();
      const pastedLines = e.range.endLineNumber - e.range.startLineNumber + 1;
      const totalLines = editor.getModel()?.getLineCount() || 1;
      const val = editor.getValue();

      setMetrics((m) => {
        const newPasteCount = m.pasteCount + 1;
        const newPastedLines = m.pastedLines + pastedLines;
        const ratio = calculateUncheatablePasteRatio(
          val.length,
          totalLines,
          m.keystrokes,
          (m.pastedChars || 0) + val.length,
          newPastedLines,
          newPasteCount,
          95
        );

        return {
          ...m,
          pasteCount: newPasteCount,
          pastedLines: newPastedLines,
          totalLines,
          pasteRatio: ratio
        };
      });

      setTimeout(() => saveSnapshot(val), 200);
    });

    // Keystroke dynamics and paste lock enforcement
    editor.onKeyDown((e) => {
      if (isLockedByProctorRef.current) {
        e.preventDefault();
        e.stopPropagation();
        playSound('warning');
        return;
      }

      recordUserActivity();

      // Enforce Exam Mode Paste Lock
      if (isPasteBlockedRef.current && (e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyV) {
        e.preventDefault();
        e.stopPropagation();
        playSound('warning');
        setMetrics((m) => ({
          ...m,
          pasteLockViolations: (m.pasteLockViolations || 0) + 1
        }));
        alert('Examination Lock Active: Pasting external code is prohibited by the invigilator.');
        return;
      }

      keystrokesInWindowRef.current++;

      if ((e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyZ) {
        setMetrics((m) => ({ ...m, undoCount: m.undoCount + 1 }));
      } else if (e.keyCode === monaco.KeyCode.Backspace || e.keyCode === monaco.KeyCode.Delete) {
        setMetrics((m) => ({
          ...m,
          deleteCount: m.deleteCount + 1,
          keystrokes: m.keystrokes + 1
        }));
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        setMetrics((m) => ({ ...m, editCount: m.editCount + 1 }));
      } else {
        // Legitimate key typed
        setMetrics((m) => ({
          ...m,
          editCount: m.editCount + 1,
          keystrokes: m.keystrokes + 1
        }));
      }
    });

    // Model Content Change Listener: Tracks bulk insertions and character counts
    editor.onDidChangeModelContent((e) => {
      if (isProgrammaticUpdateRef.current) {
        isProgrammaticUpdateRef.current = false;
        const val = editor.getValue();
        codeRef.current = val;
        lastGoodCodeRef.current = val;
        setCode(val);
        setFileCodes((prev) => ({
          ...prev,
          [languageRef.current]: val
        }));
        return;
      }

      if (isLockedByProctorRef.current || isExamSubmittedRef.current) {
        isProgrammaticUpdateRef.current = true;
        editor.setValue(lastGoodCodeRef.current);
        playSound('warning');
        return;
      }

      recordUserActivity();
      const val = editor.getValue();
      codeRef.current = val;
      lastGoodCodeRef.current = val;
      setCode(val);
      setFileCodes((prev) => ({
        ...prev,
        [languageRef.current]: val
      }));

      const totalLines = editor.getModel()?.getLineCount() || 0;
      const charCount = val.trim().length;

      if (charCount === 0) {
        setMetrics((m) => ({
          ...m,
          totalLines: 0,
          pastedLines: 0,
          pastedChars: 0,
          pasteRatio: 0,
          pasteCount: 0,
          keystrokes: 0
        }));
        return;
      }

      // Check change deltas for bulk insertions
      let bulkPasteDetected = false;
      let addedLinesFromBulk = 0;
      let addedCharsFromBulk = 0;

      for (const change of e.changes) {
        if (change.text.length > 2 && !e.isUndoing && !e.isRedoing) {
          bulkPasteDetected = true;
          addedLinesFromBulk += change.text.split('\n').length;
          addedCharsFromBulk += change.text.length;
        }
      }

      setMetrics((m) => {
        const newPasteCount = bulkPasteDetected ? m.pasteCount + 1 : m.pasteCount;
        const newPastedLines = bulkPasteDetected
          ? Math.min(totalLines, m.pastedLines + addedLinesFromBulk)
          : m.pastedLines;
        const newPastedChars = bulkPasteDetected
          ? (m.pastedChars || 0) + addedCharsFromBulk
          : m.pastedChars || 0;

        const ratio = calculateUncheatablePasteRatio(
          charCount,
          totalLines,
          m.keystrokes,
          newPastedChars,
          newPastedLines,
          newPasteCount,
          m.pasteRatio
        );

        return {
          ...m,
          pasteCount: newPasteCount,
          pastedLines: newPastedLines,
          pastedChars: newPastedChars,
          totalLines,
          pasteRatio: ratio
        };
      });
    });

    // Track Cursor Position (Does NOT count as typing activity)
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({
        line: e.position.lineNumber,
        col: e.position.column
      });
    });
  };

  // Switch language and populate standard template or stored candidate code
  const handleSelectTab = (newLang: string) => {
    if (isLockedByProctorRef.current || isRegistrationRequiredRef.current) {
      playSound('warning');
      return;
    }
    if (newLang === language) return;

    // Save current editor content for current language
    const currentVal = editorRef.current ? editorRef.current.getValue() : code;
    const updatedCodes = {
      ...fileCodes,
      [language]: currentVal
    };

    if (!openTabs.includes(newLang)) {
      setOpenTabs((prev) => [...prev, newLang]);
    }

    const nextCode =
      updatedCodes[newLang] !== undefined
        ? updatedCodes[newLang]
        : DEFAULT_LANGUAGE_TEMPLATES[newLang] || '';

    setFileCodes(updatedCodes);
    setLanguage(newLang);
    languageRef.current = newLang;
    setCode(nextCode);
    codeRef.current = nextCode;

    if (editorRef.current) {
      isProgrammaticUpdateRef.current = true;
      editorRef.current.setValue(nextCode);
    }

    setMetrics((m) => ({
      ...m,
      totalLines: nextCode ? nextCode.split('\n').length : 0
    }));

    if (onSelectLanguage) {
      onSelectLanguage(newLang);
    }

    playSound('click');
  };

  useEffect(() => {
    if (selectedLanguage && selectedLanguage !== languageRef.current) {
      handleSelectTab(selectedLanguage);
    }
  }, [selectedLanguage]);

  const handleCloseTab = (e: React.MouseEvent, tabToClose: string) => {
    e.stopPropagation();
    if (openTabs.length <= 1) return;

    const nextTabs = openTabs.filter((t) => t !== tabToClose);
    setOpenTabs(nextTabs);

    if (language === tabToClose) {
      const nextActive = nextTabs[nextTabs.length - 1];
      handleSelectTab(nextActive);
    }
    playSound('click');
  };

  const activeLangInfo = MONACO_LANG_MAP[language] || MONACO_LANG_MAP['Python'];

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s < 10 ? '0' : ''}${s}s` : `${s}s`;
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
        userSelect: 'none'
      }}
    >
      {/* ── VS CODE TOP TAB BAR ── */}
      <div
        style={{
          height: '35px',
          minHeight: '35px',
          background: 'var(--bg-main)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 0 0',
          flexShrink: 0
        }}
      >
        {/* Multi-File Tab Bar (Authentic VS Code Multi-Tab System) */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', overflowX: 'auto', flex: 1 }}>
          {openTabs.map((tabLang) => {
            const langInfo = MONACO_LANG_MAP[tabLang] || MONACO_LANG_MAP['Python'];
            const isActive = tabLang === language;
            const tabCode = fileCodes[tabLang] || '';
            const isDirty = tabCode.trim().length > 0;

            return (
              <div
                key={tabLang}
                onClick={() => handleSelectTab(tabLang)}
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 12px',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  borderRight: '1px solid var(--border)',
                  borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
                title={`Switch to ${tabLang} (${langInfo.compiler})`}
              >
                <Code2 size={12} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} />
                <span>{langInfo.fileName}</span>
                <span
                  style={{
                    fontSize: '9.5px',
                    padding: '0 4px',
                    borderRadius: 'var(--radius-pill)',
                    background: isActive ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 600
                  }}
                >
                  {langInfo.tag}
                </span>
                {isDirty && (
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: isActive ? 'var(--accent)' : 'var(--text-muted)'
                    }}
                  />
                )}
                {openTabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(e, tabLang)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '1px',
                      borderRadius: '2px',
                      marginLeft: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: isActive ? 0.9 : 0.4
                    }}
                    title={`Close ${langInfo.fileName}`}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}

          {/* "+ Add File / Language" Selector */}
          <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', width: '155px' }}>
            <SimpleSelect<string>
              value=""
              placeholder="+ Add File / Lang"
              disabled={isLockedByProctor || isRegistrationRequired}
              onChange={(newLang) => {
                if (newLang) {
                  handleSelectTab(newLang);
                }
              }}
              options={Object.keys(MONACO_LANG_MAP).map((langKey) => ({
                value: langKey,
                label: `${MONACO_LANG_MAP[langKey].fileName} (${langKey})`
              }))}
              size="sm"
              style={{
                height: '24px',
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-xs)'
              }}
              title={
                isLockedByProctor
                  ? 'Locked by invigilator'
                  : isRegistrationRequired
                  ? 'Candidate registration mandatory'
                  : 'Open another programming language solution file'
              }
            />
          </div>
        </div>

        {/* Right Tab Controls: Candidate Credentials & Exam Lock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLockedByProctor ? (
            <span
              className="badge badge-sm badge-danger"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '24px', fontSize: '10.5px' }}
            >
              <Lock size={11} />
              <span>LOCKED BY PROCTOR</span>
            </span>
          ) : isRegistrationRequired ? (
            <span
              className="badge badge-sm badge-warning"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '24px', fontSize: '10.5px' }}
            >
              <UserCheck size={11} />
              <span>REGISTRATION REQUIRED</span>
            </span>
          ) : null}

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (onOpenRegistration) {
                onOpenRegistration();
              } else {
                setShowStudentDetails(!showStudentDetails);
              }
            }}
            disabled={isLockedByProctor}
            style={{ fontSize: '11px', padding: '2px 8px', height: '26px', opacity: isLockedByProctor ? 0.6 : 1 }}
          >
            <User size={12} />
            <span>{student.name || 'Candidate Details'}</span>
            {student.rollNumber && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                ({student.rollNumber})
              </span>
            )}
            {showStudentDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          <button
            className={`btn ${isPasteBlocked ? 'btn-danger' : 'btn-ghost'} btn-sm`}
            onClick={onTogglePasteBlock}
            disabled={isLockedByProctor || isRegistrationRequired}
            title={
              isLockedByProctor
                ? 'Terminal locked by invigilator'
                : isRegistrationRequired
                ? 'Registration mandatory'
                : isPasteBlocked
                ? 'Clipboard Paste Lock is Active'
                : 'Clipboard Paste Lock is Inactive'
            }
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              height: '26px',
              opacity: (isLockedByProctor || isRegistrationRequired) ? 0.6 : 1
            }}
          >
            {isPasteBlocked ? <Lock size={11} /> : <Unlock size={11} />}
            <span>{isPasteBlocked ? 'Paste Locked' : 'Paste Allowed'}</span>
          </button>
        </div>
      </div>

      {/* ── VS CODE BREADCRUMB BAR ── */}
      <div
        style={{
          height: '24px',
          minHeight: '24px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          gap: '6px',
          flexShrink: 0
        }}
      >
        <span>codedna</span>
        <span>&rsaquo;</span>
        <span>examination</span>
        <span>&rsaquo;</span>
        <span>src</span>
        <span>&rsaquo;</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {activeLangInfo.fileName}
        </span>
        {student.assignmentTitle && (
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: '10.5px' }}>
            {student.assignmentTitle}
          </span>
        )}
      </div>

      {/* Collapsible Student & Examination Details Bar */}
      {showStudentDetails && (
        <div
          style={{
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            fontSize: '12px',
            zIndex: 10
          }}
        >
          {/* Exam Category */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Evaluation / Exam Type
            </label>
            <SimpleSelect<ExamCategory>
              value={student.examType}
              onChange={(newType) =>
                onUpdateStudent({ ...student, examType: newType })
              }
              options={[
                { value: 'Internal Assessment (CIE)', label: 'Internal Assessment (CIE)' },
                { value: 'Semester End Exam (SEE)', label: 'Semester End Exam (SEE)' },
                { value: 'Weekly Lab Practical', label: 'Weekly Lab Practical' },
                { value: 'Coding Hackathon / Contest', label: 'Coding Hackathon / Contest' },
                { value: 'Project Viva & Defense', label: 'Project Viva & Defense' }
              ]}
              size="sm"
            />
          </div>

          {/* Student Full Name */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Candidate Name
            </label>
            <input
              type="text"
              placeholder="Candidate Full Name"
              value={student.name}
              onChange={(e) => onUpdateStudent({ ...student, name: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* Roll No / USN */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              USN / Roll Number
            </label>
            <input
              type="text"
              placeholder="Candidate USN / Roll No"
              value={student.rollNumber}
              onChange={(e) => onUpdateStudent({ ...student, rollNumber: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* Assigned College Laboratory */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Assigned Lab (Room)
            </label>
            <SimpleSelect<string>
              value={student.labId || 'LAB-01'}
              onChange={(newLabId) => {
                const lab = COLLEGE_LABS.find((l) => l.labId === newLabId);
                onUpdateStudent({
                  ...student,
                  labId: newLabId,
                  labName: lab?.labName || newLabId
                });
              }}
              options={COLLEGE_LABS.map((lab) => ({
                value: lab.labId,
                label: `${lab.labCode} - ${lab.labName} (${lab.block})`,
                badge: lab.labId
              }))}
              searchable
              size="sm"
            />
          </div>

          {/* Workstation PC Number */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Workstation PC ID
            </label>
            <input
              type="text"
              placeholder="e.g. Station #01"
              value={student.stationNumber || 'Station #01'}
              onChange={(e) => onUpdateStudent({ ...student, stationNumber: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* Department / Branch */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Department / Branch
            </label>
            <input
              type="text"
              placeholder="Branch (e.g. CSE, IT)"
              value={student.department}
              onChange={(e) => onUpdateStudent({ ...student, department: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* Semester */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Semester / Year
            </label>
            <input
              type="text"
              placeholder="Semester (e.g. Sem 5)"
              value={student.semester}
              onChange={(e) => onUpdateStudent({ ...student, semester: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* Subject / Lab Course */}
          <div>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Subject / Lab Course
            </label>
            <input
              type="text"
              placeholder="Lab Course Name"
              value={student.course}
              onChange={(e) => onUpdateStudent({ ...student, course: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* Problem Statement */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              Problem Statement / Lab Question Title
            </label>
            <input
              type="text"
              placeholder="Enter Problem Statement or Practical Question Title"
              value={student.assignmentTitle}
              onChange={(e) => onUpdateStudent({ ...student, assignmentTitle: e.target.value })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          </div>
        </div>
      )}

      {/* ── GENUINE MICROSOFT VS CODE MONACO EDITOR CANVAS ── */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
          position: 'relative'
        }}
      >
        <Editor
          height="100%"
          language={activeLangInfo.monacoLang}
          value={code}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: Boolean(isExamSubmitted || isLockedByProctor || isRegistrationRequired),
            domReadOnly: Boolean(isExamSubmitted || isLockedByProctor || isRegistrationRequired),
            fontSize: 13.5,
            fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: 'on',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            renderLineHighlight: 'all',
            padding: { top: 10, bottom: 10 }
          }}
          onMount={handleEditorDidMount}
        />

        {isLockedByProctor ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              zIndex: 30,
              color: '#fff',
              textAlign: 'center',
              padding: '24px',
              cursor: 'not-allowed',
              userSelect: 'none',
              pointerEvents: 'all'
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              playSound('warning');
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1.5px solid var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Lock size={28} color="var(--danger)" />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#f87171' }}>
                WORKSTATION TERMINAL LOCKED BY PROCTOR
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)', maxWidth: '480px', marginTop: '6px', lineHeight: 1.5 }}>
                Academic freeze engaged. All keyboard inputs, code edits, and compiler execution have been disabled from the Invigilator Control Room.
              </div>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                color: '#fca5a5'
              }}
            >
              <ShieldAlert size={12} />
              <span>Station: {student.stationNumber || 'Station #01'} ({student.labId || 'LAB-01'}) &bull; Read-Only Freeze Active</span>
            </div>
          </div>
        ) : isRegistrationRequired ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10, 10, 10, 0.82)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              zIndex: 30,
              color: '#fff',
              textAlign: 'center',
              padding: '24px',
              cursor: 'not-allowed',
              userSelect: 'none',
              pointerEvents: 'all'
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onOpenRegistration) onOpenRegistration();
              playSound('warning');
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1.5px solid var(--warning)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <UserCheck size={28} color="var(--warning)" />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--warning)' }}>
                CANDIDATE REGISTRATION MANDATORY
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)', maxWidth: '460px', marginTop: '6px', lineHeight: 1.5 }}>
                Workstation is locked. You must complete the candidate registration form with your Full Name and USN before editing code.
              </div>
            </div>
            {onOpenRegistration && (
              <button
                className="btn btn-warning btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenRegistration();
                }}
                style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 700, gap: '6px' }}
              >
                <UserCheck size={13} />
                <span>Open Registration Form</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* ── VS CODE BOTTOM STATUS BAR ── */}
      <div
        style={{
          height: '24px',
          minHeight: '24px',
          background: 'var(--bg-main)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          flexShrink: 0
        }}
      >
        {/* Left: Exam Mode, Active Time, Keystrokes, Paste Monitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className={`badge badge-sm ${isPasteBlocked ? 'badge-danger' : 'badge-neutral'}`}
            style={{ cursor: 'pointer' }}
            onClick={onTogglePasteBlock}
            title={isPasteBlocked ? 'Exam Mode: Pasting is locked' : 'Practice Mode: Pasting allowed'}
          >
            {isPasteBlocked ? <Lock size={10} /> : <Unlock size={10} />}
            <span>{isPasteBlocked ? 'Exam Mode Locked' : 'Open Practice'}</span>
          </span>

          {/* Active Time Indicator */}
          <span
            className={`badge badge-sm ${isExamSubmitted ? 'badge-neutral' : isEditorActive ? 'badge-primary' : 'badge-neutral'}`}
            title={isExamSubmitted ? 'Exam submitted. Timer frozen.' : isEditorActive ? 'Active coding session' : 'Session paused (idle)'}
          >
            <Clock size={10} />
            <span>Active: {formatSeconds(metrics.timeSpent)}</span>
            <span style={{ fontSize: '9px', opacity: 0.75 }}>
              ({isExamSubmitted ? 'Frozen' : isEditorActive ? 'Live' : 'Paused'})
            </span>
          </span>

          <span className="badge badge-sm badge-neutral" title="Total keyboard keystrokes typed">
            <Activity size={10} />
            <span>{metrics.keystrokes} Keystrokes</span>
          </span>

          <span className="badge badge-sm badge-neutral" title="Average typing speed in words per minute">
            <span>{metrics.typingSpeed} WPM</span>
          </span>

          <span
            className={`badge badge-sm ${
              metrics.pasteRatio >= 50 ? 'badge-danger' : metrics.pasteRatio > 0 ? 'badge-warning' : 'badge-success'
            }`}
            title="Real-time typing forensics and paste detection"
          >
            {metrics.pasteRatio >= 50 ? (
              <ShieldAlert size={10} />
            ) : metrics.pasteRatio > 0 ? (
              <AlertTriangle size={10} />
            ) : (
              <ShieldCheck size={10} />
            )}
            <span>
              {metrics.pasteRatio > 0
                ? `${metrics.pasteRatio}% Pasted (${metrics.pasteCount} op)`
                : '100% Hand-Typed'}
            </span>
          </span>
        </div>

        {/* Right: Line/Col, Indent, Encoding, Language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="badge badge-sm badge-neutral">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span className="badge badge-sm badge-neutral">Spaces: 4</span>
          <span className="badge badge-sm badge-neutral">UTF-8</span>
          <span className="badge badge-sm badge-primary" style={{ fontWeight: 700 }}>
            {activeLangInfo.fileName.split('.').pop()?.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
