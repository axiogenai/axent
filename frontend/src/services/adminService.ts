import {
  CandidateStation,
  CollegeLabInfo,
  CodeSubmission,
  CompilerExecutionResult,
  AnalysisReport,
  IntegrityStatus,
  CheatingRiskLevel,
  StudentInfo,
  ExamCategory
} from '../types/dna';
import { MCQAttempt, MCQExamConfig } from '../types/mcq';
import {
  saveStationToCloud,
  saveCollegeLabToCloud,
  deleteCollegeLabFromCloud,
  updateStationLockInCloud,
  updateStationWarningInCloud,
  fetchCollegeLabsFromCloud,
  deleteStationFromCloud,
  clearSubmittedStationsFromCloud,
  clearAllStationsFromCloud,
  clearAllAttemptsFromCloud,
  clearSubmittedAttemptsFromCloud,
  clearAllCollegeLabsFromCloud
} from './supabaseService';


const STATIONS_KEY = 'codedna_college_50_labs_workstations';
const CURRENT_LAB_KEY = 'codedna_active_lab_id';
const BROADCAST_BUS_NAME = 'codedna_cctv_proctor_bus';

export interface CctvBroadcastMessage {
  type: 'STATION_UPDATE' | 'STATION_SUBMIT' | 'LOCK_COMMAND' | 'PROCTOR_MESSAGE' | 'HEARTBEAT' | 'RESET_ALL' | 'CONCLUDE_AND_FREE';
  stationId?: string;
  labId?: string;
  station?: CandidateStation;
  isLocked?: boolean;
  warningMessage?: string;
  pardon?: boolean;
}

// ── WORKSTATION IDENTIFIER GENERATOR ──
export function buildWorkstationId(labId?: string, stationNumber?: string): string {
  const activeLab = (labId || getActiveLabId() || 'LAB-01').toUpperCase();
  const cleanNum = (stationNumber || '01').replace(/[^0-9]/g, '') || '01';
  return `${activeLab}-WS-${cleanNum.padStart(2, '0')}`;
}

// ── BROADCAST CHANNEL & REAL-TIME MULTI-BUS EVENT SYSTEM ──
const localSubscribers: Set<(msg: CctvBroadcastMessage) => void> = new Set();
let broadcastSenderChannel: BroadcastChannel | null = null;

function getSenderBus(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!broadcastSenderChannel && 'BroadcastChannel' in window) {
    try {
      broadcastSenderChannel = new BroadcastChannel(BROADCAST_BUS_NAME);
    } catch (e) {
      console.warn('BroadcastChannel initialization error:', e);
    }
  }
  return broadcastSenderChannel;
}

export function broadcastCctvMessage(msg: CctvBroadcastMessage): void {
  // 1. Instant Synchronous In-Process Dispatch (0ms, same window/tab)
  localSubscribers.forEach((handler) => {
    try {
      handler(msg);
    } catch (err) {
      console.error('Local subscriber notification error:', err);
    }
  });

  // 2. Custom DOM Window Event Dispatch (0ms, same window)
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('codedna_cctv_bus_event', { detail: msg }));
    } catch {
      // Ignore
    }
  }

  // 3. BroadcastChannel to other tabs and windows (<2ms)
  const bus = getSenderBus();
  if (bus) {
    try {
      bus.postMessage(msg);
    } catch (err) {
      console.warn('Broadcast message delivery failed:', err);
    }
  }

  // 4. Cross-tab Storage Event Fallback with guaranteed timestamp (<3ms)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('codedna_cctv_heartbeat_tick', JSON.stringify({
        ...msg,
        _t: Date.now() + Math.random()
      }));
      localStorage.setItem('codedna_lock_tick', `${Date.now()}_${Math.random()}`);
    } catch {
      // Storage quota or private mode
    }
  }
}

