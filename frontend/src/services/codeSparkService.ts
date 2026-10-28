import { supabase } from './supabaseService';
import {
  MCQExamConfig,
  MCQQuestion
} from '../types/mcq';
import {
  getAllExams,
  saveExam,
  saveQuestion,
  getAllAttempts
} from './mcqService';
/**
 * CodeSpark Private Examination Service
 * Manages candidate rosters, AXENT-XXXX alphanumeric access keys,
 * and automated credential lookup for CodeSpark on Axent.
 * Zero hardcoded mock candidates - purely dynamic repository.
 */

export interface CodeSparkCandidate {
  accessKey: string; // Strictly 'AXENT-XXXX' (4 digits)
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
  allowRound1Retake?: boolean; // Authorized to take Round 1 a second time due to lab overflow
  round1Batch?: 1 | 2; // Batch 1 vs Batch 2 (Remaining candidates)
  round1RetakeAuthorizedAt?: number;
  registeredAt: number;
  lastActiveAt?: number;
}

const STORAGE_KEY = 'codedna_codespark_candidates';
const ACTIVE_CANDIDATE_KEY = 'codedna_codespark_active_candidate';
const EVENT_NAME = 'codedna_codespark_candidates_updated';


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

export async function pushCandidatesToCloud(candidates: CodeSparkCandidate[]): Promise<boolean> {
  try {
    if (!supabase) return false;
    const deduped = deduplicateCandidates(candidates);
    const { data: exam, error } = await supabase
      .from('mcq_exams')
      .select('instructions')
      .eq('id', 'codespark-round1-aptitude')
      .maybeSingle();

    if (error || !exam) {
      return false;
    }

    let instr = exam.instructions || '';
    instr = instr.replace(/<!--CODESPARK_ROSTER:[\s\S]*?-->/g, '').trim();
    instr = `${instr}\n<!--CODESPARK_ROSTER:${JSON.stringify(deduped)}-->`;

    const { error: updateErr } = await supabase
      .from('mcq_exams')
      .update({ instructions: instr, updated_at: Date.now() })
      .eq('id', 'codespark-round1-aptitude');

    return !updateErr;
  } catch (err) {
    console.warn('[CodeSpark Cloud] pushCandidatesToCloud failed:', err);
    return false;
  }
}

export async function syncCandidatesFromCloud(): Promise<CodeSparkCandidate[]> {
  try {
    if (!supabase) return getAllCodeSparkCandidates();
    const { data: exam, error } = await supabase
      .from('mcq_exams')
      .select('instructions')
      .eq('id', 'codespark-round1-aptitude')
      .maybeSingle();

    if (error || !exam || !exam.instructions) {
      return getAllCodeSparkCandidates();
    }

    const match = exam.instructions.match(/<!--CODESPARK_ROSTER:([\s\S]*?)-->/);
    if (!match) return getAllCodeSparkCandidates();

    const cloudCandidates = JSON.parse(match[1]) as CodeSparkCandidate[];
    if (!Array.isArray(cloudCandidates)) return getAllCodeSparkCandidates();

    const local = getAllCodeSparkCandidates();
    const combined = deduplicateCandidates([...local, ...cloudCandidates]);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: combined }));
        window.dispatchEvent(new Event('storage'));
      }
    } catch {}

    return combined;
  } catch (err) {
    console.warn('[CodeSpark Cloud] syncCandidatesFromCloud error:', err);
    return getAllCodeSparkCandidates();
  }
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

export function notifyCandidatesUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: getAllCodeSparkCandidates() }));
    window.dispatchEvent(new Event('storage'));
  }
}

/**
 * Normalizes input key to 'AXNT-XXXX' format:
 * Handles 'axnt-1234', 'AXNT1234', 'axnt 1234', etc.
 */
