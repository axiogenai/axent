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

export async function pushCandidatesToCloud(candidates: CodeSparkCandidate[]): Promise<boolean> {
  try {
    if (!supabase) return false;
    const deduped = deduplicateCandidates(candidates);

    let currentConfig: Partial<CodeSparkSystemConfig> = {};

    // 1. Try reading existing config from candidate_stations (100% public read-write for anon and authenticated)
    try {
      const { data: stationRec } = await supabase
        .from('candidate_stations')
        .select('code, student')
        .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
        .maybeSingle();

      if (stationRec) {
        if (stationRec.student && typeof stationRec.student === 'object' && Object.keys(stationRec.student).length > 0) {
          currentConfig = stationRec.student as Partial<CodeSparkSystemConfig>;
        } else if (stationRec.code) {
          currentConfig = JSON.parse(stationRec.code);
        }
      }
    } catch {}

    // 2. Fallback read from mcq_exams if needed
    if (!currentConfig.activeExamId) {
      try {
        const { data: existing } = await supabase
          .from('mcq_exams')
          .select('instructions')
          .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
          .maybeSingle();

        if (existing?.instructions) {
          currentConfig = JSON.parse(existing.instructions);
        }
      } catch {}
    }

    const assignedId = typeof window !== 'undefined'
      ? localStorage.getItem('codedna_codespark_round1_exam_id')
      : null;
    const isConcluded = typeof window !== 'undefined'
      ? localStorage.getItem(ROUND1_CONCLUDED_STORAGE_KEY) === 'true'
      : false;

    const payload: CodeSparkSystemConfig = {
      activeExamId: currentConfig.activeExamId || assignedId || null,
      shortlistMode: currentConfig.shortlistMode || 'cutoff',
      shortlistValue: currentConfig.shortlistValue || 12,
      manualShortlistRolls: currentConfig.manualShortlistRolls || getShortlistedRolls(),
      isConcluded: currentConfig.isConcluded !== undefined ? currentConfig.isConcluded : isConcluded,
      candidates: deduped,
      updatedAt: Date.now()
    };

    // 1. Save to candidate_stations (universally accessible by all phones and stations)
    try {
      await supabase
        .from('candidate_stations')
        .upsert({
          id: CODESPARK_SYSTEM_CONFIG_ID,
          lab_id: 'SYSTEM_CONFIG',
          station_number: 'CONFIG',
          status: 'CONFIG',
          code: JSON.stringify(payload),
          student: payload,
          last_updated_timestamp: Date.now()
        });
    } catch (csErr) {
      console.warn('[CodeSpark] candidate_stations upsert warning:', csErr);
    }

    // 2. Also save to mcq_exams with status: 'PUBLISHED'
    try {
      await supabase
        .from('mcq_exams')
        .upsert({
          id: CODESPARK_SYSTEM_CONFIG_ID,
          title: 'CodeSpark System Configuration & Roster',
          description: 'Cloud configuration for CodeSpark Active Paper, Shortlist Criteria, and Registered Candidates',
          instructions: JSON.stringify(payload),
          subject: 'CodeSpark',
          topic: 'System',
          status: 'PUBLISHED',
          duration_minutes: 0,
          total_marks: 0,
          question_count: 0,
          created_at: Date.now(),
          updated_at: Date.now()
        });
    } catch (meErr) {
      console.warn('[CodeSpark] mcq_exams upsert warning:', meErr);
    }

    return true;
  } catch (err) {
    console.warn('[CodeSpark Cloud] pushCandidatesToCloud failed:', err);
    return false;
  }
}