export function subscribeToCctvBroadcast(
  handler: (msg: CctvBroadcastMessage) => void
): () => void {
  // 1. Add to local synchronous subscriber set (instant 0ms)
  localSubscribers.add(handler);

  // 2. Dedicated listening BroadcastChannel instance per subscriber (so other tabs reach it)
  let subscriberBus: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      subscriberBus = new BroadcastChannel(BROADCAST_BUS_NAME);
      subscriberBus.onmessage = (event: MessageEvent) => {
        if (event.data) {
          handler(event.data);
        }
      };
    } catch {
      subscriberBus = null;
    }
  }

  // 3. Local Custom Event listener
  const localEventListener = (e: Event) => {
    const custom = e as CustomEvent<CctvBroadcastMessage>;
    if (custom?.detail) {
      handler(custom.detail);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('codedna_cctv_bus_event', localEventListener);
  }

  // 4. Storage listener fallback across browser tabs and windows
  const storageListener = (e: StorageEvent) => {
    if (e.key === 'codedna_cctv_heartbeat_tick') {
      try {
        const payload = e.newValue ? JSON.parse(e.newValue) : null;
        if (payload) {
          handler(payload);
        }
      } catch {
        handler({ type: 'HEARTBEAT' });
      }
    } else if (
      e.key === 'codedna_lock_tick' ||
      e.key === STATIONS_KEY ||
      e.key === CAMPUS_LOCK_KEY ||
      e.key?.startsWith(LAB_LOCK_PREFIX) ||
      e.key?.startsWith(STATION_LOCK_PREFIX)
    ) {
      const stationId = e.key?.startsWith(STATION_LOCK_PREFIX) ? e.key.slice(STATION_LOCK_PREFIX.length) : undefined;
      const labId = e.key?.startsWith(LAB_LOCK_PREFIX) ? e.key.slice(LAB_LOCK_PREFIX.length) : undefined;
      const isExplicitUnlock = e.newValue === 'false';
      const isExplicitLock = e.newValue === 'true';
      handler({
        type: 'LOCK_COMMAND',
        stationId: stationId || (e.key === CAMPUS_LOCK_KEY ? 'all' : undefined),
        labId: labId || (e.key === CAMPUS_LOCK_KEY ? 'all' : undefined),
        isLocked: isExplicitUnlock ? false : isExplicitLock ? true : undefined
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageListener);
  }

  return () => {
    localSubscribers.delete(handler);
    if (subscriberBus) {
      try {
        subscriberBus.close();
      } catch {
        // Ignore
      }
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('codedna_cctv_bus_event', localEventListener);
      window.removeEventListener('storage', storageListener);
    }
  };
}

// ── REAL INSTITUTE LABORATORIES ──
// Configurable dynamically by faculty and synchronized to Supabase Cloud
export const DEFAULT_INSTITUTE_LABS: CollegeLabInfo[] = [];
export const COLLEGE_LABS: CollegeLabInfo[] = [];

export const LAB_LOCK_PREFIX = 'codedna_lock_lab_';
export const STATION_LOCK_PREFIX = 'codedna_lock_station_';
export const CAMPUS_LOCK_KEY = 'codedna_lock_all';
export const CUSTOM_LABS_KEY = 'codedna_custom_institute_labs';

// ── DYNAMIC COLLEGE LAB MANAGEMENT (Zero Hardcoded Labs) ──

export function pruneAndDeduplicateLabs(labs: CollegeLabInfo[]): CollegeLabInfo[] {
  if (!Array.isArray(labs) || labs.length === 0) return [];
  const seenNames = new Map<string, CollegeLabInfo>();
  const seenIds = new Set<string>();
  const cleaned: CollegeLabInfo[] = [];

  for (const lab of labs) {
    if (!lab || !lab.labId) continue;
    const cleanId = String(lab.labId).toUpperCase().trim();
    // Normalize lab name (strip "Exam: ", whitespace)
    const cleanName = (lab.labName || '').replace(/^Exam:\s*/i, '').trim().toLowerCase();

    // If duplicate labId or duplicate exam name, skip
    if (seenIds.has(cleanId) || (cleanName && seenNames.has(cleanName))) {
      continue;
    }

    seenIds.add(cleanId);
    if (cleanName) seenNames.set(cleanName, lab);
    cleaned.push({
      ...lab,
      labId: cleanId,
      totalStations: lab.totalStations || 50
    });
  }

  // Renumber cleanly: ensure sequential neat IDs
  return cleaned.slice(0, 20);
}

export function getAllCollegeLabs(): CollegeLabInfo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_LABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length > 10 || parsed.some((l, idx) => parsed.findIndex((o) => o?.labId === l?.labId) !== idx)) {
          const pruned = pruneAndDeduplicateLabs(parsed);
          localStorage.setItem(CUSTOM_LABS_KEY, JSON.stringify(pruned));
          return pruned;
        }
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function notifyLabsChanged(labs: CollegeLabInfo[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('codedna_labs_changed', { detail: labs }));
    localStorage.setItem('codedna_labs_tick', String(Date.now()));
  } catch {}
}

export async function syncCollegeLabsFromCloud(): Promise<CollegeLabInfo[]> {
  try {
    const cloudLabs = await fetchCollegeLabsFromCloud();
    const localLabs = getAllCollegeLabs();

    if (cloudLabs && cloudLabs.length > 0) {
      const merged = pruneAndDeduplicateLabs([...cloudLabs, ...localLabs]);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CUSTOM_LABS_KEY, JSON.stringify(merged));
        notifyLabsChanged(merged);
      }
      return merged;
    } else if (localLabs.length > 0) {
      const pruned = pruneAndDeduplicateLabs(localLabs);
      for (const lab of pruned) {
        void saveCollegeLabToCloud(lab);
      }
      return pruned;
    }
  } catch (err) {
    console.warn('[Axent] Failed to sync college labs from cloud:', err);
  }
  return getAllCollegeLabs();
}

/**
 * Automatically creates or binds a dedicated examination laboratory for a paper.
 * Synchronizes to local storage and Supabase cloud college_labs table so proctors can
 * filter out candidates by exam/lab cleanly when multiple tests are running simultaneously.
 * Guaranteed to NEVER create duplicate labs for the same exam!
 */
export function ensureLabForExam(exam: {
  id: string;
  title: string;
  subject?: string;
  department?: string;
  assignedLabId?: string;
  assignedLabName?: string;
}): CollegeLabInfo {
  const existingLabs = getAllCollegeLabs();
  const cleanTitle = (exam.title || '').trim().toLowerCase();
  const expectedName = `Exam: ${exam.title || 'Examination'}`;

  // 1. If exam already has an assignedLabId, check if it exists in labs
  if (exam.assignedLabId) {
    const matched = existingLabs.find((l) => l.labId.toUpperCase() === exam.assignedLabId?.toUpperCase());
    if (matched) {
      return matched;
    }
  }

  // 2. Check if a lab already exists for this exact exam title
  const titleMatch = existingLabs.find((l) => {
    const labTitle = (l.labName || '').replace(/^Exam:\s*/i, '').trim().toLowerCase();
    return labTitle === cleanTitle || l.labName?.toLowerCase() === expectedName.toLowerCase();
  });
  if (titleMatch) {
    return titleMatch;
  }

  // 3. If there are already at least 5 labs, bind to one of the existing labs instead of creating infinite labs
  if (existingLabs.length >= 5) {
    return existingLabs[0];
  }

  // 4. Determine next available sequential lab ID (e.g. LAB-01, LAB-02, ...)
  const usedNumbers = new Set<number>();
  existingLabs.forEach((l) => {
    const num = parseInt(l.labId.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > 0) usedNumbers.add(num);
  });

  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }

  const assignedLabId = `LAB-${String(nextNum).padStart(2, '0')}`;
  const subjectDept = exam.subject || exam.department || 'Computer Science & Engineering';

  const newLab: CollegeLabInfo = {
    labId: assignedLabId,
    labCode: (exam.subject || 'EXAM').slice(0, 8).toUpperCase(),
    labName: expectedName,
    department: subjectDept,
    block: 'Cloud Examination Cluster',
    totalStations: 50,
    invigilatorName: 'Central Autonomous Proctor'
  };

  saveCollegeLab(newLab);
  return newLab;
}

