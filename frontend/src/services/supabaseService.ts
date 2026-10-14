import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MCQQuestion, MCQExamConfig, MCQAttempt } from '../types/mcq';
import { CandidateStation, CollegeLabInfo } from '../types/dna';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jswcwixeoilxuhbzojee.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzd2N3aXhlb2lseHVoYnpvamVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NTU0OTMsImV4cCI6MjEwNzUzMTQ5M30.A73oIpxR0FdrK5GOb6zeEh-xH0NY3RuJoQY5hngOrew';
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key if available for administrative write access, else anon key
const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

export const supabase: SupabaseClient = createClient(SUPABASE_URL, keyToUse, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

export function isSupabaseConnected(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ── MCQ QUESTIONS SYNC ────────────────────────────────────────────────────────

export async function fetchQuestionsFromCloud(): Promise<MCQQuestion[] | null> {
  try {
    const { data, error } = await supabase.from('mcq_questions').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('[Supabase] Failed to fetch questions (table may not exist yet):', error.message);
      return null;
    }
    if (!data) return null;

    return data.map((row: any): MCQQuestion => ({
      id: row.id,
      text: row.text,
      options: row.options || [],
      subject: row.subject,
      topic: row.topic,
      difficulty: row.difficulty,
      marks: Number(row.marks) || 1,
      negativeMarks: Number(row.negative_marks) || 0,
      explanation: row.explanation || '',
      status: row.status,
      tags: row.tags || [],
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      createdBy: row.created_by || 'admin',
      bankGroup: row.bank_group || '',
    }));
  } catch (err) {
    console.warn('[Supabase] Error in fetchQuestionsFromCloud:', err);
    return null;
  }
}

export async function saveQuestionToCloud(q: MCQQuestion): Promise<boolean> {
  try {
    const row = {
      id: q.id,
      text: q.text,
      options: q.options,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks,
      negative_marks: q.negativeMarks,
      explanation: q.explanation,
      status: q.status,
      tags: q.tags,
      created_at: q.createdAt,
      updated_at: q.updatedAt,
      created_by: q.createdBy,
      bank_group: q.bankGroup || '',
    };
    const { error } = await supabase.from('mcq_questions').upsert(row);
    if (error) {
      console.warn('[Supabase] Question upsert warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Failed to sync question:', err);
    return false;
  }
}

export async function deleteQuestionFromCloud(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('mcq_questions').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

// ── MCQ EXAMS SYNC ────────────────────────────────────────────────────────────

export async function fetchExamsFromCloud(): Promise<MCQExamConfig[] | null> {
  try {
    const { data, error } = await supabase.from('mcq_exams').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('[Supabase] Failed to fetch exams:', error.message);
      return null;
    }
    if (!data) return null;

    return data.map((row: any): MCQExamConfig => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      instructions: row.instructions || '',
      subject: row.subject || '',
      topic: row.topic || '',
      examCategory: row.exam_category || 'Internal Assessment (CIE)',
      durationMinutes: Number(row.duration_minutes) || 30,
      startTime: row.start_time ? Number(row.start_time) : undefined,
      endTime: row.end_time ? Number(row.end_time) : undefined,
      totalMarks: Number(row.total_marks) || 0,
      questionCount: Number(row.question_count) || 10,
      questionIds: row.question_ids || [],
      shuffleQuestions: Boolean(row.shuffle_questions),
      shuffleOptions: Boolean(row.shuffle_options),
      negativeMarkingEnabled: Boolean(row.negative_marking_enabled),
      allowReview: Boolean(row.allow_review),
      showExplanationsAfterSubmit: Boolean(row.show_explanations_after_submit),
      maxAttempts: Number(row.max_attempts) || 1,
      status: row.status,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      createdBy: row.created_by || 'admin',
      publishedAt: row.published_at ? Number(row.published_at) : undefined,
    }));
  } catch (err) {
    console.warn('[Supabase] Error in fetchExamsFromCloud:', err);
    return null;
  }
}

