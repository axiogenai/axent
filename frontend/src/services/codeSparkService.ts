import { supabase } from './supabaseService';
import {
  MCQExamConfig,
  MCQQuestion,
  MCQAttempt
} from '../types/mcq';
import {
  getAllExams,
  saveExam,
  getAllAttempts,
} from './mcqService';
import { saveExamToCloud } from './supabaseService';

/**
 * CodeSpark Private Examination Service
 * Manages candidate rosters, AXENT-XXXX alphanumeric access keys,
 * active paper assignment, cloud shortlist synchronization, and SMTP dispatch.
 * 100% Dynamic - Zero hardcoded mock candidates or dummy exams.
 */

export interface CodeSparkCandidate {
  accessKey: string;
  assignedExamId?: string; // Strictly 'AXENT-XXXX' (4 digits)
  round2Key?: string; // Dedicated Round 2 access key for shortlisted candidates e.g. 'AXENT-R2-XXXX'
  name: string;
  email: string;
  rollNumber?: string;
  department?: string;
  examId?: string; // Associated MCQ/Aptitude Exam ID
  status: 'REGISTERED' | 'CHECKED_IN' | 'ROUND1_COMPLETED' | 'SHORTLISTED' | 'DISQUALIFIED';
  round1Score?: number;
  round1MaxScore?: number;
  isShortlisted?: boolean;
  round2InvitedAt?: number;
  allowRound1Retake?: boolean; // Authorized to take Round 1 a second time due to workstation overflow
  round1Batch?: 1 | 2; // Batch 1 vs Batch 2 (Remaining candidates)
  round1RetakeAuthorizedAt?: number;
  registeredAt: number;
  lastActiveAt?: number;
}

export interface CodeSparkSystemConfig {
  activeExamId: string | null;
  shortlistMode: 'cutoff' | 'top_n' | 'manual';
  shortlistValue: number;
  manualShortlistRolls: string[];
  isConcluded: boolean;
  concludedAt?: number;
  candidates: CodeSparkCandidate[];
  updatedAt: number;
}

const STORAGE_KEY = 'codedna_codespark_candidates';
const ACTIVE_CANDIDATE_KEY = 'codedna_codespark_active_candidate';
const EVENT_NAME = 'codedna_codespark_candidates_updated';
export const CODESPARK_SYSTEM_CONFIG_ID = 'codespark_system_config';
export const SHORTLIST_STORAGE_KEY = 'codedna_codespark_shortlist';
export const ROUND1_CONCLUDED_STORAGE_KEY = 'codedna_codespark_round1_concluded';
export const LAB_OVERFLOW_STORAGE_KEY = 'codespark_lab_overflow_retake_enabled';
export const RETAKE_AUTHORIZED_ROLLS_KEY = 'codespark_round1_retake_rolls';
export const SMTP_CONFIG_STORAGE_KEY = 'codedna_codespark_smtp_config';

export function normalizeCodeSparkKey(rawKey: string): string {
  if (!rawKey) return '';
  const cleaned = rawKey.trim().toUpperCase().replace(/\s+/g, '');
  
  if (/^AXENT-\d{4}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^AXENT\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned.slice(5)}`;
  }
  if (/^AXNT-\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned.slice(5)}`;
  }
  if (/^AXNT\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned.slice(4)}`;
  }
  if (/^\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned}`;
  }
  return cleaned;
}

export function deduplicateCandidates(candidates: CodeSparkCandidate[]): CodeSparkCandidate[] {
  const keyMap = new Map<string, CodeSparkCandidate>();
  for (const c of candidates) {
    if (!c || !c.accessKey) continue;
    const cleanKey = normalizeCodeSparkKey(c.accessKey);
    if (!cleanKey) continue;
    const itemRoll = c.rollNumber || (c.email ? c.email.split('@')[0].toUpperCase() : cleanKey);
    
    if (!keyMap.has(cleanKey)) {
      keyMap.set(cleanKey, { ...c, accessKey: cleanKey, rollNumber: itemRoll });
    } else {
      const existing = keyMap.get(cleanKey)!;
      existing.name = c.name || existing.name;
      existing.email = c.email || existing.email;
      existing.rollNumber = existing.rollNumber || itemRoll;
      existing.department = c.department || existing.department;
      if (c.status && c.status !== 'REGISTERED') existing.status = c.status;
      if (c.round1Score !== undefined) existing.round1Score = c.round1Score;
      if (c.round1MaxScore !== undefined) existing.round1MaxScore = c.round1MaxScore;
      if (c.isShortlisted !== undefined) existing.isShortlisted = c.isShortlisted;
      if (c.round2Key) existing.round2Key = c.round2Key;
    }
  }
  return Array.from(keyMap.values());
}

export function getAllCodeSparkCandidates(): CodeSparkCandidate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return deduplicateCandidates(parsed);
  } catch (e) {
    console.error('[CodeSpark] Failed to load candidates from storage:', e);
    return [];
  }
}

export function saveCodeSparkCandidates(candidates: CodeSparkCandidate[]): void {
  try {
    const deduped = deduplicateCandidates(candidates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: deduped }));
      window.dispatchEvent(new Event('storage'));
    }
    void pushCandidatesToCloud(deduped);
  } catch (e) {
    console.error('[CodeSpark] Failed to save candidates:', e);
  }
}