export async function syncCandidatesFromCloud(): Promise<CodeSparkCandidate[]> {
  try {
    if (!supabase) return getAllCodeSparkCandidates();

    let config: CodeSparkSystemConfig | null = null;

    // 1. Read from candidate_stations first (100% public read-write for anon and authenticated)
    try {
      const { data: stationRec, error: stationErr } = await supabase
        .from('candidate_stations')
        .select('code, student')
        .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
        .maybeSingle();

      if (!stationErr && stationRec) {
        if (stationRec.student && typeof stationRec.student === 'object' && Array.isArray((stationRec.student as any).candidates)) {
          config = stationRec.student as CodeSparkSystemConfig;
        } else if (stationRec.code) {
          const parsed = JSON.parse(stationRec.code);
          if (parsed && Array.isArray(parsed.candidates)) {
            config = parsed;
          }
        }
      }
    } catch (e) {
      console.warn('[CodeSpark] candidate_stations read error:', e);
    }

    // 2. If not found in candidate_stations, fallback to mcq_exams
    if (!config) {
      try {
        const { data: record, error } = await supabase
          .from('mcq_exams')
          .select('instructions')
          .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
          .maybeSingle();

        if (!error && record?.instructions) {
          const parsed = JSON.parse(record.instructions);
          if (parsed && Array.isArray(parsed.candidates)) {
            config = parsed;
          }
        }
      } catch (e) {
        console.warn('[CodeSpark] mcq_exams read error:', e);
      }
    }

    if (config && Array.isArray(config.candidates)) {
      if (config.activeExamId && typeof window !== 'undefined') {
        localStorage.setItem('codedna_codespark_round1_exam_id', config.activeExamId);
      }
      if (config.shortlistMode && typeof window !== 'undefined') {
        localStorage.setItem('codedna_codespark_shortlist_mode', config.shortlistMode);
        localStorage.setItem('codedna_codespark_shortlist_value', String(config.shortlistValue || 12));
      }
      if (Array.isArray(config.manualShortlistRolls) && typeof window !== 'undefined') {
        localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(config.manualShortlistRolls));
      }
      if (config.isConcluded !== undefined && typeof window !== 'undefined') {
        localStorage.setItem(ROUND1_CONCLUDED_STORAGE_KEY, config.isConcluded ? 'true' : 'false');
      }

      const local = getAllCodeSparkCandidates();
      const combined = deduplicateCandidates([...local, ...config.candidates]);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: combined }));
          window.dispatchEvent(new Event('storage'));
        }
      } catch {}

      return combined;
    }

    return getAllCodeSparkCandidates();
  } catch (err) {
    console.warn('[CodeSpark Cloud] syncCandidatesFromCloud error:', err);
    return getAllCodeSparkCandidates();
  }
}