export function saveCollegeLab(lab: CollegeLabInfo): CollegeLabInfo[] {
  const current = getAllCollegeLabs();
  const idx = current.findIndex((l) => l.labId.toUpperCase() === lab.labId.toUpperCase());
  let updated: CollegeLabInfo[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = lab;
  } else {
    updated = [...current, lab];
  }
  const finalized = pruneAndDeduplicateLabs(updated);
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_LABS_KEY, JSON.stringify(finalized));
    notifyLabsChanged(finalized);
  }
  void saveCollegeLabToCloud(lab);
  return finalized;
}

export async function deleteCollegeLab(labId: string): Promise<CollegeLabInfo[]> {
  const current = getAllCollegeLabs();
  const updated = current.filter((l) => l.labId.toUpperCase() !== labId.toUpperCase());
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_LABS_KEY, JSON.stringify(updated));
    notifyLabsChanged(updated);
  }
  await deleteCollegeLabFromCloud(labId);
  await clearAllStations(labId);
  return updated;
}

export async function resetCollegeLabs(): Promise<CollegeLabInfo[]> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CUSTOM_LABS_KEY);
    notifyLabsChanged([]);
  }
  await clearAllCollegeLabsFromCloud();
  await clearAllStations();
  return [];
}

// Automatically sync college labs on load
if (typeof window !== 'undefined') {
  void syncCollegeLabsFromCloud();
}

// ── PURGE CORRUPTED / LEGACY ENTRIES FROM LOCAL STORAGE ──
export function cleanCorruptedStations(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STATIONS_KEY);
    if (raw) {
      const parsed: CandidateStation[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Keep valid stations with an id and student object
        const cleaned = parsed.filter(
          (s) => s && s.id && s.student
        );
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(STATIONS_KEY, JSON.stringify(cleaned));
        }
      }
    }
  } catch {
    // Ignore
  }
}
export const purgeDemoStations = cleanCorruptedStations;

function reconcileAttemptsIntoStations(stations: CandidateStation[]): CandidateStation[] {
  if (typeof window === 'undefined') return stations;
  const stationMap = new Map<string, CandidateStation>();
  stations.forEach((s) => {
    if (s && s.id) stationMap.set(s.id, s);
  });

  // Reconcile real MCQ candidate attempts
  try {
    const rawAttempts = localStorage.getItem('codedna_mcq_attempts');
    if (rawAttempts) {
      const attempts = JSON.parse(rawAttempts);
      if (Array.isArray(attempts)) {
        for (const a of attempts) {
          if (!a || !a.id || !a.studentName) continue;
          const cleanRoll = String(a.studentRoll || '01').replace(/[^0-9]/g, '') || '01';
          const labId = a.assignedLabId || a.labId || 'LAB-01';
          const stationNum = `Station #${cleanRoll.padStart(2, '0')}`;
          const stationId = `${labId}-WS-${cleanRoll.padStart(2, '0')}`;

          if (!stationMap.has(stationId)) {
            const safeAnswers = a.answers || {};
            const answeredCount = Object.keys(safeAnswers).filter((k) => safeAnswers[k]).length;
            const totalQ = a.assignedQuestions?.length || 25;
            const isDone = a.status === 'SUBMITTED' || a.status === 'DISQUALIFIED' || a.status === 'ABANDONED';
            const tabSwitches = a.tabSwitchCount || 0;
            const unfocusedSec = a.unfocusedSeconds || 0;

            const st: CandidateStation = {
              id: stationId,
              labId,
              labName: a.assignedLabName || `Laboratory ${labId}`,
              stationNumber: stationNum,
              ipAddress: `10.50.${parseInt(labId.replace(/[^0-9]/g, ''), 10) || 1}.${parseInt(cleanRoll, 10) + 10}`,
              student: {
                name: a.studentName,
                rollNumber: a.studentRoll || 'USN-001',
                course: a.examTitle || 'MCQ Examination',
                department: a.studentDept || 'Computer Science & Engineering',
                semester: a.studentSem || '6th Semester',
                division: a.studentDiv || 'A',
                examType: 'Multiple Choice Question (MCQ) Examination',
                labId,
                stationNumber: stationNum,
                examMode: 'MCQ',
                assignmentTitle: a.examTitle || 'MCQ Examination'
              },
              language: 'MCQ',
              code: `// MCQ Exam: ${a.examTitle || 'Exam'}\n// Score: ${a.score ?? 0}/${a.maxScore || totalQ}\n// Violations: ${tabSwitches}`,
              metrics: {
                typingSpeed: 0,
                timeSpent: Math.round(((a.submitTime || Date.now()) - (a.startTime || Date.now())) / 1000),
                pasteCount: 0,
                deleteCount: 0,
                editCount: answeredCount,
                undoCount: 0,
                pasteRatio: 0,
                pastedLines: 0,
                totalLines: totalQ,
                keystrokes: answeredCount,
                pauseDuration: unfocusedSec,
                tabSwitchViolations: tabSwitches,
                unfocusedTimeSeconds: unfocusedSec
              },
              tabSwitchViolations: tabSwitches,
              unfocusedTimeSeconds: unfocusedSec,
              status: isDone ? 'Submitted & Done' : 'In Progress',
              integrityStatus: tabSwitches >= 3 ? 'High Cheating Risk / Plagiarized' : tabSwitches >= 1 ? 'Suspicious Activity / Moderate AI' : 'Verified Original Work',
              cheatingRisk: tabSwitches >= 3 ? 'Critical' : tabSwitches >= 1 ? 'Medium' : 'Low',
              marks: a.score !== undefined ? {
                executionMarks: a.score,
                logicMarks: 0,
                vivaMarks: 0,
                integrityMarks: tabSwitches > 2 ? 0 : 10,
                totalMarks: a.score,
                maxMarks: a.maxScore || totalQ
              } : undefined,
              isLockedByProctor: isStationLocked(stationId, labId),
              lastActive: isDone ? 'Submitted' : 'Just now',
              lastUpdatedTimestamp: a.submitTime || a.startTime || Date.now(),
              examMode: 'MCQ',
              mcqProgress: {
                examId: a.examId,
                examTitle: a.examTitle || 'MCQ Examination',
                answeredCount,
                totalQuestions: totalQ,
                currentQuestionIndex: 0,
                currentScore: a.score,
                score: a.score,
                maxScore: a.maxScore || totalQ,
                tabSwitches
              }
            };
            stationMap.set(stationId, st);
          }
        }
      }
    }
  } catch {}

  return Array.from(stationMap.values());
}