async function getCodeSparkAdminHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in with an administrator account to manage the CodeSpark roster.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` };
}

async function fetchCodeSparkRosterConfig(): Promise<CodeSparkSystemConfig | null> {
  const headers = await getCodeSparkAdminHeaders();
  const response = await fetch("/api/codespark/roster", { headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load the CodeSpark roster.");
  return result.config || null;
}

export async function pushCandidatesToCloud(candidates: CodeSparkCandidate[]): Promise<boolean> {
  try {
    const headers = await getCodeSparkAdminHeaders();
    const currentConfig = await fetchCodeSparkRosterConfig();
    const assignedId = typeof window !== "undefined" ? localStorage.getItem("codedna_codespark_round1_exam_id") : null;
    const isConcluded = typeof window !== "undefined" ? localStorage.getItem(ROUND1_CONCLUDED_STORAGE_KEY) === "true" : false;
    const payload: CodeSparkSystemConfig = {
      activeExamId: currentConfig?.activeExamId || assignedId || null,
      shortlistMode: currentConfig?.shortlistMode || "cutoff",
      shortlistValue: currentConfig?.shortlistValue || 12,
      manualShortlistRolls: currentConfig?.manualShortlistRolls || getShortlistedRolls(),
      isConcluded: currentConfig?.isConcluded ?? isConcluded,
      candidates: deduplicateCandidates(candidates),
      updatedAt: Date.now()
    };
    const response = await fetch("/api/codespark/roster", {
      method: "POST", headers, body: JSON.stringify({ config: payload })
    });
    return response.ok;
  } catch (err) {
    console.warn("[CodeSpark Cloud] secure roster update failed:", err);
    return false;
  }
}

export async function syncCandidatesFromCloud(): Promise<CodeSparkCandidate[]> {
  try {
    const config = await fetchCodeSparkRosterConfig();
    if (!config || !Array.isArray(config.candidates)) return getAllCodeSparkCandidates();
    if (config.activeExamId && typeof window !== "undefined") localStorage.setItem("codedna_codespark_round1_exam_id", config.activeExamId);
    if (config.shortlistMode && typeof window !== "undefined") {
      localStorage.setItem("codedna_codespark_shortlist_mode", config.shortlistMode);
      localStorage.setItem("codedna_codespark_shortlist_value", String(config.shortlistValue || 12));
    }
    if (Array.isArray(config.manualShortlistRolls) && typeof window !== "undefined") {
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(config.manualShortlistRolls));
    }
    if (config.isConcluded !== undefined && typeof window !== "undefined") {
      localStorage.setItem(ROUND1_CONCLUDED_STORAGE_KEY, config.isConcluded ? "true" : "false");
      window.dispatchEvent(new CustomEvent("codedna_codespark_concluded_updated", { detail: config.isConcluded }));
    }
    const combined = deduplicateCandidates(config.candidates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: combined }));
      window.dispatchEvent(new Event("storage"));
    }
    return combined;
  } catch (err) {
    // Candidate browsers may not have an authority session. Sync only safe public exam state.
    try {
      const response = await fetch('/api/codespark/public-config');
      const publicConfig = await response.json();
      if (response.ok) {
        if (publicConfig.activeExamId) localStorage.setItem('codedna_codespark_round1_exam_id', publicConfig.activeExamId);
        localStorage.setItem(ROUND1_CONCLUDED_STORAGE_KEY, publicConfig.isConcluded ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('codedna_codespark_concluded_updated', { detail: Boolean(publicConfig.isConcluded) }));
      }
    } catch {}
    console.warn("[CodeSpark Cloud] roster sync requires administrator authentication:", err);
    return getAllCodeSparkCandidates();
  }
}

export async function saveActiveCodeSparkPaper(
  examId: string,
  criteria?: { mode?: 'cutoff' | 'top_n' | 'manual'; value?: number; manualRolls?: string[] }
): Promise<boolean> {
  try {
    const current = await fetchCodeSparkRosterConfig();
    const updatedConfig: CodeSparkSystemConfig = {
      activeExamId: examId,
      shortlistMode: criteria?.mode || current?.shortlistMode || 'cutoff',
      shortlistValue: criteria?.value !== undefined ? criteria.value : (current?.shortlistValue || 12),
      manualShortlistRolls: criteria?.manualRolls || current?.manualShortlistRolls || getShortlistedRolls(),
      isConcluded: current?.isConcluded || false,
      candidates: current?.candidates || getAllCodeSparkCandidates(),
      updatedAt: Date.now()
    };
    const headers = await getCodeSparkAdminHeaders();
    const response = await fetch('/api/codespark/roster', {
      method: 'POST', headers, body: JSON.stringify({ config: updatedConfig })
    });
    if (!response.ok) return false;

    if (typeof window !== 'undefined') {
      localStorage.setItem('codedna_codespark_round1_exam_id', examId);
      localStorage.setItem('codedna_codespark_shortlist_mode', updatedConfig.shortlistMode);
      localStorage.setItem('codedna_codespark_shortlist_value', String(updatedConfig.shortlistValue));
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(updatedConfig.manualShortlistRolls));
    }
    const all = getAllExams();
    for (const ex of all) {
      if (ex.id === examId && !ex.isCodeSpark) { ex.isCodeSpark = true; saveExam(ex); void saveExamToCloud(ex); }
      else if (ex.id !== examId && ex.isCodeSpark) { ex.isCodeSpark = false; saveExam(ex); void saveExamToCloud(ex); }
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('codedna_codespark_config_updated', { detail: updatedConfig }));
    return true;
  } catch (err) {
    console.error('[CodeSpark] secure active paper update failed:', err);
    return false;
  }
}

export function getCodeSparkActiveExam(): MCQExamConfig | null {
  const all = getAllExams().filter((e) => e.id !== CODESPARK_SYSTEM_CONFIG_ID);

  const assignedId = typeof window !== 'undefined'
    ? localStorage.getItem('codedna_codespark_round1_exam_id')
    : null;
  if (assignedId) {
    const existing = all.find((e) => e.id === assignedId);
    if (existing) return existing;
  }

  const sparkExam = all.find((e) => e.isCodeSpark);
  if (sparkExam) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('codedna_codespark_round1_exam_id', sparkExam.id);
    }
    return sparkExam;
  }

  return null;
}

export async function asyncGetCodeSparkActiveExam(): Promise<MCQExamConfig | null> {
  const local = getCodeSparkActiveExam();
  if (local) return local;
  try {
    const response = await fetch('/api/codespark/public-exam');
    const result = await response.json();
    const row = result.exam;
    if (!response.ok || !row) return null;
    const mapped: MCQExamConfig = {
      id: row.id,
      title: row.title,
      description: row.description || '',
      instructions: row.instructions || '',
      subject: row.subject || '',
      topic: row.topic || '',
      examCategory: row.exam_category || 'Aptitude',
      durationMinutes: Number(row.duration_minutes) || 30,
      startTime: row.start_time ? Number(row.start_time) : undefined,
      endTime: row.end_time ? Number(row.end_time) : undefined,
      totalMarks: Number(row.total_marks) || 0,
      questionCount: Array.isArray(row.question_ids) ? row.question_ids.length : (Number(row.question_count) || 0),
      questionIds: Array.isArray(row.question_ids) ? row.question_ids : [],
      shuffleQuestions: Boolean(row.shuffle_questions),
      shuffleOptions: Boolean(row.shuffle_options),
      negativeMarkingEnabled: Boolean(row.negative_marking_enabled),
      allowReview: Boolean(row.allow_review),
      showExplanationsAfterSubmit: Boolean(row.show_explanations_after_submit),
      maxAttempts: Number(row.max_attempts) || 1,
      isCodeSpark: true,
      isPrivate: true,
      status: row.status,
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
      createdBy: row.created_by || 'admin'
    };
    localStorage.setItem('codedna_codespark_round1_exam_id', mapped.id);
    saveExam(mapped);
    return mapped;
  } catch (error) {
    console.warn('[CodeSpark] Active exam metadata unavailable:', error);
    return null;
  }
}

export function ensureCodeSparkAptitudeExam(): MCQExamConfig | null {
  return getCodeSparkActiveExam();
}

export function notifyCandidatesUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: getAllCodeSparkCandidates() }));
    window.dispatchEvent(new Event('storage'));
  }
}

export function lookupCandidateByKey(rawKey: string): CodeSparkCandidate | null {
  const normalized = normalizeCodeSparkKey(rawKey);
  if (!normalized) return null;
  const all = getAllCodeSparkCandidates();
  return all.find((c) => normalizeCodeSparkKey(c.accessKey) === normalized) || null;
}

export async function asyncLookupCandidateByKey(rawKey: string): Promise<CodeSparkCandidate | null> {
  const local = lookupCandidateByKey(rawKey);
  if (local) return local;
  const synced = await syncCandidatesFromCloud();
  const normalized = normalizeCodeSparkKey(rawKey);
  if (!normalized) return null;
  return synced.find((c) => normalizeCodeSparkKey(c.accessKey) === normalized) || null;
}

export function getShortlistedRolls(): string[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SHORTLIST_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isCandidateInShortlistStorage(identifier: string): boolean {
  if (!identifier) return false;
  const clean = identifier.trim().toUpperCase();
  const rolls = getShortlistedRolls();
  return rolls.includes(clean);
}

export function generateRound2KeyForCandidate(_cand: CodeSparkCandidate): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('A secure browser context is required to generate Round 2 access keys.');
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `AXENT-R2-${token}`;
}

export function isRound1ConcludedGlobally(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(ROUND1_CONCLUDED_STORAGE_KEY);
      if (val === 'false') return false;
      if (val === 'true') return true;
    }
    const shortlisted = getShortlistedRolls();
    if (shortlisted.length === 0) return false;
    const cands = getAllCodeSparkCandidates();
    return cands.some(c => Boolean(c.round2Key) && (c.status === 'SHORTLISTED' || c.isShortlisted));
  } catch {
    return false;
  }
}

export function setRound1ConcludedGlobally(concluded: boolean): void {
  try {
    localStorage.setItem(ROUND1_CONCLUDED_STORAGE_KEY, concluded ? 'true' : 'false');
    if (!concluded) {
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([]));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('codedna_codespark_concluded_updated', { detail: concluded }));
      window.dispatchEvent(new Event('storage'));
    }
    notifyCandidatesUpdated();

    // Persist authority-only state through the authenticated server API.
    void (async () => {
      try {
        const cfg = await fetchCodeSparkRosterConfig();
        if (!cfg) return;
        cfg.isConcluded = concluded;
        if (!concluded) cfg.manualShortlistRolls = [];
        cfg.updatedAt = Date.now();
        const headers = await getCodesparkAdminHeaders();
        await fetch('/api/codespark/roster', {
          method: 'POST', headers, body: JSON.stringify({ config: cfg })
        });
      } catch (error) {
        console.warn('[CodeSpark] secure conclusion update failed:', error);
      }
    })();
  } catch {}
}

export interface SmtpConfig {
  smtp_user: string;
  smtp_password: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_from_name?: string;
}

export function getStoredSmtpConfig(): SmtpConfig | null {
  // SMTP credentials are server-only. Retain only harmless UI preferences locally.
  try {
    const raw = localStorage.getItem(SMTP_CONFIG_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const safePreferences = {
        smtp_from_name: saved.smtp_from_name || "Code Spark 2026 Examination Board"
      };
      // Purge any SMTP credentials written by the legacy client-side settings.
      localStorage.setItem(SMTP_CONFIG_STORAGE_KEY, JSON.stringify(safePreferences));
      return {
        smtp_user: "",
        smtp_password: "",
        smtp_from_name: safePreferences.smtp_from_name
      };
    }
  } catch {}
  return { smtp_user: "", smtp_password: "", smtp_from_name: "Code Spark 2026 Examination Board" };
}

export function saveStoredSmtpConfig(config: SmtpConfig): void {
  try {
    localStorage.setItem(SMTP_CONFIG_STORAGE_KEY, JSON.stringify({
      smtp_from_name: config.smtp_from_name || "Code Spark 2026 Examination Board"
    }));
  } catch {}
}

async function getCodesparkAdminHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Please sign in with your administrator Supabase account.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session.access_token}`
  };
}