export function normalizeCodeSparkKey(rawKey: string): string {
  if (!rawKey) return '';
  const cleaned = rawKey.trim().toUpperCase().replace(/\s+/g, '');
  
  if (/^AXENT-\d{4}$/.test(cleaned)) {
    return cleaned;
  }
  
  if (/^AXENT\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned.slice(5)}`;
  }

  // Also support legacy/compact AXNT format
  if (/^AXNT-\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned.slice(5)}`;
  }
  
  if (/^AXNT\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned.slice(4)}`;
  }

  // 4 raw digits
  if (/^\d{4}$/.test(cleaned)) {
    return `AXENT-${cleaned}`;
  }

  return cleaned;
}

/**
 * Searches registered candidates by AXNT key.
 */
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

export const SHORTLIST_STORAGE_KEY = 'codedna_codespark_shortlist';

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

export function generateRound2KeyForCandidate(cand: CodeSparkCandidate): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `AXENT-R2-${num}`;
}

export const ROUND1_CONCLUDED_STORAGE_KEY = 'codedna_codespark_round1_concluded';

export function isRound1ConcludedGlobally(): boolean {
  try {
    return localStorage.getItem(ROUND1_CONCLUDED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setRound1ConcludedGlobally(concluded: boolean): void {
  try {
    localStorage.setItem(ROUND1_CONCLUDED_STORAGE_KEY, concluded ? 'true' : 'false');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('codedna_codespark_concluded_updated', { detail: concluded }));
      window.dispatchEvent(new Event('storage'));
    }
    notifyCandidatesUpdated();
  } catch {}
}

export interface SmtpConfig {
  smtp_user: string;
  smtp_password: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_from_name?: string;
}

export const SMTP_CONFIG_STORAGE_KEY = 'codedna_codespark_smtp_config';

export function getStoredSmtpConfig(): SmtpConfig | null {
  try {
    const raw = localStorage.getItem(SMTP_CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    smtp_user: 'teamaxiogen@gmail.com',
    smtp_password: (import.meta as any).env?.VITE_SMTP_PASSWORD || '',
    smtp_from_name: 'Code Spark 2026 Examination Board'
  };
}

export function saveStoredSmtpConfig(config: SmtpConfig): void {
  try {
    localStorage.setItem(SMTP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export async function testSmtpConnection(
  config: SmtpConfig
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/codespark/test-smtp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp_user: config.smtp_user,
        smtp_password: config.smtp_password,
        smtp_host: config.smtp_host || 'smtp.gmail.com',
        smtp_port: config.smtp_port || 587
      })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: `Network / Gateway Error: ${err.message || String(err)}`
    };
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
  config: SmtpConfig,
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
    const res = await fetch('/api/codespark/send-emails/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp_user: config.smtp_user,
        smtp_password: config.smtp_password,
        smtp_host: config.smtp_host || 'smtp.gmail.com',
        smtp_port: config.smtp_port || 587,
        smtp_from_name: config.smtp_from_name || 'CodeSpark 2026 Examination Board',
        recipients
      })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      total: recipients.length,
      sent_count: 0,
      failed_count: recipients.length,
      sent: [],
      failed: recipients.map((r) => ({ email: r.email, reason: err.message || 'Dispatch error' })),
      error: err.message || 'Network error during email dispatch'
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

  // Aggregate highest attempt score per candidate across all labs / sittings
  const candidateScores = allCandidates.map((cand) => {
    const candRoll = (cand.rollNumber || '').trim().toUpperCase();
    const candEmail = (cand.email || '').trim().toLowerCase();
    const candKey = (cand.accessKey || '').trim().toUpperCase();

    const matchedAttempts = allAttempts.filter((att) => {
      const attRoll = (att.studentRoll || '').trim().toUpperCase();
      const attEmail = ((att as any).studentEmail || '').trim().toLowerCase();
      return (
        (candRoll && attRoll === candRoll) ||
        (candEmail && attEmail === candEmail) ||
        (attRoll === candKey)
      );
    });

    const targetExam = ensureCodeSparkAptitudeExam();
    const dynamicExamTotal = targetExam?.totalMarks || 0;

    let maxScore = cand.round1Score ?? 0;
    let maxTotal = cand.round1MaxScore ?? (dynamicExamTotal > 0 ? dynamicExamTotal : 0);
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

  // Sort descending by highest score
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
    // Cutoff mode
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

  saveCodeSparkCandidates(allCandidates);

  try {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(newlyShortlistedRolls));
  } catch {}

  setRound1ConcludedGlobally(true);

  return {
    shortlistedCount: newlyShortlistedRolls.length,
    candidates: allCandidates,
    shortlistedRolls: newlyShortlistedRolls
  };
}

export const LAB_OVERFLOW_STORAGE_KEY = 'codespark_lab_overflow_retake_enabled';
export const RETAKE_AUTHORIZED_ROLLS_KEY = 'codespark_round1_retake_rolls';

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
    const sparkExam = ensureCodeSparkAptitudeExam();
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

  // Ensure exam allows 2 attempts
  if (allow) {
    try {
      const exam = ensureCodeSparkAptitudeExam();
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
    const exam = ensureCodeSparkAptitudeExam();
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

/**
 * Searches registered candidates by either their Round 1 Access Key OR their Round 2 Email Key.
 */
export async function asyncLookupCandidateAny(rawKey: string): Promise<KeyLookupResult | null> {
  const local = lookupCandidateAny(rawKey);
  if (local) return local;
  await syncCandidatesFromCloud();
  return lookupCandidateAny(rawKey);
}

export function lookupCandidateAny(rawKey: string): KeyLookupResult | null {
  if (!rawKey) return null;
  const cleaned = rawKey.trim().toUpperCase().replace(/\s+/g, '');
  const all = getAllCodeSparkCandidates();
  const normalizedKey = normalizeCodeSparkKey(cleaned);

  // 1. Check if input matches a provisioned Round 2 key (e.g. AXENT-R2-XXXX, R2-XXXX, or digits)
  for (const c of all) {
    if (c.round2Key) {
      const cleanR2 = c.round2Key.trim().toUpperCase().replace(/\s+/g, '');
      const rawR2Digits = cleanR2.replace(/\D/g, '');
      const inputDigits = cleaned.replace(/\D/g, '');

      if (
        cleanR2 === cleaned ||
        cleanR2.replace('AXENT-', '') === cleaned ||
        (cleaned.includes('R2') && cleanR2.includes(cleaned)) ||
        (rawR2Digits.length >= 4 && inputDigits === rawR2Digits && cleaned.includes('R2'))
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

  // 2. Check standard Round 1 access key
  for (const c of all) {
    const cleanR1 = c.accessKey.trim().toUpperCase().replace(/\s+/g, '');
    const normR1 = normalizeCodeSparkKey(cleanR1);
    if (cleanR1 === cleaned || normR1 === normalizedKey) {
      const isShortlisted = Boolean(
        c.isShortlisted ||
        c.status === 'SHORTLISTED' ||
        isCandidateInShortlistStorage(c.rollNumber || c.accessKey)
      );
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

/**
 * Shortlists or un-shortlists a candidate for Round 2, auto-provisioning a dedicated Round 2 key.
 */
export function shortlistCandidateForRound2(
  candidateKeyOrRoll: string,
  shortlisted: boolean
): { candidate: CodeSparkCandidate; round2Key?: string } | null {
  const all = getAllCodeSparkCandidates();
  const clean = candidateKeyOrRoll.trim().toUpperCase();
  const cand = all.find(
    (c) =>
      c.accessKey.toUpperCase() === clean ||
      (c.rollNumber && c.rollNumber.toUpperCase() === clean) ||
      c.email.toUpperCase() === clean
  );
  if (!cand) return null;

  cand.isShortlisted = shortlisted;
  if (shortlisted) {
    cand.status = 'SHORTLISTED';
    if (!cand.round2Key) {
      cand.round2Key = generateRound2KeyForCandidate(cand);
    }
    cand.round2InvitedAt = Date.now();
  } else {
    cand.status = 'ROUND1_COMPLETED';
    cand.round2Key = undefined;
    cand.round2InvitedAt = undefined;
  }

  saveCodeSparkCandidates(all);

  // Synchronize shortlist array in localStorage
  const rolls = getShortlistedRolls();
  const rollId = (cand.rollNumber || cand.accessKey).toUpperCase();
  const nextRolls = shortlisted
    ? Array.from(new Set([...rolls, rollId]))
    : rolls.filter((r) => r !== rollId);
  try {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(nextRolls));
    window.dispatchEvent(new Event('storage'));
  } catch {}

  return { candidate: cand, round2Key: cand.round2Key };
}

/**
 * Generates an unallocated random AXNT-XXXX key.
 */
export function generateCodeSparkKey(existingKeys?: Set<string>): string {
  const set = existingKeys || new Set(getAllCodeSparkCandidates().map((c) => c.accessKey.toUpperCase()));
  let key = '';
  let attempts = 0;
  do {
    const num = Math.floor(1000 + Math.random() * 9000); // 1000 - 9999
    key = `AXENT-${num}`;
    attempts++;
  } while (set.has(key) && attempts < 10000);
  
  return key;
}

export interface CandidateImportPayload {
  name: string;
  email: string;
  rollNumber?: string;
  department?: string;
}

/**
 * Bulk imports candidates using ONLY name and email address, generates unique AXENT-XXXX keys for each,
 * and saves them into the CodeSpark private registry.
 */
export function importCodeSparkCandidates(
  records: CandidateImportPayload[],
  examId?: string
): CodeSparkCandidate[] {
  const current = getAllCodeSparkCandidates();
  const existingKeys = new Set(current.map((c) => c.accessKey.toUpperCase()));
  const existingEmails = new Map(current.map((c) => [c.email.trim().toLowerCase(), c]));

  const newlyCreated: CodeSparkCandidate[] = [];

  for (const item of records) {
    const cleanName = (item.name || '').trim();
    const cleanEmail = (item.email || '').trim().toLowerCase();
    if (!cleanName || !cleanEmail) continue;

    // If candidate with this email already has a key, update their info and preserve key
    if (existingEmails.has(cleanEmail)) {
      const existing = existingEmails.get(cleanEmail)!;
      existing.name = cleanName;
      if (examId) existing.examId = examId;
      newlyCreated.push(existing);
      continue;
    }

    const newKey = generateCodeSparkKey(existingKeys);
    existingKeys.add(newKey);

    const candidate: CodeSparkCandidate = {
      accessKey: newKey,
      name: cleanName,
      email: cleanEmail,
      rollNumber: item.rollNumber || cleanEmail.split('@')[0].toUpperCase(),
      department: item.department || 'Axent Enclave',
      examId: examId,
      status: 'REGISTERED',
      registeredAt: Date.now()
    };

    current.push(candidate);
    newlyCreated.push(candidate);
    existingEmails.set(cleanEmail, candidate);
  }

  saveCodeSparkCandidates(current);
  return newlyCreated;
}

/**
 * Parses raw text (CSV, TSV, or newline separated) taking only Name and Email address.
 * Format: Full Name, email@domain.com
 */
export function parseCandidateImportText(rawText: string): CandidateImportPayload[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results: CandidateImportPayload[] = [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.startsWith('name') ||
      lower.startsWith('full name') ||
      lower.startsWith('candidate') ||
      lower.startsWith('email')
    ) {
      continue;
    }

    const tokens = line.includes('\t')
      ? line.split('\t').map((t) => t.trim().replace(/^["']|["']$/g, ''))
      : line.split(',').map((t) => t.trim().replace(/^["']|["']$/g, ''));

    if (tokens.length === 0) continue;

    let name = '';
    let email = '';

    // If 2 tokens: Name, Email
    if (tokens.length === 2) {
      if (emailRegex.test(tokens[1])) {
        name = tokens[0];
        email = tokens[1].toLowerCase();
      } else if (emailRegex.test(tokens[0])) {
        email = tokens[0].toLowerCase();
        name = tokens[1];
      }
    } else {
      // Find the token that looks like an email address
      const emailIdx = tokens.findIndex((t) => emailRegex.test(t));
      if (emailIdx !== -1) {
        email = tokens[emailIdx].toLowerCase();
        const nonEmailTokens = tokens.filter((_, idx) => idx !== emailIdx);
        name = nonEmailTokens[0] || 'Candidate';
      } else if (tokens.length >= 2) {
        name = tokens[0];
        email = tokens[1].toLowerCase();
      }
    }

    if (name.trim() && email.trim()) {
      results.push({ name: name.trim(), email: email.trim() });
    }
  }

  return results;
}

export function setActiveCodeSparkCandidate(candidate: CodeSparkCandidate): void {
  try {
    localStorage.setItem(ACTIVE_CANDIDATE_KEY, JSON.stringify(candidate));
  } catch {}
}

export function getActiveCodeSparkCandidate(): CodeSparkCandidate | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CANDIDATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function onCodeSparkCandidatesChanged(callback: (candidates: CodeSparkCandidate[]) => void): () => void {
  const handler = () => callback(getAllCodeSparkCandidates());
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Ensures a valid CodeSpark Round 1 Aptitude Exam paper exists and is active.
 * If no paper is configured or the database is fresh, automatically seeds and publishes
 * the official 10-question Code Spark Aptitude assessment.
 */
export function ensureCodeSparkAptitudeExam(): MCQExamConfig {
  const all = getAllExams();

  // 1. Check if assigned ID exists and is valid
  const assignedId = typeof window !== 'undefined'
    ? localStorage.getItem('codedna_codespark_round1_exam_id')
    : null;
  if (assignedId) {
    const existing = all.find((e) => e.id === assignedId);
    if (existing) return existing;
  }

  // 2. Check if any isCodeSpark exam exists
  const sparkExam = all.find((e) => e.isCodeSpark);
  if (sparkExam) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('codedna_codespark_round1_exam_id', sparkExam.id);
    }
    return sparkExam;
  }

  // 3. Check if any published aptitude exam exists
  const aptExam = all.find(
    (e) =>
      e.status === 'PUBLISHED' &&
      (e.examCategory === 'Aptitude' ||
        (e.title || '').toLowerCase().includes('spark') ||
        (e.title || '').toLowerCase().includes('aptitude'))
  );
  if (aptExam) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('codedna_codespark_round1_exam_id', aptExam.id);
    }
    return aptExam;
  }

  // 4. Create and publish the official CodeSpark Round 1 Aptitude Exam with 10 questions
  const now = Date.now();
  const qList: Array<{
    text: string;
    topic: string;
    options: Array<{ text: string; isCorrect: boolean }>;
    explanation: string;
  }> = [
    {
      text: 'A train traveling at 72 km/h crosses a 200-meter platform in 22 seconds. What is the length of the train?',
      topic: 'Quantitative Aptitude - Speed, Time & Distance',
      options: [
        { text: '220 meters', isCorrect: false },
        { text: '240 meters', isCorrect: true },
        { text: '260 meters', isCorrect: false },
        { text: '280 meters', isCorrect: false }
      ],
      explanation: 'Speed = 72 * (5/18) = 20 m/s. Total distance in 22s = 20 * 22 = 440 m. Train length = 440 - 200 = 240 m.'
    },
    {
      text: 'Statements: All algorithms are logic. Some logic is verified.\nConclusions:\nI. Some algorithms are verified.\nII. All logic is algorithms.',
      topic: 'Logical Reasoning - Syllogism',
      options: [
        { text: 'Only Conclusion I follows', isCorrect: false },
        { text: 'Only Conclusion II follows', isCorrect: false },
        { text: 'Either Conclusion I or II follows', isCorrect: false },
        { text: 'Neither Conclusion I nor II follows', isCorrect: true }
      ],
      explanation: 'Since "some logic is verified" does not necessarily intersect with the subset of logic that contains algorithms, neither conclusion follows strictly.'
    },
    {
      text: 'If the price of a cloud compute license increases by 25%, by what percentage must a team reduce its runtime so that total cost remains unchanged?',
      topic: 'Quantitative Aptitude - Percentages',
      options: [
        { text: '16.67%', isCorrect: false },
        { text: '20.00%', isCorrect: true },
        { text: '22.50%', isCorrect: false },
        { text: '25.00%', isCorrect: false }
      ],
      explanation: 'Reduction = [r / (100 + r)] * 100 = [25 / 125] * 100 = 20%.'
    },
    {
      text: 'What is the tight asymptotic time complexity of the recurrence relation T(n) = 2T(n/2) + O(n)?',
      topic: 'Computational Logic - Algorithmic Complexity',
      options: [
        { text: 'O(n)', isCorrect: false },
        { text: 'O(n log n)', isCorrect: true },
        { text: 'O(n²)', isCorrect: false },
        { text: 'O(log n)', isCorrect: false }
      ],
      explanation: 'By Case 2 of the Master Theorem (a=2, b=2, f(n)=n, log_b(a) = 1), T(n) = Θ(n log n).'
    },
    {
      text: 'Find the missing number in the sequence: 4, 9, 25, 49, 121, 169, ?',
      topic: 'Analytical Reasoning - Number Series',
      options: [
        { text: '196', isCorrect: false },
        { text: '225', isCorrect: false },
        { text: '289', isCorrect: true },
        { text: '361', isCorrect: false }
      ],
      explanation: 'The sequence consists of squares of consecutive prime numbers: 2², 3², 5², 7², 11², 13², and next is 17² = 289.'
    },
    {
      text: 'Two independent 6-sided dice are rolled simultaneously. What is the probability that the sum of the dice is at least 10?',
      topic: 'Quantitative Aptitude - Probability',
      options: [
        { text: '1/12', isCorrect: false },
        { text: '1/9', isCorrect: false },
        { text: '1/6', isCorrect: true },
        { text: '1/4', isCorrect: false }
      ],
      explanation: 'Favorable pairs summing to >= 10: (4,6), (5,5), (5,6), (6,4), (6,5), (6,6) = 6 pairs. Probability = 6 / 36 = 1/6.'
    },
    {
      text: 'Engineer A builds a module in 12 hours, Engineer B in 6 hours. With Engineer C, all three complete it in 3 hours. How many hours would C take alone?',
      topic: 'Quantitative Aptitude - Time & Work',
      options: [
        { text: '8 hours', isCorrect: false },
        { text: '10 hours', isCorrect: false },
        { text: '12 hours', isCorrect: true },
        { text: '15 hours', isCorrect: false }
      ],
      explanation: 'Work rates: 1/12 + 1/6 + 1/C = 1/3 => 3/12 + 1/C = 4/12 => 1/C = 1/12 => C takes 12 hours.'
    },
    {
      text: 'From starting node A, a rover moves 15m North, turns right and moves 20m, turns right again and moves 15m, then turns left and moves 10m. What is the direct distance from node A?',
      topic: 'Logical Reasoning - Direction Sense',
      options: [
        { text: '25 meters', isCorrect: false },
        { text: '30 meters', isCorrect: true },
        { text: '35 meters', isCorrect: false },
        { text: '40 meters', isCorrect: false }
      ],
      explanation: 'North 15, East 20, South 15 brings rover to 20m East of origin. An additional 10m East brings total displacement to 30m East.'
    },
    {
      text: 'If in a secure cipher "BINARY" is encoded as "DMPCPA" (+2, -1, +2, -1, +2, -1), what is the encryption of "KERNEL"?',
      topic: 'Logical Reasoning - Coding & Decoding',
      options: [
        { text: 'MDTMGK', isCorrect: true },
        { text: 'MDUMFK', isCorrect: false },
        { text: 'LDTMGK', isCorrect: false },
        { text: 'MCTMFK', isCorrect: false }
      ],
      explanation: 'K(+2)=M, E(-1)=D, R(+2)=T, N(-1)=M, E(+2)=G, L(-1)=K => MDTMGK.'
    },
    {
      text: 'A full binary tree has 15 total vertices. Exactly how many leaf (terminal) nodes does it contain?',
      topic: 'Computational Logic - Graph & Tree Properties',
      options: [
        { text: '7 leaves', isCorrect: false },
        { text: '8 leaves', isCorrect: true },
        { text: '9 leaves', isCorrect: false },
        { text: '10 leaves', isCorrect: false }
      ],
      explanation: 'In a full binary tree with N nodes, the number of leaf nodes L = (N + 1) / 2 = 16 / 2 = 8.'
    }
  ];

  const savedQuestionIds: string[] = [];

  for (let i = 0; i < qList.length; i++) {
    const qItem = qList[i];
    const qId = `codespark-q-${i + 1}`;
    const questionObj: MCQQuestion = {
      id: qId,
      text: qItem.text,
      subject: 'General Aptitude & Reasoning',
      topic: qItem.topic,
      difficulty: 'MEDIUM',
      marks: 2,
      negativeMarks: 0,
      explanation: qItem.explanation,
      status: 'PUBLISHED',
      tags: ['codespark', 'aptitude', 'logic'],
      options: qItem.options.map((opt, optIdx) => ({
        id: `opt-${qId}-${optIdx + 1}`,
        text: opt.text,
        isCorrect: opt.isCorrect
      })),
      createdAt: now,
      updatedAt: now,
      createdBy: 'CodeSpark System'
    };
    saveQuestion(questionObj);
    savedQuestionIds.push(qId);
  }

  const exam: MCQExamConfig = {
    id: 'codespark-round1-aptitude',
    title: 'Code Spark 2026: General Aptitude & Reasoning',
    description: 'Official Round 1 Aptitude & Logical Reasoning assessment for Code Spark 2026 candidates.',
    instructions: 'Answer all 10 objective questions. Each question carries 2 marks. Full-screen proctoring and anti-cheating protocols are strictly enforced.',
    subject: 'General Aptitude & Reasoning',
    topic: 'Cognitive & Analytical Assessment',
    examCategory: 'Aptitude',
    durationMinutes: 45,
    totalMarks: 20,
    questionCount: savedQuestionIds.length,
    questionIds: savedQuestionIds,
    shuffleQuestions: true,
    shuffleOptions: true,
    negativeMarkingEnabled: false,
    allowReview: true,
    showExplanationsAfterSubmit: true,
    maxAttempts: 1,
    isCodeSpark: true,
    isPrivate: true,
    status: 'PUBLISHED',
    createdAt: now,
    updatedAt: now,
    createdBy: 'CodeSpark System'
  };

  saveExam(exam);
  if (typeof window !== 'undefined') {
    localStorage.setItem('codedna_codespark_round1_exam_id', exam.id);
  }

  return exam;
}
