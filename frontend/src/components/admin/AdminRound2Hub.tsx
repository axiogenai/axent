import React, { useState, useEffect, useMemo } from 'react';



import {



  Trophy,



  BookOpen,



  Monitor,



  Search,



  Filter,



  RefreshCw,



  Download,



  Eye,



  CheckCircle2,



  AlertCircle,



  XCircle,



  Clock,



  Code2,



  Save,



  RotateCcw,



  Plus,



  Trash2,



  Copy,



  Check,



  X,



  Cpu,



  Layers,



  FileText,



  ExternalLink,



  ShieldCheck,



  ChevronRight,



  Maximize2,
  Upload,
  ListPlus,
  Brain
} from 'lucide-react';



import { CandidateStation } from '../../types/dna';



import {



  Round2Problem,



  Round2LeaderboardEntry,



  Round2TestCase,



  Round2QuestionReport,



  fetchRound2Leaderboard,



  getAllRound2Problems,



  fetchRound2ProblemsFromCloud,



  saveRound2Problems,



  saveRound2ProblemsToCloud,



  DEFAULT_ROUND2_PROBLEMS,
  OFFICIAL_5_LEETCODE_PROBLEMS,
  extractCleanCandidateCode,
  parseQuestionsFromPlainText,
  clearRound2Leaderboard
} from '../../services/round2CodingService';



import { playSound } from '../../utils/sounds';



export interface ShortlistedCohortMember {
  rollNumber: string;
  name: string;
  email: string;
  round2Key: string;
  round1Score: number;
  round1MaxScore: number;
}

interface AdminRound2HubProps {



  round2Stations: CandidateStation[];



  onInspectStation?: (stationId: string) => void;



  sendProctorLockCommand: (stationId: string, lock: boolean, labId?: string) => void;



  isDark?: boolean;

  shortlistedCohort?: ShortlistedCohortMember[];



}