export async function testSmtpConnection(
  _config: SmtpConfig
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getCodesparkAdminHeaders();
    const response = await fetch("/api/codespark/test-smtp/", { method: "POST", headers, body: "{}" });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "SMTP verification failed." };
    return data;
  } catch (error: any) {
    return { success: false, error: error?.message || "SMTP verification failed." };
  }
}

export interface SmtpRecipientPayload {
  name: string;
  email: string;
  rollNumber?: string;
  round2Key: string;
  round1Score?: number;
  round1MaxScore?: number;
  examUrl?: string;
}

export async function dispatchRound2EmailsViaSmtp(
  _config: SmtpConfig,
  recipients: SmtpRecipientPayload[]
): Promise<{
  success: boolean;
  total: number;
  sent_count: number;
  failed_count: number;
  sent: any[];
  failed: any[];
  error?: string;
}> {
  try {
    const headers = await getCodesparkAdminHeaders();
    const response = await fetch("/api/codespark/send-emails/", {
      method: "POST", headers, body: JSON.stringify({ recipients })
    });
    const data = await response.json();
    if (!response.ok && !data.error) data.error = "Email dispatch failed.";
    return data;
  } catch (error: any) {
    return {
      success: false, total: recipients.length, sent_count: 0,
      failed_count: recipients.length, sent: [],
      failed: recipients.map((recipient) => ({ email: recipient.email, reason: "Email dispatch failed." })),
      error: error?.message || "Network error during email dispatch."
    };
  }
}