// ── GET ONLY REAL REGISTERED / ACTIVE WORKSTATIONS (NO AUTO FAKE INJECTION) ──
export function getLiveStations(): CandidateStation[] {
  if (typeof window === 'undefined') return [];
  cleanCorruptedStations();
  try {
    const raw = localStorage.getItem(STATIONS_KEY);
    let parsed: CandidateStation[] = [];
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) parsed = p;
    }
    const reconciled = reconcileAttemptsIntoStations(parsed);
    return reconciled.map((s) => ({
      ...s,
      isLockedByProctor: isStationLocked(s.id, s.labId)
    }));
  } catch (err) {
    console.error('Failed to parse stored college stations:', err);
  }
  return [];
}

export function saveAllStations(stations: CandidateStation[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATIONS_KEY, JSON.stringify(stations));
  } catch (err) {
    console.error('Failed to save stations:', err);
  }
}

// ── PERSISTENT CLASS & CAMPUS LOCK ENFORCEMENT ──
export function isCampusLocked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CAMPUS_LOCK_KEY) === 'true';
}

export function isLabLocked(labId: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!labId || labId === 'all') return isCampusLocked();

  const labExplicit = localStorage.getItem(`${LAB_LOCK_PREFIX}${labId}`);
  if (labExplicit === 'false') return false;
  if (labExplicit === 'true') return true;

  return isCampusLocked();
}

export function isStationLocked(stationId: string, labId?: string): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Explicit station lock/unlock MUST have absolute highest precedence!
  const explicitLock = stationId ? localStorage.getItem(`${STATION_LOCK_PREFIX}${stationId}`) : null;
  if (explicitLock === 'false') return false;
  if (explicitLock === 'true') return true;

  // 2. Explicit lab lock/unlock
  if (labId) {
    const labExplicit = localStorage.getItem(`${LAB_LOCK_PREFIX}${labId}`);
    if (labExplicit === 'false') return false;
    if (labExplicit === 'true') return true;
  }

  // 3. Campus-wide lock fallback
  if (isCampusLocked()) return true;

  return false;
}

export function setLabLock(labId: string, isLocked: boolean): void {
  if (typeof window === 'undefined') return;
  if (labId === 'all') {
    localStorage.setItem(CAMPUS_LOCK_KEY, isLocked ? 'true' : 'false');
    getAllCollegeLabs().forEach((l) => {
      localStorage.setItem(`${LAB_LOCK_PREFIX}${l.labId}`, isLocked ? 'true' : 'false');
    });
  } else {
    localStorage.setItem(`${LAB_LOCK_PREFIX}${labId}`, isLocked ? 'true' : 'false');
    if (!isLocked) {
      localStorage.setItem(CAMPUS_LOCK_KEY, 'false');
    }
  }

  // Update in-memory stations and also persistent station keys
  const stations = getLiveStations();
  const updated = stations.map((s) => {
    if (labId === 'all' || s.labId === labId) {
      localStorage.setItem(`${STATION_LOCK_PREFIX}${s.id}`, isLocked ? 'true' : 'false');
      return {
        ...s,
        isLockedByProctor: isLocked,
        tabSwitchViolations: isLocked ? (s.metrics?.tabSwitchViolations || 0) : 0,
        unfocusedTimeSeconds: isLocked ? (s.metrics?.unfocusedTimeSeconds || 0) : 0,
        metrics: {
          ...s.metrics,
          tabSwitchViolations: isLocked ? (s.metrics?.tabSwitchViolations || 0) : 0,
          unfocusedTimeSeconds: isLocked ? (s.metrics?.unfocusedTimeSeconds || 0) : 0
        },
        proctorWarningMessage: isLocked ? s.proctorWarningMessage : undefined
      };
    }
    return s;
  });
  saveAllStations(updated);
  updateStationLockInCloud('all', isLocked, undefined, labId);

  broadcastCctvMessage({
    type: 'LOCK_COMMAND',
    stationId: 'all',
    labId,
    isLocked
  });
}

// ── FLUSH & RESET CONTROL ROOM (WIPES ALL DATA CLEANLY) ──
export async function clearAllStations(labId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const isAll = !labId || labId === 'all';
    if (isAll) {
      localStorage.removeItem(STATIONS_KEY);
      localStorage.removeItem('codedna_mcq_attempts');
      localStorage.removeItem('codedna_mcq_answers');
      localStorage.removeItem('codedna_cctv_heartbeat_tick');
      localStorage.removeItem(CAMPUS_LOCK_KEY);
      getAllCollegeLabs().forEach((l) => {
        localStorage.removeItem(`${LAB_LOCK_PREFIX}${l.labId}`);
      });
      // Remove all station lock keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STATION_LOCK_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } else {
      // Clear only this specific lab
      const currentStations = getLiveStations();
      const keptStations = currentStations.filter((s) => s.labId !== labId);
      saveAllStations(keptStations);

      // Filter MCQ attempts
      try {
        const raw = localStorage.getItem('codedna_mcq_attempts');
        if (raw) {
          const attempts = JSON.parse(raw);
          if (Array.isArray(attempts)) {
            const keptAttempts = attempts.filter((a) => (a.assignedLabId || a.labId) !== labId);
            localStorage.setItem('codedna_mcq_attempts', JSON.stringify(keptAttempts));
          }
        }
      } catch {}

      localStorage.removeItem(`${LAB_LOCK_PREFIX}${labId}`);
    }

    await clearAllStationsFromCloud(labId);
    await clearAllAttemptsFromCloud(labId);
    broadcastCctvMessage({ type: 'RESET_ALL', labId });
  } catch (err) {
    console.error('Failed to clear stations:', err);
  }
}

/**
 * Removes submitted/completed candidate workstations from the live proctoring registry.
 * Active in-progress candidates are preserved untouched.
 */