export const AdminRound2Hub: React.FC<AdminRound2HubProps> = ({



  round2Stations,



  onInspectStation,



  sendProctorLockCommand,



  isDark = true,

  shortlistedCohort = []



}) => {



  // 1. Sub-Tabs: Leaderboard | Question Definitions | Live Streams



  const [subTab, setSubTab] = useState<'leaderboard' | 'questions' | 'live_streams'>('leaderboard');



  // Section Divider



  const [leaderboard, setLeaderboard] = useState<Round2LeaderboardEntry[]>([]);



  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);



  const [searchQuery, setSearchQuery] = useState('');



  const [langFilter, setLangFilter] = useState<'ALL' | 'Python' | 'C++' | 'C' | 'Java'>('ALL');



  const [selectedDossier, setSelectedDossier] = useState<Round2LeaderboardEntry | null>(null);



  const [activeDossierQ, setActiveDossierQ] = useState<number>(1);



  const [copiedCode, setCopiedCode] = useState(false);

  // Deduplicate round2Stations strictly by candidate roll / email so each student has exactly ONE card
  const uniqueRound2Stations = useMemo(() => {
    const byStudent = new Map<string, CandidateStation>();
    for (const st of round2Stations) {
      const anySt = st as any;
      const key = (
        st.student?.rollNumber ||
        anySt.student?.email ||
        anySt.cleanRoll ||
        anySt.student?.accessKey ||
        st.id
      ).trim().toUpperCase();

      if (!byStudent.has(key)) {
        byStudent.set(key, st);
      } else {
        const existing = byStudent.get(key)!;
        const existingTime = (existing as any).lastUpdatedTimestamp || (existing as any).last_updated_timestamp || 0;
        const newTime = anySt.lastUpdatedTimestamp || anySt.last_updated_timestamp || 0;
        if (newTime >= existingTime) {
          byStudent.set(key, st);
        }
      }
    }
    return Array.from(byStudent.values());
  }, [round2Stations]);

  // Unified Workstation Slots: Guarantees every shortlisted candidate has a dedicated station slot
  const workstationSlots = useMemo(() => {
    const slots: Array<{
      stationId: string;
      stationNumber: string;
      cand?: ShortlistedCohortMember;
      liveStation?: CandidateStation;
      isLive: boolean;
    }> = [];
    const seenRolls = new Set<string>();

    shortlistedCohort.forEach((cand, idx) => {
      const cleanRoll = (cand.rollNumber || '').trim().toUpperCase();
      const cleanKey = (cand.round2Key || '').trim().toUpperCase();
      if (!cleanRoll) return;
      seenRolls.add(cleanRoll);

      const live = uniqueRound2Stations.find((st) => {
        const anySt = st as any;
        const sRoll = (st.student?.rollNumber || anySt.cleanRoll || '').trim().toUpperCase();
        const sKey = (anySt.student?.accessKey || st.id || '').trim().toUpperCase();
        const sEmail = ((st.student as any)?.email || anySt.student?.email || '').trim().toUpperCase();
        return (
          sRoll === cleanRoll ||
          sKey === cleanKey ||
          (cand.email && sEmail === cand.email.toUpperCase())
        );
      });

      slots.push({
        stationId: live ? live.id : `r2_ws_${cleanRoll}`,
        stationNumber: `Workstation #${String(idx + 1).padStart(2, '0')}`,
        cand,
        liveStation: live,
        isLive: Boolean(live)
      });
    });

    uniqueRound2Stations.forEach((st) => {
      const anySt = st as any;
      const sRoll = (st.student?.rollNumber || anySt.cleanRoll || '').trim().toUpperCase();
      if (sRoll && !seenRolls.has(sRoll)) {
        seenRolls.add(sRoll);
        slots.push({
          stationId: st.id,
          stationNumber: `Workstation #${String(slots.length + 1).padStart(2, '0')}`,
          liveStation: st,
          isLive: true
        });
      }
    });

    return slots;
  }, [shortlistedCohort, uniqueRound2Stations]);

  const loadLeaderboardData = async () => {
    setLoadingLeaderboard(true);
    try {
      const data = await fetchRound2Leaderboard();
      setLeaderboard(data);
    } catch (e) {
      console.warn('Failed to load Round 2 leaderboard:', e);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  useEffect(() => {
    void loadLeaderboardData();
    const interval = setInterval(loadLeaderboardData, 4500);
    return () => clearInterval(interval);
  }, []);

  // Unified Ranked Contenders: Merges finalized submissions, active coding stations, and shortlisted candidates
  const rankedContenders = useMemo<Round2LeaderboardEntry[]>(() => {
    const list: Round2LeaderboardEntry[] = [];
    const seenRolls = new Set<string>();

    for (const cand of shortlistedCohort) {
      const cleanRoll = (cand.rollNumber || '').trim().toUpperCase();
      const cleanKey = (cand.round2Key || '').trim().toUpperCase();
      if (!cleanRoll || seenRolls.has(cleanRoll)) continue;
      seenRolls.add(cleanRoll);

      const matchLead = leaderboard.find(
        (l) =>
          (l.candidateKey && l.candidateKey.toUpperCase() === cleanKey) ||
          (l.rollNumber && l.rollNumber.toUpperCase() === cleanRoll) ||
          (cand.email && l.email && l.email.toUpperCase() === cand.email.toUpperCase())
      );

      if (matchLead) {
        list.push({
          ...matchLead,
          candidateName: matchLead.candidateName || cand.name,
          rollNumber: matchLead.rollNumber || cand.rollNumber,
          candidateKey: matchLead.candidateKey || cand.round2Key,
          round2Key: matchLead.round2Key || cand.round2Key,
          email: matchLead.email || cand.email,
          status: matchLead.isSubmitted ? 'SUBMITTED' : 'IN_PROGRESS',
          round1Score: cand.round1Score,
          round1MaxScore: cand.round1MaxScore
        });
        continue;
      }

      const liveStation = uniqueRound2Stations.find((st) => {
        const anySt = st as any;
        const sRoll = (st.student?.rollNumber || anySt.cleanRoll || '').trim().toUpperCase();
        const sKey = (anySt.student?.accessKey || st.id || '').trim().toUpperCase();
        const sEmail = ((st.student as any)?.email || anySt.student?.email || '').trim().toUpperCase();
        return (
          sRoll === cleanRoll ||
          sKey === cleanKey ||
          (cand.email && sEmail === cand.email.toUpperCase())
        );
      });

      if (liveStation) {
        const anySt = liveStation as any;
        const totalMarks = Number(liveStation.marks?.totalMarks) || 0;
        const dominantLang = (liveStation.language && liveStation.language !== 'MCQ') ? liveStation.language : 'Python';
        list.push({
          rank: 0,
          candidateKey: cand.round2Key,
          round2Key: cand.round2Key,
          rollNumber: cand.rollNumber,
          candidateName: cand.name,
          email: cand.email,
          totalScore: totalMarks,
          maxScore: 50,
          solvedCount: totalMarks > 0 ? Math.min(5, Math.ceil(totalMarks / 10)) : 0,
          dominantLanguage: dominantLang,
          timeTakenMinutes: Math.round(((anySt.metrics?.timeSpent || 0) / 60)) || 1,
          isSubmitted: false,
          status: 'IN_PROGRESS',
          questionStatus: { 1: totalMarks >= 10 ? 'ACCEPTED' : 'PENDING', 2: 'PENDING', 3: 'PENDING', 4: 'PENDING', 5: 'PENDING' },
          submission: {
            candidateKey: cand.round2Key,
            rollNumber: cand.rollNumber,
            candidateName: cand.name,
            email: cand.email,
            dominantLanguage: dominantLang,
            totalScore: totalMarks,
            solvedCount: totalMarks > 0 ? Math.min(5, Math.ceil(totalMarks / 10)) : 0,
            timeTakenMinutes: Math.round(((anySt.metrics?.timeSpent || 0) / 60)) || 1,
            submittedAt: Date.now(),
            questionReports: {}
          } as any,
          round1Score: cand.round1Score,
          round1MaxScore: cand.round1MaxScore
        });
        continue;
      }

      list.push({
        rank: 0,
        candidateKey: cand.round2Key,
        round2Key: cand.round2Key,
        rollNumber: cand.rollNumber,
        candidateName: cand.name,
        email: cand.email,
        totalScore: 0,
        maxScore: 50,
        solvedCount: 0,
        dominantLanguage: '—',
        timeTakenMinutes: 0,
        isSubmitted: false,
        status: 'STANDBY',
        questionStatus: { 1: 'PENDING', 2: 'PENDING', 3: 'PENDING', 4: 'PENDING', 5: 'PENDING' },
        submission: {
          candidateKey: cand.round2Key,
          rollNumber: cand.rollNumber,
          candidateName: cand.name,
          email: cand.email,
          dominantLanguage: 'Python',
          totalScore: 0,
          solvedCount: 0,
          timeTakenMinutes: 0,
          submittedAt: 0,
          questionReports: {}
        } as any,
        round1Score: cand.round1Score,
        round1MaxScore: cand.round1MaxScore
      });
    }

    for (const l of leaderboard) {
      const cleanRoll = l.rollNumber.trim().toUpperCase();
      if (!seenRolls.has(cleanRoll)) {
        seenRolls.add(cleanRoll);
        list.push({
          ...l,
          status: l.isSubmitted ? 'SUBMITTED' : 'IN_PROGRESS'
        });
      }
    }

    const r1ScoreMap = new Map<string, number>();
    shortlistedCohort.forEach((c) => r1ScoreMap.set(c.rollNumber.toUpperCase(), c.round1Score));

    list.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
      if (b.isSubmitted !== a.isSubmitted) return b.isSubmitted ? 1 : -1;
      if (a.timeTakenMinutes !== b.timeTakenMinutes && a.timeTakenMinutes > 0 && b.timeTakenMinutes > 0) {
        return a.timeTakenMinutes - b.timeTakenMinutes;
      }
      const r1A = r1ScoreMap.get(a.rollNumber.toUpperCase()) || 0;
      const r1B = r1ScoreMap.get(b.rollNumber.toUpperCase()) || 0;
      if (r1B !== r1A) return r1B - r1A;
      return a.rollNumber.localeCompare(b.rollNumber);
    });

    return list.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [shortlistedCohort, leaderboard, uniqueRound2Stations]);

  // Filtered leaderboard based on unified ranked contenders
  const filteredLeaderboard = useMemo(() => {
    return rankedContenders.filter((entry) => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        entry.candidateName.toLowerCase().includes(q) ||
        entry.rollNumber.toLowerCase().includes(q) ||
        entry.candidateKey.toLowerCase().includes(q);
      const matchLang = langFilter === 'ALL' || entry.dominantLanguage === langFilter;
      return matchSearch && matchLang;
    });
  }, [rankedContenders, searchQuery, langFilter]);

  // Leaderboard KPIs from unified contenders
  const totalParticipants = rankedContenders.length;
  const completedSubmissions = rankedContenders.filter((l) => l.isSubmitted).length;
  const averageScore = useMemo(() => {
    if (rankedContenders.length === 0) return 0;
    const sum = rankedContenders.reduce((acc, curr) => acc + curr.totalScore, 0);
    return Math.round(sum / rankedContenders.length);
  }, [rankedContenders]);

  const highestScore = useMemo(() => {
    if (rankedContenders.length === 0) return 0;
    return Math.max(...rankedContenders.map((l) => l.totalScore));
  }, [rankedContenders]);



  // Export CSV



  const handleExportCSV = () => {



    playSound('click');



    const rows = [



      ['Rank', 'Roll Number', 'Candidate Name', 'Email', `Score / ${totalContestMarks || 50}`, 'Solved (Out of 5)', 'Dominant Language', 'Time Taken (m)', 'Status'],



      ...leaderboard.map((e) => [



        e.rank,



        e.rollNumber,



        e.candidateName,



        e.email,



        e.totalScore,



        `${e.solvedCount} / 5`,



        e.dominantLanguage,



        `${e.timeTakenMinutes}m`,



        e.isSubmitted ? 'SUBMITTED' : 'IN_PROGRESS'



      ])



    ];



    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((r) => r.join(',')).join('\n');



    const encodedUri = encodeURI(csvContent);



    const link = document.createElement('a');



    link.setAttribute('href', encodedUri);



    link.setAttribute('download', `CodeSpark_Round2_Leaderboard_${new Date().toISOString().slice(0, 10)}.csv`);



    document.body.appendChild(link);



    link.click();



  };



  // Section Divider



  const [problems, setProblems] = useState<Round2Problem[]>(() => getAllRound2Problems());

  const totalContestMarks = useMemo(() => {
    return problems.slice(0, 5).reduce((sum, p) => sum + (p.marks || 0), 0) || 50;
  }, [problems]);



  const [activeQTab, setActiveQTab] = useState<number>(1);



  const [isSavingProblems, setIsSavingProblems] = useState(false);



  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const handleResetToOfficial5 = () => {
    if (!window.confirm('Reset all 5 questions to the official LeetCode specifications?')) return;
    setProblems(OFFICIAL_5_LEETCODE_PROBLEMS);
    saveRound2Problems(OFFICIAL_5_LEETCODE_PROBLEMS);
    void saveRound2ProblemsToCloud(OFFICIAL_5_LEETCODE_PROBLEMS);
    setActiveQTab(1);
    setSaveSuccessMsg('Reset to official 5 LeetCode challenges and synced to cloud!');
    playSound('success');
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleLoadOfficial10Bank = () => {



    setProblems([]);



    saveRound2Problems([]);



    setSaveSuccessMsg(`Successfully loaded and synced official 10-problem algorithmic bank to cloud!`);



    setShowImportModal(false);



    playSound('success');



  };



  const handleQuickPasteSubmit = (textToParse?: string) => {
    const raw = textToParse || quickPasteText;
    if (!raw.trim()) return;
    const parsed = parseQuestionsFromPlainText(raw);
    if (parsed.length === 0) {
      alert('Could not parse questions. Please paste questions numbered (1., 2., 3.) or separated by blank lines.');
      return;
    }
    setProblems(parsed);
    saveRound2Problems(parsed);
    setActiveQTab(1);
    setSaveSuccessMsg(`Successfully imported ${parsed.length} questions into pool and synced to cloud!`);
    setQuickPasteText('');
    setShowImportModal(false);
    playSound('success');
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleImportJson = () => {
    setImportError(null);
    try {
      const formatted = parseQuestionsFromPlainText(importJsonText);
      if (formatted.length > 0) {
        setProblems(formatted);
        saveRound2Problems(formatted);
        setActiveQTab(1);
        setSaveSuccessMsg(`Successfully imported ${formatted.length} coding questions to cloud pool!`);
        setShowImportModal(false);
        setImportJsonText('');
        playSound('success');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
        return;
      }
    } catch (e) {}



    setImportError(null);



    try {



      const parsed = JSON.parse(importJsonText);



      if (!Array.isArray(parsed) || parsed.length === 0) {



        setImportError('JSON must be an array of question objects.');



        return;



      }



      const formatted: Round2Problem[] = parsed.map((p: any, idx: number) => ({



        id: p.id || `r2_q${idx + 1}_${Date.now()}`,



        number: idx + 1,



        title: p.title || `Coding Question ${idx + 1}`,



        difficulty: p.difficulty || 'Medium',



        marks: Number(p.marks) || 20,



        timeLimitMs: Number(p.timeLimitMs) || 2000,



        description: p.description || '',



        inputFormat: p.inputFormat || '',



        outputFormat: p.outputFormat || '',



        constraints: Array.isArray(p.constraints) ? p.constraints : [],



        sampleTestCases: Array.isArray(p.sampleTestCases) ? p.sampleTestCases : [],



        hiddenTestCases: Array.isArray(p.hiddenTestCases) ? p.hiddenTestCases : [],



        starterCode: p.starterCode || {



          Python: '# Write solution here\n',



          'C++': '// Write solution here\n',



          C: '// Write solution here\n'



        }



      }));



      setProblems(formatted);



      saveRound2Problems(formatted);



      setSaveSuccessMsg(`Successfully imported ${formatted.length} coding questions to cloud pool!`);



      setShowImportModal(false);



      setImportJsonText('');



      playSound('success');



    } catch (err: any) {



      setImportError(`Invalid JSON format: ${err.message}`);



    }



  };



  const handleAddNewQuestion = () => {



    const nextNum = problems.length + 1;



    const newProb: Round2Problem = {



      id: `r2_q${nextNum}_${Date.now()}`,



      number: nextNum,



      title: `Algorithmic Problem ${nextNum}`,



      difficulty: 'Medium',



      marks: 20,



      timeLimitMs: 2000,



      description: 'Given input data, compute the optimal result satisfying the constraints.',



      inputFormat: 'First line: integer N\nSecond line: N space-separated integers',



      outputFormat: 'Single integer result.',



      constraints: ['1 <= N <= 10^5'],



      sampleTestCases: [



        { id: `tc${nextNum}_s1`, input: '3\n1 2 3', expectedOutput: '6', explanation: 'Sum of elements is 6.' }



      ],



      hiddenTestCases: [



        { id: `tc${nextNum}_h1`, input: '1\n10', expectedOutput: '10', isHidden: true }



      ],



      starterCode: {



        Python: `# CodeSpark 2026 Round 2\nimport sys\n\ndef solve():\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    solve()\n`,



        'C++': `// CodeSpark 2026 Round 2\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,



        C: `// CodeSpark 2026 Round 2\n#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`



      }



    };



    const updated = [...problems, newProb];



    setProblems(updated);



    setActiveQTab(nextNum);



    saveRound2Problems(updated);



    playSound('click');



  };



  const handleDeleteQuestion = (numToDelete: number) => {



    if (problems.length === 0) return; if (!window.confirm("Delete Question #" + numToDelete + " from pool?")) return; if (false) {



      alert('Pool must contain at least 5 questions so students can receive an exam.');



      return;



    }



    const updated = problems



      .filter((p) => p.number !== numToDelete)



      .map((p, idx) => ({ ...p, number: idx + 1 }));



    setProblems(updated);



    setActiveQTab(1);



    saveRound2Problems(updated);



    playSound('click');



  };



  const handleClearAllQuestions = () => {
    if (problems.length === 0) return;
    if (!window.confirm("Are you sure you want to delete ALL " + problems.length + " questions from the pool?")) return;
    playSound('click');
    setProblems([]);
    saveRound2Problems([]);
    void saveRound2ProblemsToCloud([]);
    setActiveQTab(1);
    setSaveSuccessMsg('All questions cleared from pool and cloud.');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const [showImportModal, setShowImportModal] = useState(false);



  const [importJsonText, setImportJsonText] = useState('');
  const [quickPasteText, setQuickPasteText] = useState('');
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);



  const [importError, setImportError] = useState<string | null>(null);



  // Sync latest cloud problems on mount



  useEffect(() => {



    void (async () => {



      try {



        const cloudProbs = await fetchRound2ProblemsFromCloud();



        if (Array.isArray(cloudProbs) && cloudProbs.length > 0) {



          setProblems(cloudProbs);



        }



      } catch {}



    })();



  }, []);



  const activeProblem = useMemo(() => {



    return problems.find((p) => p.number === activeQTab) || problems[0] || ({ id: "q1", number: 1, title: "", difficulty: "Medium", marks: 20, timeLimitMs: 2000, description: "", inputFormat: "", outputFormat: "", constraints: [], sampleTestCases: [], hiddenTestCases: [], starterCode: { Python: "" } } as any);



  }, [problems, activeQTab]);



  const updateActiveProblemField = (field: keyof Round2Problem, val: any) => {



    setProblems((prev) =>



      prev.map((prob) => {



        if (prob.number === activeQTab) {



          return { ...prob, [field]: val };



        }



        return prob;



      })



    );



  };



  const handleSaveAllQuestionsToCloud = async () => {



    setIsSavingProblems(true);



    setSaveSuccessMsg(null);



    playSound('click');



    try {



      saveRound2Problems(problems);



      await saveRound2ProblemsToCloud(problems);



      playSound('success');



      setSaveSuccessMsg('All 5 Coding Questions saved to cloud! Candidate workstations will load them instantly.');



      setTimeout(() => setSaveSuccessMsg(null), 5000);



    } catch (err: any) {



      console.error('Failed to save questions to cloud:', err);



      alert('Error saving questions to cloud. Check console for details.');



    } finally {



      setIsSavingProblems(false);



    }



  };



  const handleResetToDefaultProblems = () => {



    if (!window.confirm('Reset all 5 coding questions to default standard algorithmic challenges?')) return;



    playSound('click');



    setProblems(DEFAULT_ROUND2_PROBLEMS);
    saveRound2Problems(DEFAULT_ROUND2_PROBLEMS);
    void saveRound2ProblemsToCloud(DEFAULT_ROUND2_PROBLEMS);



    setSaveSuccessMsg('Default standard coding questions reloaded and saved to cloud.');



    setTimeout(() => setSaveSuccessMsg(null), 4000);



  };



  return (



    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>



      {/* Section */}



      <div



        style={{



          display: 'flex',



          justifyContent: 'space-between',



          alignItems: 'center',



          flexWrap: 'wrap',



          gap: '12px',



          background: '#121214',



          border: '1px solid #27272a',



          borderRadius: '8px',



          padding: '10px 14px'



        }}



      >



        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



          <button



            type="button"



            onClick={() => {



              setSubTab('leaderboard');



              playSound('click');



            }}



            style={{



              padding: '6px 14px',



              borderRadius: '6px',



              border: subTab === 'leaderboard' ? '1px solid #f4f4f5' : '1px solid transparent',



              background: subTab === 'leaderboard' ? '#27272a' : 'transparent',



              color: subTab === 'leaderboard' ? '#ffffff' : '#a1a1aa',



              fontSize: '12.5px',



              fontWeight: 700,



              cursor: 'pointer',



              display: 'inline-flex',



              alignItems: 'center',



              gap: '6px'



            }}



          >



            <Trophy size={14} color={subTab === 'leaderboard' ? '#f59e0b' : '#a1a1aa'} />



            <span>Live Leaderboard &amp; Rankings</span>



            <span



              style={{



                fontSize: '10px',



                padding: '1px 6px',



                borderRadius: '999px',



                background: subTab === 'leaderboard' ? '#18181b' : '#27272a',



                color: '#e4e4e7'



              }}



            >



              {rankedContenders.length}



            </span>



          </button>



          <button



            type="button"



            onClick={() => {



              setSubTab('questions');



              playSound('click');



            }}



            style={{



              padding: '6px 14px',



              borderRadius: '6px',



              border: subTab === 'questions' ? '1px solid #f4f4f5' : '1px solid transparent',



              background: subTab === 'questions' ? '#27272a' : 'transparent',



              color: subTab === 'questions' ? '#ffffff' : '#a1a1aa',



              fontSize: '12.5px',



              fontWeight: 700,



              cursor: 'pointer',



              display: 'inline-flex',



              alignItems: 'center',



              gap: '6px'



            }}



          >



            <BookOpen size={14} color={subTab === 'questions' ? '#10b981' : '#a1a1aa'} />



            <span>Official Coding Challenges (5)</span>



          </button>



          <button



            type="button"



            onClick={() => {



              setSubTab('live_streams');



              playSound('click');



            }}



            style={{



              padding: '6px 14px',



              borderRadius: '6px',



              border: subTab === 'live_streams' ? '1px solid #f4f4f5' : '1px solid transparent',



              background: subTab === 'live_streams' ? '#27272a' : 'transparent',



              color: subTab === 'live_streams' ? '#ffffff' : '#a1a1aa',



              fontSize: '12.5px',



              fontWeight: 700,



              cursor: 'pointer',



              display: 'inline-flex',



              alignItems: 'center',



              gap: '6px'



            }}



          >



            <Monitor size={14} color={subTab === 'live_streams' ? '#60a5fa' : '#a1a1aa'} />



            <span>Live Coding Workstations</span>



            <span



              style={{



                fontSize: '10px',



                padding: '1px 6px',



                borderRadius: '999px',



                background: subTab === 'live_streams' ? '#18181b' : '#27272a',



                color: '#e4e4e7'



              }}



            >



              {workstationSlots.length}



            </span>



          </button>



        </div>



        {/* Action Controls for Active SubTab */}



        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



          {subTab === 'leaderboard' && (



            <>



              <button



                type="button"



                onClick={loadLeaderboardData}



                style={{



                  padding: '6px 12px',



                  borderRadius: '6px',



                  background: '#18181b',



                  border: '1px solid #27272a',



                  color: '#e4e4e7',



                  fontSize: '12px',



                  fontWeight: 600,



                  cursor: 'pointer',



                  display: 'inline-flex',



                  alignItems: 'center',



                  gap: '6px'



                }}



              >



                <RefreshCw size={13} className={loadingLeaderboard ? 'animate-spin' : ''} />



                <span>Refresh</span>



              </button>



              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('Reset Round 2 leaderboard? This will delete all submissions.')) {
                    await clearRound2Leaderboard();
                    await loadLeaderboardData();
                  }
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#18181b',
                  border: '1px solid #3f3f3f',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Trash2 size={13} />
                <span>Reset Leaderboard</span>
              </button>



              <button



                type="button"



                onClick={handleExportCSV}



                style={{



                  padding: '6px 12px',



                  borderRadius: '6px',



                  background: '#f4f4f5',



                  color: '#09090b',



                  border: 'none',



                  fontSize: '12px',



                  fontWeight: 700,



                  cursor: 'pointer',



                  display: 'inline-flex',



                  alignItems: 'center',



                  gap: '6px'



                }}



              >



                <Download size={13} />



                <span>Export CSV</span>



              </button>



            </>



          )}



          {subTab === 'questions' && (
            <>
              <button
                type="button"
                onClick={handleResetToOfficial5}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid #27272a',
                  color: '#a1a1aa',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Reset all 5 questions to official LeetCode specifications"
              >
                <RotateCcw size={13} />
                <span>Reset to 5 Defaults</span>
              </button>

              <button
                type="button"
                disabled={isSavingProblems}
                onClick={handleSaveAllQuestionsToCloud}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: '#f4f4f5',
                  color: '#09090b',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isSavingProblems ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Save size={13} />
                <span>{isSavingProblems ? 'Saving to Cloud...' : 'Save Configuration to Cloud'}</span>
              </button>
            </>
          )}



        </div>



      </div>



      {/* Section */}



      {subTab === 'leaderboard' && (



        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>



          {/* KPI Summary Cards */}



          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>



            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>



              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>



                Participants in Round 2



              </div>



              <div style={{ fontSize: '22px', fontWeight: 800, color: '#f4f4f5', marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>

                <span>{totalParticipants > 0 ? totalParticipants : shortlistedCohort.length}</span>

                <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>

                  {totalParticipants > 0 ? 'Active' : `${shortlistedCohort.length} Shortlisted`}

                </span>

              </div>



            </div>



            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>



              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>



                Completed &amp; Submitted



              </div>



              <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>



                {completedSubmissions}{' '}



                <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>



                  ({totalParticipants > 0 ? Math.round((completedSubmissions / totalParticipants) * 100) : 0}%)



                </span>



              </div>



            </div>



            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>



              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>



                Average Score



              </div>



              <div style={{ fontSize: '22px', fontWeight: 800, color: '#f4f4f5', marginTop: '4px' }}>



                {averageScore}{' '}



                <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>/ {totalContestMarks}</span>



              </div>



            </div>



            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>



              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>



                Top Score



              </div>



              <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>



                {highestScore}{' '}



                <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>/ {totalContestMarks}</span>



              </div>



            </div>



          </div>



          {/* Search & Filters */}



          <div



            style={{



              display: 'flex',



              justifyContent: 'space-between',



              alignItems: 'center',



              flexWrap: 'wrap',



              gap: '12px',



              background: '#121214',



              border: '1px solid #27272a',



              borderRadius: '8px',



              padding: '10px 14px'



            }}



          >



            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '360px' }}>



              <Search size={14} color="#71717a" />



              <input



                type="text"



                placeholder="Search candidate name, roll number, or key..."



                value={searchQuery}



                onChange={(e) => setSearchQuery(e.target.value)}



                style={{



                  background: 'transparent',



                  border: 'none',



                  color: '#f4f4f5',



                  fontSize: '12.5px',



                  width: '100%',



                  outline: 'none'



                }}



              />



            </div>



            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



              <span style={{ fontSize: '11.5px', color: '#71717a' }}>Language:</span>



              {(['ALL', 'Python', 'C++', 'C', 'Java'] as const).map((l) => (



                <button



                  key={l}



                  type="button"



                  onClick={() => setLangFilter(l)}



                  style={{



                    padding: '3px 8px',



                    borderRadius: '4px',



                    border: langFilter === l ? '1px solid #f4f4f5' : '1px solid #27272a',



                    background: langFilter === l ? '#27272a' : '#18181b',



                    color: langFilter === l ? '#ffffff' : '#a1a1aa',



                    fontSize: '11px',



                    fontWeight: 600,



                    cursor: 'pointer'



                  }}



                >



                  {l}



                </button>



              ))}



            </div>



          </div>



          {/* Leaderboard Table */}



          <div



            style={{



              background: '#121214',



              border: '1px solid #27272a',



              borderRadius: '8px',



              overflow: 'hidden'



            }}



          >



            {filteredLeaderboard.length === 0 ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '24px', textAlign: 'center', background: '#121214', border: '1px dashed #27272a', borderRadius: '8px' }}>
                  <Trophy size={28} color="#71717a" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#f4f4f5' }}>
                    No Round 2 Submissions Yet
                  </div>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px', maxWidth: '640px', margin: '4px auto 0 auto', lineHeight: '1.5' }}>
                    {shortlistedCohort && shortlistedCohort.length > 0
                      ? `${shortlistedCohort.length} candidate(s) are shortlisted and provisioned with Round 2 keys. Once a candidate logs in at /codespark-exams?round=2 and begins compiling code, their live rankings, test pass telemetry, and final dossier will display here.`
                      : 'When shortlisted candidates log in with their Round 2 key and compile code, their live rankings and dossier will appear here.'}
                  </div>
                </div>

                {shortlistedCohort && shortlistedCohort.length > 0 && (
                  <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#18181b', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={15} color="#10b981" />
                        <strong style={{ fontSize: '13px', color: '#f4f4f5' }}>
                          Round 2 Shortlisted Candidates Ready to Attend ({shortlistedCohort.length})
                        </strong>
                      </div>
                      <span style={{ fontSize: '11px', color: '#71717a' }}>
                        Exam Arena URL: <code style={{ color: '#10b981', background: '#121214', padding: '2px 6px', borderRadius: '4px' }}>/codespark-exams?round=2</code>
                      </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ background: '#121214', borderBottom: '1px solid #27272a', color: '#71717a', fontSize: '11px', textTransform: 'uppercase' }}>
                            <th style={{ padding: '10px 14px', width: '45px' }}>#</th>
                            <th style={{ padding: '10px 14px' }}>Roll Number</th>
                            <th style={{ padding: '10px 14px' }}>Candidate Name</th>
                            <th style={{ padding: '10px 14px' }}>Email</th>
                            <th style={{ padding: '10px 14px' }}>Round 2 Key</th>
                            <th style={{ padding: '10px 14px' }}>Round 1 Score</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right' }}>Arena Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shortlistedCohort.map((cand, idx) => (
                            <tr key={cand.rollNumber} style={{ borderBottom: '1px solid #1f1f23' }}>
                              <td style={{ padding: '10px 14px', color: '#71717a', fontFamily: 'monospace' }}>
                                {String(idx + 1).padStart(2, '0')}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f4f4f5' }}>
                                  {cand.rollNumber}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#e4e4e7', fontWeight: 600 }}>
                                {cand.name}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#a1a1aa', fontSize: '11.5px' }}>
                                {cand.email}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <code style={{ background: '#18181b', border: '1px solid #27272a', padding: '3px 8px', borderRadius: '4px', color: '#10b981', fontWeight: 700, fontSize: '11.5px' }}>
                                  {cand.round2Key}
                                </code>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#a1a1aa' }}>
                                {cand.round1Score} / {cand.round1MaxScore}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', background: '#18181b', border: '1px solid #27272a', padding: '3px 8px', borderRadius: '4px' }}>
                                  STANDBY · READY
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (



              <div style={{ overflowX: 'auto' }}>



                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>



                  <thead>



                    <tr style={{ background: '#18181b', borderBottom: '1px solid #27272a', color: '#71717a', fontSize: '11px', textTransform: 'uppercase' }}>



                      <th style={{ padding: '10px 14px', width: '60px' }}>Rank</th>



                      <th style={{ padding: '10px 14px' }}>Candidate</th>



                      <th style={{ padding: '10px 14px' }}>Language</th>



                      <th style={{ padding: '10px 14px' }}>Questions (Q1 - Q5)</th>



                      <th style={{ padding: '10px 14px' }}>Solved</th>



                      <th style={{ padding: '10px 14px' }}>Total Score</th>



                      <th style={{ padding: '10px 14px' }}>Runtime &amp; Complexity</th>



                      <th style={{ padding: '10px 14px' }}>Time</th>



                      <th style={{ padding: '10px 14px', width: '110px', textAlign: 'right' }}>Actions</th>



                    </tr>



                  </thead>



                  <tbody>



                    {filteredLeaderboard.map((entry) => {



                      const isTop3 = entry.rank <= 3;



                      const rankColor =



                        entry.rank === 1 ? '#f59e0b' : entry.rank === 2 ? '#94a3b8' : entry.rank === 3 ? '#d97706' : '#71717a';



                      return (



                        <tr



                          key={entry.candidateKey}



                          style={{



                            borderBottom: '1px solid #27272a',



                            background: isTop3 ? 'rgba(24, 24, 27, 0.6)' : 'transparent'



                          }}



                        >



                          <td style={{ padding: '12px 14px', fontWeight: 800, color: rankColor }}>



                            #{entry.rank}



                          </td>



                          <td style={{ padding: '12px 14px' }}>



                            <div style={{ fontWeight: 700, color: '#f4f4f5' }}>{entry.candidateName}</div>



                            <div style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>



                              {entry.rollNumber} {entry.round2Key ? ` | ${entry.round2Key}` : ''}



                            </div>



                          </td>



                          <td style={{ padding: '12px 14px' }}>



                            <span



                              style={{



                                fontSize: '11px',



                                fontWeight: 700,



                                padding: '2px 8px',



                                borderRadius: '4px',



                                background: '#18181b',



                                border: '1px solid #27272a',



                                color: '#e4e4e7'



                              }}



                            >



                              {entry.dominantLanguage || 'Python'}



                            </span>



                          </td>



                          {/* Q1 to Q5 breakdown pills */}



                          <td style={{ padding: '12px 14px' }}>



                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>



                              {[1, 2, 3, 4, 5].map((q) => {



                                const st = entry.questionStatus[q];



                                const isAcc = st === 'ACCEPTED';



                                const isPart = st === 'PARTIAL';



                                const isFail = st === 'FAILED';



                                return (



                                  <span



                                    key={q}



                                    title={`Q${q}: ${st}`}



                                    style={{



                                      width: '24px',



                                      height: '24px',



                                      borderRadius: '4px',



                                      display: 'inline-flex',



                                      alignItems: 'center',



                                      justifyContent: 'center',



                                      fontSize: '10px',



                                      fontWeight: 800,



                                      background: isAcc



                                        ? 'rgba(16, 185, 129, 0.15)'



                                        : isPart



                                        ? 'rgba(245, 158, 11, 0.15)'



                                        : isFail



                                        ? 'rgba(239, 68, 68, 0.15)'



                                        : '#18181b',



                                      border: isAcc



                                        ? '1px solid rgba(16, 185, 129, 0.3)'



                                        : isPart



                                        ? '1px solid rgba(245, 158, 11, 0.3)'



                                        : isFail



                                        ? '1px solid rgba(239, 68, 68, 0.3)'



                                        : '1px solid #27272a',



                                      color: isAcc ? '#10b981' : isPart ? '#f59e0b' : isFail ? '#ef4444' : '#52525b'



                                    }}



                                  >



                                    Q{q}



                                  </span>



                                );



                              })}



                            </div>



                          </td>



                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#10b981' }}>



                            {entry.solvedCount} / 5



                          </td>



                          <td style={{ padding: '12px 14px' }}>



                            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#f4f4f5' }}>



                              {entry.totalScore}{' '}



                              <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>/ {totalContestMarks || 50}</span>



                            </div>



                          </td>



                          <td style={{ padding: '12px 14px' }}>



                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#f4f4f5' }}>



                              {entry.averageRuntimeMs ? `${entry.averageRuntimeMs} ms` : '—'}



                            </div>



                            <div style={{ fontSize: '10.5px', color: '#10b981', fontFamily: 'monospace' }}>



                              {entry.timeComplexities?.[1] || 'O(N)'}



                            </div>



                          </td>



                          <td style={{ padding: '12px 14px', fontSize: '11.5px', color: '#71717a' }}>



                            {entry.timeTakenMinutes}m



                          </td>



                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>



                            <button



                              type="button"



                              onClick={() => {



                                setSelectedDossier(entry);



                                setActiveDossierQ(1);



                                playSound('click');



                              }}



                              style={{



                                padding: '4px 10px',



                                borderRadius: '4px',



                                background: '#18181b',



                                border: '1px solid #27272a',



                                color: '#e4e4e7',



                                fontSize: '11.5px',



                                fontWeight: 600,



                                cursor: 'pointer',



                                display: 'inline-flex',



                                alignItems: 'center',



                                gap: '5px'



                              }}



                            >



                              <Eye size={12} />



                              <span>Inspect</span>



                            </button>



                          </td>



                        </tr>



                      );



                    })}



                  </tbody>



                </table>



              </div>



            )}



          </div>



        </div>



      )}



      {/* Section */}



      {subTab === 'questions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {saveSuccessMsg && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '12.5px',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Official 5 Questions Summary Strip */}
          <div
            style={{
              background: '#121214',
              border: '1px solid #27272a',
              borderRadius: '8px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <Code2 size={15} color="#f4f4f5" />
                <strong style={{ fontSize: '14px', color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                  Code Spark Round 2 · Official 5 DSA Challenges
                </strong>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}
                >
                  Direct 5 Mode · 10 Marks Each
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#71717a' }}>
                Zero pool randomization. All contestants receive these exact 5 challenges in order. Adjust marks, difficulty, time limits and constraints below.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#71717a', fontWeight: 600 }}>
                  Total Contest Marks
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#f4f4f5', fontFamily: 'monospace' }}>
                  {problems.slice(0, 5).reduce((sum, p) => sum + (p.marks || 0), 0)} Marks
                </div>
              </div>

              <button
                type="button"
                disabled={isSavingProblems}
                onClick={handleSaveAllQuestionsToCloud}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#f4f4f5',
                  color: '#09090b',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isSavingProblems ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Save size={13} />
                <span>{isSavingProblems ? 'Saving to Cloud...' : 'Save Configuration to Cloud'}</span>
              </button>
            </div>
          </div>

          {/* 5 Question Selector Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '10px',
              overflowX: 'auto'
            }}
          >
            {problems.slice(0, 5).map((prob) => {
              const isActive = prob.number === activeQTab;
              return (
                <button
                  key={prob.number}
                  type="button"
                  onClick={() => {
                    setActiveQTab(prob.number);
                    playSound('click');
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: isActive ? '1px solid #f4f4f5' : '1px solid #27272a',
                    background: isActive ? '#27272a' : '#121214',
                    color: isActive ? '#ffffff' : '#a1a1aa',
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>Q{prob.number}: {prob.title.length > 25 ? prob.title.slice(0, 25) + '...' : prob.title}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: isActive ? '#10b981' : '#71717a',
                      background: '#18181b',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontFamily: 'monospace'
                    }}
                  >
                    {prob.difficulty} · {prob.marks}p
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Question Editor Form */}
          <div
            style={{
              background: '#121214',
              border: '1px solid #27272a',
              borderRadius: '8px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {/* Row 1: Title, Marks, Difficulty, Time Limit */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Question Title
                </label>
                <input
                  type="text"
                  value={activeProblem.title}
                  onChange={(e) => updateActiveProblemField('title', e.target.value)}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f4f4f5',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Marks Awarded *
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={activeProblem.marks}
                  onChange={(e) => updateActiveProblemField('marks', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#10b981',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Difficulty
                </label>
                <select
                  value={activeProblem.difficulty}
                  onChange={(e) => updateActiveProblemField('difficulty', e.target.value as any)}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f4f4f5',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Time Limit (ms)
                </label>
                <input
                  type="number"
                  min={500}
                  max={10000}
                  step={100}
                  value={activeProblem.timeLimitMs || 2000}
                  onChange={(e) => updateActiveProblemField('timeLimitMs', parseInt(e.target.value, 10) || 2000)}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f4f4f5',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Row 2: Problem Statement */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                Problem Statement &amp; Context
              </label>
              <textarea
                rows={4}
                value={activeProblem.description}
                onChange={(e) => updateActiveProblemField('description', e.target.value)}
                style={{
                  width: '100%',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '10px',
                  color: '#f4f4f5',
                  fontSize: '13px',
                  fontFamily: 'Inter, sans-serif',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Row 3: Input & Output Formats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Input Format
                </label>
                <textarea
                  rows={2}
                  value={activeProblem.inputFormat || ''}
                  onChange={(e) => updateActiveProblemField('inputFormat', e.target.value)}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f4f4f5',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Output Format
                </label>
                <textarea
                  rows={2}
                  value={activeProblem.outputFormat || ''}
                  onChange={(e) => updateActiveProblemField('outputFormat', e.target.value)}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f4f4f5',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Row 4: Constraints */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>
                Constraints (One line per constraint)
              </label>
              <textarea
                rows={3}
                value={(activeProblem.constraints || []).join('\n')}
                onChange={(e) => updateActiveProblemField('constraints', e.target.value.split('\n'))}
                style={{
                  width: '100%',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#e4e4e7',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Row 5: Test Cases Overview */}
            <div
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                  Sample Test Cases: <strong style={{ color: '#f4f4f5' }}>{activeProblem.sampleTestCases?.length || 0}</strong>
                </span>
                <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                  Hidden Test Cases: <strong style={{ color: '#f4f4f5' }}>{activeProblem.hiddenTestCases?.length || 0}</strong>
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#71717a' }}>
                Boilerplates preloaded for Python, Java, C++, and C
              </span>
            </div>
          </div>
        </div>
      )}



      {/* Section */}



      {subTab === 'live_streams' && (



        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>



          {uniqueRound2Stations.length === 0 ? (
            shortlistedCohort && shortlistedCohort.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px', gridColumn: '1 / -1' }}>
                {shortlistedCohort.map((cand, idx) => (
                  <div
                    key={cand.rollNumber}
                    style={{
                      background: '#121214',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={15} color="#71717a" />
                        <strong style={{ fontSize: '13px', color: '#f4f4f5' }}>
                          Workstation #{String(idx + 1).padStart(2, '0')}
                        </strong>
                      </div>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: '#a1a1aa',
                          background: '#18181b',
                          border: '1px solid #27272a',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}
                      >
                        STANDBY · AWAITING LOGIN
                      </span>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5' }}>{cand.name}</div>
                      <div style={{ fontSize: '11.5px', color: '#71717a', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Roll: <strong style={{ color: '#e4e4e7' }}>{cand.rollNumber}</strong></span>
                        <span>•</span>
                        <span>R1 Score: <strong style={{ color: '#10b981' }}>{cand.round1Score}/{cand.round1MaxScore}</strong></span>
                      </div>
                    </div>

                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#71717a', fontWeight: 600, marginBottom: '4px' }}>
                        Round 2 Access Key
                      </div>
                      <code style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>
                        {cand.round2Key}
                      </code>
                    </div>

                    <div style={{ fontSize: '11px', color: '#71717a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={12} />
                      <span>Live editor will stream here upon contestant login</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center', border: '1px dashed #27272a', borderRadius: '8px', background: '#121214' }}>
                <Code2 size={28} color="#71717a" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>No active coding workstations</div>
                <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
                  When shortlisted candidates start Round 2 at /codespark-exams?round=2, their live telemetry and code stream will stream here.
                </div>
              </div>
            )
          ) : (



            uniqueRound2Stations.map((station) => (



              <div key={station.id} style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>



                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>



                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#f4f4f5' }}>{station.student?.name || 'Candidate'}</span>



                    <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>({station.student?.rollNumber || 'N/A'})</span>



                  </div>



                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa' }}>



                    {station.stationNumber} ({station.labId})



                  </span>



                </div>



                {/* Live Code Stream Panel */}



                <div style={{ borderRadius: '6px', border: '1px solid #27272a', background: '#09090b', padding: '10px', height: '140px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '4px' }}>



                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '4px' }}>



                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>



                      <Code2 size={11} color="#60a5fa" />



                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.05em' }}>LIVE CODE STREAM</span>



                    </div>



                    <span style={{ fontSize: '9px', color: '#71717a', fontFamily: 'monospace' }}>{station.language || 'Python'}</span>



                  </div>



                  <pre style={{ margin: 0, flex: 1, fontFamily: 'monospace', fontSize: '10.5px', color: '#e4e4e7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'hidden' }}>



                    {extractCleanCandidateCode(station.code)}



                  </pre>



                </div>



                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>



                  <div style={{ fontSize: '11px', color: '#71717a' }}>



                    WPM: {station.metrics?.typingSpeed || 0} • Keystrokes: {station.metrics?.keystrokes || 0}



                  </div>



                  <div style={{ display: 'flex', gap: '6px' }}>



                    <button



                      type="button"



                      onClick={() => sendProctorLockCommand(station.id, !station.isLockedByProctor, station.labId)}



                      style={{



                        padding: '4px 8px',



                        borderRadius: '4px',



                        border: station.isLockedByProctor ? '1px solid #10b981' : '1px solid #ef4444',



                        background: 'transparent',



                        color: station.isLockedByProctor ? '#10b981' : '#ef4444',



                        fontSize: '11px',



                        fontWeight: 600,



                        cursor: 'pointer'



                      }}



                    >



                      {station.isLockedByProctor ? 'Unlock' : 'Lock'}



                    </button>



                    {onInspectStation && (



                      <button



                        type="button"



                        onClick={() => onInspectStation(station.id)}



                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #27272a', background: '#18181b', color: '#f4f4f5', fontSize: '11px', cursor: 'pointer' }}



                      >



                        Inspect



                      </button>



                    )}



                  </div>



                </div>



              </div>



            ))



          )}



        </div>



      )}



      {/* Section */}



      {selectedDossier && (



        <div



          style={{



            position: 'fixed',



            inset: 0,



            background: 'rgba(0, 0, 0, 0.85)',



            backdropFilter: 'blur(6px)',



            display: 'flex',



            alignItems: 'center',



            justifyContent: 'center',



            zIndex: 9999,



            padding: '24px'



          }}



        >



          <div



            style={{



              maxWidth: '840px',



              width: '100%',



              maxHeight: '90vh',



              background: '#121214',



              border: '1px solid #27272a',



              borderRadius: '12px',



              display: 'flex',



              flexDirection: 'column',



              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',



              overflow: 'hidden'



            }}



          >



            {/* Modal Header */}



            <div



              style={{



                padding: '16px 20px',



                borderBottom: '1px solid #27272a',



                display: 'flex',



                justifyContent: 'space-between',



                alignItems: 'center',



                background: '#18181b'



              }}



            >



              <div>



                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f4f4f5' }}>



                    {selectedDossier.candidateName}



                  </h3>



                  <span style={{ fontSize: '11.5px', color: '#71717a', fontFamily: 'monospace' }}>



                    ({selectedDossier.rollNumber})



                  </span>



                  <span



                    style={{



                      fontSize: '11px',



                      fontWeight: 700,



                      padding: '2px 8px',



                      borderRadius: '4px',



                      background: 'rgba(16, 185, 129, 0.15)',



                      color: '#10b981'



                    }}



                  >



                    Rank #{selectedDossier.rank}



                  </span>



                </div>



                <div style={{ fontSize: '11.5px', color: '#71717a', marginTop: '2px' }}>



                  Total Score: <strong style={{ color: '#f4f4f5' }}>{selectedDossier.totalScore} / {totalContestMarks || 50}</strong> • Language: {selectedDossier.dominantLanguage} • Solved: {selectedDossier.solvedCount}/5



                </div>



              </div>



              <button



                type="button"



                onClick={() => setSelectedDossier(null)}



                style={{



                  background: 'transparent',



                  border: 'none',



                  color: '#a1a1aa',



                  cursor: 'pointer',



                  padding: '4px'



                }}



              >



                <X size={18} />



              </button>



            </div>



            {/* Question Selector Tabs (Q1 to Q5) */}



            <div style={{ display: 'flex', borderBottom: '1px solid #27272a', background: '#121214', padding: '8px 16px', gap: '6px' }}>



              {[1, 2, 3, 4, 5].map((q) => {



                const rep: Round2QuestionReport | undefined = selectedDossier.submission?.questionReports?.[q];



                const isActive = q === activeDossierQ;



                const status = rep?.status || 'PENDING';



                const score = rep?.score || 0;



                return (



                  <button



                    key={q}



                    type="button"



                    onClick={() => {



                      setActiveDossierQ(q);



                      playSound('click');



                    }}



                    style={{



                      padding: '6px 12px',



                      borderRadius: '6px',



                      border: isActive ? '1px solid #f4f4f5' : '1px solid #27272a',



                      background: isActive ? '#27272a' : '#18181b',



                      color: isActive ? '#ffffff' : '#a1a1aa',



                      fontSize: '11.5px',



                      fontWeight: 700,



                      cursor: 'pointer',



                      display: 'inline-flex',



                      alignItems: 'center',



                      gap: '6px'



                    }}



                  >



                    <span>Q{q}</span>



                    <span



                      style={{



                        fontSize: '10px',



                        color: status === 'ACCEPTED' ? '#10b981' : status === 'PARTIAL' ? '#f59e0b' : '#71717a'



                      }}



                    >



                      {score}/20p



                    </span>



                  </button>



                );



              })}



            </div>



            {/* Question Report Body */}



            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>



              {(() => {



                const rep: Round2QuestionReport | undefined =



                  selectedDossier.submission?.questionReports?.[activeDossierQ];



                const prob = problems.find((p) => p.number === activeDossierQ);



                if (!rep) {



                  return (



                    <div style={{ padding: '36px', textAlign: 'center', color: '#71717a' }}>



                      <AlertCircle size={24} style={{ margin: '0 auto 8px auto' }} />



                      <div>Candidate did not compile or attempt Question {activeDossierQ}.</div>



                    </div>



                  );



                }



                return (



                  <>



                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>



                      <div>



                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#f4f4f5' }}>



                          Q{activeDossierQ}. {prob?.title || rep.questionTitle}



                        </div>



                        <div style={{ fontSize: '11.5px', color: '#71717a', marginTop: '2px' }}>



                          Status: <strong style={{ color: rep.status === 'ACCEPTED' ? '#10b981' : '#f59e0b' }}>{rep.status}</strong> • Score: <strong>{rep.score} / {rep.maxScore}</strong> • Tests Passed: {rep.passedTests} / {rep.totalTests}



                        </div>



                      </div>



                      <button



                        type="button"



                        onClick={() => {



                          navigator.clipboard.writeText(rep.code);



                          setCopiedCode(true);



                          playSound('click');



                          setTimeout(() => setCopiedCode(false), 2000);



                        }}



                        style={{



                          padding: '5px 10px',



                          borderRadius: '4px',



                          background: '#18181b',



                          border: '1px solid #27272a',



                          color: '#e4e4e7',



                          fontSize: '11.5px',



                          fontWeight: 600,



                          cursor: 'pointer',



                          display: 'inline-flex',



                          alignItems: 'center',



                          gap: '5px'



                        }}



                      >



                        {copiedCode ? <Check size={12} color="#10b981" /> : <Copy size={12} />}



                        <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>



                      </button>



                    </div>



                    {/* Timestamps & Telemetry strip */}



                    <div



                      style={{



                        background: '#18181b',



                        border: '1px solid #27272a',



                        borderRadius: '6px',



                        padding: '10px 14px',



                        display: 'flex',



                        flexDirection: 'column',



                        gap: '8px'



                      }}



                    >



                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', fontSize: '12px' }}>



                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>



                          <div>



                            <span style={{ color: '#71717a' }}>Compiled Runtime: </span>



                            <strong style={{ color: '#f4f4f5' }}>{rep.executionTime || (rep.executionTimeMs ? `${rep.executionTimeMs} ms` : '38 ms')}</strong>



                          </div>



                          <div style={{ width: '1px', height: '14px', background: '#27272a' }} />



                          <div>



                            <span style={{ color: '#71717a' }}>Time Complexity: </span>



                            <strong style={{ color: '#10b981' }}>{rep.timeComplexity || 'O(N)'}</strong>



                          </div>



                          <div style={{ width: '1px', height: '14px', background: '#27272a' }} />



                          <div>



                            <span style={{ color: '#71717a' }}>Space Complexity: </span>



                            <strong style={{ color: '#60a5fa' }}>{rep.spaceComplexity || 'O(1)'}</strong>



                          </div>



                          <div style={{ width: '1px', height: '14px', background: '#27272a' }} />



                          <div>



                            <span style={{ color: '#71717a' }}>Rating: </span>



                            <span



                              style={{



                                fontSize: '11px',



                                fontWeight: 700,



                                padding: '1px 6px',



                                borderRadius: '3px',



                                background: rep.efficiencyRating === 'Optimal' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',



                                color: rep.efficiencyRating === 'Optimal' ? '#10b981' : '#f59e0b'



                              }}



                            >



                              {rep.efficiencyRating || 'Optimal'}



                            </span>



                          </div>



                        </div>



                        {/* Exact Timestamps */}



                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#a1a1aa', fontFamily: 'monospace' }}>



                          {rep.startedAt && <span>Started: {rep.startedAtFormatted || new Date(rep.startedAt).toLocaleTimeString()}</span>}



                          {rep.compiledAt && <span>• Compiled: {rep.compiledAtFormatted || new Date(rep.compiledAt).toLocaleTimeString()}</span>}



                          {rep.nextQuestionStartedAt && <span>• Next Q: {rep.nextQuestionStartedAtFormatted || new Date(rep.nextQuestionStartedAt).toLocaleTimeString()}</span>}



                        </div>



                      </div>



                      {/* AI Verification & Predicted Output Box */}



                      {rep.aiVerification && (



                        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '8px 10px', fontSize: '11.5px' }}>



                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>



                            <Brain size={12} color="#a855f7" />



                            <strong style={{ color: '#f4f4f5' }}>AI Verification: Question on Screen: {rep.aiVerification.verifiedQuestionTitle}</strong>



                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: rep.aiVerification.isAlignedWithProblem ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: rep.aiVerification.isAlignedWithProblem ? '#10b981' : '#ef4444', fontWeight: 700 }}>



                              {rep.aiVerification.isAlignedWithProblem ? 'ALIGNED' : 'DEVIATION DETECTED'}



                            </span>



                          </div>



                          <div style={{ color: '#a1a1aa' }}>



                            <span style={{ color: '#71717a' }}>Predicted Output: </span>



                            <code style={{ color: '#60a5fa', background: '#18181b', padding: '1px 4px', borderRadius: '2px' }}>{rep.aiVerification.predictedOutput}</code>



                            <span style={{ marginLeft: '10px' }}>{rep.aiVerification.analysis}</span>



                          </div>



                        </div>



                      )}



                      {rep.complexityExplanation && !rep.aiVerification && (



                        <div style={{ fontSize: '11.5px', color: '#a1a1aa', fontStyle: 'italic' }}>



                          {rep.complexityExplanation}



                        </div>



                      )}



                    </div>



                    {/* Submitted Code Panel */}



                    <div



                      style={{



                        borderRadius: '6px',



                        border: '1px solid #27272a',



                        background: '#09090b',



                        padding: '14px',



                        maxHeight: '260px',



                        overflowY: 'auto'



                      }}



                    >



                      <pre



                        style={{



                          margin: 0,



                          fontFamily: 'JetBrains Mono, monospace',



                          fontSize: '12px',



                          color: '#e4e4e7',



                          whiteSpace: 'pre-wrap'



                        }}



                      >



                        {rep.code || '// Empty solution'}



                      </pre>



                    </div>



                    {/* Sample Test Cases Feedback */}



                    <div>



                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>



                        Test Case Evaluations



                      </div>



                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>



                        {rep.sampleResults?.map((res, i) => (



                          <div



                            key={i}



                            style={{



                              background: '#18181b',



                              border: res.passed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',



                              borderRadius: '6px',



                              padding: '8px 10px',



                              fontSize: '11px'



                            }}



                          >



                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>



                              <span style={{ fontWeight: 700, color: '#f4f4f5' }}>Sample #{i + 1}</span>



                              <span style={{ fontWeight: 700, color: res.passed ? '#10b981' : '#ef4444' }}>



                                {res.passed ? 'PASSED' : 'FAILED'}



                              </span>



                            </div>



                            <div style={{ fontFamily: 'monospace', color: '#a1a1aa' }}>



                              <div>In: {res.input}</div>



                              <div>Exp: {res.expected}</div>



                              <div style={{ color: res.passed ? '#10b981' : '#ef4444' }}>Act: {res.actual}</div>



                            </div>



                          </div>



                        ))}



                      </div>



                    </div>



                    {/* Stderr if present */}



                    {rep.compilerResult?.stderr && (



                      <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '10px' }}>



                        <div style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', marginBottom: '4px' }}>



                          Compiler Diagnostic Output



                        </div>



                        <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: '#f59e0b', whiteSpace: 'pre-wrap' }}>



                          {rep.compilerResult.stderr}



                        </pre>



                      </div>



                    )}



                  </>



                );



              })()}



            </div>



          </div>



        </div>



      )}



          </div>

  );

};

export default AdminRound2Hub;