export function concludeRound1AndShortlistUnified(options: { mode: 'cutoff' | 'top_n'; value: number }): {
  shortlistedCount: number;
  candidates: CodeSparkCandidate[];
  shortlistedRolls: string[];
} {
  const allCandidates = getAllCodeSparkCandidates();
  const allAttempts = getAllAttempts();
  const targetExam = getCodeSparkActiveExam();
  const dynamicExamTotal = targetExam?.totalMarks || 20;

  const candidateScores = allCandidates.map((cand) => {
    const cRoll = (cand.rollNumber || '').trim().toUpperCase();
    const cKey = cand.accessKey.trim().toUpperCase();
    const cEmail = (cand.email || '').trim().toUpperCase();

    const matchedAttempts = allAttempts.filter((att) => {
      const attRoll = (att.studentRoll || '').trim().toUpperCase();
      const attName = (att.studentName || '').trim().toUpperCase();
      return (
        (cRoll && attRoll === cRoll) ||
        (cKey && attRoll === cKey) ||
        (cEmail && attRoll === cEmail.split('@')[0]) ||
        (attName && attName === cand.name.trim().toUpperCase())
      );
    });

    let maxScore = cand.round1Score ?? 0;
    let maxTotal = cand.round1MaxScore || dynamicExamTotal;

    if (matchedAttempts.length > 0) {
      for (const att of matchedAttempts) {
        if ((att.score ?? 0) >= maxScore) {
          maxScore = att.score ?? 0;
          maxTotal = att.maxScore || dynamicExamTotal || maxTotal;
        }
      }
    }

    return {
      candidate: cand,
      bestScore: maxScore,
      maxScore: maxTotal,
      attemptsCount: matchedAttempts.length
    };
  });

  candidateScores.sort((a, b) => b.bestScore - a.bestScore);

  const qualifyingSet = new Set<string>();

  if (options.mode === 'top_n') {
    const topCandidates = candidateScores.slice(0, Math.max(1, options.value));
    topCandidates.forEach((item) => {
      qualifyingSet.add(item.candidate.accessKey.toUpperCase());
      if (item.candidate.rollNumber) {
        qualifyingSet.add(item.candidate.rollNumber.toUpperCase());
      }
    });
  } else {
    candidateScores.forEach((item) => {
      if (item.bestScore >= options.value) {
        qualifyingSet.add(item.candidate.accessKey.toUpperCase());
        if (item.candidate.rollNumber) {
          qualifyingSet.add(item.candidate.rollNumber.toUpperCase());
        }
      }
    });
  }

  const newlyShortlistedRolls: string[] = [];
  allCandidates.forEach((cand) => {
    const candKey = cand.accessKey.toUpperCase();
    const candRoll = (cand.rollNumber || '').toUpperCase();
    const isQual = qualifyingSet.has(candKey) || (candRoll && qualifyingSet.has(candRoll));

    const scoreItem = candidateScores.find((cs) => cs.candidate.accessKey === cand.accessKey);
    if (scoreItem) {
      cand.round1Score = scoreItem.bestScore;
      cand.round1MaxScore = scoreItem.maxScore;
    }

    cand.isShortlisted = Boolean(isQual);
    if (isQual) {
      cand.status = 'SHORTLISTED';
      if (!cand.round2Key) {
        cand.round2Key = generateRound2KeyForCandidate(cand);
      }
      cand.round2InvitedAt = Date.now();
      newlyShortlistedRolls.push(candRoll || candKey);
    } else {
      if (cand.status === 'SHORTLISTED') {
        cand.status = 'ROUND1_COMPLETED';
      }
    }
  });

  setRound1ConcludedGlobally(true);
  try {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(newlyShortlistedRolls));
  } catch {}
  saveCodeSparkCandidates(allCandidates);

  return {
    shortlistedCount: newlyShortlistedRolls.length,
    candidates: allCandidates,
    shortlistedRolls: newlyShortlistedRolls
  };
}