export async function saveExamToCloud(e: MCQExamConfig): Promise<boolean> {
  try {
    const row = {
      id: e.id,
      title: e.title,
      description: e.description || '',
      instructions: e.instructions || '',
      subject: e.subject || '',
      topic: e.topic || '',
      exam_category: e.examCategory,
      duration_minutes: e.durationMinutes,
      start_time: e.startTime || null,
      end_time: e.endTime || null,
      total_marks: e.totalMarks,
      question_count: e.questionCount,
      question_ids: e.questionIds,
      shuffle_questions: e.shuffleQuestions,
      shuffle_options: e.shuffleOptions,
      negative_marking_enabled: e.negativeMarkingEnabled,
      allow_review: e.allowReview,
      show_explanations_after_submit: e.showExplanationsAfterSubmit,
      max_attempts: e.maxAttempts,
      status: e.status,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
      created_by: e.createdBy,
      published_at: e.publishedAt || null,
    };
    const { error } = await supabase.from('mcq_exams').upsert(row);
    if (error) {
      console.warn('[Supabase] Exam upsert warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Failed to sync exam:', err);
    return false;
  }
}

export async function deleteExamFromCloud(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('mcq_exams').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

// ── MCQ ATTEMPTS SYNC ─────────────────────────────────────────────────────────

export async function fetchAttemptsFromCloud(): Promise<MCQAttempt[] | null> {
  try {
    const { data, error } = await supabase.from('mcq_attempts').select('*').order('start_time', { ascending: false });
    if (error) {
      console.warn('[Supabase] Failed to fetch attempts:', error.message);
      return null;
    }
    if (!data) return null;

    return data.map((row: any): MCQAttempt => ({
      id: row.id,
      examId: row.exam_id,
      examTitle: row.exam_title,
      studentName: row.student_name,
      studentRoll: row.student_roll,
      studentDept: row.student_dept || '',
      studentSem: row.student_sem || '',
      studentDiv: row.student_div || 'A',
      startTime: Number(row.start_time),
      deadline: Number(row.deadline),
      submitTime: row.submit_time ? Number(row.submit_time) : undefined,
      status: row.status,
      assignedQuestions: row.assigned_questions || [],
      answers: row.answers || {},
      score: row.score !== null ? Number(row.score) : undefined,
      maxScore: Number(row.max_score) || 0,
      correctCount: row.correct_count !== null ? Number(row.correct_count) : undefined,
      wrongCount: row.wrong_count !== null ? Number(row.wrong_count) : undefined,
      unansweredCount: row.unanswered_count !== null ? Number(row.unanswered_count) : undefined,
      percentageScore: row.percentage_score !== null ? Number(row.percentage_score) : undefined,
      gradedAt: row.graded_at ? Number(row.graded_at) : undefined,
      tabSwitchCount: Number(row.tab_switch_count) || 0,
      unfocusedSeconds: Number(row.unfocused_seconds) || 0,
      infractionLog: row.infraction_log || [],
    }));
  } catch (err) {
    console.warn('[Supabase] Error in fetchAttemptsFromCloud:', err);
    return null;
  }
}

export async function saveAttemptToCloud(a: MCQAttempt): Promise<boolean> {
  try {
    const row = {
      id: a.id,
      exam_id: a.examId,
      exam_title: a.examTitle,
      student_name: a.studentName,
      student_roll: a.studentRoll,
      student_dept: a.studentDept,
      student_sem: a.studentSem,
      student_div: a.studentDiv || 'A',
      start_time: a.startTime,
      deadline: a.deadline,
      submit_time: a.submitTime || null,
      status: a.status,
      assigned_questions: a.assignedQuestions,
      answers: a.answers,
      score: a.score !== undefined ? a.score : null,
      max_score: a.maxScore,
      correct_count: a.correctCount !== undefined ? a.correctCount : null,
      wrong_count: a.wrongCount !== undefined ? a.wrongCount : null,
      unanswered_count: a.unansweredCount !== undefined ? a.unansweredCount : null,
      percentage_score: a.percentageScore !== undefined ? a.percentageScore : null,
      graded_at: a.gradedAt || null,
      tab_switch_count: a.tabSwitchCount,
      unfocused_seconds: a.unfocusedSeconds,
      infraction_log: a.infractionLog,
    };
    const { error } = await supabase.from('mcq_attempts').upsert(row);
    if (error) {
      console.warn('[Supabase] Attempt upsert warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Failed to sync attempt:', err);
    return false;
  }
}

// ── CANDIDATE STATIONS (CCTV) SYNC ───────────────────────────────────────────

export async function saveStationToCloud(station: CandidateStation): Promise<boolean> {
  try {
    const row = {
      id: station.id,
      lab_id: station.labId,
      lab_name: station.labName || '',
      station_number: station.stationNumber,
      ip_address: station.ipAddress || '',
      student: station.student,
      language: station.language || 'Python',
      code: station.code || '',
      metrics: station.metrics || {},
      status: station.status,
      integrity_status: station.integrityStatus,
      cheating_risk: station.cheatingRisk,
      marks: station.marks || null,
      compiler_result: station.compilerResult || null,
      analysis_report: station.analysisReport || null,
      screen_image_data: station.screenImageData || null,
      has_live_screen_stream: station.hasLiveScreenStream || false,
      active_line_number: station.activeLineNumber || null,
      last_terminal_output: station.lastTerminalOutput || null,
      is_locked_by_proctor: station.isLockedByProctor || false,
      proctor_warning_message: station.proctorWarningMessage || null,
      tab_switch_violations: station.tabSwitchViolations || 0,
      unfocused_time_seconds: station.unfocusedTimeSeconds || 0,
      infraction_history: station.infractionHistory || [],
      last_active: station.lastActive || 'Just now',
      last_updated_timestamp: station.lastUpdatedTimestamp || Date.now(),
      exam_mode: station.examMode || 'CODING',
      mcq_progress: station.mcqProgress || null,
    };
    const { error } = await supabase.from('candidate_stations').upsert(row);
    if (error) {
      console.warn('[Supabase] Station upsert warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Failed to sync station:', err);
    return false;
  }
}

export async function fetchStationsFromCloud(labId?: string): Promise<CandidateStation[] | null> {
  try {
    let query = supabase.from('candidate_stations').select('*').order('last_updated_timestamp', { ascending: false });
    if (labId && labId !== 'all') {
      query = query.eq('lab_id', labId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[Supabase] Failed to fetch stations:', error.message);
      return null;
    }
    if (!data) return null;

    return data.map((row: any): CandidateStation => ({
      id: row.id,
      labId: row.lab_id,
      labName: row.lab_name,
      stationNumber: row.station_number,
      ipAddress: row.ip_address,
      student: row.student,
      language: row.language,
      code: row.code,
      metrics: row.metrics,
      status: row.status,
      integrityStatus: row.integrity_status,
      cheatingRisk: row.cheating_risk,
      marks: row.marks,
      compilerResult: row.compiler_result,
      analysisReport: row.analysis_report,
      screenImageData: row.screen_image_data,
      hasLiveScreenStream: row.has_live_screen_stream,
      activeLineNumber: row.active_line_number,
      lastTerminalOutput: row.last_terminal_output,
      isLockedByProctor: row.is_locked_by_proctor,
      proctorWarningMessage: row.proctor_warning_message,
      tabSwitchViolations: row.tab_switch_violations,
      unfocusedTimeSeconds: row.unfocused_time_seconds,
      infractionHistory: row.infraction_history,
      lastActive: row.last_active,
      lastUpdatedTimestamp: Number(row.last_updated_timestamp),
      examMode: row.exam_mode || 'CODING',
      mcqProgress: row.mcq_progress,
    }));
  } catch (err) {
    console.warn('[Supabase] Error in fetchStationsFromCloud:', err);
    return null;
  }
}

export async function updateStationLockInCloud(
  stationId: string,
  isLocked: boolean,
  warningMessage?: string,
  labId?: string
): Promise<boolean> {
  try {
    const patch: any = { is_locked_by_proctor: isLocked };
    if (warningMessage !== undefined) {
      patch.proctor_warning_message = warningMessage;
    }

    if (stationId === 'all') {
      let query = supabase.from('candidate_stations').update(patch);
      if (labId && labId !== 'all') {
        query = query.eq('lab_id', labId);
      } else {
        query = query.neq('id', '');
      }
      const { error } = await query;
      return !error;
    } else {
      const { error } = await supabase.from('candidate_stations').update(patch).eq('id', stationId);
      return !error;
    }
  } catch (err) {
    console.warn('[Supabase] Failed to update station lock in cloud:', err);
    return false;
  }
}

export async function updateStationWarningInCloud(
  stationId: string,
  message: string,
  labId?: string
): Promise<boolean> {
  try {
    const patch = { proctor_warning_message: message };
    if (stationId === 'all') {
      let query = supabase.from('candidate_stations').update(patch);
      if (labId && labId !== 'all') {
        query = query.eq('lab_id', labId);
      } else {
        query = query.neq('id', '');
      }
      const { error } = await query;
      return !error;
    } else {
      const { error } = await supabase.from('candidate_stations').update(patch).eq('id', stationId);
      return !error;
    }
  } catch (err) {
    console.warn('[Supabase] Failed to send warning in cloud:', err);
    return false;
  }
}

export async function fetchSingleStationLockStatus(
  stationId: string
): Promise<{ isLocked: boolean; warningMessage?: string } | null> {
  try {
    const { data, error } = await supabase
      .from('candidate_stations')
      .select('is_locked_by_proctor, proctor_warning_message')
      .eq('id', stationId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      isLocked: Boolean(data.is_locked_by_proctor),
      warningMessage: data.proctor_warning_message || undefined
    };
  } catch {
    return null;
  }
}

export function subscribeToCloudStations(onStationChange: (payload: any) => void): () => void {
  try {
    const channel = supabase
      .channel('candidate_stations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidate_stations' },
        (payload) => {
          onStationChange(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[Supabase] Realtime subscription failed:', err);
    return () => {};
  }
}

export function subscribeToCloudExams(onExamChange: (payload: any) => void): () => void {
  try {
    const channel = supabase
      .channel('mcq_exams_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mcq_exams' },
        (payload) => {
          onExamChange(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[Supabase] Realtime exams subscription failed:', err);
    return () => {};
  }
}

export function subscribeToCloudAttempts(onAttemptChange: (payload: any) => void): () => void {
  try {
    const channel = supabase
      .channel('mcq_attempts_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mcq_attempts' },
        (payload) => {
          onAttemptChange(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[Supabase] Realtime attempts subscription failed:', err);
    return () => {};
  }
}

// ── COLLEGE LABS SYNC ─────────────────────────────────────────────────────────

export async function fetchCollegeLabsFromCloud(): Promise<CollegeLabInfo[] | null> {
  try {
    const { data, error } = await supabase.from('college_labs').select('*').order('lab_id', { ascending: true });
    if (error) {
      console.warn('[Supabase] Failed to fetch labs:', error.message);
      return null;
    }
    if (!data) return null;

    return data.map((row: any): CollegeLabInfo => ({
      labId: row.lab_id,
      labCode: row.lab_code,
      labName: row.lab_name,
      department: row.department,
      block: row.block,
      totalStations: Number(row.total_stations) || 40,
      invigilatorName: row.invigilator_name || '',
    }));
  } catch (err) {
    console.warn('[Supabase] Error in fetchCollegeLabsFromCloud:', err);
    return null;
  }
}

export async function saveCollegeLabToCloud(lab: CollegeLabInfo): Promise<boolean> {
  try {
    const row = {
      lab_id: lab.labId,
      lab_code: lab.labCode,
      lab_name: lab.labName,
      department: lab.department,
      block: lab.block,
      total_stations: lab.totalStations,
      invigilator_name: lab.invigilatorName || '',
      is_custom: true,
      created_at: Date.now(),
    };
    const { error } = await supabase.from('college_labs').upsert(row);
    if (error) {
      console.warn('[Supabase] Lab upsert warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Failed to sync lab to cloud:', err);
    return false;
  }
}

export async function deleteCollegeLabFromCloud(labId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('college_labs').delete().eq('lab_id', labId);
    return !error;
  } catch {
    return false;
  }
}

// ── SUPABASE HEALTH & SCHEMA CHECKER ──────────────────────────────────────────

export interface SupabaseHealthReport {
  connected: boolean;
  projectUrl: string;
  tables: {
    mcq_questions: boolean;
    mcq_exams: boolean;
    mcq_attempts: boolean;
    candidate_stations: boolean;
    college_labs: boolean;
    code_submissions: boolean;
  };
  allTablesLive: boolean;
  errorMessage?: string;
  lastChecked: number;
}

export async function checkSupabaseHealth(): Promise<SupabaseHealthReport> {
  const result: SupabaseHealthReport = {
    connected: false,
    projectUrl: SUPABASE_URL,
    tables: {
      mcq_questions: false,
      mcq_exams: false,
      mcq_attempts: false,
      candidate_stations: false,
      college_labs: false,
      code_submissions: false,
    },
    allTablesLive: false,
    lastChecked: Date.now(),
  };

  if (!SUPABASE_URL || !keyToUse) {
    result.errorMessage = 'Supabase credentials not configured';
    return result;
  }

  try {
    // Check connection and each table individually
    const checkTable = async (tableName: string): Promise<boolean> => {
      try {
        const { error } = await supabase.from(tableName).select('*').limit(1);
        if (error && error.message.includes('Could not find the table')) {
          return false;
        }
        return !error;
      } catch {
        return false;
      }
    };

    const [qOk, eOk, aOk, sOk, lOk, subOk] = await Promise.all([
      checkTable('mcq_questions'),
      checkTable('mcq_exams'),
      checkTable('mcq_attempts'),
      checkTable('candidate_stations'),
      checkTable('college_labs'),
      checkTable('code_submissions'),
    ]);

    result.connected = true;
    result.tables.mcq_questions = qOk;
    result.tables.mcq_exams = eOk;
    result.tables.mcq_attempts = aOk;
    result.tables.candidate_stations = sOk;
    result.tables.college_labs = lOk;
    result.tables.code_submissions = subOk;
    result.allTablesLive = qOk && eOk && aOk && sOk && lOk && subOk;

    return result;
  } catch (err: any) {
    result.errorMessage = err?.message || 'Failed to ping Supabase';
    return result;
  }
}

// ── BULK LOCAL-TO-CLOUD SYNC UTILITY ──────────────────────────────────────────

export async function syncAllLocalToCloud(
  questions: MCQQuestion[],
  exams: MCQExamConfig[],
  labs: CollegeLabInfo[]
): Promise<{ questionsSynced: number; examsSynced: number; labsSynced: number }> {
  let qCount = 0;
  let eCount = 0;
  let lCount = 0;

  for (const q of questions) {
    const ok = await saveQuestionToCloud(q);
    if (ok) qCount++;
  }

  for (const ex of exams) {
    const ok = await saveExamToCloud(ex);
    if (ok) eCount++;
  }

  for (const lab of labs) {
    const ok = await saveCollegeLabToCloud(lab);
    if (ok) lCount++;
  }

  return { questionsSynced: qCount, examsSynced: eCount, labsSynced: lCount };
}