export async function clearSubmittedStations(labId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const all = getLiveStations();
    const remaining = all.filter((s) => {
      if (labId && labId !== 'all' && s.labId !== labId) return true; // keep other labs
      return s.status !== 'Submitted & Done';
    });
    saveAllStations(remaining);

    // Also filter submitted MCQ attempts from localStorage
    try {
      const rawAttempts = localStorage.getItem('codedna_mcq_attempts');
      if (rawAttempts) {
        const attempts = JSON.parse(rawAttempts);
        if (Array.isArray(attempts)) {
          const remainingAttempts = attempts.filter((a) => {
            if (labId && labId !== 'all' && (a.assignedLabId || a.labId) !== labId) return true;
            const isDone = a.status === 'SUBMITTED' || a.status === 'DISQUALIFIED' || a.status === 'ABANDONED';
            return !isDone;
          });
          localStorage.setItem('codedna_mcq_attempts', JSON.stringify(remainingAttempts));
        }
      }
    } catch {}

    await clearSubmittedStationsFromCloud(labId);
    await clearSubmittedAttemptsFromCloud(labId);
    broadcastCctvMessage({ type: 'STATION_UPDATE', labId });
  } catch (err) {
    console.error('Failed to clear submitted stations:', err);
  }
}

/**
 * Removes a single workstation from the live monitoring grid (e.g. dismissed by invigilator).
 */
export function removeSingleStation(stationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const all = getLiveStations();
    const remaining = all.filter((s) => s.id !== stationId);
    saveAllStations(remaining);
    localStorage.removeItem(`${STATION_LOCK_PREFIX}${stationId}`);
    deleteStationFromCloud(stationId).catch(() => {});
    broadcastCctvMessage({ type: 'STATION_UPDATE', stationId });
  } catch (err) {
    console.error('Failed to remove single station:', err);
  }
}

// ── GET ACTIVE LAB ID ──
export function getActiveLabId(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(CURRENT_LAB_KEY);
  if (stored) return stored;
  const labs = getAllCollegeLabs();
  return labs[0]?.labId || '';
}

export function setActiveLabId(labId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENT_LAB_KEY, labId);
}

// ── GET STATIONS FOR A SPECIFIC LAB ──
export function getStationsForLab(labId: string): CandidateStation[] {
  const all = getLiveStations();
  return all.filter((s) => s.labId === labId);
}

// ── GET DYNAMIC LAB INFO HELPER ──
export function getLabInfoOrDefault(labId?: string): CollegeLabInfo {
  const labs = getAllCollegeLabs();
  const matched = labs.find((l) => l.labId === labId);
  if (matched) return matched;
  if (labs.length > 0) return labs[0];
  return {
    labId: labId || 'LAB-01',
    labCode: labId || 'LAB-01',
    labName: labId ? `Laboratory ${labId}` : 'Computer Laboratory',
    department: 'Computer Science & Engineering',
    block: 'Main Academic Block',
    totalStations: 40,
    invigilatorName: 'Faculty In-Charge'
  };
}

// ── CAMPUS-WIDE MACRO KPI STATISTICS ACROSS DYNAMIC LABS ──
export function getCampusStats(): {
  totalLabs: number;
  totalWorkstations: number;
  activeExams: number;
  submitted: number;
  cheatingAlerts: number;
} {
  const all = getLiveStations();
  const labs = getAllCollegeLabs();
  const totalLabs = Math.max(labs.length, 1);
  const totalWorkstations = labs.reduce((acc, l) => acc + (l.totalStations || 50), 0) || Math.max(all.length, 50);

  const cheatingAlerts = all.filter(
    (s) => s.cheatingRisk === 'High' || s.cheatingRisk === 'Critical' || (s.metrics && s.metrics.pasteRatio >= 50) || (s.tabSwitchViolations || 0) >= 3
  ).length;

  const submitted = all.filter((s) => s.status === 'Submitted & Done' || (s as any).status === 'SUBMITTED').length;
  const activeExams = all.filter((s) => s.status === 'In Progress' || (s as any).status === 'IN_PROGRESS').length;

  return {
    totalLabs,
    totalWorkstations,
    activeExams,
    submitted,
    cheatingAlerts
  };
}