export function isLabOverflowRetakeEnabledGlobally(): boolean {
  try {
    return localStorage.getItem(LAB_OVERFLOW_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLabOverflowRetakeGlobally(enabled: boolean): void {
  try {
    localStorage.setItem(LAB_OVERFLOW_STORAGE_KEY, enabled ? 'true' : 'false');
    const sparkExam = getCodeSparkActiveExam();
    if (sparkExam) {
      sparkExam.maxAttempts = enabled ? 2 : 1;
      saveExam(sparkExam);
    }
    notifyCandidatesUpdated();
  } catch {}
}

export function getRound1RetakeRolls(): string[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(RETAKE_AUTHORIZED_ROLLS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isCandidateAuthorizedForRound1Retake(identifier: string): boolean {
  if (!identifier) return false;
  if (isLabOverflowRetakeEnabledGlobally()) return true;
  const clean = identifier.trim().toUpperCase();
  const rolls = getRound1RetakeRolls();
  if (rolls.includes(clean)) return true;
  const cand = getAllCodeSparkCandidates().find(
    (c) =>
      c.accessKey.toUpperCase() === clean ||
      (c.rollNumber && c.rollNumber.toUpperCase() === clean) ||
      c.email.toUpperCase() === clean
  );
  return Boolean(cand?.allowRound1Retake);
}

export function authorizeCandidateForRound1Retake(identifier: string, allow = true): void {
  if (!identifier) return;
  const clean = identifier.trim().toUpperCase();
  const rolls = getRound1RetakeRolls();
  const nextRolls = allow
    ? Array.from(new Set([...rolls, clean]))
    : rolls.filter((r) => r !== clean);
  try {
    localStorage.setItem(RETAKE_AUTHORIZED_ROLLS_KEY, JSON.stringify(nextRolls));
  } catch {}

  const all = getAllCodeSparkCandidates();
  const cand = all.find(
    (c) =>
      c.accessKey.toUpperCase() === clean ||
      (c.rollNumber && c.rollNumber.toUpperCase() === clean) ||
      c.email.toUpperCase() === clean
  );
  if (cand) {
    cand.allowRound1Retake = allow;
    if (allow) {
      cand.round1Batch = 2;
      cand.round1RetakeAuthorizedAt = Date.now();
    }
    saveCodeSparkCandidates(all);
  }

  if (allow) {
    try {
      const exam = getCodeSparkActiveExam();
      if (exam) {
        exam.maxAttempts = 2;
        saveExam(exam);
      }
    } catch {}
  }
}

export function authorizeAllRemainingCandidatesForRetake(): number {
  const all = getAllCodeSparkCandidates();
  let count = 0;
  all.forEach((cand) => {
    cand.allowRound1Retake = true;
    cand.round1Batch = 2;
    cand.round1RetakeAuthorizedAt = Date.now();
    count++;
  });
  saveCodeSparkCandidates(all);
  try {
    const rolls = all.map((c) => (c.rollNumber || c.accessKey).toUpperCase());
    localStorage.setItem(RETAKE_AUTHORIZED_ROLLS_KEY, JSON.stringify(rolls));
    const exam = getCodeSparkActiveExam();
    if (exam) {
      exam.maxAttempts = 2;
      saveExam(exam);
    }
  } catch {}
  return count;
}

export function prepareCandidateForRound1Retake(rollNumber: string, examId: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('codedna_mcq_session_attempt');
      sessionStorage.setItem('codedna_codespark_active_batch', '2');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('codedna_codespark_active_batch', '2');
      localStorage.removeItem('codedna_mcq_active_attempt');
      const allE = getAllExams();
      const target = allE.find((e) => e.id === examId);
      if (target) {
        target.maxAttempts = 2;
        saveExam(target);
      }
    }
  } catch {}
}

export interface KeyLookupResult {
  candidate: CodeSparkCandidate;
  targetRound: 'round1' | 'round2';
  isShortlisted: boolean;
  round2Key?: string;
}

export async function asyncLookupCandidateAny(rawKey: string): Promise<KeyLookupResult | null> {
  const key = String(rawKey || '').trim();
  if (!key) return null;
  try {
    const response = await fetch('/api/codespark/candidate-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.candidate) return null;
    return {
      candidate: result.candidate as CodeSparkCandidate,
      targetRound: result.targetRound === 'round2' ? 'round2' : 'round1',
      isShortlisted: Boolean(result.isShortlisted),
      round2Key: result.targetRound === 'round2' ? result.candidate.round2Key : undefined
    };
  } catch (error) {
    console.warn('[CodeSpark] Server candidate verification unavailable:', error);
    return null;
  }
}

function extractPureKeySuffix(k: string): string {
  if (!k) return '';
  return k.toUpperCase().replace(/^AXENT-R2-|^AXENT-|^R2-?/i, '').replace(/\D/g, '');
}

export function lookupCandidateAny(rawKey: string): KeyLookupResult | null {
  if (!rawKey) return null;
  const cleaned = rawKey.trim().toUpperCase().replace(/\s+/g, '');
  const inputPure = extractPureKeySuffix(cleaned);
  const inputDigits = cleaned.replace(/\D/g, '');

  // Strictly require at least 4 digits or a valid AXENT- key.
  // Never match empty string, partial prefixes like 'AXENT-R2-', or fewer than 4 digits.
  if (inputPure.length < 4 && inputDigits.length < 4 && !/^AXENT-\d{4}$/.test(cleaned) && !/^AXENT-R2-\d{4}$/.test(cleaned)) {
    return null;
  }

  const all = getAllCodeSparkCandidates();
  const normalizedKey = normalizeCodeSparkKey(cleaned);
  const isRound1Over = isRound1ConcludedGlobally();

  // 1. Check Round 2 keys first
  for (const c of all) {
    if (c.round2Key) {
      const cleanR2 = c.round2Key.trim().toUpperCase().replace(/\s+/g, '');
      const r2Pure = extractPureKeySuffix(cleanR2);
      const r2Digits = cleanR2.replace(/\D/g, '');

      if (
        cleanR2 === cleaned ||
        cleanR2.replace('AXENT-', '') === cleaned ||
        cleanR2.replace('AXENT-R2-', '') === cleaned ||
        (r2Pure.length >= 4 && inputPure.length >= 4 && inputPure === r2Pure) ||
        (r2Digits.length >= 4 && inputDigits.length >= 4 && inputDigits === r2Digits)
      ) {
        return {
          candidate: c,
          targetRound: 'round2',
          isShortlisted: true,
          round2Key: c.round2Key
        };
      }
    }
  }

  // 2. Check Round 1 keys
  for (const c of all) {
    const cleanR1 = c.accessKey.trim().toUpperCase().replace(/\s+/g, '');
    const normR1 = normalizeCodeSparkKey(cleanR1);
    const r1Pure = extractPureKeySuffix(cleanR1);
    const r1Digits = cleanR1.replace(/\D/g, '');

    if (
      cleanR1 === cleaned ||
      normR1 === normalizedKey ||
      cleanR1 === normalizedKey ||
      normR1 === cleaned ||
      (r1Pure.length >= 4 && inputPure.length >= 4 && inputPure === r1Pure) ||
      (r1Digits.length >= 4 && inputDigits.length >= 4 && inputDigits === r1Digits)
    ) {
      const isShortlisted = Boolean(
        c.isShortlisted ||
        c.status === 'SHORTLISTED' ||
        Boolean(c.round2Key)
      );

      // If candidate is shortlisted and (has round2Key or round 1 is over), targetRound is round2!
      if (isShortlisted && c.round2Key) {
        return {
          candidate: c,
          targetRound: 'round2',
          isShortlisted: true,
          round2Key: c.round2Key
        };
      }

      return {
        candidate: c,
        targetRound: 'round1',
        isShortlisted,
        round2Key: c.round2Key
      };
    }
  }

  return null;
}

export function shortlistCandidateForRound2(identifier: string, isShortlisted = true): void {
  if (!identifier) return;
  const clean = identifier.trim().toUpperCase();
  const currentRolls = getShortlistedRolls();
  const nextRolls = isShortlisted
    ? Array.from(new Set([...currentRolls, clean]))
    : currentRolls.filter((r) => r !== clean);

  try {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(nextRolls));
  } catch {}

  const all = getAllCodeSparkCandidates();
  let updated = false;

  for (const c of all) {
    const cRoll = (c.rollNumber || '').trim().toUpperCase();
    const cKey = c.accessKey.trim().toUpperCase();
    const cEmail = (c.email || '').trim().toUpperCase();

    if (cRoll === clean || cKey === clean || cEmail === clean) {
      c.isShortlisted = isShortlisted;
      c.status = isShortlisted ? 'SHORTLISTED' : 'ROUND1_COMPLETED';
      if (isShortlisted && !c.round2Key) {
        c.round2Key = generateRound2KeyForCandidate(c);
      } else if (!isShortlisted) {
        c.round2Key = undefined;
      }
      c.round2InvitedAt = isShortlisted ? Date.now() : undefined;
      updated = true;
    }
  }

  if (updated) {
    saveCodeSparkCandidates(all);
  }
}

export function onCodeSparkCandidatesChanged(callback: (candidates: CodeSparkCandidate[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleUpdate = (e: Event) => {
    const custom = e as CustomEvent<CodeSparkCandidate[]>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(getAllCodeSparkCandidates());
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === SHORTLIST_STORAGE_KEY || !e.key) {
      callback(getAllCodeSparkCandidates());
    }
  };

  window.addEventListener(EVENT_NAME, handleUpdate);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}


export interface CandidateImportItem {
  name: string;
  email: string;
  rollNumber?: string;
  department?: string;
}

export function generateCodeSparkKey(existingCandidates: CodeSparkCandidate[] = getAllCodeSparkCandidates()): string {
  const usedKeys = new Set<string>();
  existingCandidates.forEach((c) => {
    if (c.accessKey) usedKeys.add(c.accessKey.trim().toUpperCase());
  });
  if (!globalThis.crypto?.getRandomValues) throw new Error('A secure browser context is required to generate candidate access keys.');
  let key = '';
  do {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    key = `AXENT-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  } while (usedKeys.has(key));
  return key;
}

export function parseCandidateImportText(rawText: string): CandidateImportItem[] {
  if (!rawText || !rawText.trim()) return [];
  const trimmed = rawText.trim();

  // 1. Single number to generate N candidate passes (e.g. "50")
  if (/^\d{1,4}$/.test(trimmed)) {
    const count = Math.min(500, Math.max(1, parseInt(trimmed, 10)));
    const items: CandidateImportItem[] = [];
    for (let i = 1; i <= count; i++) {
      items.push({
        name: `Candidate ${i}`,
        email: `candidate${i}@event.axiogen.in`,
        rollNumber: `CS-${String(i).padStart(3, '0')}`,
        department: 'Axent Candidate'
      });
    }
    return items;
  }

  // 2. JSON array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item && (item.name || item.email))
          .map((item: any, idx: number) => ({
            name: String(item.name || item.fullName || `Candidate ${idx + 1}`).trim(),
            email: String(item.email || '').trim().toLowerCase(),
            rollNumber: item.rollNumber ? String(item.rollNumber).trim() : undefined,
            department: item.department ? String(item.department).trim() : 'Axent Candidate'
          }));
      }
    } catch {}
  }

  // 3. Line by line parsing (CSV, TSV, pipe)
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results: CandidateImportItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      i === 0 &&
      (line.toLowerCase().includes('name') ||
       line.toLowerCase().includes('email') ||
       line.toLowerCase().includes('roll'))
    ) {
      continue;
    }

    const parts = line.split(/[,\t;|]/).map((p) => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean);

    if (parts.length >= 2) {
      const emailIdx = parts.findIndex((p) => p.includes('@'));
      if (emailIdx !== -1) {
        const email = parts[emailIdx].toLowerCase();
        const nonEmails = parts.filter((_, idx) => idx !== emailIdx);
        const name = nonEmails[0] || parts[0] || `Candidate ${i + 1}`;
        const rollNumber = nonEmails[1] || undefined;
        results.push({
          name,
          email,
          rollNumber,
          department: 'Axent Candidate'
        });
      } else {
        results.push({
          name: parts[0],
          email: `${parts[0].toLowerCase().replace(/[^a-z0-9]/g, '')}@event.axiogen.in`,
          rollNumber: parts[1] || undefined,
          department: 'Axent Candidate'
        });
      }
    } else if (parts.length === 1) {
      const single = parts[0];
      if (single.includes('@')) {
        const email = single.toLowerCase();
        const namePart = email.split('@')[0].replace(/[._-]/g, ' ');
        const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        results.push({
          name,
          email,
          department: 'Axent Candidate'
        });
      } else {
        results.push({
          name: single,
          email: `${single.toLowerCase().replace(/[^a-z0-9]/g, '')}@event.axiogen.in`,
          department: 'Axent Candidate'
        });
      }
    }
  }

  return results;
}

export function importCodeSparkCandidates(
  items: CandidateImportItem[],
  assignedExamId?: string
): CodeSparkCandidate[] {
  const existing = getAllCodeSparkCandidates();
  const created: CodeSparkCandidate[] = [];

  const usedDigits = new Set<number>();
  existing.forEach((c) => {
    const m = (c.accessKey || '').match(/(\d{4})/);
    if (m) usedDigits.add(parseInt(m[1], 10));
  });

  const usedKeys = new Set<string>();
  existing.forEach((c) => {
    if (c.accessKey) usedKeys.add(c.accessKey.trim().toUpperCase());
  });
  const getNextKey = (): string => {
    if (!globalThis.crypto?.getRandomValues) throw new Error('A secure browser context is required to generate candidate access keys.');
    let key = '';
    do {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      key = `AXENT-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    } while (usedKeys.has(key));
    usedKeys.add(key);
    return key;
  };

  const updatedRoster = [...existing];

  for (const item of items) {
    const cleanEmail = item.email.trim().toLowerCase();
    const cleanName = item.name.trim();

    const matchIdx = updatedRoster.findIndex(
      (c) =>
        (c.email && c.email.toLowerCase() === cleanEmail) ||
        (c.name && c.name.toLowerCase() === cleanName.toLowerCase() && cleanEmail.includes(c.name.toLowerCase()))
    );

    if (matchIdx !== -1) {
      const curr = updatedRoster[matchIdx];
      const updated: CodeSparkCandidate = {
        ...curr,
        name: cleanName || curr.name,
        email: cleanEmail || curr.email,
        rollNumber: item.rollNumber || curr.rollNumber,
        department: item.department || curr.department || 'Axent Candidate',
        assignedExamId: assignedExamId || curr.assignedExamId
      };
      updatedRoster[matchIdx] = updated;
      created.push(updated);
    } else {
      const accessKey = getNextKey();
      const newCand: CodeSparkCandidate = {
        accessKey,
        name: cleanName,
        email: cleanEmail,
        rollNumber: item.rollNumber || cleanEmail.split('@')[0].toUpperCase(),
        department: item.department || 'Axent Candidate',
        assignedExamId,
        status: 'REGISTERED',
        registeredAt: Date.now(),
        isShortlisted: false,
        allowRound1Retake: false
      };
      updatedRoster.push(newCand);
      created.push(newCand);
    }
  }

  saveCodeSparkCandidates(updatedRoster);
  return created;
}

export function deleteCodeSparkCandidate(accessKey: string): void {
  const all = getAllCodeSparkCandidates();
  const remaining = all.filter((c) => c.accessKey.toUpperCase() !== accessKey.trim().toUpperCase());
  saveCodeSparkCandidates(remaining);
}

export async function deleteCodeSparkCandidateComplete(accessKeyOrRoll: string): Promise<void> {
  const clean = accessKeyOrRoll.trim().toUpperCase();
  if (!clean) return;
  const all = getAllCodeSparkCandidates();
  const remaining = all.filter(c => 
    (c.accessKey?.toUpperCase() !== clean) && 
    (c.rollNumber?.toUpperCase() !== clean) &&
    (c.email?.toUpperCase() !== clean)
  );
  saveCodeSparkCandidates(remaining);

  const shortlists = getShortlistedRolls();
  const remainingShortlists = shortlists.filter(r => r.toUpperCase() !== clean);
  try {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(remainingShortlists));
  } catch {}

  try {
    const { deleteAttemptByRollOrKeyFromCloud } = await import('./supabaseService');
    await deleteAttemptByRollOrKeyFromCloud(clean);
  } catch {}

  await pushCandidatesToCloud(remaining);
}

export async function resetCodeSparkSystemInCloud(): Promise<boolean> {
  try {
    const headers = await getCodesparkAdminHeaders();
    const emptyConfig: CodeSparkSystemConfig = {
      activeExamId: null, shortlistMode: 'cutoff', shortlistValue: 12,
      manualShortlistRolls: [], isConcluded: false, candidates: [], updatedAt: Date.now()
    };
    const response = await fetch('/api/codespark/roster', {
      method: 'POST', headers, body: JSON.stringify({ config: emptyConfig })
    });
    return response.ok;
  } catch (error) {
    console.warn('[CodeSpark Cloud] secure roster reset failed:', error);
    return false;
  }
}

export function getActiveCodeSparkCandidate(): CodeSparkCandidate | null {
  try {
    const raw = localStorage.getItem('codedna_codespark_active_candidate');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setActiveCodeSparkCandidate(cand: CodeSparkCandidate | null): void {
  try {
    if (cand) {
      localStorage.setItem('codedna_codespark_active_candidate', JSON.stringify(cand));
    } else {
      localStorage.removeItem('codedna_codespark_active_candidate');
    }
  } catch {}
}
