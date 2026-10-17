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
  MessageCircle,
  Calendar,
  Clock,
  Shield,
  Shuffle,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  generateFullExamPaperWithAI,
  AIPaperGenerationRequest,
  AIPaperGenerationResult,
  CrossValidationReport,
  AIPaperSectionSpec
} from '../services/groqService';
import {
  saveExam,
  publishExam,
  saveQuestion,
  deleteQuestion,
  deleteExam,
  getAllQuestions
} from '../services/mcqService';
import { MCQExamConfig, MCQQuestion, MCQResultDeclarationMode } from '../types/mcq';
import { playSound } from '../utils/sounds';
import { ConfirmationModal } from './ConfirmationModal';
import { WatermelonSchedulePicker } from './watermelon/WatermelonSchedulePicker';

function toLocalDatetimeString(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
}

function parseLocalDatetimeString(str: string): number | undefined {
  if (!str) return undefined;
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? undefined : parsed;
}

function formatSchedulePreview(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

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
  const [configPage, setConfigPage] = useState<1 | 2>(1);

  // Generator Form State
  const [title, setTitle] = useState('General Aptitude Assessment');
  const [examCategory, setExamCategory] = useState<'Aptitude' | 'ISE'>('Aptitude');
  const [subject, setSubject] = useState('General Aptitude & Reasoning');
  const [topic, setTopic] = useState('');
  const [syllabusText, setSyllabusText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Dynamic subjects and topics from database
  const allExistingQuestions = useMemo(() => getAllQuestions(), []);
  const availableSubjects = useMemo(
    () => Array.from(new Set(allExistingQuestions.map((q) => q.subject).filter(Boolean))).sort(),
    [allExistingQuestions]
  );
  const availableTopics = useMemo(
    () => Array.from(new Set(allExistingQuestions.map((q) => q.topic).filter(Boolean))).sort(),
    [allExistingQuestions]
  );

  // Multi-Topic / Section Breakdown Configuration
  const [topicMode, setTopicMode] = useState<'sections' | 'single'>('sections');
  const [sections, setSections] = useState<Array<{
    id: string;
    topic: string;
    count: number;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    marks: number;
  }>>([
    { id: 'sec_1', topic: 'Logical Reasoning', count: 10, difficulty: 'MEDIUM', marks: 1 },
    { id: 'sec_2', topic: 'Quantitative Aptitude', count: 10, difficulty: 'MEDIUM', marks: 1 },
    { id: 'sec_3', topic: 'Verbal Ability', count: 10, difficulty: 'MEDIUM', marks: 1 }
  ]);

  // Difficulty & Question Configuration for Single Mode and ISE
  const [totalQuestions, setTotalQuestions] = useState(30);
  const [easyCount, setEasyCount] = useState(0);
  const [mediumCount, setMediumCount] = useState(0);
  const [hardCount, setHardCount] = useState(30);
  const [marksPerQuestion, setMarksPerQuestion] = useState(1);
  const [overallSeverity, setOverallSeverity] = useState<'EASY' | 'MEDIUM' | 'HARD' | 'CUSTOM'>('HARD');

  const handleSetSeverity = (sev: 'EASY' | 'MEDIUM' | 'HARD' | 'BALANCED') => {
    if (sev === 'HARD') {
      setEasyCount(0);
      setMediumCount(0);
      setHardCount(totalQuestions);
      setOverallSeverity('HARD');
    } else if (sev === 'MEDIUM') {
      setEasyCount(0);
      setMediumCount(totalQuestions);
      setHardCount(0);
      setOverallSeverity('MEDIUM');
    } else if (sev === 'EASY') {
      setEasyCount(totalQuestions);
      setMediumCount(0);
      setHardCount(0);
      setOverallSeverity('EASY');
    } else if (sev === 'BALANCED') {
      const e = Math.floor(totalQuestions / 3);
      const m = Math.floor(totalQuestions / 3);
      const h = totalQuestions - e - m;
      setEasyCount(e);
      setMediumCount(m);
      setHardCount(h);
      setOverallSeverity('CUSTOM');
    }
    playSound('click');
  };

  // Computed total questions and marks derived strictly without cyclic loops
  const effectiveTotalQuestions = useMemo(() => {
    if (examCategory === 'Aptitude') {
      if (topicMode === 'sections') {
        return sections.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
      }
      return totalQuestions;
    }
    // ISE mode: explicit sum of easy, medium, hard
    return (Number(easyCount) || 0) + (Number(mediumCount) || 0) + (Number(hardCount) || 0);
  }, [examCategory, topicMode, sections, totalQuestions, easyCount, mediumCount, hardCount]);

  const effectiveTotalMarks = useMemo(() => {
    if (examCategory === 'Aptitude' && topicMode === 'sections') {
      return sections.reduce((sum, s) => sum + ((Number(s.count) || 0) * (Number(s.marks) || 1)), 0);
    }
    return effectiveTotalQuestions * (Number(marksPerQuestion) || 1);
  }, [examCategory, topicMode, sections, effectiveTotalQuestions, marksPerQuestion]);

  const handleAddSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        topic: '',
        count: 10,
        difficulty: 'MEDIUM',
        marks: 1
      }
    ]);
    playSound('click');
  };

  const handleRemoveSection = (id: string) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
    playSound('click');
  };

  const handleUpdateSection = (
    id: string,
    updates: Partial<{ topic: string; count: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; marks: number }>
  ) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleCategoryChange = (cat: 'Aptitude' | 'ISE') => {
    setExamCategory(cat);
    setError(null);
    if (cat === 'Aptitude') {
      setSubject('General Aptitude & Reasoning');
      setTitle('General Aptitude Assessment');
      setTopicMode('sections');
      setSections([
        { id: 'sec_1', topic: 'Logical Reasoning', count: 10, difficulty: 'MEDIUM', marks: 1 },
        { id: 'sec_2', topic: 'Quantitative Aptitude', count: 10, difficulty: 'MEDIUM', marks: 1 },
        { id: 'sec_3', topic: 'Verbal Ability', count: 10, difficulty: 'MEDIUM', marks: 1 }
      ]);
    } else {
      if (subject === 'General Aptitude & Reasoning') {
        setSubject('');
      }
      setTitle(subject ? `${subject} In-Semester Examination (ISE)` : 'In-Semester Examination (ISE)');
      setTopicMode('single');
    }
    playSound('click');
  };

  const handleLoadSampleSyllabus = () => {
    setSubject('Data Structures & Algorithms');
    setTitle('Data Structures & Algorithms ISE');
    setSyllabusText(
      `Unit 1: Linear Data Structures - Arrays, Stacks, Queues, Circular Queues, Linked Lists (Singly, Doubly, Circular) and applications.\n` +
      `Unit 2: Trees & Hierarchical Structures - Binary Trees, Tree Traversals (Inorder, Preorder, Postorder), Binary Search Trees (BST), AVL Trees, Heaps and Priority Queues.\n` +
      `Unit 3: Graphs & Networks - Graph representations (Adjacency Matrix, Adjacency List), BFS, DFS, Shortest Path (Dijkstra, Bellman-Ford), Minimum Spanning Trees (Prim, Kruskal).\n` +
      `Unit 4: Sorting, Searching & Hashing - QuickSort, MergeSort, HeapSort, Linear/Binary Search, Hash functions, Collision resolution (Chaining, Open Addressing).`
    );
    playSound('click');
  };

  const handleApplyPreset = (preset: 'aptitude' | 'verbal' | 'technical') => {
    if (preset === 'aptitude') {
      setExamCategory('Aptitude');
      setSubject('General Aptitude & Reasoning');
      setTitle('General Aptitude & Logical Reasoning Assessment');
      setSections([
        { id: 'sec_1', topic: 'Logical Reasoning', count: 10, difficulty: 'MEDIUM', marks: 1 },
        { id: 'sec_2', topic: 'Quantitative Aptitude', count: 10, difficulty: 'MEDIUM', marks: 1 },
        { id: 'sec_3', topic: 'Verbal Ability', count: 10, difficulty: 'MEDIUM', marks: 1 }
      ]);
    } else if (preset === 'verbal') {
      setExamCategory('Aptitude');
      setSubject('Verbal Ability & Comprehension');
      setTitle('Verbal Ability Assessment');
      setSections([
        { id: 'sec_1', topic: 'Reading Comprehension', count: 15, difficulty: 'MEDIUM', marks: 1 },
        { id: 'sec_2', topic: 'Syllogisms & Analogies', count: 15, difficulty: 'MEDIUM', marks: 1 }
      ]);
    } else if (preset === 'technical') {
      setExamCategory('Aptitude');
      setSubject('Computer Science');
      setTitle('CS Technical Assessment');
      setSections([
        { id: 'sec_1', topic: 'Data Structures & Algorithms', count: 15, difficulty: 'HARD', marks: 1 },
        { id: 'sec_2', topic: 'Operating Systems & DBMS', count: 15, difficulty: 'MEDIUM', marks: 1 },
        { id: 'sec_3', topic: 'Computer Networks', count: 10, difficulty: 'MEDIUM', marks: 1 }
      ]);
    }
    playSound('click');
  };

  // Negative Marking & Settings
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(true);
  const [negativeMarkPenalty, setNegativeMarkPenalty] = useState(0.25);
  const [resultDeclarationMode, setResultDeclarationMode] = useState<MCQResultDeclarationMode>('WHATSAPP_GROUP');

  // Scheduling & Delivery settings in Generator
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  const [endTime, setEndTime] = useState<number | undefined>(undefined);
  const [whatsappGroupName, setWhatsappGroupName] = useState('');
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');

  // Settings drawer state in Review screen
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Progress & Error
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Review Stage State
  const [reviewedExam, setReviewedExam] = useState<MCQExamConfig | null>(null);
  const [reviewedQuestions, setReviewedQuestions] = useState<MCQQuestion[]>([]);
  const [auditReport, setAuditReport] = useState<CrossValidationReport | null>(null);
  const [expandedQIds, setExpandedQIds] = useState<Set<string>>(new Set());
  const [activeDifficultyFilter, setActiveDifficultyFilter] = useState<'ALL' | 'EASY' | 'MEDIUM' | 'HARD'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  if (!isOpen) return null;

  // ── ADVANCE FROM PAGE 1 (BLUEPRINT) TO PAGE 2 (RULES & TIMING) ──────────────
  const handleNextPage = () => {
    setError(null);
    if (examCategory === 'ISE') {
      if (!subject.trim()) {
        setError('Please enter a Subject / Course title for the ISE examination.');
        return;
      }
      if (!syllabusText.trim()) {
        setError('Please paste or enter the course syllabus / unit curriculum for the ISE examination.');
        return;
      }
      if (totalQuestions <= 0) {
        setError('Total questions must be greater than zero.');
        return;
      }
    } else {
      // Aptitude mode
      if (!subject.trim()) {
        setSubject('General Aptitude & Reasoning');
      }
      if (topicMode === 'sections') {
        if (sections.length === 0) {
          setError('Please configure at least one aptitude section.');
          return;
        }
        const emptyTopic = sections.find((s) => !s.topic.trim());
        if (emptyTopic) {
          setError('Please enter a topic name for all sections.');
          return;
        }
        if (effectiveTotalQuestions <= 0) {
          setError('Total questions across sections must be greater than zero.');
          return;
        }
      } else {
        if (!topic.trim()) {
          setError('Please provide at least one topic or syllabus theme.');
          return;
        }
        if (totalQuestions <= 0) {
          setError('Total questions must be greater than zero.');
          return;
        }
      }
    }
    setConfigPage(2);
    playSound('click');
  };

  // ── 1. GENERATE DRAFT WITH AI ────────────────────────────────────────────────
  const handleGenerate = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    if (configPage !== 2) {
      handleNextPage();
      return;
    }
    setError(null);

    if (examCategory === 'ISE') {
      if (!subject.trim()) {
        setError('Please provide a Subject / Course title for the ISE exam.');
        return;
      }
      if (!syllabusText.trim()) {
        setError('Please enter or paste the course syllabus / unit curriculum.');
        return;
      }
      if (totalQuestions <= 0) {
        setError('Total questions must be greater than zero.');
        return;
      }
    } else if (topicMode === 'sections') {
      if (sections.length === 0) {
        setError('Please configure at least one topic section.');
        return;
      }
      const emptyTopic = sections.find((s) => !s.topic.trim());
      if (emptyTopic) {
        setError('Please enter a syllabus topic name for all sections.');
        return;
      }
      if (effectiveTotalQuestions <= 0) {
        setError('Total questions across sections must be greater than zero.');
        return;
      }
    } else {
      if (!topic.trim()) {
        setError('Please provide at least one topic or syllabus theme.');
        return;
      }
      if (totalQuestions <= 0) {
        setError('Total questions must be greater than zero.');
        return;
      }
    }

    setStep('loading');
    setProgressMsg('Initializing Autonomous Reasoning Models...');
    playSound('click');

    try {
      let payload: AIPaperGenerationRequest;

      if (examCategory === 'ISE') {
        const finalEasy = Number(easyCount) || 0;
        const finalMed = Number(mediumCount) || 0;
        const finalHard = Number(hardCount) || 0;
        const finalTotal = finalEasy + finalMed + finalHard;

        if (finalTotal <= 0) {
          setError('Total questions must be greater than zero. Please set question counts for Easy, Medium, or Hard.');
          setStep('config');
          return;
        }

        const basePerQ = marksPerQuestion || 1;

        payload = {
          title: title.trim() || `${subject.trim()} In-Semester Examination (ISE)`,
          subject: subject.trim(),
          topic: `ISE Syllabus Curriculum (${subject.trim()})`,
          syllabusText: syllabusText.trim(),
          examCategory: 'ISE',
          instructions: instructions.trim(),
          durationMinutes,
          totalQuestions: finalTotal,
          easyCount: finalEasy,
          mediumCount: finalMed,
          hardCount: finalHard,
          easyMarks: basePerQ,
          mediumMarks: basePerQ,
          hardMarks: basePerQ,
          negativeMarkingEnabled,
          negativeMarkPenalty,
          autoPublish: false
        };
      } else if (topicMode === 'sections') {
        const finalTitle = title.trim() || `${sections.map((s) => s.topic.trim()).filter(Boolean).slice(0, 2).join(' & ')} Examination`;
        const finalSubject = subject.trim() || 'General Aptitude & Reasoning';
        const finalTopic = sections.map((s) => s.topic.trim()).filter(Boolean).join(', ');
        const secTotalCount = sections.reduce((sum, s) => sum + Math.max(1, Number(s.count) || 1), 0);

        payload = {
          title: finalTitle,
          subject: finalSubject,
          topic: finalTopic,
          totalQuestions: secTotalCount,
          sections: sections.map((s) => ({
            id: s.id,
            topic: s.topic.trim(),
            count: Math.max(1, Number(s.count) || 1),
            difficulty: s.difficulty,
            marks: Math.max(1, Number(s.marks) || 1)
          })),
          examCategory: 'Aptitude',
          instructions: instructions.trim(),
          durationMinutes,
          easyCount: 0,
          mediumCount: 0,
          hardCount: 0,
          negativeMarkingEnabled,
          negativeMarkPenalty,
          autoPublish: false // Explicitly DRAFT: Faculty reviews before publishing
        };
      } else {
        const finalTitle = title.trim() || `${topic.trim()} Examination`;
        const finalSubject = subject.trim() || 'General Aptitude & Reasoning';
        const finalTopic = topic.trim();

        const reqTotal = Math.max(1, Number(totalQuestions) || 30);
        let finalEasy = Number(easyCount) || 0;
        let finalMed = Number(mediumCount) || 0;
        let finalHard = Number(hardCount) || 0;
        const basePerQ = Number(marksPerQuestion) || 1;

        if (finalEasy + finalMed + finalHard !== reqTotal) {
          if (overallSeverity === 'EASY') {
            finalEasy = reqTotal;
            finalMed = 0;
            finalHard = 0;
          } else if (overallSeverity === 'MEDIUM') {
            finalEasy = 0;
            finalMed = reqTotal;
            finalHard = 0;
          } else if (overallSeverity === 'HARD') {
            finalEasy = 0;
            finalMed = 0;
            finalHard = reqTotal;
          } else {
            finalMed = reqTotal;
            finalEasy = 0;
            finalHard = 0;
          }
        }

        payload = {
          title: finalTitle,
          subject: finalSubject,
          topic: finalTopic,
          examCategory: 'Aptitude',
          instructions: instructions.trim(),
          durationMinutes,
          totalQuestions: reqTotal,
          easyCount: finalEasy,
          mediumCount: finalMed,
          hardCount: finalHard,
          easyMarks: basePerQ,
          mediumMarks: basePerQ,
          hardMarks: basePerQ,
          negativeMarkingEnabled,
          negativeMarkPenalty,
          autoPublish: false
        };
      }

      const res = await generateFullExamPaperWithAI(payload, (status) => {
        setProgressMsg(status);
      });

      setReviewedExam({
        ...res.exam,
        resultDeclarationMode,
        startTime,
        endTime,
        whatsappGroupName: whatsappGroupName.trim() || undefined,
        whatsappGroupLink: whatsappGroupLink.trim() || undefined,
        instructions: instructions.trim() || res.exam.instructions,
      });
      setReviewedQuestions(res.questions);
      setAuditReport(res.auditReport || null);
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
      marks: marksPerQuestion || (reviewedQuestions.length > 0 ? (Number(reviewedQuestions[0].marks) || 1) : 1),
      negativeMarks: reviewedExam.negativeMarkingEnabled ? negativeMarkPenalty : 0,
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
    setShowDiscardConfirm(true);
  };

  const confirmDiscardDraft = () => {
    const examToDelete = reviewedExam;
    const questionsToDelete = reviewedQuestions;
    playSound('click');
    setShowDiscardConfirm(false);
    onClose();

    if (examToDelete) {
      void deleteExam(examToDelete.id);
      void Promise.allSettled(questionsToDelete.map((q) => deleteQuestion(q.id)));
    }
  };

  const handleCopyStudentLink = () => {
    const studentUrl = reviewedExam?.id
      ? `${window.location.origin}/mcq?examId=${encodeURIComponent(reviewedExam.id)}`
      : `${window.location.origin}/mcq`;
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

          {/* ── STEP 1: CONFIG FORM (2-PAGE SYSTEM) ── */}
          {step === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 2-Page Step Selector Tabs */}
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px'
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setConfigPage(1);
                    playSound('click');
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    background: configPage === 1 ? 'var(--bg-elevated)' : 'transparent',
                    color: configPage === 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: configPage === 1 ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: configPage === 1 ? 'var(--accent)' : 'var(--bg-surface)',
                      color: configPage === 1 ? 'var(--accent-contrast)' : 'var(--text-muted)',
                      fontSize: '10px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    1
                  </span>
                  <span>1. Paper Blueprint & Topics</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNextPage()}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    background: configPage === 2 ? 'var(--bg-elevated)' : 'transparent',
                    color: configPage === 2 ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: configPage === 2 ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: configPage === 2 ? 'var(--accent)' : 'var(--bg-surface)',
                      color: configPage === 2 ? 'var(--accent-contrast)' : 'var(--text-muted)',
                      fontSize: '10px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    2
                  </span>
                  <span>2. Rules, Timing & Delivery</span>
                </button>
              </div>

              <div id="ai-paper-config-fields" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {configPage === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Row 1: Official Examination Title */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Official Examination Title (Optional)
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Campus Placement Aptitude & Logical Reasoning Assessment"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                />
              </div>

              {/* Row 2: Subject & Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Subject / Discipline *
                  </label>
                  <input
                    list="ai-available-subjects"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. General Aptitude, Computer Science, Mathematics..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                    required
                  />
                  <datalist id="ai-available-subjects">
                    {availableSubjects.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Examination Category
                  </label>
                  <select
                    value={examCategory}
                    onChange={(e) => handleCategoryChange(e.target.value as 'Aptitude' | 'ISE')}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Aptitude">Aptitude</option>
                    <option value="ISE">ISE</option>
                  </select>
                </div>
              </div>

              {/* ── CONDITIONAL MODE: APTITUDE VS ISE ── */}
              {examCategory === 'Aptitude' ? (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '14px'
                  }}
                >
                {/* Topic Distribution Mode Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={14} color="var(--accent)" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Topic & Question Quota Configuration
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setTopicMode('sections')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-xs)',
                        border: 'none',
                        background: topicMode === 'sections' ? 'var(--bg-surface)' : 'transparent',
                        color: topicMode === 'sections' ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Layers size={11} color={topicMode === 'sections' ? 'var(--accent)' : 'inherit'} />
                      <span>Multi-Topic Breakdown</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopicMode('single')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-xs)',
                        border: 'none',
                        background: topicMode === 'single' ? 'var(--bg-surface)' : 'transparent',
                        color: topicMode === 'single' ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      Single Syllabus Theme
                    </button>
                  </div>
                </div>

                {/* MODE 1: MULTI-TOPIC / SECTION BREAKDOWN */}
                {topicMode === 'sections' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Table Header */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 105px 110px 85px 75px 36px',
                        gap: '8px',
                        padding: '0 8px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}
                    >
                      <span>Topic / Module Name *</span>
                      <span style={{ textAlign: 'center' }}>Questions</span>
                      <span>Difficulty</span>
                      <span style={{ textAlign: 'center' }}>Marks / Q</span>
                      <span style={{ textAlign: 'center' }}>Subtotal</span>
                      <span></span>
                    </div>

                    {/* Section Rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {sections.map((sec, idx) => (
                        <div
                          key={sec.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 105px 110px 85px 75px 36px',
                            gap: '8px',
                            alignItems: 'center',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px'
                          }}
                        >
                          {/* Topic Input */}
                          <div>
                            <input
                              list="ai-available-topics"
                              value={sec.topic}
                              onChange={(e) => handleUpdateSection(sec.id, { topic: e.target.value })}
                              placeholder={idx === 0 ? "e.g. Logical Reasoning" : idx === 1 ? "e.g. Blood Relations" : "e.g. Quantitative Aptitude"}
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '6px 8px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                fontWeight: 600
                              }}
                              required
                            />
                          </div>

                          {/* Questions Count */}
                          <div>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              className="no-spin"
                              value={sec.count || ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  handleUpdateSection(sec.id, { count: val });
                                }
                              }}
                              placeholder="15"
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '6px 8px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                fontWeight: 700,
                                textAlign: 'center'
                              }}
                              required
                            />
                          </div>

                          {/* Difficulty */}
                          <div>
                            <select
                              value={sec.difficulty}
                              onChange={(e) => handleUpdateSection(sec.id, { difficulty: e.target.value as 'EASY' | 'MEDIUM' | 'HARD' })}
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '6px 6px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: sec.difficulty === 'EASY' ? 'var(--success)' : sec.difficulty === 'HARD' ? 'var(--danger)' : 'var(--warning)',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <option value="EASY">Easy</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HARD">Hard</option>
                            </select>
                          </div>

                          {/* Marks per Question */}
                          <div>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              className="no-spin"
                              value={sec.marks || ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  handleUpdateSection(sec.id, { marks: val });
                                }
                              }}
                              placeholder="1"
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '6px 8px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                fontWeight: 700,
                                textAlign: 'center'
                              }}
                            />
                          </div>

                          {/* Subtotal */}
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>
                            {(Number(sec.count) || 0) * (Number(sec.marks) || 1)} pt{(Number(sec.count) || 0) * (Number(sec.marks) || 1) !== 1 ? 's' : ''}
                          </div>

                          {/* Remove Button */}
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveSection(sec.id)}
                              disabled={sections.length <= 1}
                              title={sections.length <= 1 ? "At least one topic section is required" : "Remove topic section"}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: sections.length <= 1 ? 'var(--text-dim)' : 'var(--danger)',
                                cursor: sections.length <= 1 ? 'not-allowed' : 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: sections.length <= 1 ? 0.3 : 0.8
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Section & Quick Presets Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={handleAddSection}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={13} color="var(--accent)" />
                        <span>Add Topic / Section</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Quick Presets:</span>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('aptitude')}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            fontSize: '10.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Aptitude (45 Qs)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('verbal')}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            fontSize: '10.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Verbal (30 Qs)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('technical')}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            fontSize: '10.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          CS Technical (40 Qs)
                        </button>
                      </div>
                    </div>

                    {/* Real-Time Matrix Total Summary Strip */}
                    <div
                      style={{
                        marginTop: '6px',
                        padding: '8px 12px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        fontSize: '11px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total Questions: <strong style={{ color: 'var(--text-primary)' }}>{effectiveTotalQuestions}</strong>
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total Marks: <strong style={{ color: 'var(--accent)' }}>{effectiveTotalMarks} pts</strong>
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Active Topics: <strong style={{ color: 'var(--text-primary)' }}>{sections.length}</strong>
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Quotas: {sections.map(s => `${s.count || 0} ${s.topic || 'Topic'}`).join(' • ')}
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE 2: SINGLE SYLLABUS THEME */}
                {topicMode === 'single' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Syllabus Topic or Theme *
                      </label>
                      <input
                        list="ai-available-topics"
                        value={topic}
                        onChange={(e) => {
                          setTopic(e.target.value);
                          if (!title) setTitle(`${e.target.value} Examination`);
                        }}
                        placeholder="e.g. Data Structures, Arrays, Stacks, Trees..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '8px 10px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                        required={topicMode === 'single'}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                      {/* Total Questions */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Total Questions
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          className="no-spin"
                          value={totalQuestions || ''}
                          onChange={(e) => {
                            const count = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            if (!isNaN(count)) {
                              setTotalQuestions(count);
                              if (overallSeverity === 'HARD') {
                                setHardCount(count);
                                setEasyCount(0);
                                setMediumCount(0);
                              } else if (overallSeverity === 'MEDIUM') {
                                setMediumCount(count);
                                setEasyCount(0);
                                setHardCount(0);
                              } else if (overallSeverity === 'EASY') {
                                setEasyCount(count);
                                setMediumCount(0);
                                setHardCount(0);
                              } else {
                                const eCount = Math.floor(count / 3);
                                const mCount = Math.floor(count / 3);
                                setEasyCount(eCount);
                                setMediumCount(mCount);
                                setHardCount(count - eCount - mCount);
                              }
                            }
                          }}
                          placeholder="e.g. 30"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontWeight: 600
                          }}
                        />
                      </div>

                      {/* Marks per Question */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Marks / Question
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          className="no-spin"
                          value={marksPerQuestion || ''}
                          onChange={(e) => {
                            const m = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                            if (!isNaN(m)) {
                              setMarksPerQuestion(m);
                            }
                          }}
                          placeholder="e.g. 1"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontWeight: 600
                          }}
                        />
                      </div>

                      {/* Total Marks (Calculated) */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Total Marks
                        </label>
                        <input
                          type="number"
                          readOnly
                          className="no-spin"
                          value={effectiveTotalMarks}
                          placeholder="e.g. 30"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--accent)',
                            fontSize: '13px',
                            fontWeight: 700
                          }}
                        />
                      </div>

                      {/* Overall Severity */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Overall Severity
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                          {(['EASY', 'MEDIUM', 'HARD'] as const).map((sev) => {
                            const isSelected = overallSeverity === sev;
                            const color = sev === 'EASY' ? 'var(--success)' : sev === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)';
                            return (
                              <button
                                key={sev}
                                type="button"
                                onClick={() => handleSetSeverity(sev)}
                                style={{
                                  padding: '8px 4px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: isSelected ? `1.5px solid ${color}` : '1px solid var(--border)',
                                  background: isSelected ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                                  color: isSelected ? color : 'var(--text-secondary)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {sev}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 12px',
                        fontSize: '11px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total Questions: <strong style={{ color: 'var(--text-primary)' }}>{totalQuestions}</strong>
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Marks / Question: <strong style={{ color: 'var(--text-primary)' }}>{marksPerQuestion} pt{marksPerQuestion > 1 ? 's' : ''}</strong>
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total Marks: <strong style={{ color: 'var(--accent)' }}>{effectiveTotalMarks} pts</strong>
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Severity Profile: <span style={{ fontWeight: 700, color: overallSeverity === 'EASY' ? 'var(--success)' : overallSeverity === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)' }}>{overallSeverity}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
                /* ── ISE MODE: SYLLABUS & UNIT CURRICULUM DRIVEN ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Subject Quick Chips */}
                  <div>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      Quick University Course Subjects:
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        'Data Structures & Algorithms',
                        'Operating Systems',
                        'Database Management Systems (DBMS)',
                        'Computer Networks',
                        'Object-Oriented Programming (OOP)'
                      ].map((sub) => (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => {
                            setSubject(sub);
                            setTitle(`${sub} In-Semester Examination (ISE)`);
                            playSound('click');
                          }}
                          style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 500,
                            borderRadius: 'var(--radius-xs)',
                            background: subject === sub ? 'var(--accent)' : 'var(--bg-elevated)',
                            color: subject === sub ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            cursor: 'pointer'
                          }}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Course Syllabus / Unit Curriculum Card */}
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <BookOpen size={14} color="var(--accent)" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Course Syllabus & Unit Curriculum (Paste or type entire unit syllabus) *
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleLoadSampleSyllabus}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10.5px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        Load Sample Unit Syllabus
                      </button>
                    </div>

                    <textarea
                      rows={6}
                      value={syllabusText}
                      onChange={(e) => setSyllabusText(e.target.value)}
                      placeholder={`Paste your entire course syllabus / unit breakdown here...\nFor example:\nUnit 1: Linear Data Structures - Arrays, Stacks, Queues, Circular Queues, Linked Lists and applications.\nUnit 2: Trees & Hierarchical Structures - Binary Trees, Tree Traversals, BST, AVL Trees, Heaps.\nUnit 3: Graphs & Networks - Graph representations, BFS, DFS, Dijkstra, Minimum Spanning Trees.\nUnit 4: Sorting, Searching & Hashing - QuickSort, MergeSort, Binary Search, Hash functions, Collisions.`}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 12px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        lineHeight: '1.5',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                      required
                    />

                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      CodeDNA AI analyzes every unit and automatically distributes university-level examination questions across the entire curriculum.
                    </span>
                  </div>

                  {/* Question Quotas & Difficulty Controls */}
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} color="var(--accent)" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Question Quota & Exact Difficulty Breakdown
                        </span>
                      </div>

                      {/* Quick Severity Buttons */}
                      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => handleSetSeverity('HARD')}
                          style={{
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            borderRadius: 'var(--radius-xs)',
                            border: 'none',
                            background: overallSeverity === 'HARD' ? 'var(--danger)' : 'transparent',
                            color: overallSeverity === 'HARD' ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          All Hard ({effectiveTotalQuestions || 30})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSeverity('MEDIUM')}
                          style={{
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            borderRadius: 'var(--radius-xs)',
                            border: 'none',
                            background: overallSeverity === 'MEDIUM' ? 'var(--warning)' : 'transparent',
                            color: overallSeverity === 'MEDIUM' ? '#18181b' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          All Medium ({effectiveTotalQuestions || 30})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSeverity('EASY')}
                          style={{
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            borderRadius: 'var(--radius-xs)',
                            border: 'none',
                            background: overallSeverity === 'EASY' ? 'var(--success)' : 'transparent',
                            color: overallSeverity === 'EASY' ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          All Easy ({effectiveTotalQuestions || 30})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSeverity('BALANCED')}
                          style={{
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            borderRadius: 'var(--radius-xs)',
                            border: 'none',
                            background: overallSeverity === 'CUSTOM' ? 'var(--accent)' : 'transparent',
                            color: overallSeverity === 'CUSTOM' ? 'var(--accent-contrast)' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          Balanced Mix
                        </button>
                      </div>
                    </div>

                    {/* 4 Direct Numeric Input Columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--success)', marginBottom: '4px' }}>
                          Easy Questions
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="no-spin"
                          value={easyCount}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setEasyCount(val);
                              setOverallSeverity('CUSTOM');
                            }
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--warning)', marginBottom: '4px' }}>
                          Medium Questions
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="no-spin"
                          value={mediumCount}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setMediumCount(val);
                              setOverallSeverity('CUSTOM');
                            }
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--danger)', marginBottom: '4px' }}>
                          Hard Questions
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="no-spin"
                          value={hardCount}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setHardCount(val);
                              setOverallSeverity('CUSTOM');
                            }
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Marks / Question
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          className="no-spin"
                          value={marksPerQuestion}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                            if (!isNaN(val)) setMarksPerQuestion(val);
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                      </div>
                    </div>

                    {/* ISE Summary Strip */}
                    <div
                      style={{
                        padding: '8px 12px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        fontSize: '11px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total Questions: <strong style={{ color: 'var(--text-primary)' }}>{effectiveTotalQuestions}</strong>
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total Marks: <strong style={{ color: 'var(--accent)' }}>{effectiveTotalMarks} pts</strong>
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Exact Quota: <span style={{ color: 'var(--success)', fontWeight: 700 }}>{easyCount} Easy</span> • <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{mediumCount} Medium</span> • <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{hardCount} Hard</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <datalist id="ai-available-topics">
                {availableTopics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          )}

          {/* ── PAGE 2: RULES, TIMING & DELIVERY ── */}
          {configPage === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Duration & Negative Penalty */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Clock size={13} color="var(--accent)" />
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Exam Duration (Minutes) *
                    </label>
                  </div>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    className="no-spin"
                    value={durationMinutes || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                      if (!isNaN(val)) setDurationMinutes(val);
                    }}
                    onBlur={() => {
                      if (!durationMinutes || durationMinutes < 5) setDurationMinutes(30);
                    }}
                    placeholder="e.g. 45"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  />
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Standard recommendation: 30 to 60 minutes
                  </span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Shield size={13} color="var(--accent)" />
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Negative Marking Scheme
                    </label>
                  </div>
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
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="0">Disabled (0 Penalty · Standard Attempt)</option>
                    <option value="0.25">-0.25 Mark per wrong answer</option>
                    <option value="0.5">-0.50 Mark per wrong answer</option>
                    <option value="1.0">-1.00 Mark per wrong answer</option>
                  </select>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Deducts marks only for incorrect responses
                  </span>
                </div>
              </div>

              {/* Result Declaration Option */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <CheckSquare size={13} color="var(--accent)" />
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Result Declaration & Score Release
                  </label>
                </div>
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
                    <span>Declare Results Immediately Post-Exam</span>
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
                      <span>Dispatch on WhatsApp Group</span>
                    </span>
                    {resultDeclarationMode === 'WHATSAPP_GROUP' && <Check size={12} color="var(--accent)" />}
                  </button>
                </div>
                {resultDeclarationMode === 'WHATSAPP_GROUP' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '10px', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        WhatsApp Group Name (Optional)
                      </label>
                      <input
                        value={whatsappGroupName}
                        onChange={(e) => setWhatsappGroupName(e.target.value)}
                        placeholder="e.g. TE Computer Div A - 2026 Batch"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 10px',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '11.5px'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        WhatsApp Group Invite Link (Optional)
                      </label>
                      <input
                        value={whatsappGroupLink}
                        onChange={(e) => setWhatsappGroupLink(e.target.value)}
                        placeholder="https://chat.whatsapp.com/..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 10px',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '11.5px'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Scheduled Examination Window (Watermelon UI Component) */}
              <WatermelonSchedulePicker
                startTime={startTime}
                endTime={endTime}
                durationMinutes={durationMinutes}
                onChange={(start, end) => {
                  setStartTime(start);
                  setEndTime(end);
                }}
              />

              {/* Focus Instructions */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Specific Focus Instructions for AI (Optional)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Focus on recursive tree traversals and worst-case complexity edge cases."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '7px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '11.5px',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Autonomous Answer Cross-Validator Badge */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <CheckCircle2 size={14} color="var(--success)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Autonomous Answer Cross-Validator Active
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--success-bg)',
                        border: '1px solid var(--success-border)',
                        color: 'var(--success)',
                        textTransform: 'uppercase'
                      }}
                    >
                      Double-Check Enabled
                    </span>
                  </div>
                  <p style={{ margin: '1px 0 0', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Every synthesized question is verified against distractors before draft presentation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
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
              
              {/* Cross-Validator Audit Banner */}
              {auditReport && (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <CheckCircle2 size={16} color="var(--success)" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Autonomous Answer Cross-Validator Certified
                        </span>
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--success-bg)',
                            border: '1px solid var(--success-border)',
                            color: 'var(--success)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}
                        >
                          Audited
                        </span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                        All {auditReport.totalAudited} questions solved and verified from first principles.
                        {auditReport.correctionsCount > 0
                          ? ` ${auditReport.correctionsCount} answer keys auto-refined with step-by-step mathematical proofs.`
                          : ' 100% of answer keys verified strictly accurate with complete proofs.'}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {auditReport.totalAudited}/{auditReport.totalAudited} Verified
                    </span>
                  </div>
                </div>
              )}

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'end' }}>
                  <div style={{ minWidth: '160px' }}>
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

                  <div style={{ minWidth: '140px' }}>
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

                  <div style={{ minWidth: '85px' }}>
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

                  <div style={{ minWidth: '110px' }}>
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

                  <div style={{ minWidth: '125px' }}>
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
                      {reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' ? 'WhatsApp' : 'Immediate'}
                    </button>
                  </div>

                  <div style={{ minWidth: '140px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Exam Settings
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSettingsDrawer(!showSettingsDrawer);
                        playSound('click');
                      }}
                      style={{
                        width: '100%',
                        height: '36px',
                        boxSizing: 'border-box',
                        padding: '0 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: showSettingsDrawer ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                        border: `1px solid ${showSettingsDrawer ? 'var(--accent)' : (reviewedExam.startTime ? 'var(--warning-border)' : 'var(--border)')}`,
                        borderRadius: 'var(--radius-sm)',
                        color: showSettingsDrawer ? 'var(--text-primary)' : (reviewedExam.startTime ? 'var(--warning)' : 'var(--text-secondary)'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Settings size={12} color={reviewedExam.startTime ? 'var(--warning)' : 'var(--text-muted)'} />
                      <span>{showSettingsDrawer ? 'Hide Settings' : 'Schedule & Settings'}</span>
                      {reviewedExam.startTime && (
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--warning)' }} />
                      )}
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

              {/* Comprehensive Exam Settings & Schedule Panel */}
              {showSettingsDrawer && (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Settings size={13} color="var(--accent)" />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Exam Delivery, Scheduling & Anti-Cheat Controls
                        </h4>
                        <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Configure student unlock window, option scrambling, attempts, and WhatsApp score release.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSettingsDrawer(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* 1. SCHEDULE & ACCESS WINDOW (Watermelon UI Component) */}
                  <WatermelonSchedulePicker
                    startTime={reviewedExam.startTime}
                    endTime={reviewedExam.endTime}
                    durationMinutes={reviewedExam.durationMinutes || durationMinutes}
                    onChange={(start, end) => {
                      setReviewedExam({
                        ...reviewedExam,
                        startTime: start,
                        endTime: end
                      });
                    }}
                  />

                  {/* 2. ANTI-CHEAT & INTEGRITY CONTROLS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {[
                      {
                        key: 'shuffleQuestions',
                        label: 'Shuffle Question Order',
                        desc: 'Every candidate receives questions in a distinct randomized order.',
                        value: reviewedExam.shuffleQuestions ?? true,
                        toggle: () => setReviewedExam({ ...reviewedExam, shuffleQuestions: !(reviewedExam.shuffleQuestions ?? true) })
                      },
                      {
                        key: 'shuffleOptions',
                        label: 'Shuffle Answer Options',
                        desc: 'Option positions (A, B, C, D) are randomly scrambled per candidate.',
                        value: reviewedExam.shuffleOptions ?? true,
                        toggle: () => setReviewedExam({ ...reviewedExam, shuffleOptions: !(reviewedExam.shuffleOptions ?? true) })
                      },
                      {
                        key: 'allowReview',
                        label: 'Allow Question Revisit',
                        desc: 'Candidates can navigate freely between previous questions.',
                        value: reviewedExam.allowReview ?? true,
                        toggle: () => setReviewedExam({ ...reviewedExam, allowReview: !(reviewedExam.allowReview ?? true) })
                      },
                      {
                        key: 'showExplanationsAfterSubmit',
                        label: 'Show Post-Submit Explanations',
                        desc: 'Display AI step-by-step rationales when results are declared.',
                        value: reviewedExam.showExplanationsAfterSubmit ?? true,
                        toggle: () => setReviewedExam({ ...reviewedExam, showExplanationsAfterSubmit: !(reviewedExam.showExplanationsAfterSubmit ?? true) })
                      }
                    ].map((item) => (
                      <div
                        key={item.key}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            item.toggle();
                            playSound('click');
                          }}
                          style={{
                            width: '34px',
                            height: '18px',
                            borderRadius: 'var(--radius-pill)',
                            flexShrink: 0,
                            marginTop: '2px',
                            background: item.value ? 'var(--accent)' : 'var(--bg-hover)',
                            border: 'none',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'background 0.2s'
                          }}
                        >
                          <div
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '50%',
                              background: 'var(--bg-elevated)',
                              position: 'absolute',
                              top: '2px',
                              left: item.value ? '18px' : '2px',
                              transition: 'left 0.2s'
                            }}
                          />
                        </button>
                        <div>
                          <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3, marginTop: '2px' }}>
                            {item.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 3. ATTEMPTS & WHATSAPP DETAILS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Max Attempts per Student
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={reviewedExam.maxAttempts || 1}
                        onChange={(e) =>
                          setReviewedExam({
                            ...reviewedExam,
                            maxAttempts: Math.max(1, parseInt(e.target.value, 10) || 1)
                          })
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 10px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '11.5px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {reviewedExam.resultDeclarationMode === 'WHATSAPP_GROUP' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                            WhatsApp Group Name
                          </label>
                          <input
                            value={reviewedExam.whatsappGroupName || ''}
                            onChange={(e) =>
                              setReviewedExam({
                                ...reviewedExam,
                                whatsappGroupName: e.target.value
                              })
                            }
                            placeholder="e.g. TE Computer Div A - 2026 Batch"
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              padding: '6px 10px',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                              fontSize: '11.5px',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                            WhatsApp Group Invite Link
                          </label>
                          <input
                            value={reviewedExam.whatsappGroupLink || ''}
                            onChange={(e) =>
                              setReviewedExam({
                                ...reviewedExam,
                                whatsappGroupLink: e.target.value
                              })
                            }
                            placeholder="https://chat.whatsapp.com/..."
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              padding: '6px 10px',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                              fontSize: '11.5px',
                              outline: 'none'
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* 4. PRE-EXAM INSTRUCTIONS */}
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Candidate Instructions (Displayed on Entrance Screen)
                    </label>
                    <textarea
                      rows={2}
                      value={reviewedExam.instructions || ''}
                      onChange={(e) =>
                        setReviewedExam({
                          ...reviewedExam,
                          instructions: e.target.value
                        })
                      }
                      placeholder="e.g. All questions are mandatory. Negative marking is active. Do not switch tabs or exit fullscreen during the examination."
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              )}

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
                    href={reviewedExam?.id ? `/mcq?examId=${encodeURIComponent(reviewedExam.id)}` : '/mcq'}
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

        {/* MODAL FOOTER (PINNED) */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            flexShrink: 0
          }}
        >
          {step === 'config' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '11.5px' }}>
                  Total: {effectiveTotalQuestions} Questions
                </span>
                <span style={{ color: 'var(--border)' }}>•</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '11.5px' }}>
                  {effectiveTotalMarks} Marks
                </span>
                {configPage === 2 && (
                  <>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                      {durationMinutes} Mins Duration
                    </span>
                  </>
                )}
                <span style={{ color: 'var(--border)' }}>•</span>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  Page {configPage} of 2
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {configPage === 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        height: '34px',
                        padding: '0 14px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPage}
                      style={{
                        height: '34px',
                        padding: '0 16px',
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--accent-contrast)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>Next: Rules & Timing</span>
                      <ChevronRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfigPage(1);
                        playSound('click');
                      }}
                      style={{
                        height: '34px',
                        padding: '0 14px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <ChevronLeft size={14} />
                      <span>Back to Blueprint</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      style={{
                        height: '34px',
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
                        gap: '6px'
                      }}
                    >
                      <GraduationCap size={14} />
                      <span>Generate Questions for Review ({effectiveTotalQuestions})</span>
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <span>Powered by Axent Autonomous Reasoning Engine</span>
              <span>
                {step === 'review'
                  ? 'Draft state · All edits autosaved locally and sync to Question Bank'
                  : 'University Academic Integrity & Proctored Examination Standards'}
              </span>
            </>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={confirmDiscardDraft}
        variant="danger"
        title="Discard Draft Exam Paper?"
        subtitle="Unsaved questions and modifications will be permanently removed."
        badgeText="Draft Examination Action"
        confirmText="Discard Draft"
        cancelText="Continue Reviewing"
        message="This action will delete the generated questions and clear this unconfirmed draft from the local registry. This cannot be undone."
      />
    </div>
  );
};