// ── REAL-TIME BROADCAST: SYNCS CANDIDATE WORKSTATION TO ADMIN CCTV ROOM ──
export function syncCurrentLiveStation(
  submission: CodeSubmission,
  extra?: {
    screenImageData?: string;
    hasLiveScreenStream?: boolean;
    activeLineNumber?: number;
    lastTerminalOutput?: string;
  }
): CandidateStation {
  const stations = getLiveStations();
  const activeLab = submission.student.labId || getActiveLabId();

  const charCount = submission.code.trim().length;
  const isPastedByMath = charCount > 10 && submission.metrics.keystrokes < 10;
  const effectivePasteRatio = isPastedByMath
    ? Math.max(submission.metrics.pasteRatio, 95)
    : submission.metrics.pasteRatio;

  const isPasted = submission.metrics.pasteCount > 0 || effectivePasteRatio > 0 || isPastedByMath;
  const isBulkPaste =
    effectivePasteRatio >= 50 ||
    isPastedByMath ||
    (submission.metrics.pasteCount > 0 && submission.metrics.keystrokes < 15);

  const tabSwitches = submission.metrics.tabSwitchViolations || 0;
  const isExtremeTabSwitch = tabSwitches >= 3;
  const isModerateTabSwitch = tabSwitches >= 1;

  const integrityStatus: IntegrityStatus =
    isExtremeTabSwitch || isBulkPaste
      ? 'High Cheating Risk / Plagiarized'
      : isPasted || isModerateTabSwitch
      ? 'Suspicious Activity / Moderate AI'
      : 'Verified Original Work';

  const cheatingRisk: CheatingRiskLevel =
    isExtremeTabSwitch
      ? 'Critical'
      : isBulkPaste || (isModerateTabSwitch && isPasted)
      ? 'High'
      : isPasted || isModerateTabSwitch
      ? 'Medium'
      : 'Low';

  const stationLabel = submission.student.stationNumber || 'Station #01';
  const cleanStationNum = stationLabel.replace(/[^0-9]/g, '') || '01';
  const currentStationId = buildWorkstationId(activeLab, stationLabel);
  const labInfo = getLabInfoOrDefault(activeLab);
  const existing = stations.find((s) => s.id === currentStationId);

  // Check explicit unlock status
  const explicitStationLock = currentStationId ? localStorage.getItem(`${STATION_LOCK_PREFIX}${currentStationId}`) : null;
  const isExplicitlyUnlocked = explicitStationLock === 'false';

  // If 3 or more tab switch infractions occur, only auto-persist lock if not explicitly unlocked by proctor
  if (isExtremeTabSwitch && !isExplicitlyUnlocked && typeof window !== 'undefined') {
    localStorage.setItem(`${STATION_LOCK_PREFIX}${currentStationId}`, 'true');
  }

  const updatedStation: CandidateStation = {
    id: currentStationId,
    labId: activeLab,
    labName: submission.student.labName || labInfo.labName,
    stationNumber: stationLabel,
    ipAddress: existing?.ipAddress || `10.50.${parseInt(activeLab.replace('LAB-', ''), 10) || 1}.${parseInt(cleanStationNum, 10) + 10}`,
    student: {
      ...submission.student,
      labId: activeLab,
      labName: labInfo.labName,
      stationNumber: stationLabel
    },
    language: submission.language,
    code: submission.code,
    metrics: {
      ...submission.metrics,
      pasteRatio: effectivePasteRatio,
      tabSwitchViolations: isExplicitlyUnlocked ? 0 : tabSwitches,
      unfocusedTimeSeconds: submission.metrics.unfocusedTimeSeconds || 0
    },
    tabSwitchViolations: isExplicitlyUnlocked ? 0 : tabSwitches,
    unfocusedTimeSeconds: submission.metrics.unfocusedTimeSeconds || 0,
    status: existing?.status === 'Submitted & Done' ? 'Submitted & Done' : 'In Progress',
    integrityStatus,
    cheatingRisk,
    marks: existing?.marks,
    compilerResult: existing?.compilerResult,
    analysisReport: existing?.analysisReport,
    screenImageData: extra?.screenImageData || existing?.screenImageData,
    hasLiveScreenStream: extra?.hasLiveScreenStream ?? existing?.hasLiveScreenStream ?? false,
    activeLineNumber: extra?.activeLineNumber ?? existing?.activeLineNumber,
    lastTerminalOutput: extra?.lastTerminalOutput || existing?.lastTerminalOutput,
    isLockedByProctor: isExplicitlyUnlocked ? false : isStationLocked(currentStationId, activeLab),
    proctorWarningMessage: isExplicitlyUnlocked
      ? undefined
      : isExtremeTabSwitch
      ? 'EXAM SUSPENDED: Maximum Tab Switch / Alt+Tab Violations Exceeded (3/3 Strikes)'
      : existing?.proctorWarningMessage,
    lastActive: 'Just now',
    lastUpdatedTimestamp: Date.now()
  };

  const stationIndex = stations.findIndex((s) => s.id === currentStationId);
  if (stationIndex >= 0) {
    stations[stationIndex] = updatedStation;
  } else {
    stations.unshift(updatedStation);
  }

  saveAllStations(stations);
  saveStationToCloud(updatedStation);
  broadcastCctvMessage({ type: 'STATION_UPDATE', station: updatedStation, stationId: currentStationId, labId: activeLab });
  return updatedStation;
}

// ── FINAL SUBMISSION TO ADMIN CCTV CONTROL ROOM ──
export function submitAndMarkDone(
  submission: CodeSubmission,
  compilerResult?: CompilerExecutionResult,
  report?: AnalysisReport
): CandidateStation {
  const stations = getLiveStations();
  const activeLab = submission.student.labId || getActiveLabId();
  const stationLabel = submission.student.stationNumber || 'Station #01';
  const cleanStationNum = stationLabel.replace(/[^0-9]/g, '') || '01';
  const currentStationId = `${activeLab}-WS-${cleanStationNum.padStart(2, '0')}`;
  const labInfo = getLabInfoOrDefault(activeLab);

  const charCount = submission.code.trim().length;
  const isPastedByMath = charCount > 10 && submission.metrics.keystrokes < 10;
  const effectivePasteRatio = isPastedByMath
    ? Math.max(submission.metrics.pasteRatio, 95)
    : submission.metrics.pasteRatio;

  const existing = stations.find((s) => s.id === currentStationId);

  const updatedStation: CandidateStation = {
    id: currentStationId,
    labId: activeLab,
    labName: labInfo.labName,
    stationNumber: stationLabel,
    ipAddress: existing?.ipAddress || `10.50.${parseInt(activeLab.replace('LAB-', ''), 10) || 1}.${parseInt(cleanStationNum, 10) + 10}`,
    student: submission.student.name ? submission.student : (existing?.student || submission.student),
    language: submission.language,
    code: submission.code,
    metrics: {
      ...submission.metrics,
      pasteRatio: effectivePasteRatio
    },
    status: 'Submitted & Done',
    integrityStatus: report?.status || (isPastedByMath ? 'High Cheating Risk / Plagiarized' : 'Verified Original Work'),
    cheatingRisk: report?.cheatingRisk || (isPastedByMath ? 'High' : 'Low'),
    marks: report?.marks || {
      executionMarks: compilerResult?.isError ? 10 : 20,
      logicMarks: 9,
      vivaMarks: 8,
      integrityMarks: effectivePasteRatio > 50 ? 0 : 10,
      totalMarks: effectivePasteRatio > 50 ? 27 : 47,
      maxMarks: 50
    },
    compilerResult,
    analysisReport: report,
    screenImageData: existing?.screenImageData,
    hasLiveScreenStream: existing?.hasLiveScreenStream,
    isLockedByProctor: false,
    lastActive: 'Submitted Just Now',
    lastUpdatedTimestamp: Date.now()
  };

  const stationIndex = stations.findIndex((s) => s.id === currentStationId);
  if (stationIndex >= 0) {
    stations[stationIndex] = updatedStation;
  } else {
    stations.unshift(updatedStation);
  }

  saveAllStations(stations);
  saveStationToCloud(updatedStation);
  broadcastCctvMessage({ type: 'STATION_SUBMIT', station: updatedStation, stationId: currentStationId, labId: activeLab });
  return updatedStation;
}

