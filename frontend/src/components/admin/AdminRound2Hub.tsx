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
  Sparkles,
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
  extractCleanCandidateCode,
  parseQuestionsFromPlainText
} from '../../services/round2CodingService';



import { playSound } from '../../utils/sounds';



interface AdminRound2HubProps {



  round2Stations: CandidateStation[];



  onInspectStation?: (stationId: string) => void;



  sendProctorLockCommand: (stationId: string, lock: boolean, labId?: string) => void;



  isDark?: boolean;



}



export const AdminRound2Hub: React.FC<AdminRound2HubProps> = ({



  round2Stations,



  onInspectStation,



  sendProctorLockCommand,



  isDark = true



}) => {



  // ── 1. Sub-Tabs: Leaderboard | Question Definitions | Live Streams ──



  const [subTab, setSubTab] = useState<'leaderboard' | 'questions' | 'live_streams'>('leaderboard');



  // ── 2. Leaderboard State ──



  const [leaderboard, setLeaderboard] = useState<Round2LeaderboardEntry[]>([]);



  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);



  const [searchQuery, setSearchQuery] = useState('');



  const [langFilter, setLangFilter] = useState<'ALL' | 'Python' | 'C++' | 'C'>('ALL');



  const [selectedDossier, setSelectedDossier] = useState<Round2LeaderboardEntry | null>(null);



  const [activeDossierQ, setActiveDossierQ] = useState<number>(1);



  const [copiedCode, setCopiedCode] = useState(false);



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



  // Filtered leaderboard



  const filteredLeaderboard = useMemo(() => {



    return leaderboard.filter((entry) => {



      const q = searchQuery.trim().toLowerCase();



      const matchSearch =



        !q ||



        entry.candidateName.toLowerCase().includes(q) ||



        entry.rollNumber.toLowerCase().includes(q) ||



        entry.candidateKey.toLowerCase().includes(q);



      const matchLang = langFilter === 'ALL' || entry.dominantLanguage === langFilter;



      return matchSearch && matchLang;



    });



  }, [leaderboard, searchQuery, langFilter]);



  // Leaderboard KPIs



  const totalParticipants = leaderboard.length;



  const completedSubmissions = leaderboard.filter((l) => l.isSubmitted).length;



  const averageScore = useMemo(() => {



    if (leaderboard.length === 0) return 0;



    const sum = leaderboard.reduce((acc, curr) => acc + curr.totalScore, 0);



    return Math.round(sum / leaderboard.length);



  }, [leaderboard]);



  const highestScore = useMemo(() => {



    if (leaderboard.length === 0) return 0;



    return Math.max(...leaderboard.map((l) => l.totalScore));



  }, [leaderboard]);



  // Export CSV



  const handleExportCSV = () => {



    playSound('click');



    const rows = [



      ['Rank', 'Roll Number', 'Candidate Name', 'Email', 'Score / 100', 'Solved (Out of 5)', 'Dominant Language', 'Time Taken (m)', 'Status'],



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



  // ── 3. Question Editor State (5 Questions) ──



  const [problems, setProblems] = useState<Round2Problem[]>(() => getAllRound2Problems());



  const [activeQTab, setActiveQTab] = useState<number>(1);



  const [isSavingProblems, setIsSavingProblems] = useState(false);



  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);



  const handleLoadOfficial10Bank = () => {



    setProblems(DEFAULT_ROUND2_PROBLEMS);



    saveRound2Problems(DEFAULT_ROUND2_PROBLEMS);



    setSaveSuccessMsg(`Successfully loaded and synced official 10-problem algorithmic bank to cloud!`);



    setShowImportModal(false);



    playSound('success');



  };



  const handleImportJson = () => {



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



    if (problems.length <= 5) {



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



    return problems.find((p) => p.number === activeQTab) || problems[0] || DEFAULT_ROUND2_PROBLEMS[0];



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



      {/* ── Sub-Nav Tabs: Leaderboard | Questions | Live Streams ── */}



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



              {leaderboard.length}



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



            <span>Define Coding Questions ({problems.length} in Pool)</span>



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



              {round2Stations.length}



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



                onClick={() => {



                  setShowImportModal(true);



                  playSound('click');



                }}



                style={{



                  padding: '6px 14px',



                  borderRadius: '6px',



                  background: '#2563eb',



                  border: 'none',



                  color: '#ffffff',



                  fontSize: '12px',



                  fontWeight: 700,



                  cursor: 'pointer',



                  display: 'inline-flex',



                  alignItems: 'center',



                  gap: '6px'



                }}



              >



                <Upload size={13} />



                <span>Import Questions (10+ Pool)</span>



              </button>



              <button



                type="button"



                onClick={handleAddNewQuestion}



                style={{



                  padding: '6px 12px',



                  borderRadius: '6px',



                  background: 'transparent',



                  border: '1px solid #27272a',



                  color: '#f4f4f5',



                  fontSize: '12px',



                  fontWeight: 600,



                  cursor: 'pointer',



                  display: 'inline-flex',



                  alignItems: 'center',



                  gap: '6px'



                }}



              >



                <Plus size={13} />



                <span>+ Add Question</span>



              </button>



              <button



                type="button"



                onClick={handleResetToDefaultProblems}



                style={{



                  padding: '6px 12px',



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



              >



                <RotateCcw size={13} />



                <span>Reload 10 Defaults</span>



              </button>



              <button



                type="button"



                disabled={isSavingProblems}



                onClick={handleSaveAllQuestionsToCloud}



                style={{



                  padding: '6px 14px',



                  borderRadius: '6px',



                  background: '#10b981',



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



                <span>{isSavingProblems ? 'Saving to Cloud...' : 'Save All Questions to Cloud'}</span>



              </button>



            </>



          )}



        </div>



      </div>



      {/* ── SUB-TAB 1: LIVE LEADERBOARD & RANKINGS ── */}



      {subTab === 'leaderboard' && (



        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>



          {/* KPI Summary Cards */}



          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>



            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>



              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>



                Participants in Round 2



              </div>



              <div style={{ fontSize: '22px', fontWeight: 800, color: '#f4f4f5', marginTop: '4px' }}>



                {totalParticipants}



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



                <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>/ 100</span>



              </div>



            </div>



            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>



              <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>



                Top Score



              </div>



              <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>



                {highestScore}{' '}



                <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>/ 100</span>



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



              {(['ALL', 'Python', 'C++', 'C'] as const).map((l) => (



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



              <div style={{ padding: '48px 24px', textAlign: 'center', color: '#a1a1aa' }}>



                <Trophy size={28} color="#71717a" style={{ margin: '0 auto 8px auto' }} />



                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5' }}>



                  No Round 2 Submissions Yet



                </div>



                <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>



                  When shortlisted candidates log in with their Round 2 key and compile code, their live rankings and dossier will appear here.



                </div>



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



                              {entry.rollNumber} {entry.round2Key ? `• ${entry.round2Key}` : ''}



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



                              <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>/ 100</span>



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



      {/* ── SUB-TAB 2: DEFINE CODING QUESTIONS (5 QUESTIONS) ── */}



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



          {/* Pool Allocation Notice */}



          <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>



            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



              <Sparkles size={14} color="#3b82f6" />



              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f4f4f5' }}>



                Question Pool: {problems.length} Questions Configured



              </span>



              <span style={{ fontSize: '11px', color: '#a1a1aa' }}>



                (Each student receives 5 randomized questions upon entering Round 2)



              </span>



            </div>



            <div style={{ display: 'flex', gap: '8px' }}>



              <button



                type="button"



                onClick={() => handleDeleteQuestion(activeQTab)}



                disabled={problems.length <= 5}



                style={{



                  padding: '4px 10px',



                  borderRadius: '4px',



                  background: 'rgba(239, 68, 68, 0.1)',



                  border: '1px solid rgba(239, 68, 68, 0.3)',



                  color: '#ef4444',



                  fontSize: '11.5px',



                  fontWeight: 600,



                  cursor: problems.length <= 5 ? 'not-allowed' : 'pointer',



                  display: 'inline-flex',



                  alignItems: 'center',



                  gap: '4px'



                }}



              >



                <Trash2 size={12} />



                <span>Delete Active Q{activeQTab}</span>



              </button>



            </div>



          </div>



          {/* Question Selector Tabs */}



          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #27272a', paddingBottom: '10px', overflowX: 'auto' }}>



            {problems.map((prob) => {



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



                    padding: '8px 16px',



                    borderRadius: '6px',



                    border: isActive ? '1px solid #f4f4f5' : '1px solid #27272a',



                    background: isActive ? '#27272a' : '#121214',



                    color: isActive ? '#ffffff' : '#a1a1aa',



                    fontSize: '12.5px',



                    fontWeight: isActive ? 700 : 600,



                    cursor: 'pointer',



                    display: 'inline-flex',



                    alignItems: 'center',



                    gap: '6px'



                  }}



                >



                  <span>Question {prob.number}</span>



                  <span



                    style={{



                      fontSize: '10.5px',



                      color: isActive ? '#10b981' : '#71717a',



                      background: '#18181b',



                      padding: '2px 6px',



                      borderRadius: '4px'



                    }}



                  >



                    {prob.difficulty} • {prob.marks}p



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



            {/* Row 1: Title, Difficulty, Marks, Time Limit */}



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



                    outline: 'none'



                  }}



                />



              </div>



              <div>



                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                  Difficulty



                </label>



                <select



                  value={activeProblem.difficulty}



                  onChange={(e) => updateActiveProblemField('difficulty', e.target.value)}



                  style={{



                    width: '100%',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    borderRadius: '6px',



                    padding: '8px 10px',



                    color: '#f4f4f5',



                    fontSize: '13px',



                    outline: 'none'



                  }}



                >



                  <option value="Easy">Easy</option>



                  <option value="Medium">Medium</option>



                  <option value="Hard">Hard</option>



                </select>



              </div>



              <div>



                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                  Marks



                </label>



                <input



                  type="number"



                  value={activeProblem.marks}



                  onChange={(e) => updateActiveProblemField('marks', Number(e.target.value))}



                  style={{



                    width: '100%',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    borderRadius: '6px',



                    padding: '8px 10px',



                    color: '#f4f4f5',



                    fontSize: '13px',



                    outline: 'none'



                  }}



                />



              </div>



              <div>



                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                  Time Limit (ms)



                </label>



                <input



                  type="number"



                  value={activeProblem.timeLimitMs}



                  onChange={(e) => updateActiveProblemField('timeLimitMs', Number(e.target.value))}



                  style={{



                    width: '100%',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    borderRadius: '6px',



                    padding: '8px 10px',



                    color: '#f4f4f5',



                    fontSize: '13px',



                    outline: 'none'



                  }}



                />



              </div>



            </div>



            {/* Problem Description */}



            <div>



              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                Problem Statement &amp; Explanation



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



                  resize: 'vertical'



                }}



              />



            </div>



            {/* Input & Output Format */}



            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>



              <div>



                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                  Input Format



                </label>



                <textarea



                  rows={2}



                  value={activeProblem.inputFormat}



                  onChange={(e) => updateActiveProblemField('inputFormat', e.target.value)}



                  style={{



                    width: '100%',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    borderRadius: '6px',



                    padding: '8px',



                    color: '#f4f4f5',



                    fontSize: '12.5px',



                    fontFamily: 'monospace',



                    outline: 'none'



                  }}



                />



              </div>



              <div>



                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                  Output Format



                </label>



                <textarea



                  rows={2}



                  value={activeProblem.outputFormat}



                  onChange={(e) => updateActiveProblemField('outputFormat', e.target.value)}



                  style={{



                    width: '100%',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    borderRadius: '6px',



                    padding: '8px',



                    color: '#f4f4f5',



                    fontSize: '12.5px',



                    fontFamily: 'monospace',



                    outline: 'none'



                  }}



                />



              </div>



            </div>



            {/* Constraints */}



            <div>



              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '4px' }}>



                Constraints (one per line)



              </label>



              <textarea



                rows={2}



                value={(activeProblem.constraints || []).join('\n')}



                onChange={(e) =>



                  updateActiveProblemField(



                    'constraints',



                    e.target.value.split('\n').filter((c) => c.trim().length > 0)



                  )



                }



                style={{



                  width: '100%',



                  background: '#18181b',



                  border: '1px solid #27272a',



                  borderRadius: '6px',



                  padding: '8px',



                  color: '#f4f4f5',



                  fontSize: '12.5px',



                  fontFamily: 'monospace',



                  outline: 'none'



                }}



              />



            </div>



            {/* Sample Test Cases */}



            <div>



              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>



                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' }}>



                  Sample Test Cases (Visible to Students)



                </span>



                <button



                  type="button"



                  onClick={() => {



                    const newTc: Round2TestCase = {



                      id: `sample_${Date.now()}`,



                      input: '',



                      expectedOutput: '',



                      explanation: ''



                    };



                    updateActiveProblemField('sampleTestCases', [...(activeProblem.sampleTestCases || []), newTc]);



                  }}



                  style={{



                    padding: '3px 8px',



                    borderRadius: '4px',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    color: '#e4e4e7',



                    fontSize: '11px',



                    cursor: 'pointer',



                    display: 'inline-flex',



                    alignItems: 'center',



                    gap: '4px'



                  }}



                >



                  <Plus size={12} />



                  <span>Add Sample</span>



                </button>



              </div>



              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>



                {activeProblem.sampleTestCases?.map((tc, idx) => (



                  <div



                    key={tc.id || idx}



                    style={{



                      background: '#18181b',



                      border: '1px solid #27272a',



                      borderRadius: '6px',



                      padding: '10px',



                      display: 'grid',



                      gridTemplateColumns: '1fr 1fr 1fr auto',



                      gap: '8px',



                      alignItems: 'center'



                    }}



                  >



                    <div>



                      <div style={{ fontSize: '10px', color: '#71717a' }}>Input:</div>



                      <input



                        type="text"



                        value={tc.input}



                        onChange={(e) => {



                          const updated = [...activeProblem.sampleTestCases];



                          updated[idx].input = e.target.value;



                          updateActiveProblemField('sampleTestCases', updated);



                        }}



                        style={{



                          width: '100%',



                          background: '#121214',



                          border: '1px solid #27272a',



                          borderRadius: '4px',



                          padding: '4px 8px',



                          color: '#f4f4f5',



                          fontSize: '12px',



                          fontFamily: 'monospace'



                        }}



                      />



                    </div>



                    <div>



                      <div style={{ fontSize: '10px', color: '#71717a' }}>Expected Output:</div>



                      <input



                        type="text"



                        value={tc.expectedOutput}



                        onChange={(e) => {



                          const updated = [...activeProblem.sampleTestCases];



                          updated[idx].expectedOutput = e.target.value;



                          updateActiveProblemField('sampleTestCases', updated);



                        }}



                        style={{



                          width: '100%',



                          background: '#121214',



                          border: '1px solid #27272a',



                          borderRadius: '4px',



                          padding: '4px 8px',



                          color: '#10b981',



                          fontSize: '12px',



                          fontFamily: 'monospace'



                        }}



                      />



                    </div>



                    <div>



                      <div style={{ fontSize: '10px', color: '#71717a' }}>Explanation (optional):</div>



                      <input



                        type="text"



                        value={tc.explanation || ''}



                        onChange={(e) => {



                          const updated = [...activeProblem.sampleTestCases];



                          updated[idx].explanation = e.target.value;



                          updateActiveProblemField('sampleTestCases', updated);



                        }}



                        style={{



                          width: '100%',



                          background: '#121214',



                          border: '1px solid #27272a',



                          borderRadius: '4px',



                          padding: '4px 8px',



                          color: '#a1a1aa',



                          fontSize: '12px'



                        }}



                      />



                    </div>



                    <button



                      type="button"



                      onClick={() => {



                        const updated = activeProblem.sampleTestCases.filter((_, i) => i !== idx);



                        updateActiveProblemField('sampleTestCases', updated);



                      }}



                      style={{



                        padding: '6px',



                        borderRadius: '4px',



                        background: 'transparent',



                        border: 'none',



                        color: '#ef4444',



                        cursor: 'pointer'



                      }}



                    >



                      <Trash2 size={13} />



                    </button>



                  </div>



                ))}



              </div>



            </div>



            {/* Hidden Test Cases */}



            <div>



              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>



                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' }}>



                  Hidden Evaluation Test Cases (Graded during Execution)



                </span>



                <button



                  type="button"



                  onClick={() => {



                    const newTc: Round2TestCase = {



                      id: `hidden_${Date.now()}`,



                      input: '',



                      expectedOutput: '',



                      isHidden: true



                    };



                    updateActiveProblemField('hiddenTestCases', [...(activeProblem.hiddenTestCases || []), newTc]);



                  }}



                  style={{



                    padding: '3px 8px',



                    borderRadius: '4px',



                    background: '#18181b',



                    border: '1px solid #27272a',



                    color: '#e4e4e7',



                    fontSize: '11px',



                    cursor: 'pointer',



                    display: 'inline-flex',



                    alignItems: 'center',



                    gap: '4px'



                  }}



                >



                  <Plus size={12} />



                  <span>Add Hidden Test</span>



                </button>



              </div>



              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>



                {activeProblem.hiddenTestCases?.map((tc, idx) => (



                  <div



                    key={tc.id || idx}



                    style={{



                      background: '#18181b',



                      border: '1px solid #27272a',



                      borderRadius: '6px',



                      padding: '10px',



                      display: 'grid',



                      gridTemplateColumns: '1fr 1fr auto',



                      gap: '8px',



                      alignItems: 'center'



                    }}



                  >



                    <div>



                      <div style={{ fontSize: '10px', color: '#71717a' }}>Hidden Input:</div>



                      <input



                        type="text"



                        value={tc.input}



                        onChange={(e) => {



                          const updated = [...activeProblem.hiddenTestCases];



                          updated[idx].input = e.target.value;



                          updateActiveProblemField('hiddenTestCases', updated);



                        }}



                        style={{



                          width: '100%',



                          background: '#121214',



                          border: '1px solid #27272a',



                          borderRadius: '4px',



                          padding: '4px 8px',



                          color: '#f4f4f5',



                          fontSize: '12px',



                          fontFamily: 'monospace'



                        }}



                      />



                    </div>



                    <div>



                      <div style={{ fontSize: '10px', color: '#71717a' }}>Expected Output:</div>



                      <input



                        type="text"



                        value={tc.expectedOutput}



                        onChange={(e) => {



                          const updated = [...activeProblem.hiddenTestCases];



                          updated[idx].expectedOutput = e.target.value;



                          updateActiveProblemField('hiddenTestCases', updated);



                        }}



                        style={{



                          width: '100%',



                          background: '#121214',



                          border: '1px solid #27272a',



                          borderRadius: '4px',



                          padding: '4px 8px',



                          color: '#10b981',



                          fontSize: '12px',



                          fontFamily: 'monospace'



                        }}



                      />



                    </div>



                    <button



                      type="button"



                      onClick={() => {



                        const updated = activeProblem.hiddenTestCases.filter((_, i) => i !== idx);



                        updateActiveProblemField('hiddenTestCases', updated);



                      }}



                      style={{



                        padding: '6px',



                        borderRadius: '4px',



                        background: 'transparent',



                        border: 'none',



                        color: '#ef4444',



                        cursor: 'pointer'



                      }}



                    >



                      <Trash2 size={13} />



                    </button>



                  </div>



                ))}



              </div>



            </div>



          </div>



        </div>



      )}



      {/* ── SUB-TAB 3: LIVE CODING WORKSTATIONS (TELEMETRY) ── */}



      {subTab === 'live_streams' && (



        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>



          {round2Stations.length === 0 ? (



            <div style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center', border: '1px dashed #27272a', borderRadius: '8px', background: '#121214' }}>



              <Code2 size={28} color="#71717a" style={{ margin: '0 auto 8px auto' }} />



              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>No active coding workstations</div>



              <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>



                When shortlisted candidates start Round 2 at /codespark-exams?round=2, their live telemetry and code stream will stream here.



              </div>



            </div>



          ) : (



            round2Stations.map((station) => (



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



      {/* ── 4. INSPECT CODE DOSSIER MODAL ── */}



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



                  Total Score: <strong style={{ color: '#f4f4f5' }}>{selectedDossier.totalScore} / 100</strong> • Language: {selectedDossier.dominantLanguage} • Solved: {selectedDossier.solvedCount}/5



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



                              {rep.aiVerification.isAlignedWithProblem ? 'ALIGNED ✓' : 'DEVIATION DETECTED'}



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



      {/* ── MODAL: IMPORT ROUND 2 CODING QUESTIONS ── */}



      {showImportModal && (



        <div



          onClick={() => setShowImportModal(false)}



          style={{



            position: 'fixed',



            inset: 0,



            background: 'rgba(9, 9, 11, 0.85)',



            backdropFilter: 'blur(6px)',



            zIndex: 9999,



            display: 'flex',



            alignItems: 'center',



            justifyContent: 'center',



            padding: '24px'



          }}



        >



          <div



            onClick={(e) => e.stopPropagation()}



            style={{



              background: '#121214',



              border: '1px solid #27272a',



              borderRadius: '8px',



              maxWidth: '680px',



              width: '100%',



              padding: '24px',



              display: 'flex',



              flexDirection: 'column',



              gap: '16px',



              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'



            }}



          >



            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>



              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>



                <Upload size={18} color="#3b82f6" />



                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f4f4f5' }}>



                  Import Round 2 Coding Questions Pool



                </h3>



              </div>



              <button



                type="button"



                onClick={() => setShowImportModal(false)}



                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}



              >



                ✕



              </button>



            </div>



            <p style={{ margin: 0, fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.5 }}>



              Define the pool of coding problems (at least 10 questions recommended). When shortlisted students enter Round 2, each student will receive <strong>5 randomized questions</strong> from this pool.



            </p>



            {/* Quick 1-Click Load Official 10-Question Bank */}



            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>



              <div>



                <strong style={{ fontSize: '13px', color: '#f4f4f5', display: 'block' }}>



                  Prebuilt Official 10-Question Coding Bank



                </strong>



                <span style={{ fontSize: '11.5px', color: '#71717a' }}>



                  Includes Two Sum, Palindrome, Kadane's, Climbing Stairs, Longest Substring, Parentheses, etc.



                </span>



              </div>



              <button



                type="button"



                onClick={handleLoadOfficial10Bank}



                style={{



                  padding: '8px 14px',



                  borderRadius: '6px',



                  background: '#10b981',



                  border: 'none',



                  color: '#ffffff',



                  fontSize: '12px',



                  fontWeight: 700,



                  cursor: 'pointer',



                  whiteSpace: 'nowrap'



                }}



              >



                1-Click Load 10 Bank



              </button>



            </div>



            {/* Or Paste JSON */}



            <div>



              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#f4f4f5', marginBottom: '6px' }}>



                Or Paste Custom Questions JSON Array (Round2Problem[]):



              </label>



              <textarea



                value={importJsonText}



                onChange={(e) => setImportJsonText(e.target.value)}



                placeholder='[ { "title": "Custom Problem", "difficulty": "Medium", "description": "...", "sampleTestCases": [...] } ]'



                rows={7}



                style={{



                  width: '100%',



                  background: '#09090b',



                  border: '1px solid #27272a',



                  borderRadius: '6px',



                  padding: '10px',



                  color: '#e4e4e7',



                  fontSize: '12px',



                  fontFamily: 'monospace',



                  boxSizing: 'border-box',



                  outline: 'none'



                }}



              />



            </div>



            {importError && (



              <div style={{ color: '#ef4444', fontSize: '12px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '4px' }}>



                {importError}



              </div>



            )}



            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>



              <button



                type="button"



                onClick={() => setShowImportModal(false)}



                style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', fontSize: '12px', cursor: 'pointer' }}



              >



                Cancel



              </button>



              <button



                type="button"



                onClick={handleImportJson}



                disabled={!importJsonText.trim()}



                style={{



                  padding: '8px 16px',



                  borderRadius: '6px',



                  background: importJsonText.trim() ? '#3b82f6' : '#27272a',



                  border: 'none',



                  color: '#ffffff',



                  fontSize: '12px',



                  fontWeight: 700,



                  cursor: importJsonText.trim() ? 'pointer' : 'not-allowed'



                }}



              >



                Import JSON & Sync to Cloud



              </button>



            </div>



          </div>



        </div>



      )}



    </div>



  );



};



export default AdminRound2Hub;

