import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CandidateStation,
  AnalysisReport,
  ThemeMode,
  CollegeLabInfo,
  CodeSubmission
} from '../types/dna';
import {
  COLLEGE_LABS,
  getAllCollegeLabs,
  getLiveStations,
  getStationsForLab,
  getCampusStats,
  getActiveLabId,
  setActiveLabId,
  saveAllStations,
  clearAllStations,
  purgeDemoStations,
  isLabLocked,
  setLabLock,
  isStationLocked,
  sendProctorLockCommand,
  sendProctorWarningMessage,
  subscribeToCctvBroadcast,
  syncCurrentLiveStation,
  clearSubmittedStations,
  removeSingleStation,
  sendProctorConcludeAndFreeCommand
} from '../services/adminService';
import { fetchStationsFromCloud, subscribeToCloudStations } from '../services/supabaseService';
import { InstituteLabManagerModal } from './InstituteLabManagerModal';
import { SupabaseMigrationModal } from './SupabaseMigrationModal';
import { ConfirmationModal } from './ConfirmationModal';
import {
  ShieldAlert,
  ShieldCheck,
  Eye,
  FileText,
  Download,
  RefreshCw,
  Monitor,
  Video,
  User,
  Hash,
  Award,
  Terminal,
  Clock,
  Clipboard,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  LogOut,
  Radio,
  Building,
  GraduationCap,
  Layers,
  Search,
  Filter,
  LayoutGrid,
  Table,
  Building2,
  ExternalLink,
  Trash2,
  Code2,
  Copy,
  EyeOff,
  PlusCircle,
  MapPin,
  UserCheck,
  ListChecks,
  BookOpen,
  Database
} from 'lucide-react';
import { playSound } from '../utils/sounds';
import {
  WatermelonBentoCard,
  WatermelonStatCard,
  ContinuousTabs,
  MicroSegmentedBar,
  MetricTag,
  SimpleSelect
} from './watermelon-ui';