export async function saveActiveCodeSparkPaper(
  examId: string,
  criteria?: { mode?: 'cutoff' | 'top_n' | 'manual'; value?: number; manualRolls?: string[] }
): Promise<boolean> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('codedna_codespark_round1_exam_id', examId);
      if (criteria?.mode) localStorage.setItem('codedna_codespark_shortlist_mode', criteria.mode);
      if (criteria?.value) localStorage.setItem('codedna_codespark_shortlist_value', String(criteria.value));
      if (criteria?.manualRolls) localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(criteria.manualRolls));
    }

    if (!supabase) return true;

    let currentConfig: Partial<CodeSparkSystemConfig> = {};

    // Read current config
    try {
      const { data: stationRec } = await supabase
        .from('candidate_stations')
        .select('code, student')
        .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
        .maybeSingle();

      if (stationRec) {
        if (stationRec.student && typeof stationRec.student === 'object' && Object.keys(stationRec.student).length > 0) {
          currentConfig = stationRec.student as Partial<CodeSparkSystemConfig>;
        } else if (stationRec.code) {
          currentConfig = JSON.parse(stationRec.code);
        }
      }
    } catch {}

    if (!currentConfig.candidates) {
      try {
        const { data: existing } = await supabase
          .from('mcq_exams')
          .select('instructions')
          .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
          .maybeSingle();

        if (existing?.instructions) {
          currentConfig = JSON.parse(existing.instructions);
        }
      } catch {}
    }

    const updatedConfig: CodeSparkSystemConfig = {
      activeExamId: examId,
      shortlistMode: criteria?.mode || currentConfig.shortlistMode || 'cutoff',
      shortlistValue: criteria?.value !== undefined ? criteria.value : (currentConfig.shortlistValue || 12),
      manualShortlistRolls: criteria?.manualRolls || currentConfig.manualShortlistRolls || getShortlistedRolls(),
      isConcluded: currentConfig.isConcluded || false,
      candidates: currentConfig.candidates || getAllCodeSparkCandidates(),
      updatedAt: Date.now()
    };

    // 1. Save to candidate_stations
    try {
      await supabase
        .from('candidate_stations')
        .upsert({
          id: CODESPARK_SYSTEM_CONFIG_ID,
          lab_id: 'SYSTEM_CONFIG',
          station_number: 'CONFIG',
          status: 'CONFIG',
          code: JSON.stringify(updatedConfig),
          student: updatedConfig,
          last_updated_timestamp: Date.now()
        });
    } catch {}

    // 2. Save to mcq_exams with status: 'PUBLISHED'
    try {
      await supabase
        .from('mcq_exams')
        .upsert({
          id: CODESPARK_SYSTEM_CONFIG_ID,
          title: 'CodeSpark System Configuration & Roster',
          description: 'Cloud configuration for CodeSpark Active Paper, Shortlist Criteria, and Registered Candidates',
          instructions: JSON.stringify(updatedConfig),
          subject: 'CodeSpark',
          topic: 'System',
          status: 'PUBLISHED',
          duration_minutes: 0,
          total_marks: 0,
          question_count: 0,
          created_at: Date.now(),
          updated_at: Date.now()
        });
    } catch {}

    // Mark target exam as isCodeSpark: true in Supabase
    const all = getAllExams();
    for (const ex of all) {
      if (ex.id === examId) {
        ex.isCodeSpark = true;
        saveExam(ex);
        void saveExamToCloud(ex);
      } else if (ex.isCodeSpark) {
        ex.isCodeSpark = false;
        saveExam(ex);
        void saveExamToCloud(ex);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('codedna_codespark_config_updated', { detail: updatedConfig }));
    }

    return true;
  } catch (err) {
    console.error('[CodeSpark] saveActiveCodeSparkPaper failed:', err);
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

  if (supabase) {
    try {
      let activeExamId: string | null = null;

      // 1. Check candidate_stations
      try {
        const { data: stRec } = await supabase
          .from('candidate_stations')
          .select('code, student')
          .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
          .maybeSingle();

        if (stRec) {
          const cfg = (stRec.student && typeof stRec.student === 'object' && (stRec.student as any).activeExamId)
            ? (stRec.student as any)
            : (stRec.code ? JSON.parse(stRec.code) : null);
          if (cfg?.activeExamId) {
            activeExamId = cfg.activeExamId;
          }
        }
      } catch {}

      // 2. Check mcq_exams
      if (!activeExamId) {
        try {
          const { data: configRow } = await supabase
            .from('mcq_exams')
            .select('instructions')
            .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
            .maybeSingle();

          if (configRow?.instructions) {
            const parsed = JSON.parse(configRow.instructions);
            if (parsed?.activeExamId) {
              activeExamId = parsed.activeExamId;
            }
          }
        } catch {}
      }

      if (activeExamId) {
        const { data: row } = await supabase
          .from('mcq_exams')
          .select('*')
          .eq('id', activeExamId)
          .maybeSingle();

        if (row) {
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
          if (typeof window !== 'undefined') {
            localStorage.setItem('codedna_codespark_round1_exam_id', mapped.id);
          }
          saveExam(mapped);
          return mapped;
        }
      }

      const { data: anyPublished } = await supabase
        .from('mcq_exams')
        .select('*')
        .neq('id', CODESPARK_SYSTEM_CONFIG_ID)
        .eq('status', 'PUBLISHED')
        .limit(2);

      if (anyPublished && anyPublished.length === 1) {
        const row = anyPublished[0];
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
        saveExam(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[CodeSpark] asyncGetCodeSparkActiveExam error:', err);
    }
  }

  return null;
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

export function generateRound2KeyForCandidate(cand: CodeSparkCandidate): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `AXENT-R2-${num}`;
}

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

    // Async push to cloud
    if (supabase) {
      void (async () => {
        try {
          const { data: stRec } = await supabase
            .from('candidate_stations')
            .select('code, student')
            .eq('id', CODESPARK_SYSTEM_CONFIG_ID)
            .maybeSingle();

          if (stRec) {
            let cfg = (stRec.student && typeof stRec.student === 'object') ? stRec.student : (stRec.code ? JSON.parse(stRec.code) : {});
            cfg.isConcluded = concluded;
            cfg.updatedAt = Date.now();
            await supabase.from('candidate_stations').upsert({
              id: CODESPARK_SYSTEM_CONFIG_ID,
              lab_id: 'SYSTEM_CONFIG',
              station_number: 'CONFIG',
              status: 'CONFIG',
              code: JSON.stringify(cfg),
              student: cfg,
              last_updated_timestamp: Date.now()
            });
          }
        } catch {}
      })();
    }
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
  try {
    const raw = localStorage.getItem(SMTP_CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    smtp_user: 'teamaxiogen@gmail.com',
    smtp_password: (import.meta as any).env?.VITE_SMTP_PASSWORD || 'qtdpejtmmsuflijo',
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
  const payload = {
    smtp_user: config.smtp_user,
    smtp_password: config.smtp_password,
    smtp_host: config.smtp_host || 'smtp.gmail.com',
    smtp_port: config.smtp_port || 587
  };

  // Try relative Vercel serverless endpoint first
  try {
    const res = await fetch('/api/codespark/test-smtp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (res.ok) return data;
    } catch {}
  } catch {}

  // Fallback to Render backend
  try {
    const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || 'https://axent-b0wl.onrender.com';
    const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/codespark/test-smtp/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: `SMTP Connection Error: ${err.message || String(err)}`
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
  const payload = {
    smtp_user: config.smtp_user,
    smtp_password: config.smtp_password,
    smtp_host: config.smtp_host || 'smtp.gmail.com',
    smtp_port: config.smtp_port || 587,
    smtp_from_name: config.smtp_from_name || 'CodeSpark 2026 Examination Board',
    recipients
  };

  // Try relative Vercel serverless endpoint first
  try {
    const res = await fetch('/api/codespark/send-emails/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (res.ok) return data;
    } catch {}
  } catch {}

  // Fallback to Render backend
  try {
    const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || 'https://axent-b0wl.onrender.com';
    const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/codespark/send-emails/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
  const inputDigits = cleaned.replace(/\D/g, '');
  const isConcluded = isRound1ConcludedGlobally();

  // 1. First check dedicated Round 2 keys
  for (const c of all) {
    if (c.round2Key) {
      const cleanR2 = c.round2Key.trim().toUpperCase().replace(/\s+/g, '');
      const rawR2Digits = cleanR2.replace(/\D/g, '');

      if (
        cleanR2 === cleaned ||
        cleanR2.replace('AXENT-', '') === cleaned ||
        cleanR2.replace('AXENT-R2-', '') === cleaned ||
        (cleaned.includes('R2') && cleanR2.includes(cleaned)) ||
        (rawR2Digits.length >= 4 && inputDigits === rawR2Digits) ||
        (inputDigits.length >= 4 && rawR2Digits.endsWith(inputDigits))
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

  // 2. Check standard Round 1 keys
  for (const c of all) {
    const cleanR1 = c.accessKey.trim().toUpperCase().replace(/\s+/g, '');
    const normR1 = normalizeCodeSparkKey(cleanR1);
    const candDigits = cleanR1.replace(/\D/g, '');

    if (
      cleanR1 === cleaned ||
      normR1 === normalizedKey ||
      cleanR1 === normalizedKey ||
      normR1 === cleaned ||
      (inputDigits.length === 4 && candDigits === inputDigits)
    ) {
      const isShortlisted = Boolean(
        c.isShortlisted ||
        c.status === 'SHORTLISTED' ||
        isCandidateInShortlistStorage(c.rollNumber || c.accessKey)
      );

      // If Round 1 is finished/concluded and candidate is shortlisted, automatically route to Round 2!
      const targetRound = (isShortlisted && isConcluded) ? 'round2' : 'round1';

      return {
        candidate: c,
        targetRound,
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
  let key = '';
  do {
    const pin = Math.floor(1000 + Math.random() * 9000);
    key = `AXENT-${pin}`;
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
    let key = '';
    do {
      const pin = Math.floor(1000 + Math.random() * 9000);
      key = `AXENT-${pin}`;
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