// ── REMOTE PROCTOR COMMAND: LOCK OR UNLOCK A WORKSTATION OR ENTIRE LAB ──
export function sendProctorLockCommand(stationId: string, isLocked: boolean, labId?: string): void {
  if (stationId === 'all') {
    setLabLock(labId || 'all', isLocked);
    return;
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${STATION_LOCK_PREFIX}${stationId}`, isLocked ? 'true' : 'false');
    if (!isLocked) {
      if (labId) {
        localStorage.setItem(`${LAB_LOCK_PREFIX}${labId}`, 'false');
      }
      localStorage.setItem(CAMPUS_LOCK_KEY, 'false');

      // CRITICAL: Also pardon and reset tabSwitchCount in codedna_mcq_attempts so reconcileAttemptsIntoStations doesn't restore old strikes!
      try {
        const rawAttempts = localStorage.getItem('codedna_mcq_attempts');
        if (rawAttempts) {
          const attempts = JSON.parse(rawAttempts);
          if (Array.isArray(attempts)) {
            const currentStationsList = getLiveStations();
            const targetStationObj = currentStationsList.find((st) => st.id === stationId);
            const rollToMatch = targetStationObj?.student?.rollNumber?.toLowerCase()?.trim();
            const nameToMatch = targetStationObj?.student?.name?.toLowerCase()?.trim();
            let changed = false;
            attempts.forEach((a: any) => {
              const aRoll = (a.studentRoll || '').toLowerCase().trim();
              const aName = (a.studentName || '').toLowerCase().trim();
              if ((rollToMatch && aRoll === rollToMatch) || (nameToMatch && aName === nameToMatch) || a.assignedStationId === stationId) {
                a.tabSwitchCount = 0;
                a.unfocusedSeconds = 0;
                changed = true;
              }
            });
            if (changed) {
              localStorage.setItem('codedna_mcq_attempts', JSON.stringify(attempts));
            }
          }
        }
      } catch (err) {
        console.warn('Could not reset attempt infractions on unlock:', err);
      }
    }
  }

  const stations = getLiveStations();
  const updated = stations.map((s) => {
    if (s.id === stationId) {
      return {
        ...s,
        isLockedByProctor: isLocked,
        tabSwitchViolations: isLocked ? (s.metrics?.tabSwitchViolations || 0) : 0,
        unfocusedTimeSeconds: isLocked ? (s.metrics?.unfocusedTimeSeconds || 0) : 0,
        integrityStatus: isLocked ? s.integrityStatus : ('Verified Original Work' as const),
        cheatingRisk: isLocked ? s.cheatingRisk : ('Low' as const),
        metrics: {
          ...s.metrics,
          tabSwitchViolations: isLocked ? (s.metrics?.tabSwitchViolations || 0) : 0,
          unfocusedTimeSeconds: isLocked ? (s.metrics?.unfocusedTimeSeconds || 0) : 0
        },
        mcqProgress: s.mcqProgress ? {
          ...s.mcqProgress,
          tabSwitches: isLocked ? s.mcqProgress.tabSwitches : 0
        } : undefined,
        proctorWarningMessage: isLocked ? s.proctorWarningMessage : undefined
      };
    }
    return s;
  });
  saveAllStations(updated);
  updateStationLockInCloud(stationId, isLocked, undefined, labId);
  broadcastCctvMessage({ type: 'LOCK_COMMAND', stationId, labId, isLocked, pardon: !isLocked });
}

/**
 * Remotely concludes an ongoing candidate examination (MCQ or Coding) and completely frees their terminal.
 * Finalizes evaluated score, unlocks hardware, exits fullscreen, and marks station as 'Submitted & Done'.
 */
export function sendProctorConcludeAndFreeCommand(stationId: string, labId?: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${STATION_LOCK_PREFIX}${stationId}`, 'false');
  }

  const stations = getLiveStations();
  const updated = stations.map((s) => {
    if (s.id === stationId) {
      return {
        ...s,
        status: 'Submitted & Done' as const,
        isLockedByProctor: false,
        tabSwitchViolations: 0,
        unfocusedTimeSeconds: 0,
        metrics: {
          ...s.metrics,
          tabSwitchViolations: 0,
          unfocusedTimeSeconds: 0
        },
        mcqProgress: s.mcqProgress ? {
          ...s.mcqProgress,
          tabSwitches: 0
        } : undefined,
        proctorWarningMessage: 'Examination concluded by central proctor. Terminal released.',
        lastActive: 'Concluded & Freed Just Now',
        lastUpdatedTimestamp: Date.now()
      };
    }
    return s;
  });
  saveAllStations(updated);
  updateStationLockInCloud(stationId, false, 'Examination concluded by central proctor. Terminal released.', labId);

  broadcastCctvMessage({
    type: 'CONCLUDE_AND_FREE',
    stationId,
    labId,
    isLocked: false,
    warningMessage: 'Examination concluded by central proctor. Workstation released.'
  });
}

// ── REMOTE PROCTOR COMMAND: SEND INSTANT WARNING MESSAGE TO CANDIDATE SCREEN ──
export function sendProctorWarningMessage(stationId: string, message: string, labId?: string): void {
  const stations = getLiveStations();
  const updated = stations.map((s) => {
    if (s.id === stationId || stationId === 'all') {
      return { ...s, proctorWarningMessage: message };
    }
    return s;
  });
  saveAllStations(updated);
  updateStationWarningInCloud(stationId, message, labId);
  broadcastCctvMessage({ type: 'PROCTOR_MESSAGE', stationId, labId, warningMessage: message });
}