interface AdminDashboardProps {
  theme?: ThemeMode;
  onSelectReportForStudent?: (report: AnalysisReport, codeSubmission?: CodeSubmission) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  theme = 'dark',
  onSelectReportForStudent
}) => {
  const navigate = useNavigate();

  // Selected Lab: 'all' or specific 'LAB-01' to 'LAB-50'
  const [allLabs, setAllLabs] = useState<CollegeLabInfo[]>(() => getAllCollegeLabs());
  const [selectedLabId, setSelectedLabId] = useState<string>(() => getActiveLabId() || 'LAB-01');
  const [stations, setStations] = useState<CandidateStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'screen' | 'code' | 'terminal' | 'mcq'>('screen');
  const selectedStation = stations.find((s) => s.id === selectedStationId) || null;
  const [filter, setFilter] = useState<'all' | 'cheating' | 'submitted' | 'active'>('all');
  const [viewMode, setViewMode] = useState<'cctv' | 'ledger'>('cctv');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lastRefreshed, setLastRefreshed] = useState<string>('Just now');
  const isCurrentLabLocked = isLabLocked(selectedLabId);

  // Modals for Lab Setup and Supabase Cloud DB
  const [showLabManager, setShowLabManager] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [showResetRoomConfirm, setShowResetRoomConfirm] = useState(false);
  const [showClearSubmittedConfirm, setShowClearSubmittedConfirm] = useState(false);
  const [noticeModalMessage, setNoticeModalMessage] = useState<string | null>(null);

  const loadData = async () => {
    purgeDemoStations();
    let list: CandidateStation[];
    if (selectedLabId === 'all') {
      list = getLiveStations();
    } else {
      list = getStationsForLab(selectedLabId);
    }

    try {
      const cloudStations = await fetchStationsFromCloud(selectedLabId === 'all' ? undefined : selectedLabId);
      if (cloudStations && cloudStations.length > 0) {
        const stationMap = new Map<string, CandidateStation>();
        list.forEach((s) => stationMap.set(s.id, s));
        cloudStations.forEach((cs) => {
          const existing = stationMap.get(cs.id);
          if (!existing || (cs.lastUpdatedTimestamp || 0) >= (existing.lastUpdatedTimestamp || 0)) {
            stationMap.set(cs.id, cs);
          }
        });
        list = Array.from(stationMap.values());
        saveAllStations(list);
      }
    } catch {
      // Offline fallback
    }

    setStations(list);
    setLastRefreshed(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    loadData();
    const unsubscribeBroadcast = subscribeToCctvBroadcast(() => {
      loadData();
    });
    const unsubscribeCloud = subscribeToCloudStations(() => {
      loadData();
    });
    // Auto-poll live workstation feeds every 2.5 seconds for instant cross-network sync
    const interval = setInterval(() => {
      loadData();
    }, 2500);
    return () => {
      unsubscribeBroadcast();
      unsubscribeCloud();
      clearInterval(interval);
    };
  }, [selectedLabId]);

  const campusStats = getCampusStats();
  const currentLabInfo = allLabs.find((l) => l.labId === selectedLabId) || allLabs[0];

  const handleLabChange = (newLabId: string) => {
    setSelectedLabId(newLabId);
    if (newLabId !== 'all') {
      setActiveLabId(newLabId);
    }
    playSound('click');
  };

  const handleViewStudentReport = (station: CandidateStation) => {
    playSound('click');
    if (station.examMode === 'MCQ') {
      setSelectedStationId(station.id);
      setModalTab('mcq');
      return;
    }

    const isFlagged = station.cheatingRisk === 'High' || station.cheatingRisk === 'Critical' || station.metrics.pasteRatio >= 50;

    const dossier: AnalysisReport = station.analysisReport || {
      language: station.language,
      integrityScore: isFlagged ? 25 : 95,
      similarityScore: station.metrics.pasteRatio,
      aiPercentage: station.cheatingRisk === 'Critical' ? 85 : station.cheatingRisk === 'High' ? 65 : 0,
      understandingScore: isFlagged ? 30 : 85,
      algorithmName: 'Standard Algorithm',
      conceptName: 'Practical Implementation',
      codingStyle: isFlagged ? 'Irregular (Clipboard Pasted)' : 'Consistent Human Typing',
      status: isFlagged ? 'High Cheating Risk / Plagiarized' : 'Verified Original Work',
      cheatingRisk: station.cheatingRisk,
      detectedSource: isFlagged ? 'Mixed / Unconfirmed' : 'Human Written',
      summary: `Automated invigilator assessment for candidate ${station.student.name || 'Candidate'} (${station.student.rollNumber || 'USN'}). Keystrokes: ${station.metrics.keystrokes}, Paste Ratio: ${station.metrics.pasteRatio}%.`,
      timeComplexity: 'O(N)',
      spaceComplexity: 'O(1)',
      observations: [],
      timestamp: new Date().toISOString(),
      marks: station.marks || {
        executionMarks: 18,
        logicMarks: 8,
        vivaMarks: 8,
        integrityMarks: isFlagged ? 2 : 10,
        totalMarks: isFlagged ? 28 : 44,
        maxMarks: 50
      },
      forensics: {
        keystrokeIntegrity: isFlagged ? 'Compromised' : 'High',
        pasteVerdict: `${station.metrics.pasteRatio}% external clipboard content detected.`,
        typingSpeedVerdict: `${station.metrics.typingSpeed} WPM average writing speed.`,
        aiSignatureVerdict: isFlagged ? 'Probable AI synthesis detected.' : 'Natural human writing dynamics.',
        vivaDefenseVerdict: 'Awaiting invigilator viva evaluation.',
        cheatingEvidenceList: isFlagged ? [`Elevated clipboard paste ratio (${station.metrics.pasteRatio}%)`] : []
      }
    };

    const submission: CodeSubmission = {
      code: station.code || '// No code recorded for this station yet',
      language: station.language,
      student: station.student,
      metrics: station.metrics,
      snapshots: []
    };

    if (onSelectReportForStudent) {
      onSelectReportForStudent(dossier, submission);
    } else {
      navigate('/report');
    }
  };

  const handleExportCSV = () => {
    playSound('click');
    const headers = [
      'Lab ID',
      'Lab Name',
      'Station',
      'Student Name',
      'USN/Roll No',
      'Department',
      'Language',
      'Exam Status',
      'Paste Ratio (%)',
      'Keystrokes',
      'Cheating Risk',
      'Integrity Status',
      'Total Marks (out of 50)'
    ];

    const rows = stations.map((s) => [
      `"${s.labId || selectedLabId}"`,
      `"${s.labName || currentLabInfo?.labName || 'College Lab'}"`,
      `"${s.stationNumber}"`,
      `"${s.student.name || 'N/A'}"`,
      `"${s.student.rollNumber || 'N/A'}"`,
      `"${s.student.department || 'N/A'}"`,
      `"${s.language}"`,
      `"${s.status}"`,
      s.metrics.pasteRatio,
      s.metrics.keystrokes,
      `"${s.cheatingRisk}"`,
      `"${s.integrityStatus}"`,
      s.marks ? s.marks.totalMarks : 'Pending'
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `university_exam_marks_${selectedLabId}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleEmergencyLock = () => {
    const next = !isCurrentLabLocked;
    setLabLock(selectedLabId, next);
    playSound(next ? 'warning' : 'click');
    loadData();
  };

  const handleConnectTestStation = () => {
    const targetLab = selectedLabId === 'all' ? 'LAB-01' : selectedLabId;
    const labInfo = allLabs.find((l) => l.labId === targetLab) || allLabs[0];
    const existingInLab = getLiveStations().filter((s) => s.labId === targetLab);
    const cleanIndex = existingInLab.length + 1;
    const stationNum = `Station #${cleanIndex.toString().padStart(2, '0')}`;

    const testSubmission: CodeSubmission = {
      code: `// Practical Laboratory Solution - ${targetLab}\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Testing workstation connection in ${labInfo.labName}..." << endl;\n    return 0;\n}`,
      language: 'C++',
      student: {
        name: `Candidate ${cleanIndex}`,
        rollNumber: `1MS22CS${(100 + cleanIndex).toString()}`,
        course: labInfo.department,
        department: labInfo.department,
        semester: '5th Semester',
        examType: 'Internal Assessment (CIE)',
        assignmentTitle: `${labInfo.labName} Exam`,
        labId: targetLab,
        labName: labInfo.labName,
        stationNumber: stationNum
      },
      metrics: {
        typingSpeed: 45,
        timeSpent: 120,
        pasteCount: 0,
        deleteCount: 4,
        editCount: 42,
        undoCount: 0,
        pasteRatio: 0,
        pastedLines: 0,
        pastedChars: 0,
        totalLines: 8,
        keystrokes: 195,
        pauseDuration: 10,
        pasteLockViolations: 0,
        tabSwitchViolations: 0,
        unfocusedTimeSeconds: 0
      },
      snapshots: []
    };

    syncCurrentLiveStation(testSubmission, {
      lastTerminalOutput: `Compiling main.cpp with GCC 9.2...\nTesting workstation connection in ${labInfo.labName}...\nProgram finished with exit code 0.`
    });
    loadData();
    playSound('success');
  };

  // Filter stations based on security risk & search query
  const filteredStations = stations.filter((s) => {
    if (filter === 'cheating') {
      if (!(s.cheatingRisk === 'High' || s.cheatingRisk === 'Critical' || s.metrics.pasteRatio >= 50)) {
        return false;
      }
    }
    if (filter === 'submitted' && s.status !== 'Submitted & Done') return false;
    if (filter === 'active' && s.status === 'Submitted & Done') return false;

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchName = s.student.name.toLowerCase().includes(q);
      const matchRoll = s.student.rollNumber.toLowerCase().includes(q);
      const matchStation = s.stationNumber.toLowerCase().includes(q);
      const matchIP = s.ipAddress.toLowerCase().includes(q);
      if (!matchName && !matchRoll && !matchStation && !matchIP) return false;
    }

    return true;
  });

  const submittedCount = stations.filter((s) => s.status === 'Submitted & Done').length;
  const activeCount = stations.filter((s) => s.status !== 'Submitted & Done').length;
  const cheatingCount = stations.filter(
    (s) => s.cheatingRisk === 'High' || s.cheatingRisk === 'Critical' || s.metrics.pasteRatio >= 50
  ).length;

  const handleClearSubmitted = () => {
    clearSubmittedStations(selectedLabId);
    loadData();
    playSound('click');
    setShowClearSubmittedConfirm(false);
  };

  const handleRemoveSingleStation = (stationId: string) => {
    removeSingleStation(stationId);
    setStations((prev) => prev.filter((s) => s.id !== stationId));
    playSound('click');
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-main)',
        padding: '20px 24px',
        overflowY: 'auto',
        gap: '18px'
      }}
    >
      {/* ── TOP CAMPUS MACRO KPI RIBBON (50 LABS SCALE) ── */}
      <div className="kpi-grid">
        <WatermelonStatCard
          label="Campus Laboratories"
          value={campusStats.totalLabs}
          unit="Labs"
          icon={<Building size={13} />}
          iconColor="var(--accent)"
        />

        <WatermelonStatCard
          label="Active Sessions"
          value={campusStats.activeExams}
          unit="Active"
          icon={<Clock size={13} />}
          iconColor="var(--warning)"
        />

        <WatermelonStatCard
          label="Submissions Done"
          value={campusStats.submitted}
          unit="Submitted"
          icon={<CheckCircle2 size={13} />}
          iconColor="var(--success)"
        />

        <WatermelonStatCard
          label="Cheating Alerts"
          value={campusStats.cheatingAlerts}
          unit="Flagged"
          icon={<ShieldAlert size={13} />}
          iconColor={campusStats.cheatingAlerts > 0 ? 'var(--danger)' : 'var(--success)'}
        />
      </div>

      {/* ── TOP INVIGILATOR COMMAND & LAB SELECTOR BAR ── */}
      <div
        className="card-elevated"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          padding: '16px 20px',
          border: '1px solid var(--border)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-danger">
              <Radio size={11} />
              <span>LIVE CCTV SURVEILLANCE</span>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--border-strong)' }}>/</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Chief Superintendent & Invigilation Control Room
            </span>
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '4px 0 2px', color: 'var(--text-primary)' }}>
            College Multi-Laboratory Examination Grid
          </h2>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Monitoring {selectedLabId === 'all' ? 'All 50 Campus Labs' : currentLabInfo?.labName} • Live feed sync every 3s • Last updated: {lastRefreshed}
          </div>
        </div>

        {/* Action Controls & Emergency Lockdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleConnectTestStation}
            style={{ gap: '5px', fontSize: '11px' }}
            title="Connect an active functional test workstation to this laboratory"
          >
            <PlusCircle size={12} color="var(--accent)" />
            <span>+ Test Station</span>
          </button>

          <a
            href={`/workspace?lab=${selectedLabId === 'all' ? 'LAB-01' : selectedLabId}&station=${(getLiveStations().filter((s) => s.labId === (selectedLabId === 'all' ? 'LAB-01' : selectedLabId)).length + 1).toString().padStart(2, '0')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: 'none', gap: '5px', fontSize: '11px' }}
            title="Open Student Examination Terminal in a new browser tab to test live streaming"
          >
            <ExternalLink size={12} />
            <span>Launch Student Tab</span>
          </a>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowResetRoomConfirm(true);
            }}
            style={{ fontSize: '11px', gap: '5px', color: 'var(--danger)' }}
            title="Wipe stored workstations and reset to live listening mode"
          >
            <Trash2 size={12} />
            <span>Reset Room</span>
          </button>

          <button
            className={`btn ${isCurrentLabLocked ? 'btn-danger' : 'btn-secondary'} btn-sm`}
            onClick={handleToggleEmergencyLock}
            title={isCurrentLabLocked ? 'Lift lockdown on workstations' : 'Freeze workstations to prevent typing or pasting'}
            style={{ fontWeight: 700 }}
          >
            {isCurrentLabLocked ? <Unlock size={13} /> : <Lock size={13} />}
            <span>{isCurrentLabLocked ? `Unlock ${selectedLabId === 'all' ? 'All Labs' : selectedLabId}` : `Lockdown ${selectedLabId === 'all' ? 'All Labs' : selectedLabId}`}</span>
          </button>

          <button className="btn btn-secondary btn-sm" onClick={loadData}>
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>

          {/* Supabase Cloud DB Connected Pill / Button */}
          <button
            onClick={() => { setShowSupabaseModal(true); playSound('click'); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            title="Click to inspect central cloud database schema status, copy SQL migration, or trigger bulk cloud sync"
          >
            <Database size={12} color="var(--accent)" />
            <span>Cloud Database: <strong>Active</strong></span>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          </button>

          <button className="btn btn-primary btn-sm" onClick={handleExportCSV}>
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── 50 LAB SELECTOR DROPDOWN & SEARCH FILTER ── */}
      <div
        className="card"
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Select Laboratory:
          </label>
          <div style={{ flex: 1, minWidth: '260px', maxWidth: '480px' }}>
            <SimpleSelect<string>
              value={selectedLabId}
              onChange={(newLabId) => handleLabChange(newLabId)}
              options={[
                {
                  value: 'all',
                  label: `All ${allLabs.length} Labs (Campus Overview - ${getLiveStations().length} Active Online)`,
                  badge: 'ALL'
                },
                ...allLabs.map((lab) => {
                  const liveCount = getLiveStations().filter((s) => s.labId === lab.labId).length;
                  return {
                    value: lab.labId,
                    label: `${lab.labId}: ${lab.labName} (${lab.department})`,
                    badge: liveCount > 0 ? `${liveCount} Live` : lab.labCode
                  };
                })
              ]}
              searchable
              size="md"
            />
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setShowLabManager(true); playSound('click'); }}
            style={{ gap: '6px', fontSize: '11px', whiteSpace: 'nowrap' }}
            title="Manage physical institute laboratories, workstation IDs, and kiosk setup scripts"
          >
            <Building2 size={13} color="var(--accent)" />
            <span>Manage Institute Labs</span>
          </button>
        </div>

        {/* Quick Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '240px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              width: '100%'
            }}
          >
            <Search size={13} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search candidate, USN, station..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '12px',
                width: '100%'
              }}
            />
            {searchQuery && (
              <X size={12} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={() => setSearchQuery('')} />
            )}
          </div>
        </div>
      </div>

      {/* ── SELECTED LAB METADATA BANNER (Watermelon UI MetaChips Pattern) ── */}
      {currentLabInfo && selectedLabId !== 'all' && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <MetricTag icon={<Hash size={11} color="var(--accent)" />} label="CODE" value={currentLabInfo.labCode} tone="neutral" />
            <MetricTag icon={<Building size={11} color="var(--accent)" />} label="DEPT" value={currentLabInfo.department} tone="neutral" />
            <MetricTag icon={<MapPin size={11} color="var(--accent)" />} label="LOC" value={currentLabInfo.block} tone="neutral" />
            <MetricTag icon={<UserCheck size={11} color="var(--accent)" />} label="INVIGILATOR" value={currentLabInfo.invigilatorName} tone="neutral" />
            <MetricTag icon={<Monitor size={11} color="var(--accent)" />} label="CAPACITY" value={`${currentLabInfo.totalStations} PCs`} tone="neutral" />
          </div>

          <MetricTag
            icon={<Radio size={10} />}
            value={`Subnet 10.50.${parseInt(currentLabInfo.labId.replace('LAB-', ''), 10)}.x Active`}
            tone="success"
          />
        </div>
      )}

      {/* ── LAB / CAMPUS LOCKDOWN ACTIVE NOTIFICATION ── */}
      {isCurrentLabLocked && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock size={16} color="var(--danger)" />
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--danger)' }}>
                ACADEMIC LOCKDOWN ACTIVE: {selectedLabId === 'all' ? 'ALL 50 CAMPUS LABS' : selectedLabId}
              </span>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Candidate code editors in this laboratory are locked and read-only. Keystrokes, pasting, and compiler execution are frozen.
              </div>
            </div>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={handleToggleEmergencyLock}
            style={{ height: '28px', fontSize: '11px', padding: '0 12px', fontWeight: 700 }}
          >
            <Unlock size={12} />
            <span>Lift Lockdown</span>
          </button>
        </div>
      )}

      {/* ── Filter Tabs & View Mode Toggle (Watermelon UI ContinuousTabs) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <ContinuousTabs
            layoutId="admin-filter-tabs"
            size="sm"
            activeId={filter}
            onChange={(id: string) => {
              playSound('click');
              setFilter(id as 'all' | 'cheating' | 'submitted' | 'active');
            }}
            tabs={[
              {
                id: 'all',
                label: 'All Stations',
                badge: stations.length,
                badgeTone: 'neutral'
              },
              {
                id: 'active',
                label: 'In-Progress',
                icon: <Clock size={12} />,
                badge: activeCount,
                badgeTone: 'warning'
              },
              {
                id: 'submitted',
                label: 'Submitted',
                icon: <CheckCircle2 size={12} />,
                badge: submittedCount,
                badgeTone: 'success'
              },
              {
                id: 'cheating',
                label: 'Cheating Alerts',
                icon: <ShieldAlert size={12} />,
                badge: cheatingCount,
                badgeTone: cheatingCount > 0 ? 'danger' : 'neutral'
              }
            ]}
          />

          {submittedCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                playSound('click');
                setShowClearSubmittedConfirm(true);
              }}
              style={{
                height: '30px',
                fontSize: '11px',
                padding: '0 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                cursor: 'pointer'
              }}
              title="Remove finished / submitted candidates from live proctoring grid"
            >
              <Trash2 size={11} />
              <span>Clear Submitted ({submittedCount})</span>
            </button>
          )}
        </div>

        {/* View Mode & Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ContinuousTabs
            layoutId="admin-view-mode-tabs"
            size="sm"
            activeId={viewMode}
            onChange={(id: string) => {
              playSound('click');
              setViewMode(id as 'cctv' | 'ledger');
            }}
            tabs={[
              {
                id: 'cctv',
                label: 'Camera Grid',
                icon: <LayoutGrid size={12} />
              },
              {
                id: 'ledger',
                label: 'Audit Ledger',
                icon: <Table size={12} />
              }
            ]}
          />

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredStations.length}</strong> of <strong>{stations.length}</strong> Workstations
          </div>
        </div>
      </div>

      {/* ── Examination Concluded Notification Banner ── */}
      {activeCount === 0 && submittedCount > 0 && viewMode === 'cctv' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 18px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--success)'
              }}
            >
              <CheckCircle2 size={16} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Examination Concluded · All {submittedCount} Candidates Submitted
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                All candidate submissions, AI proctoring telemetry, and test scores have been securely registered.
                Switch to the Audit Ledger to inspect evaluations or clear the completed grid for the next batch.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                playSound('click');
                setViewMode('ledger');
              }}
              style={{ height: '30px', fontSize: '11px', padding: '0 12px', gap: '6px' }}
            >
              <Table size={12} />
              <span>Open Audit Ledger</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                playSound('click');
                setShowClearSubmittedConfirm(true);
              }}
              style={{ height: '30px', fontSize: '11px', padding: '0 12px', gap: '6px' }}
            >
              <Trash2 size={12} />
              <span>Clear Completed Grid ({submittedCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* ── VIEW MODE 1: CCTV LIVE SECURITY CAMERA GRID ── */}
      {viewMode === 'cctv' ? (
        filteredStations.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)'
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--accent-subtle)',
                border: '1px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Video size={24} color="var(--accent)" />
            </div>

            <div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Proctoring Room Listening &bull; Awaiting Workstations
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '520px', lineHeight: 1.6 }}>
                No active exam candidate is currently connected in {selectedLabId === 'all' ? 'any lab' : currentLabInfo?.labName || selectedLabId}.
                Open the <strong>Student Workspace</strong> in another browser tab to start transmitting real-time keystroke telemetry, compiler reports, and live screen feeds.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleConnectTestStation}
                style={{ padding: '7px 18px', gap: '6px' }}
                title="Immediately connect an active test workstation to evaluate invigilation controls"
              >
                <PlusCircle size={13} />
                <span>Connect Test Candidate</span>
              </button>

              <a
                href={`/workspace?lab=${selectedLabId === 'all' ? 'LAB-01' : selectedLabId}&station=${(getLiveStations().filter((s) => s.labId === (selectedLabId === 'all' ? 'LAB-01' : selectedLabId)).length + 1).toString().padStart(2, '0')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: 'none', padding: '7px 18px', gap: '6px' }}
                title="Launch a new candidate exam terminal in another browser tab"
              >
                <ExternalLink size={13} />
                <span>Launch Student Station (New Tab)</span>
              </a>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  clearAllStations();
                  loadData();
                  playSound('click');
                }}
                style={{ padding: '7px 16px', gap: '6px', color: 'var(--danger)' }}
                title="Wipe stored workstations and reset to live listening mode"
              >
                <Trash2 size={13} />
                <span>Reset Grid & Clear Cache</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '14px'
            }}
          >
            {filteredStations.map((station) => {
              const isFlagged =
                station.cheatingRisk === 'High' ||
                station.cheatingRisk === 'Critical' ||
                station.metrics.pasteRatio >= 50;

              const isSubmitted = station.status === 'Submitted & Done';
              const isLocked = isStationLocked(station.id, station.labId);

              return (
                <div
                  key={station.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: isLocked
                      ? '1px solid var(--danger)'
                      : isFlagged
                      ? '1px solid var(--danger)'
                      : isSubmitted
                      ? '1px solid var(--success)'
                      : '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    position: 'relative',
                    padding: 0
                  }}
                >
                  {/* CCTV Camera Header Bar */}
                  <div
                    style={{
                      height: '32px',
                      background: isLocked
                        ? 'var(--danger-bg)'
                        : isFlagged
                        ? 'var(--danger-bg)'
                        : isSubmitted
                        ? 'var(--success-bg)'
                        : 'var(--bg-surface)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                      fontSize: '11px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Video
                        size={12}
                        color={isLocked || isFlagged ? 'var(--danger)' : isSubmitted ? 'var(--success)' : 'var(--text-secondary)'}
                      />
                      <strong style={{ color: 'var(--text-primary)' }}>{station.stationNumber}</strong>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({station.ipAddress})</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        className={`badge badge-sm ${
                          isLocked
                            ? 'badge-danger'
                            : isFlagged
                            ? 'badge-danger'
                            : isSubmitted
                            ? 'badge-success'
                            : 'badge-neutral'
                        }`}
                      >
                        {isLocked ? (
                          <Lock size={10} />
                        ) : isFlagged ? (
                          <ShieldAlert size={10} />
                        ) : isSubmitted ? (
                          <CheckCircle2 size={10} />
                        ) : (
                          <Radio size={10} />
                        )}
                        <span>{isLocked ? 'LOCKED' : isFlagged ? 'FLAGGED' : isSubmitted ? 'SUBMITTED' : 'LIVE'}</span>
                      </span>
                      {Boolean((station.metrics?.tabSwitchViolations || 0) > 0) && (
                        <span
                          className={`badge badge-sm ${(station.metrics?.tabSwitchViolations || 0) >= 3 ? 'badge-danger' : 'badge-warning'}`}
                          style={{ height: '20px', fontSize: '9.5px', padding: '0 5px', gap: '3px' }}
                          title={`${station.metrics?.tabSwitchViolations} Tab switches detected (${station.metrics?.unfocusedTimeSeconds || 0}s unfocused)`}
                        >
                          <EyeOff size={10} />
                          <span>{station.metrics?.tabSwitchViolations}/3 Strikes</span>
                        </span>
                      )}
                      {isSubmitted && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSingleStation(station.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: '2px'
                          }}
                          title="Dismiss submitted workstation from live CCTV grid"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Student Identity Strip */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {station.student.name || 'Candidate (Unregistered)'}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        {station.student.rollNumber || 'No USN'} &bull; {station.language}
                      </div>
                    </div>

                    {station.marks && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                          {station.marks.totalMarks}/50
                        </div>
                        <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Marks</div>
                      </div>
                    )}
                  </div>

                  {/* CCTV Screen Stream: If Submitted, show concluded status. Otherwise Live Captured Screen OR Live Answering / Code Mirror */}
                  {isSubmitted ? (
                    <div
                      style={{
                        height: '145px',
                        background: '#09090b',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '8px',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'rgba(34, 197, 94, 0.12)',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--success)'
                        }}
                      >
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Examination Concluded
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Workstation Disengaged &bull; Score: <strong style={{ color: 'var(--text-primary)' }}>{station.marks?.totalMarks ?? 0}/{station.marks?.maxMarks ?? 50}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSelectedStationId(station.id)}
                          style={{ height: '24px', fontSize: '10.5px', padding: '0 8px' }}
                        >
                          Inspect Audit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRemoveSingleStation(station.id)}
                          style={{ height: '24px', fontSize: '10.5px', padding: '0 8px', color: 'var(--text-muted)' }}
                          title="Dismiss from CCTV grid"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : station.screenImageData ? (
                    <div
                      style={{
                        height: '145px',
                        background: '#000',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <img
                        src={station.screenImageData}
                        alt={`Live Screen ${station.stationNumber}`}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                      <span
                        className="badge badge-sm badge-danger"
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          height: '18px',
                          fontSize: '9.5px',
                          background: 'rgba(239, 68, 68, 0.85)',
                          color: '#fff'
                        }}
                      >
                        <Radio size={9} />
                        <span>SCREEN STREAM</span>
                      </span>
                    </div>
                  ) : station.examMode === 'MCQ' || station.language === 'MCQ' ? (
                    <div
                      style={{
                        height: '145px',
                        background: '#0d0d0d',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <ListChecks size={12} color="var(--accent)" />
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            MCQ EXAMINATION
                          </span>
                        </div>
                        <span
                          className="badge badge-sm badge-neutral"
                          style={{
                            fontSize: '9px',
                            background: 'rgba(0, 0, 0, 0.75)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#d4d4d4'
                          }}
                        >
                          <Radio size={8} color="var(--accent)" />
                          <span>Q {(station.mcqProgress?.currentQuestionIndex ?? 0) + 1} / {station.mcqProgress?.totalQuestions || station.metrics.totalLines || 10}</span>
                        </span>
                      </div>

                      <div>
                        <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {station.student.assignmentTitle || 'MCQ Examination Paper'}
                        </div>
                        {/* Live Answering Dots Matrix */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
                          {Array.from({ length: Math.min(20, station.mcqProgress?.totalQuestions || station.metrics.totalLines || 10) }).map((_, idx) => {
                            const isAnswered = idx < (station.mcqProgress?.answeredCount ?? (station.metrics.editCount || 0));
                            const isCurrent = idx === (station.mcqProgress?.currentQuestionIndex ?? 0);
                            return (
                              <div
                                key={idx}
                                style={{
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '2px',
                                  background: isCurrent ? 'var(--accent)' : isAnswered ? 'var(--success)' : 'rgba(255, 255, 255, 0.12)',
                                  border: isCurrent ? '1px solid #fff' : 'none'
                                }}
                                title={`Question ${idx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                        <span>
                          {station.mcqProgress?.answeredCount ?? (station.metrics.editCount || 0)}/{station.mcqProgress?.totalQuestions ?? (station.metrics.totalLines || 10)} Answered
                        </span>
                        {station.marks ? (
                          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                            Score: {station.marks.totalMarks}/{station.marks.maxMarks || 50}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>Live Answering</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        height: '145px',
                        background: '#0d0d0d',
                        padding: '8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        lineHeight: 1.45,
                        color: '#d4d4d4',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      <span
                        className="badge badge-sm badge-neutral"
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          height: '17px',
                          fontSize: '9px',
                          background: 'rgba(0, 0, 0, 0.75)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#d4d4d4'
                        }}
                      >
                        <Radio size={8} color="var(--danger)" />
                        <span>CODE MIRROR &bull; {station.language.toUpperCase()}</span>
                      </span>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: '128px',
                          overflow: 'hidden'
                        }}
                      >
                        {station.code || '// Awaiting student keyboard input...'}
                      </pre>
                    </div>
                  )}

                  {/* Telemetry Radar Footer & Remote Proctor Actions */}
                  <div
                    style={{
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      background: 'var(--bg-surface)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span className="badge badge-sm badge-neutral">{station.metrics.keystrokes} Keys</span>
                      <span className="badge badge-sm badge-neutral">{station.metrics.typingSpeed} WPM</span>
                      <span
                        className={`badge badge-sm ${
                          station.metrics.pasteRatio >= 50
                            ? 'badge-danger'
                            : station.metrics.pasteRatio > 0
                            ? 'badge-warning'
                            : 'badge-success'
                        }`}
                      >
                        {station.metrics.pasteRatio}% Pasted
                      </span>
                      {Boolean((station.metrics?.tabSwitchViolations || 0) > 0) && (
                        <span
                          className={`badge badge-sm ${(station.metrics?.tabSwitchViolations || 0) >= 3 ? 'badge-danger' : 'badge-warning'}`}
                          title={`${station.metrics?.tabSwitchViolations} Tab/Window Switches (${station.metrics?.unfocusedTimeSeconds || 0}s unfocused)`}
                        >
                          <EyeOff size={9} />
                          <span>{station.metrics?.tabSwitchViolations} Swaps</span>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {/* Remote Lock/Unlock */}
                      <button
                        className={`btn ${isLocked ? 'btn-danger' : 'btn-ghost'} btn-sm`}
                        onClick={() => {
                          const nextLock = !isLocked;
                          sendProctorLockCommand(station.id, nextLock, station.labId);
                          loadData();
                        }}
                        style={{ padding: '0 6px', fontSize: '10.5px', height: '24px' }}
                        title={isLocked ? 'Unlock student editor' : 'Freeze student editor remotely'}
                      >
                        {isLocked ? <Unlock size={11} /> : <Lock size={11} />}
                        <span>{isLocked ? 'Unlock' : 'Lock'}</span>
                      </button>

                      {/* Conclude & Free Device for frozen/locked workstation */}
                      {(isLocked || (station.metrics?.tabSwitchViolations || 0) >= 3) && !isSubmitted && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            sendProctorConcludeAndFreeCommand(station.id, station.labId);
                            loadData();
                            playSound('click');
                          }}
                          style={{
                            padding: '0 6px',
                            fontSize: '10.5px',
                            height: '24px',
                            color: 'var(--success)',
                            borderColor: 'var(--success-border)',
                            background: 'var(--success-bg)'
                          }}
                          title="Conclude exam, calculate marks, and release physical workstation"
                        >
                          <CheckCircle2 size={11} />
                          <span>Conclude & Free</span>
                        </button>
                      )}

                      {/* Instant Warning */}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const msg = window.prompt(
                            `Broadcast proctor alert to ${station.student.name || station.stationNumber}:`,
                            'Keep your hands on the keyboard and focus on your exam window.'
                          );
                          if (msg) {
                            sendProctorWarningMessage(station.id, msg);
                            setNoticeModalMessage(`Proctor notice broadcast to ${station.stationNumber}`);
                          }
                        }}
                        style={{ padding: '0 6px', fontSize: '10.5px', height: '24px' }}
                        title="Broadcast alert warning notice directly to student's screen"
                      >
                        <ShieldAlert size={11} />
                        <span>Warn</span>
                      </button>

                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setSelectedStationId(station.id);
                          setModalTab(station.screenImageData ? 'screen' : 'code');
                        }}
                        style={{ padding: '0 6px', fontSize: '10.5px', height: '24px' }}
                        title="Open full-screen CCTV surveillance feed"
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleViewStudentReport(station)}
                        style={{ padding: '0 6px', fontSize: '10.5px', height: '24px' }}
                        title="Open full invigilation marks dossier"
                      >
                        <FileText size={12} />
                        <span>Report</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ── VIEW MODE 2: UNIVERSITY EXAMINATION AUDIT LEDGER TABLE ── */
        <div className="ledger-table-container">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Candidate Name</th>
                <th>USN / Roll No</th>
                <th>Assigned Lab</th>
                <th>IP Subnet</th>
                <th>Language</th>
                <th>Keystrokes</th>
                <th>Paste %</th>
                <th>Tab Swaps</th>
                <th>Cheating Risk</th>
                <th>Marks (/50)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStations.map((station) => {
                const isFlagged =
                  station.cheatingRisk === 'High' ||
                  station.cheatingRisk === 'Critical' ||
                  station.metrics.pasteRatio >= 50;

                return (
                  <tr key={station.id}>
                    <td>
                      <span className="badge badge-sm badge-neutral">
                        <Monitor size={10} color="var(--accent)" />
                        <span>{station.stationNumber}</span>
                      </span>
                    </td>
                    <td>
                      <strong>{station.student.name || 'Candidate (Unregistered)'}</strong>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {station.student.rollNumber || 'N/A'}
                    </td>
                    <td>{station.labId || currentLabInfo?.labId || 'LAB-01'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      {station.ipAddress}
                    </td>
                    <td>{station.language}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {station.metrics.keystrokes}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          station.metrics.pasteRatio >= 50
                            ? 'badge-danger'
                            : station.metrics.pasteRatio > 0
                            ? 'badge-warning'
                            : 'badge-success'
                        }`}
                      >
                        {station.metrics.pasteRatio}%
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${(station.metrics.tabSwitchViolations || 0) >= 3 ? 'badge-danger' : (station.metrics.tabSwitchViolations || 0) > 0 ? 'badge-warning' : 'badge-neutral'}`}
                        title={`${station.metrics.tabSwitchViolations || 0} Tab/Window switches (${station.metrics.unfocusedTimeSeconds || 0}s unfocused)`}
                      >
                        <EyeOff size={10} />
                        <span>{station.metrics.tabSwitchViolations || 0}/3</span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          isFlagged
                            ? 'badge-danger'
                            : station.cheatingRisk === 'Medium'
                            ? 'badge-warning'
                            : 'badge-success'
                        }`}
                      >
                        {station.cheatingRisk.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="badge badge-sm badge-primary">
                        {station.marks ? `${station.marks.totalMarks}/50` : 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {(() => {
                          const stationLocked = isStationLocked(station.id, station.labId);
                          return (
                            <button
                              className={`btn ${stationLocked ? 'btn-danger' : 'btn-ghost'} btn-sm`}
                              onClick={() => {
                                const nextLock = !stationLocked;
                                sendProctorLockCommand(station.id, nextLock, station.labId);
                                loadData();
                              }}
                              style={{ height: '24px', padding: '0 6px', fontSize: '11px' }}
                              title={stationLocked ? 'Unlock student editor' : 'Freeze student editor remotely'}
                            >
                              {stationLocked ? <Unlock size={11} /> : <Lock size={11} />}
                              <span>{stationLocked ? 'Unlock' : 'Lock'}</span>
                            </button>
                          );
                        })()}
                        {((station.status !== 'Submitted & Done' && isStationLocked(station.id, station.labId)) || (station.tabSwitchViolations || station.mcqProgress?.tabSwitches || 0) >= 3) && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              sendProctorConcludeAndFreeCommand(station.id, station.labId);
                              loadData();
                              playSound('click');
                            }}
                            style={{
                              height: '24px',
                              padding: '0 6px',
                              fontSize: '11px',
                              color: 'var(--success)',
                              borderColor: 'var(--success-border)',
                              background: 'var(--success-bg)'
                            }}
                            title="Conclude exam and free device"
                          >
                            <LogOut size={11} />
                            <span>Free</span>
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setSelectedStationId(station.id);
                            setModalTab(station.screenImageData ? 'screen' : 'code');
                          }}
                          style={{ height: '24px', padding: '0 6px', fontSize: '11px' }}
                          title="Inspect live feed"
                        >
                          <Eye size={12} />
                          <span>Inspect</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleViewStudentReport(station)}
                          style={{ height: '24px', padding: '0 6px', fontSize: '11px' }}
                          title="View Official Report"
                        >
                          <FileText size={12} />
                          <span>Report</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── WORKSTATION CCTV SURVEILLANCE & TELEMETRY INSPECTION MODAL ── */}
      {selectedStation && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px'
          }}
          onClick={() => setSelectedStationId(null)}
        >
          <div
            className="card-elevated"
            style={{
              width: '100%',
              maxWidth: '920px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-primary" style={{ padding: '2px 8px', fontSize: '11px' }}>
                    <Monitor size={11} />
                    <span>{selectedStation.stationNumber}</span>
                  </span>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    CCTV Surveillance Feed: {selectedStation.stationNumber}
                  </h3>
                  {selectedStation.screenImageData ? (
                    <span className="badge badge-danger" style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Radio size={10} />
                      <span>REC • LIVE SCREEN STREAM</span>
                    </span>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Code2 size={10} />
                      <span>CODE TELEMETRY MIRROR</span>
                    </span>
                  )}
                  {isStationLocked(selectedStation.id, selectedStation.labId) ? (
                    <span className="badge badge-danger" style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Lock size={10} />
                      <span>LOCKED BY PROCTOR</span>
                    </span>
                  ) : (
                    <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Unlock size={10} />
                      <span>UNLOCKED</span>
                    </span>
                  )}
                  {Boolean((selectedStation.metrics?.tabSwitchViolations || 0) > 0) && (
                    <span
                      className={`badge ${(selectedStation.metrics?.tabSwitchViolations || 0) >= 3 ? 'badge-danger' : 'badge-warning'}`}
                      style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title={`${selectedStation.metrics?.tabSwitchViolations} Tab/Window switches detected (${selectedStation.metrics?.unfocusedTimeSeconds || 0}s away)`}
                    >
                      <EyeOff size={10} />
                      <span>{selectedStation.metrics?.tabSwitchViolations}/3 TAB SWAPS ({selectedStation.metrics?.unfocusedTimeSeconds || 0}s AWAY)</span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Lab: {selectedStation.labName || currentLabInfo?.labName || selectedStation.labId} • IP: {selectedStation.ipAddress} • Last Packet: {selectedStation.lastActive}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedStationId(null)}
                style={{ padding: '4px', height: '28px', width: '28px' }}
                title="Close surveillance inspection"
              >
                <X size={16} />
              </button>
            </div>

            {/* Remote Invigilation Action Controls & View Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '10px 14px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
              }}
            >
              {/* Tab Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className={`btn btn-sm ${modalTab === 'screen' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setModalTab('screen')}
                  style={{ height: '28px', fontSize: '11px', padding: '0 10px' }}
                >
                  <Video size={12} />
                  <span>Desktop Screen</span>
                  {selectedStation.screenImageData && (
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                  )}
                </button>
                <button
                  className={`btn btn-sm ${modalTab === 'code' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setModalTab('code')}
                  style={{ height: '28px', fontSize: '11px', padding: '0 10px' }}
                >
                  <Code2 size={12} />
                  <span>Editor Code</span>
                </button>
                <button
                  className={`btn btn-sm ${modalTab === 'terminal' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setModalTab('terminal')}
                  style={{ height: '28px', fontSize: '11px', padding: '0 10px' }}
                >
                  <Terminal size={12} />
                  <span>Compiler Output</span>
                  {selectedStation.lastTerminalOutput && (
                    <span className="badge badge-sm badge-neutral" style={{ fontSize: '9px', padding: '0 4px', height: '14px' }}>
                      stdout
                    </span>
                  )}
                </button>
                {selectedStation.examMode === 'MCQ' && (
                  <button
                    className={`btn btn-sm ${modalTab === 'mcq' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setModalTab('mcq')}
                    style={{ height: '28px', fontSize: '11px', padding: '0 10px' }}
                  >
                    <ListChecks size={12} />
                    <span>MCQ Answering Matrix</span>
                  </button>
                )}
              </div>

              {/* Proctor Interventions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Lock/Unlock Toggle */}
                {(() => {
                  const isStationCurrentlyLocked = isStationLocked(selectedStation.id, selectedStation.labId);
                  return (
                    <button
                      className={`btn btn-sm ${isStationCurrentlyLocked ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => {
                        const nextLock = !isStationCurrentlyLocked;
                        sendProctorLockCommand(selectedStation.id, nextLock, selectedStation.labId);
                        loadData();
                      }}
                      style={{ height: '28px', fontSize: '11px', padding: '0 10px' }}
                      title="Remotely freeze/unfreeze candidate Monaco code editor"
                    >
                      {isStationCurrentlyLocked ? <Unlock size={12} /> : <Lock size={12} />}
                      <span>{isStationCurrentlyLocked ? 'Unlock Editor' : 'Freeze Editor'}</span>
                    </button>
                  );
                })()}

                {/* Conclude & Free Device */}
                {selectedStation.status !== 'Submitted & Done' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      sendProctorConcludeAndFreeCommand(selectedStation.id, selectedStation.labId);
                      loadData();
                      playSound('click');
                      setSelectedStationId(null);
                    }}
                    style={{
                      height: '28px',
                      fontSize: '11px',
                      padding: '0 10px',
                      color: 'var(--success)',
                      borderColor: 'var(--success-border)',
                      background: 'var(--success-bg)'
                    }}
                    title="Conclude student examination and release device hardware"
                  >
                    <LogOut size={12} />
                    <span>Conclude & Free</span>
                  </button>
                )}

                {/* Send Warning */}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const msg = window.prompt(
                      `Broadcast invigilator alert notice to ${selectedStation.student.name || selectedStation.stationNumber}:`,
                      'Please focus on your code window. Invigilator is monitoring your workstation.'
                    );
                    if (msg) {
                      sendProctorWarningMessage(selectedStation.id, msg);
                      setNoticeModalMessage(`Notice sent to ${selectedStation.stationNumber}`);
                    }
                  }}
                  style={{ height: '28px', fontSize: '11px', padding: '0 10px' }}
                  title="Display warning banner directly on student terminal"
                >
                  <ShieldAlert size={12} />
                  <span>Send Warning</span>
                </button>
              </div>
            </div>

            {/* Main Inspection Viewport Area */}
            {modalTab === 'screen' ? (
              selectedStation.screenImageData ? (
                /* Actual Live Desktop Screen Capture */
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16/9',
                    background: '#050505',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)'
                  }}
                >
                  <img
                    src={selectedStation.screenImageData}
                    alt="Live Candidate Desktop Stream"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  />

                  {/* Top CCTV HUD Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '12px',
                      right: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      pointerEvents: 'none'
                    }}
                  >
                    <span
                      style={{
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#fff',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      <Radio size={11} />
                      <span>REC • CAM-{selectedStation.stationNumber} • 1080P PROCTOR FEED</span>
                    </span>

                    <span
                      style={{
                        background: 'rgba(0, 0, 0, 0.8)',
                        color: '#f1f5f9',
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      LINE L{selectedStation.activeLineNumber || 1} • {selectedStation.metrics.typingSpeed} WPM
                    </span>
                  </div>

                  {/* Bottom CCTV HUD Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '12px',
                      right: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      pointerEvents: 'none',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                      padding: '12px 6px 4px',
                      color: '#cbd5e1',
                      fontSize: '11px'
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      CANDIDATE: {selectedStation.student.name || 'UNREGISTERED'} • ROLL: {selectedStation.student.rollNumber || 'N/A'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      IP: {selectedStation.ipAddress} • {selectedStation.lastActive}
                    </span>
                  </div>
                </div>
              ) : (
                /* Screen capture inactive notice */
                <div
                  className="card"
                  style={{
                    padding: '36px 24px',
                    textAlign: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <Monitor size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Desktop Screen Capture Awaiting Candidate Activation
                  </h4>
                  <p style={{ margin: '0 auto 16px', fontSize: '12px', color: 'var(--text-muted)', maxWidth: '520px' }}>
                    Candidate on {selectedStation.stationNumber} has not toggled the &ldquo;Share Screen (CCTV)&rdquo; button in their examination header. Keystroke telemetry, line cursor tracking, and compiler output are actively streaming.
                  </p>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setModalTab('code')}
                    style={{ marginInline: 'auto' }}
                  >
                    <Code2 size={13} />
                    <span>Switch to Live Code Telemetry Mirror</span>
                  </button>
                </div>
              )
            ) : modalTab === 'code' ? (
              /* Code Mirror View */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Live Code Mirror ({selectedStation.language} • {selectedStation.code.split('\n').length} lines)
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedStation.code);
                      setNoticeModalMessage('Code successfully copied to clipboard.');
                    }}
                    style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                  >
                    <Copy size={11} />
                    <span>Copy Code</span>
                  </button>
                </div>
                <div
                  style={{
                    background: '#0a0a0a',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    padding: '14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: '#e2e8f0',
                    maxHeight: '340px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {selectedStation.code || '// Workstation connected. Awaiting code input...'}
                </div>
              </div>
            ) : modalTab === 'mcq' ? (
              /* MCQ Live Answering Matrix & Candidate Progress */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ListChecks size={15} color="var(--accent)" />
                    <span>MCQ Paper: {selectedStation.student.assignmentTitle || 'Objective Examination'}</span>
                  </div>
                  <span className="badge badge-primary" style={{ fontSize: '11px' }}>
                    {selectedStation.mcqProgress?.answeredCount ?? (selectedStation.metrics.editCount || 0)} / {selectedStation.mcqProgress?.totalQuestions || selectedStation.metrics.totalLines || 10} Answered ({Math.round(((selectedStation.mcqProgress?.answeredCount ?? (selectedStation.metrics.editCount || 0)) / Math.max(1, selectedStation.mcqProgress?.totalQuestions || selectedStation.metrics.totalLines || 10)) * 100)}%)
                  </span>
                </div>

                <div style={{ background: '#0a0a0a', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px', maxHeight: '340px', overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                    {Array.from({ length: selectedStation.mcqProgress?.totalQuestions || selectedStation.metrics.totalLines || 10 }).map((_, idx) => {
                      const isAnswered = idx < (selectedStation.mcqProgress?.answeredCount ?? (selectedStation.metrics.editCount || 0));
                      const isCurrent = idx === (selectedStation.mcqProgress?.currentQuestionIndex ?? 0);
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 4px',
                            textAlign: 'center',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${isCurrent ? 'var(--accent)' : isAnswered ? 'var(--success-border)' : 'var(--border)'}`,
                            background: isCurrent ? 'var(--accent-subtle)' : isAnswered ? 'var(--success-bg)' : 'var(--bg-surface)',
                            color: isCurrent ? 'var(--accent)' : isAnswered ? 'var(--success)' : 'var(--text-muted)',
                            fontSize: '11px',
                            fontWeight: 700
                          }}
                        >
                          <div>Q{idx + 1}</div>
                          <div style={{ fontSize: '9px', marginTop: '2px', opacity: 0.85 }}>
                            {isCurrent ? 'ACTIVE' : isAnswered ? 'DONE' : 'EMPTY'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>Current Active Item:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>Question {(selectedStation.mcqProgress?.currentQuestionIndex ?? 0) + 1}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>Anti-Cheat Infractions (Tab Switches):</span>
                      <strong style={{ color: (selectedStation.metrics.tabSwitchViolations || 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>
                        {selectedStation.metrics.tabSwitchViolations || 0} violations ({selectedStation.metrics.unfocusedTimeSeconds || 0}s away)
                      </strong>
                    </div>
                    {selectedStation.marks && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>Final Grade / Marks:</span>
                        <strong style={{ color: 'var(--accent)' }}>
                          {selectedStation.marks.totalMarks} / {selectedStation.marks.maxMarks || 50} pts
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Compiler Terminal Console Output */
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Candidate Runtime Compiler Diagnostic & Execution Output
                </div>
                <div
                  style={{
                    background: '#050505',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    padding: '14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: selectedStation.lastTerminalOutput ? '#38bdf8' : 'var(--text-muted)',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {selectedStation.lastTerminalOutput ||
                    '// No runtime execution output recorded yet.\n// When the student clicks "Run Code" or "Submit", compiler stdout/stderr will stream here in real time.'}
                </div>
              </div>
            )}

            {/* Candidate Academic Details */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                padding: '12px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px'
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Candidate: </span>
                <strong>{selectedStation.student.name || 'Candidate (Unregistered)'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>USN / Roll No: </span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedStation.student.rollNumber || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Department: </span>
                <strong>{selectedStation.student.department || 'Computer Science'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                <span className={`badge badge-sm ${selectedStation.status === 'Submitted & Done' ? 'badge-success' : 'badge-primary'}`}>
                  {selectedStation.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Telemetry Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              <div className="card" style={{ padding: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Paste Ratio</div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: selectedStation.metrics.pasteRatio >= 50 ? 'var(--danger)' : 'var(--success)'
                  }}
                >
                  {selectedStation.metrics.pasteRatio}%
                </div>
              </div>
              <div className="card" style={{ padding: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Keystrokes</div>
                <div style={{ fontSize: '18px', fontWeight: 800 }}>{selectedStation.metrics.keystrokes}</div>
              </div>
              <div className="card" style={{ padding: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Typing Speed</div>
                <div style={{ fontSize: '18px', fontWeight: 800 }}>{selectedStation.metrics.typingSpeed} WPM</div>
              </div>
              <div className="card" style={{ padding: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tab Switch Strikes</div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color:
                      (selectedStation.metrics.tabSwitchViolations || 0) >= 3
                        ? 'var(--danger)'
                        : (selectedStation.metrics.tabSwitchViolations || 0) > 0
                        ? 'var(--warning)'
                        : 'var(--success)'
                  }}
                >
                  {selectedStation.metrics.tabSwitchViolations || 0}/3
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {selectedStation.metrics.unfocusedTimeSeconds || 0}s away
                </div>
              </div>
              <div className="card" style={{ padding: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Awarded Marks</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)' }}>
                  {selectedStation.marks ? `${selectedStation.marks.totalMarks}/50` : 'Pending'}
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border)'
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedStationId(null)}
              >
                Close Feed
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const target = selectedStation;
                  setSelectedStationId(null);
                  handleViewStudentReport(target);
                }}
              >
                <FileText size={13} />
                <span>Open Official Examination Dossier</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real Institute Lab Manager & Kiosk Script Generator Modal */}
      {showLabManager && (
        <InstituteLabManagerModal
          isOpen={showLabManager}
          onClose={() => setShowLabManager(false)}
          activeLabId={selectedLabId}
          onLabsUpdated={() => {
            setAllLabs(getAllCollegeLabs());
            loadData();
          }}
        />
      )}

      {/* Supabase Cloud Database & Schema Verification Modal */}
      {showSupabaseModal && (
        <SupabaseMigrationModal
          isOpen={showSupabaseModal}
          onClose={() => setShowSupabaseModal(false)}
        />
      )}

      {/* Reset Room Confirmation Modal */}
      <ConfirmationModal
        isOpen={showResetRoomConfirm}
        title="Reset Proctoring Room?"
        message="This will clear all candidate workstations and reset the live invigilation control room. Active streaming stations will be re-detected on their next telemetry ping."
        confirmText="Yes, Reset Room"
        cancelText="Cancel"
        tone="danger"
        icon="danger"
        onConfirm={() => {
          clearAllStations();
          loadData();
          playSound('click');
          setShowResetRoomConfirm(false);
        }}
        onCancel={() => setShowResetRoomConfirm(false)}
      />

      {/* Clear Submitted Workstations Confirmation Modal */}
      <ConfirmationModal
        isOpen={showClearSubmittedConfirm}
        title="Clear Submitted Workstations?"
        message={`This will clear ${submittedCount} finished / submitted candidate${submittedCount === 1 ? '' : 's'} from the live proctoring grid and refresh the lab for the next batch. All evaluated scores, audit logs, and reports remain safely archived in the university records.`}
        confirmText={`Clear ${submittedCount} Station${submittedCount === 1 ? '' : 's'}`}
        cancelText="Cancel"
        tone="warning"
        icon="warning"
        onConfirm={handleClearSubmitted}
        onCancel={() => setShowClearSubmittedConfirm(false)}
      />

      {/* Proctor Notice Confirmation/Alert Modal */}
      {noticeModalMessage && (
        <ConfirmationModal
          isOpen={Boolean(noticeModalMessage)}
          title="Notice Dispatched"
          message={noticeModalMessage}
          confirmText="Acknowledge"
          cancelText="Dismiss"
          tone="neutral"
          icon="success"
          onConfirm={() => setNoticeModalMessage(null)}
          onCancel={() => setNoticeModalMessage(null)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