// ── SYNC MCQ ATTEMPT STATE WITH ADMIN CCTV CONTROL ROOM & SUPABASE ──
export function syncMcqLiveStation(
  attempt: MCQAttempt,
  exam: MCQExamConfig,
  studentInfo: StudentInfo,
  currentIdx: number,
  isDone = false,
  extra?: { screenImageData?: string; hasLiveScreenStream?: boolean }
): CandidateStation {
  try {
    const stations = getLiveStations();
    const activeLab = studentInfo?.labId || getActiveLabId() || 'LAB-01';
    const stationLabel = studentInfo?.stationNumber || 'Station #01';
    const cleanStationNum = stationLabel.replace(/[^0-9]/g, '') || '01';
    const currentStationId = `${activeLab}-WS-${cleanStationNum.padStart(2, '0')}`;
    const labInfo = getLabInfoOrDefault(activeLab);

    const safeAnswers = attempt?.answers || {};
    const answeredCount = Object.keys(safeAnswers).filter((k) => safeAnswers[k]).length;
    const totalQuestions = attempt?.assignedQuestions?.length || exam?.questionCount || 0;
    const tabSwitches = attempt?.tabSwitchCount || 0;
    const unfocusedSec = attempt?.unfocusedSeconds || 0;
    const examTitle = exam?.title || attempt?.examTitle || 'MCQ Examination';
    const examId = exam?.id || attempt?.examId || 'exam-unknown';

    // Determine integrity & cheating risk
    let integrityStatus: IntegrityStatus = 'Verified Original Work';
    let cheatingRisk: CheatingRiskLevel = 'Low';

    if (tabSwitches >= 3 || unfocusedSec > 60) {
      integrityStatus = 'High Cheating Risk / Plagiarized';
      cheatingRisk = 'Critical';
    } else if (tabSwitches >= 1 || unfocusedSec > 15) {
      integrityStatus = 'Suspicious Activity / Moderate AI';
      cheatingRisk = 'Medium';
    }

    const resolvedMaxMarks = attempt?.maxScore && attempt.maxScore > 0
      ? attempt.maxScore
      : (exam as any)?.totalMarks && (exam as any).totalMarks > 0
      ? (exam as any).totalMarks
      : totalQuestions > 0
      ? totalQuestions
      : 25;

    const existing = stations.find((s) => s.id === currentStationId);
    const isLocked = isStationLocked(currentStationId, activeLab);

    const updatedStation: CandidateStation = {
      id: currentStationId,
      labId: activeLab,
      labName: labInfo.labName,
      stationNumber: stationLabel,
      ipAddress: existing?.ipAddress || `10.50.${parseInt(activeLab.replace('LAB-', ''), 10) || 1}.${parseInt(cleanStationNum, 10) + 10}`,
      student: {
        ...studentInfo,
        labId: activeLab,
        labName: labInfo.labName,
        stationNumber: stationLabel,
        examMode: 'MCQ',
        assignmentTitle: examTitle
      },
      language: 'MCQ',
      code: `// MCQ Exam: ${examTitle}\n// Answered: ${answeredCount}/${totalQuestions} questions\n// Score: ${attempt?.score ?? 0}/${resolvedMaxMarks}\n// Tab Switches: ${tabSwitches}`,
      metrics: {
        typingSpeed: 0,
        timeSpent: Math.round((Date.now() - (attempt?.startTime || Date.now())) / 1000),
        pasteCount: 0,
        deleteCount: 0,
        editCount: answeredCount,
        undoCount: 0,
        pasteRatio: 0,
        pastedLines: 0,
        totalLines: totalQuestions,
        keystrokes: answeredCount,
        pauseDuration: Math.round(unfocusedSec),
        tabSwitchViolations: tabSwitches,
        unfocusedTimeSeconds: Math.round(unfocusedSec)
      },
      tabSwitchViolations: tabSwitches,
      unfocusedTimeSeconds: Math.round(unfocusedSec),
      status: isDone ? 'Submitted & Done' : 'In Progress',
      integrityStatus,
      cheatingRisk,
      marks: isDone && attempt?.score !== undefined ? {
        executionMarks: attempt.score,
        logicMarks: 0,
        vivaMarks: 0,
        integrityMarks: tabSwitches > 2 ? 0 : 10,
        totalMarks: attempt.score,
        maxMarks: resolvedMaxMarks
      } : (existing?.marks ? { ...existing.marks, maxMarks: resolvedMaxMarks } : undefined),
      screenImageData: extra?.screenImageData !== undefined ? extra.screenImageData : existing?.screenImageData,
      hasLiveScreenStream: extra?.hasLiveScreenStream !== undefined ? extra.hasLiveScreenStream : existing?.hasLiveScreenStream ?? false,
      isLockedByProctor: isLocked,
      proctorWarningMessage: existing?.proctorWarningMessage,
      lastActive: isDone ? 'Submitted Just Now' : 'Just now',
      lastUpdatedTimestamp: Date.now(),
      examMode: 'MCQ',
      mcqProgress: {
        examId,
        examTitle,
        answeredCount,
        totalQuestions,
        currentQuestionIndex: currentIdx,
        currentScore: attempt?.score,
        score: attempt?.score,
        maxScore: resolvedMaxMarks,
        tabSwitches
      }
    };

    const stationIndex = stations.findIndex((s) => s.id === currentStationId);
    if (stationIndex >= 0) {
      stations[stationIndex] = updatedStation;
    } else {
      stations.unshift(updatedStation);
    }

    saveAllStations(stations);
    saveStationToCloud(updatedStation);
    broadcastCctvMessage({
      type: isDone ? 'STATION_SUBMIT' : 'STATION_UPDATE',
      station: updatedStation,
      stationId: currentStationId,
      labId: activeLab
    });

    return updatedStation;
  } catch (err) {
    console.warn('[syncMcqLiveStation] Telemetry synchronization encountered safe error:', err);
    return {
      id: `${studentInfo?.labId || 'LAB-01'}-WS-01`,
      labId: studentInfo?.labId || 'LAB-01',
      labName: 'Computer Lab',
      stationNumber: studentInfo?.stationNumber || 'Station #01',
      ipAddress: '10.50.1.10',
      student: studentInfo || ({} as any),
      language: 'MCQ',
      code: '// MCQ Sync Inactive',
      metrics: {
        typingSpeed: 0, timeSpent: 0, pasteCount: 0, deleteCount: 0, editCount: 0,
        undoCount: 0, pasteRatio: 0, pastedLines: 0, totalLines: 0, keystrokes: 0,
        pauseDuration: 0, tabSwitchViolations: 0, unfocusedTimeSeconds: 0
      },
      status: isDone ? 'Submitted & Done' : 'In Progress',
      integrityStatus: 'Verified Original Work',
      cheatingRisk: 'Low',
      lastActive: 'Just now',
      lastUpdatedTimestamp: Date.now(),
      examMode: 'MCQ'
    };
  }
}

