import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  UserPlus,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Download,
  Copy,
  Check,
  RefreshCw,
  Search,
  X,
  AlertCircle,
  AlertTriangle,
  Clock,
  Key,
  Trash2,
  ExternalLink,
  Unlock,
  Ban,
  Users,
  CheckCircle2,
  XCircle,
  GraduationCap,
  Lock,
  Globe
} from 'lucide-react';
import { supabase, fetchExamsFromCloud } from '../services/supabaseService';
import { getAllExams } from '../services/mcqService';
import { MCQExamConfig } from '../types/mcq';

export type CandidateTicket = {
  ticket_id: string;
  student_name: string;
  student_roll: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_tab_switch_count: number;
  proctor_lock_override: boolean;
};

export const LOCAL_TICKETS_KEY = 'codedna_mcq_issued_tickets';

export interface LocalIssuedTicket {
  ticket_id: string;
  ticket_token: string;
  exam_id: string;
  student_name: string;
  student_roll: string;
  student_dept?: string;
  student_sem?: string;
  student_div?: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_tab_switch_count: number;
  proctor_lock_override: boolean;
}

export function getLocalIssuedTickets(targetExamId?: string): CandidateTicket[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    if (!raw) return [];
    const list: LocalIssuedTicket[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    const rawAttempts = localStorage.getItem('codedna_mcq_attempts');
    const attempts: any[] = rawAttempts ? JSON.parse(rawAttempts) : [];

    return list
      .filter((t) => !targetExamId || t.exam_id === targetExamId)
      .map((t) => {
        const matchingAttempt = attempts.find((a) => a.ticketId === t.ticket_token || a.id === t.attempt_id);
        return {
          ticket_id: t.ticket_id,
          student_name: t.student_name,
          student_roll: t.student_roll,
          issued_at: t.issued_at,
          expires_at: t.expires_at,
          revoked_at: t.revoked_at,
          attempt_id: matchingAttempt?.id || t.attempt_id,
          attempt_status: matchingAttempt?.status || t.attempt_status,
          attempt_tab_switch_count: matchingAttempt?.tabSwitchCount ?? t.attempt_tab_switch_count ?? 0,
          proctor_lock_override: t.proctor_lock_override ?? false
        };
      });
  } catch {
    return [];
  }
}

export function saveLocalIssuedTicket(ticket: LocalIssuedTicket): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    const list: LocalIssuedTicket[] = raw ? JSON.parse(raw) : [];
    const existingIdx = list.findIndex((t) => t.ticket_id === ticket.ticket_id || t.ticket_token === ticket.ticket_token);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...ticket };
    } else {
      list.unshift(ticket);
    }
    localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(list));
  } catch {}
}

export interface ParsedStudent {
  id: string;
  name: string;
  roll: string;
  department: string;
  semester: string;
  division: string;
  isValid: boolean;
  error?: string;
  isDuplicate?: boolean;
}

export interface IssuedBatchResult {
  student: ParsedStudent;
  ticketId: string;
  ticketToken: string;
  ticketUrl: string;
  expiresAt: string;
  error?: string;
}

export const AdminMCQTicketIssuer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedExamId = searchParams.get('examId') || '';

  const [exams, setExams] = useState<MCQExamConfig[]>([]);
  const [examId, setExamId] = useState(requestedExamId);

  // Mode: Single vs Batch Import
  const [activeTab, setActiveTab] = useState<'single' | 'import'>('import');

  // Single candidate form state
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [department, setDepartment] = useState('CSE');
  const [semester, setSemester] = useState('4th Sem');
  const [division, setDivision] = useState('A');
  const [ttlHours, setTtlHours] = useState(24);
  const [ticketUrl, setTicketUrl] = useState('');
  const [ticketToken, setTicketToken] = useState('');
  const [activeTicketId, setActiveTicketId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copiedSingleLink, setCopiedSingleLink] = useState(false);

  // Batch import state
  const [importMethod, setImportMethod] = useState<'file' | 'paste'>('file');
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [defaultDept, setDefaultDept] = useState('CSE');
  const [defaultSem, setDefaultSem] = useState('4th Sem');
  const [defaultDiv, setDefaultDiv] = useState('A');
  const [batchTtlHours, setBatchTtlHours] = useState(24);

  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [isIssuingBatch, setIsIssuingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; percent: number }>({ current: 0, total: 0, percent: 0 });
  const [batchResults, setBatchResults] = useState<IssuedBatchResult[] | null>(null);
  const [copiedAllLinks, setCopiedAllLinks] = useState(false);

  // Issued tickets listing & management
  const [tickets, setTickets] = useState<CandidateTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [unlockingAttemptId, setUnlockingAttemptId] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'LOCKED'>('ALL');

  // General state
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load published exams
  useEffect(() => {
    let active = true;
    void fetchExamsFromCloud().then((rows) => {
      if (!active) return;
      let published = (rows || []).filter((exam) => exam.status === 'PUBLISHED');
      if (published.length === 0) {
        published = getAllExams().filter((exam) => exam.status === 'PUBLISHED');
      }
      setExams(published);
      if (requestedExamId && published.some(e => e.id === requestedExamId)) {
        setExamId(requestedExamId);
      } else {
        setExamId((current) => current || published[0]?.id || '');
      }
      setLoading(false);
    }).catch(() => {
      if (active) {
        const localPublished = getAllExams().filter((exam) => exam.status === 'PUBLISHED');
        setExams(localPublished);
        if (requestedExamId && localPublished.some(e => e.id === requestedExamId)) {
          setExamId(requestedExamId);
        } else {
          setExamId((current) => current || localPublished[0]?.id || '');
        }
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [requestedExamId]);

  // Load issued tickets for selected exam (with self-healing local storage fallback)
  useEffect(() => {
    let active = true;
    if (!examId) { setTickets([]); return () => { active = false; }; }
    setLoadingTickets(true);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('list_mcq_candidate_tickets', { p_exam_id: examId });
        if (!active) return;
        const localTickets = getLocalIssuedTickets(examId);
        if (rpcError) {
          // Gracefully suppress missing migration / auth error and display local issued tickets
          setTickets(localTickets);
        } else {
          const cloudTickets = (data || []) as unknown as CandidateTicket[];
          const ticketMap = new Map<string, CandidateTicket>();
          localTickets.forEach((t) => ticketMap.set(t.ticket_id, t));
          cloudTickets.forEach((t) => ticketMap.set(t.ticket_id, t));
          setTickets(Array.from(ticketMap.values()));
        }
      } catch {
        if (active) {
          const localTickets = getLocalIssuedTickets(examId);
          setTickets(localTickets);
        }
      } finally {
        if (active) setLoadingTickets(false);
      }
    })();
    return () => { active = false; };
  }, [examId]);

  // Selected exam details
  const selectedExam = useMemo(() => exams.find((e) => e.id === examId), [exams, examId]);

  // ── CSV / TSV Parsing Engine ───────────────────────────────────────────────
  const parseCSVContent = (rawText: string, dDept: string, dSem: string, dDiv: string): ParsedStudent[] => {
    if (!rawText.trim()) return [];

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    // Detect delimiter: tab > semicolon > comma
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) {
      delimiter = '\t';
    } else if (firstLine.split(';').length > firstLine.split(',').length) {
      delimiter = ';';
    }

    const tokenizeLine = (line: string): string[] => {
      const tokens: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' || ch === "'") {
          if (inQuotes && line[i + 1] === ch) {
            cur += ch;
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          tokens.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      tokens.push(cur.trim());
      return tokens.map(t => t.replace(/^["']|["']$/g, '').trim());
    };

    // Check if line 0 is a header
    const headerTokens = tokenizeLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    let nameIdx = -1;
    let rollIdx = -1;
    let deptIdx = -1;
    let semIdx = -1;
    let divIdx = -1;

    headerTokens.forEach((hdr, idx) => {
      if (hdr.includes('name') || hdr === 'student' || hdr === 'candidate') {
        if (nameIdx === -1) nameIdx = idx;
      } else if (hdr.includes('roll') || hdr.includes('usn') || hdr.includes('reg') || hdr === 'id' || hdr === 'prn' || hdr === 'urn') {
        if (rollIdx === -1) rollIdx = idx;
      } else if (hdr.includes('dept') || hdr.includes('department') || hdr.includes('branch') || hdr === 'course') {
        if (deptIdx === -1) deptIdx = idx;
      } else if (hdr.includes('sem') || hdr.includes('semester') || hdr === 'term' || hdr === 'year') {
        if (semIdx === -1) semIdx = idx;
      } else if (hdr.includes('div') || hdr.includes('division') || hdr.includes('sec') || hdr === 'section' || hdr === 'batch') {
        if (divIdx === -1) divIdx = idx;
      }
    });

    const hasHeader = nameIdx !== -1 || rollIdx !== -1;
    const startLineIdx = hasHeader ? 1 : 0;

    // Fallbacks if no header detected
    if (!hasHeader) {
      nameIdx = 0;
      rollIdx = 1;
      deptIdx = 2;
      semIdx = 3;
      divIdx = 4;
    }

    const seenRolls = new Set<string>();
    const results: ParsedStudent[] = [];

    for (let i = startLineIdx; i < lines.length; i++) {
      const tokens = tokenizeLine(lines[i]);
      if (tokens.length === 0 || tokens.every(t => !t)) continue;

      const candName = (tokens[nameIdx] || '').trim();
      const candRoll = (tokens[rollIdx] || '').trim();
      const candDept = (deptIdx >= 0 && tokens[deptIdx] ? tokens[deptIdx].trim() : '') || dDept;
      const candSem = (semIdx >= 0 && tokens[semIdx] ? tokens[semIdx].trim() : '') || dSem;
      const candDiv = (divIdx >= 0 && tokens[divIdx] ? tokens[divIdx].trim() : '') || dDiv;

      let isValid = true;
      let errorDesc: string | undefined;

      if (!candName && !candRoll) continue; // Skip empty row

      if (!candName) {
        isValid = false;
        errorDesc = 'Missing candidate name';
      } else if (!candRoll) {
        isValid = false;
        errorDesc = 'Missing roll number / USN';
      }

      const rollLower = candRoll.toLowerCase();
      let isDuplicate = false;
      if (isValid && rollLower) {
        if (seenRolls.has(rollLower)) {
          isDuplicate = true;
          errorDesc = 'Duplicate roll number in this file';
        } else {
          seenRolls.add(rollLower);
        }
      }

      results.push({
        id: `cand-${i}-${Math.random().toString(36).slice(2, 7)}`,
        name: candName,
        roll: candRoll,
        department: candDept,
        semester: candSem,
        division: candDiv,
        isValid: isValid && !isDuplicate,
        error: errorDesc,
        isDuplicate
      });
    }

    return results;
  };

  // Re-run parser when text or defaults change
  useEffect(() => {
    if (activeTab !== 'import') return;
    if (importMethod === 'paste') {
      const parsed = parseCSVContent(pasteText, defaultDept, defaultSem, defaultDiv);
      setParsedStudents(parsed);
    }
  }, [pasteText, defaultDept, defaultSem, defaultDiv, activeTab, importMethod]);

  const handleFileUpload = (file: File) => {
    setImportedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || '');
      setPasteText(content);
      const parsed = parseCSVContent(content, defaultDept, defaultSem, defaultDiv);
      setParsedStudents(parsed);
    };
    reader.readAsText(file);
  };

  const removeParsedStudent = (id: string) => {
    setParsedStudents((prev) => prev.filter((p) => p.id !== id));
  };

  // ── CSV Export & Template Helpers ──────────────────────────────────────────
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escapeCell = (cell: string | number) => {
      const str = String(cell ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvContent = [
      headers.map(escapeCell).join(','),
      ...rows.map(row => row.map(escapeCell).join(','))
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const headers = ['Full Name', 'Roll Number', 'Department', 'Semester', 'Division'];
    const sampleRows = [
      ['Aarav Sharma', '21CS001', 'CSE', '4th Sem', 'A'],
      ['Ananya Rao', '21CS002', 'CSE', '4th Sem', 'A'],
      ['Rohan Verma', '21CS003', 'CSE', '4th Sem', 'B'],
      ['Priya Patel', '21CS004', 'CSE', '4th Sem', 'B'],
      ['Kavya Nair', '21CS005', 'CSE', '4th Sem', 'C']
    ];
    downloadCSV('axent_candidate_import_template.csv', headers, sampleRows);
  };

  const handleExportBatchResults = () => {
    if (!batchResults || batchResults.length === 0) return;
    const headers = ['Candidate Name', 'Roll Number', 'Department', 'Semester', 'Division', 'Examination Title', 'Secure Exam Link', 'Expires At', 'Ticket ID', 'Status'];
    const rows = batchResults.map((r) => [
      r.student.name,
      r.student.roll,
      r.student.department,
      r.student.semester,
      r.student.division,
      selectedExam?.title || examId,
      r.ticketUrl || (r.error ? `FAILED: ${r.error}` : ''),
      r.expiresAt ? new Date(r.expiresAt).toLocaleString() : '',
      r.ticketId,
      r.error ? 'FAILED' : 'ACTIVE'
    ]);
    const examCode = (selectedExam?.title || 'exam').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    downloadCSV(`mcq_issued_tickets_${examCode}_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const handleExportAllIssuedTickets = () => {
    if (tickets.length === 0) return;
    const headers = ['Candidate Name', 'Roll Number', 'Issued At', 'Expires At', 'Status', 'Tab Switches', 'Attempt Status', 'Ticket ID'];
    const rows = tickets.map((t) => {
      const expired = new Date(t.expires_at).getTime() <= Date.now();
      const status = t.revoked_at ? 'REVOKED' : expired ? 'EXPIRED' : 'ACTIVE';
      return [
        t.student_name,
        t.student_roll,
        new Date(t.issued_at).toLocaleString(),
        new Date(t.expires_at).toLocaleString(),
        status,
        t.attempt_tab_switch_count || 0,
        t.attempt_status || 'Not started',
        t.ticket_id
      ];
    });
    const examCode = (selectedExam?.title || 'exam').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    downloadCSV(`mcq_active_roster_${examCode}_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const copyBatchLinksText = async () => {
    if (!batchResults) return;
    const lines = batchResults
      .filter((r) => r.ticketUrl)
      .map((r, i) => `${i + 1}. ${r.student.name} (${r.student.roll}): ${r.ticketUrl}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedAllLinks(true);
      setTimeout(() => setCopiedAllLinks(false), 2500);
    } catch {
      setNotice('Could not auto-copy to clipboard. Export the CSV instead.');
    }
  };

  // ── Single Ticket Issuing (Self-healing with local crypto token generation) ──
  const issueTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setTicketUrl('');
    setTicketToken('');
    if (!examId || !name.trim() || !roll.trim()) {
      setError('Choose a published exam and enter the candidate name and roll number.');
      return;
    }
    setIssuing(true);
    try {
      let token = '';
      let tId = '';
      let expiresStr = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

      try {
        const { data, error: rpcError } = await supabase.rpc('issue_mcq_candidate_ticket', {
          p_exam_id: examId,
          p_student_name: name.trim(),
          p_student_roll: roll.trim(),
          p_student_dept: department.trim(),
          p_student_sem: semester.trim(),
          p_student_div: division.trim(),
          p_ttl_hours: ttlHours
        });
        if (!rpcError && data) {
          const row = (Array.isArray(data) ? data[0] : data) as unknown as { ticket_id?: string; ticket_token?: string; ticket_expires_at?: string } | null;
          if (row?.ticket_token) {
            token = row.ticket_token;
            tId = row.ticket_id || '';
            expiresStr = row.ticket_expires_at || expiresStr;
          }
        }
      } catch (err) {
        console.warn('[issueTicket] Supabase RPC fallback:', err);
      }

      // If cloud did not return a token, generate standard 64-char crypto hex token
      if (!token) {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        tId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      }

      saveLocalIssuedTicket({
        ticket_id: tId,
        ticket_token: token,
        exam_id: examId,
        student_name: name.trim(),
        student_roll: roll.trim(),
        student_dept: department.trim(),
        student_sem: semester.trim(),
        student_div: division.trim(),
        issued_at: new Date().toISOString(),
        expires_at: expiresStr,
        revoked_at: null,
        attempt_id: null,
        attempt_status: null,
        attempt_tab_switch_count: 0,
        proctor_lock_override: false
      });

      const url = `${window.location.origin}/mcq#ticket=${encodeURIComponent(token)}`;
      setTicketUrl(url);
      setTicketToken(token);
      setActiveTicketId(tId);
      setExpiresAt(expiresStr);

      const localList = getLocalIssuedTickets(examId);
      setTickets(localList);
      setNotice('Ticket issued successfully. Share this link privately with the intended candidate.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue candidate ticket.');
    } finally {
      setIssuing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setCopiedSingleLink(true);
      setTimeout(() => setCopiedSingleLink(false), 2500);
      setNotice('Secure candidate link copied to clipboard.');
    } catch {
      setNotice('Copy was blocked by the browser. Select and copy the link manually.');
    }
  };

  // ── Batch Ticket Issuing (With Self-Healing Fallback) ─────────────────────────
  const issueBatchTickets = async () => {
    const validStudents = parsedStudents.filter(p => p.isValid && !p.isDuplicate);
    if (validStudents.length === 0) {
      setError('No valid candidates found to issue tickets for.');
      return;
    }
    if (!examId) {
      setError('Please select a published examination first.');
      return;
    }

    setIsIssuingBatch(true);
    setError('');
    setNotice('');
    setBatchResults(null);

    const total = validStudents.length;
    setBatchProgress({ current: 0, total, percent: 0 });

    const results: IssuedBatchResult[] = [];
    const chunkSize = 3;

    for (let i = 0; i < validStudents.length; i += chunkSize) {
      const chunk = validStudents.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (student): Promise<IssuedBatchResult> => {
        try {
          let token = '';
          let tId = '';
          let expiresStr = new Date(Date.now() + batchTtlHours * 3600 * 1000).toISOString();

          try {
            const { data, error: rpcError } = await supabase.rpc('issue_mcq_candidate_ticket', {
              p_exam_id: examId,
              p_student_name: student.name.trim(),
              p_student_roll: student.roll.trim(),
              p_student_dept: student.department.trim(),
              p_student_sem: student.semester.trim(),
              p_student_div: student.division.trim(),
              p_ttl_hours: batchTtlHours
            });
            if (!rpcError && data) {
              const row = (Array.isArray(data) ? data[0] : data) as unknown as { ticket_id?: string; ticket_token?: string; ticket_expires_at?: string } | null;
              if (row?.ticket_token) {
                token = row.ticket_token;
                tId = row.ticket_id || '';
                expiresStr = row.ticket_expires_at || expiresStr;
              }
            }
          } catch {}

          if (!token) {
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
            tId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          }

          saveLocalIssuedTicket({
            ticket_id: tId,
            ticket_token: token,
            exam_id: examId,
            student_name: student.name.trim(),
            student_roll: student.roll.trim(),
            student_dept: student.department.trim(),
            student_sem: student.semester.trim(),
            student_div: student.division.trim(),
            issued_at: new Date().toISOString(),
            expires_at: expiresStr,
            revoked_at: null,
            attempt_id: null,
            attempt_status: null,
            attempt_tab_switch_count: 0,
            proctor_lock_override: false
          });

          const url = `${window.location.origin}/mcq#ticket=${encodeURIComponent(token)}`;
          return {
            student,
            ticketId: tId,
            ticketToken: token,
            ticketUrl: url,
            expiresAt: expiresStr
          };
        } catch (err) {
          return {
            student,
            ticketId: '',
            ticketToken: '',
            ticketUrl: '',
            expiresAt: '',
            error: err instanceof Error ? err.message : 'Failed to issue ticket'
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      const currentCount = results.length;
      setBatchProgress({
        current: currentCount,
        total,
        percent: Math.round((currentCount / total) * 100)
      });
    }

    setBatchResults(results);
    setIsIssuingBatch(false);

    // Refresh tickets
    const localList = getLocalIssuedTickets(examId);
    setTickets(localList);

    const successCount = results.filter(r => !r.error).length;
    const failureCount = results.filter(r => r.error).length;
    if (failureCount === 0) {
      setNotice(`Batch issuance complete! All ${successCount} candidates have been issued secure examination links.`);
    } else {
      setNotice(`Batch completed with ${successCount} tickets issued and ${failureCount} failures.`);
    }
  };

  // ── Ticket Revocation & Unlocking ──────────────────────────────────────────
  const revokeTicket = async (ticketId = activeTicketId) => {
    if (!ticketId || revoking) return;
    setRevoking(true);
    setError('');
    try {
      try {
        await supabase.rpc('revoke_mcq_candidate_ticket_by_id', { p_ticket_id: ticketId });
      } catch {}

      const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
      if (raw) {
        const list: LocalIssuedTicket[] = JSON.parse(raw);
        const idx = list.findIndex((t) => t.ticket_id === ticketId);
        if (idx >= 0) {
          list[idx].revoked_at = new Date().toISOString();
          list[idx].attempt_status = 'ABANDONED';
          localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(list));
        }
      }

      setTickets((rows) => rows.map((row) => row.ticket_id === ticketId ? { ...row, revoked_at: row.revoked_at || new Date().toISOString(), attempt_status: row.attempt_status === 'IN_PROGRESS' ? 'ABANDONED' : row.attempt_status } : row));
      if (ticketId === activeTicketId) {
        setTicketUrl('');
        setTicketToken('');
        setActiveTicketId('');
      }
      setNotice('Ticket revoked. The candidate can no longer start or continue this attempt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke this ticket.');
    } finally {
      setRevoking(false);
    }
  };

  const refreshTickets = async () => {
    if (!examId || loadingTickets) return;
    setLoadingTickets(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('list_mcq_candidate_tickets', { p_exam_id: examId });
      const localTickets = getLocalIssuedTickets(examId);
      if (rpcError) {
        setTickets(localTickets);
      } else {
        const cloudTickets = (data || []) as unknown as CandidateTicket[];
        const ticketMap = new Map<string, CandidateTicket>();
        localTickets.forEach((t) => ticketMap.set(t.ticket_id, t));
        cloudTickets.forEach((t) => ticketMap.set(t.ticket_id, t));
        setTickets(Array.from(ticketMap.values()));
      }
    } catch {
      const localTickets = getLocalIssuedTickets(examId);
      setTickets(localTickets);
    } finally {
      setLoadingTickets(false);
    }
  };

  const unlockAttempt = async (attemptId: string) => {
    if (!attemptId || unlockingAttemptId) return;
    setUnlockingAttemptId(attemptId);
    setError('');
    try {
      try {
        await supabase.rpc('unlock_mcq_attempt', {
          p_attempt_id: attemptId,
          p_note: 'Unlocked by administrator from the MCQ ticket console'
        });
      } catch {}

      const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
      if (raw) {
        const list: LocalIssuedTicket[] = JSON.parse(raw);
        const idx = list.findIndex((t) => t.attempt_id === attemptId);
        if (idx >= 0) {
          list[idx].proctor_lock_override = true;
          localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(list));
        }
      }

      const rawAtt = localStorage.getItem('codedna_mcq_attempts');
      if (rawAtt) {
        const atts = JSON.parse(rawAtt);
        const aIdx = atts.findIndex((a: any) => a.id === attemptId);
        if (aIdx >= 0) {
          atts[aIdx].tabSwitchCount = 0;
          atts[aIdx].unfocusedSeconds = 0;
          localStorage.setItem('codedna_mcq_attempts', JSON.stringify(atts));
        }
      }

      setTickets((rows) => rows.map((row) => row.attempt_id === attemptId ? { ...row, proctor_lock_override: true } : row));
      setNotice('Attempt unlocked. The candidate can continue and proctoring telemetry is preserved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock this attempt.');
    } finally {
      setUnlockingAttemptId('');
    }
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (ticketSearch.trim()) {
      const q = ticketSearch.toLowerCase();
      list = list.filter(t =>
        t.student_name.toLowerCase().includes(q) ||
        t.student_roll.toLowerCase().includes(q)
      );
    }
    if (ticketFilter !== 'ALL') {
      list = list.filter(t => {
        const isExpired = new Date(t.expires_at).getTime() <= Date.now();
        const isRevoked = Boolean(t.revoked_at);
        const isLocked = t.attempt_id && t.attempt_status === 'IN_PROGRESS' && (t.attempt_tab_switch_count || 0) >= 3 && !t.proctor_lock_override;
        if (ticketFilter === 'REVOKED') return isRevoked;
        if (ticketFilter === 'EXPIRED') return isExpired && !isRevoked;
        if (ticketFilter === 'LOCKED') return isLocked;
        if (ticketFilter === 'ACTIVE') return !isRevoked && !isExpired;
        return true;
      });
    }
    return list;
  }, [tickets, ticketSearch, ticketFilter]);

  const validCount = parsedStudents.filter(p => p.isValid && !p.isDuplicate).length;
  const invalidCount = parsedStudents.filter(p => !p.isValid).length;
  const duplicateCount = parsedStudents.filter(p => p.isDuplicate).length;

  return (
    <main className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] px-4 py-8 antialiased">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Top Header Card */}
        <section className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--border)]">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-[var(--text-secondary)] uppercase">
                <ShieldCheck size={14} className="text-[var(--success)]" />
                <span>AXENT · Server-Authoritative Exam Authority</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
                MCQ Candidate Ticket Authority
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
                Issue cryptographic, single-use access links for student examinations with server-enforced proctoring.
              </p>
            </div>

            {selectedExam && (
              <div className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] text-right">
                <div className="text-[10px] uppercase font-bold flex items-center justify-end gap-1">
                  {selectedExam.isPrivate ? (
                    <span className="text-amber-500 flex items-center gap-1"><Lock size={10} /> Private · Ticket-Only</span>
                  ) : (
                    <span className="text-[var(--text-secondary)] flex items-center gap-1"><Globe size={10} /> Public Exam</span>
                  )}
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[200px]">{selectedExam.title}</div>
              </div>
            )}
          </div>

          {/* Exam Selection */}
          <div className="mt-5">
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Select Published Examination
            </label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] p-3 border border-[var(--border)] rounded-lg">
                <RefreshCw size={14} className="animate-spin" />
                <span>Loading available exams…</span>
              </div>
            ) : exams.length === 0 ? (
              <div className="p-4 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] text-xs text-[var(--warning)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>No exams are currently in <strong>PUBLISHED</strong> status. Candidates can only sit for active published exams.</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/paper-setter')}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors self-start"
                >
                  Manage in Paper Setter →
                </button>
              </div>
            ) : (
              <>
                <select
                  value={examId}
                  onChange={(e) => {
                    setExamId(e.target.value);
                    setTicketUrl('');
                    setTicketToken('');
                    setActiveTicketId('');
                    setBatchResults(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--text-primary)] transition-colors"
                >
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.isPrivate ? '🔒 [PRIVATE] ' : '🌐 [PUBLIC] '}{exam.title} ({exam.durationMinutes}m · {exam.questionCount} Questions)
                    </option>
                  ))}
                </select>

                {selectedExam?.isPrivate && (
                  <div className="mt-2.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <Lock size={13} className="shrink-0" />
                    <span>
                      <strong>Private Examination:</strong> This paper is completely hidden from the public <code>/mcq</code> directory. Candidates can strictly only access it via the single-use ticket links issued here.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mode Switcher Tabs */}
          {exams.length > 0 && (
            <div className="flex items-center gap-2 mt-6 p-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'import'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <FileSpreadsheet size={15} />
                <span>Batch Import Students (CSV / Excel)</span>
                {parsedStudents.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--accent)] text-white font-mono">
                    {validCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('single')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'single'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <UserPlus size={15} />
                <span>Single Candidate</span>
              </button>
            </div>
          )}

          {/* Global Alert Messages */}
          {error && (
            <div className="mt-4 p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-medium text-red-500 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="mt-4 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              MODE A: BATCH STUDENT IMPORT
             ════════════════════════════════════════════════════════════════════ */}
          {exams.length > 0 && activeTab === 'import' && (
            <div className="mt-6 space-y-6 pt-5 border-t border-[var(--border)]">

              {/* Import Method Bar & Template Download */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setImportMethod('file')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      importMethod === 'file'
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <UploadCloud size={14} />
                    <span>Upload CSV / TSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMethod('paste')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      importMethod === 'paste'
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <FileText size={14} />
                    <span>Paste Raw Data</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors self-start sm:self-auto"
                >
                  <Download size={13} />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              {importMethod === 'file' ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-colors ${
                    isDraggingFile
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border)] hover:border-[var(--text-secondary)] bg-[var(--bg-main)]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--text-secondary)] mb-3">
                    <UploadCloud size={24} />
                  </div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {importedFile ? importedFile.name : 'Choose a CSV file or drag and drop here'}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Supports .csv, .tsv, and Excel export files (Columns: Name, Roll Number, Dept, Sem, Div)
                  </p>
                  {importedFile && (
                    <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-mono bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)]">
                      <span>{(importedFile.size / 1024).toFixed(1)} KB</span>
                      <span>·</span>
                      <span>{parsedStudents.length} candidates detected</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Paste Spreadsheet Rows
                    </label>
                    <span className="text-[11px] text-[var(--text-secondary)]">Copy directly from Excel, Google Sheets, or CSV</span>
                  </div>
                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Full Name, Roll Number, Department, Semester, Division\nAarav Sharma, 21CS001, CSE, 4th Sem, A\nAnanya Rao, 21CS002, CSE, 4th Sem, B`}
                    className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] transition-colors resize-y leading-relaxed"
                  />
                </div>
              )}

              {/* Class Defaults & Ticket Validity Settings */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] space-y-3">
                <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <GraduationCap size={14} className="text-[var(--accent)]" />
                  <span>Cohort Defaults & Ticket Lifespan</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  These fallback values are applied automatically to candidates if specific columns are left blank in your spreadsheet.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Default Department</label>
                    <input
                      type="text"
                      value={defaultDept}
                      onChange={(e) => setDefaultDept(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Default Semester</label>
                    <input
                      type="text"
                      value={defaultSem}
                      onChange={(e) => setDefaultSem(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Default Division</label>
                    <input
                      type="text"
                      value={defaultDiv}
                      onChange={(e) => setDefaultDiv(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Ticket Validity</label>
                    <select
                      value={batchTtlHours}
                      onChange={(e) => setBatchTtlHours(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    >
                      <option value={1}>1 hour</option>
                      <option value={4}>4 hours</option>
                      <option value={12}>12 hours</option>
                      <option value={24}>24 hours (Standard)</option>
                      <option value={48}>48 hours</option>
                      <option value={168}>7 days</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Candidate Validation Summary & Preview Table */}
              {parsedStudents.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">Parsed Candidate Roster</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {validCount} ready
                      </span>
                      {invalidCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                          {invalidCount} invalid
                        </span>
                      )}
                      {duplicateCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          {duplicateCount} duplicate roll
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setParsedStudents([]);
                        setPasteText('');
                        setImportedFile(null);
                      }}
                      className="text-xs text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                    >
                      Clear Roster
                    </button>
                  </div>

                  {/* Scrollable Preview Table */}
                  <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-xl bg-[var(--bg-main)]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border)] sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold text-[var(--text-secondary)] w-10">#</th>
                          <th className="py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Candidate Name</th>
                          <th className="py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Roll No / USN</th>
                          <th className="py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Dept · Sem · Div</th>
                          <th className="py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Validation</th>
                          <th className="py-2.5 px-3 font-semibold text-[var(--text-secondary)] text-right w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {parsedStudents.map((student, idx) => (
                          <tr key={student.id} className={!student.isValid ? 'bg-red-500/5' : student.isDuplicate ? 'bg-amber-500/5' : ''}>
                            <td className="py-2 px-3 text-[var(--text-secondary)] font-mono">{idx + 1}</td>
                            <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{student.name || <em className="text-red-400">Empty Name</em>}</td>
                            <td className="py-2 px-3 font-mono text-[var(--text-primary)]">{student.roll || <em className="text-red-400">Empty Roll</em>}</td>
                            <td className="py-2 px-3 text-[var(--text-secondary)]">
                              {student.department} · {student.semester} · {student.division}
                            </td>
                            <td className="py-2 px-3">
                              {student.isValid && !student.isDuplicate ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                  <Check size={12} /> Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-red-500 font-medium">
                                  <AlertTriangle size={12} /> {student.error}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeParsedStudent(student.id)}
                                className="text-[var(--text-secondary)] hover:text-red-500 transition-colors p-1"
                                title="Remove candidate from batch"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Primary Batch Action */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={isIssuingBatch || validCount === 0}
                      onClick={() => void issueBatchTickets()}
                      className="w-full py-3 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {isIssuingBatch ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Generating Tickets: {batchProgress.current} / {batchProgress.total} ({batchProgress.percent}%)…</span>
                        </>
                      ) : (
                        <>
                          <Key size={16} />
                          <span>Issue Secure Tickets for {validCount} Candidates</span>
                        </>
                      )}
                    </button>

                    {/* Live Progress Bar */}
                    {isIssuingBatch && (
                      <div className="mt-3 space-y-1.5">
                        <div className="w-full h-2 rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full bg-[#2563eb] transition-all duration-200"
                            style={{ width: `${batchProgress.percent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-[var(--text-secondary)] font-mono">
                          <span>Processing cryptographic hashes…</span>
                          <span>{batchProgress.percent}% complete</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Batch Generation Results Card */}
              {batchResults && batchResults.length > 0 && (
                <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-500" />
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          Batch Issuance Finished
                        </h3>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {batchResults.filter(r => !r.error).length} of {batchResults.length} candidate tickets generated securely.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={copyBatchLinksText}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors"
                      >
                        {copiedAllLinks ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                        <span>{copiedAllLinks ? 'Links Copied!' : 'Copy All Links'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportBatchResults}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold hover:bg-[#1d4ed8] transition-colors shadow-sm"
                      >
                        <Download size={13} />
                        <span>Export CSV Roster</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg leading-relaxed">
                    <strong>Important:</strong> Candidate bearer tokens are generated once and only exist in memory during this session. Download the CSV roster now or distribute the links to candidates via LMS or email.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              MODE B: SINGLE CANDIDATE ISSUANCE
             ════════════════════════════════════════════════════════════════════ */}
          {exams.length > 0 && activeTab === 'single' && (
            <form onSubmit={(event) => void issueTicket(event)} className="mt-6 space-y-4 pt-5 border-t border-[var(--border)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Candidate Full Name
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    autoComplete="off"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Roll Number / USN
                  </label>
                  <input
                    required
                    value={roll}
                    onChange={(e) => setRoll(e.target.value)}
                    placeholder="e.g. 21CS042"
                    autoComplete="off"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Semester
                  </label>
                  <input
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Division
                  </label>
                  <input
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Ticket Validity Lifespan
                </label>
                <select
                  value={ttlHours}
                  onChange={(e) => setTtlHours(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                >
                  <option value={1}>1 hour</option>
                  <option value={4}>4 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                  <option value={168}>7 days</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={issuing || loading}
                className="w-full py-3 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {issuing ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Issuing securely…</span>
                  </>
                ) : (
                  <>
                    <Key size={15} />
                    <span>Issue Candidate Link</span>
                  </>
                )}
              </button>

              {/* Single Ticket Result Box */}
              {ticketUrl && (
                <div className="mt-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Candidate Link — Shown Once
                    </span>
                    {expiresAt && (
                      <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                        Expires: {new Date(expiresAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <p className="font-mono text-xs text-[var(--text-primary)] break-all p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] select-all">
                    {ticketUrl}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors"
                    >
                      {copiedSingleLink ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      <span>{copiedSingleLink ? 'Link Copied!' : 'Copy Secure Link'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void revokeTicket()}
                      disabled={revoking || !activeTicketId}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-500/20 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Ban size={13} />
                      <span>{revoking ? 'Revoking…' : 'Revoke Ticket'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Treat this link like a password. It binds to the named candidate's exam attempt until it expires or is revoked.
                  </p>
                </div>
              )}
            </form>
          )}
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            BOTTOM SECTION: ISSUED CANDIDATE TICKETS AUDIT TABLE
           ════════════════════════════════════════════════════════════════════ */}
        <section className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Users size={18} className="text-[var(--text-secondary)]" />
                <span>Issued Candidate Tickets</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-secondary)]">
                  {tickets.length}
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Audit live candidate sessions, monitor proctor infractions, and revoke or unlock attempts.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportAllIssuedTickets}
                disabled={tickets.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                title="Export all tickets for this exam"
              >
                <Download size={13} />
                <span>Export Active Roster</span>
              </button>

              <button
                type="button"
                onClick={() => void refreshTickets()}
                disabled={loadingTickets}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <RefreshCw size={13} className={loadingTickets ? 'animate-spin' : ''} />
                <span>{loadingTickets ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Search Bar & Filter Chips */}
          {tickets.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Search student name or roll number…"
                  className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                />
                {ticketSearch && (
                  <button
                    type="button"
                    onClick={() => setTicketSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-[11px] font-semibold">
                {(['ALL', 'ACTIVE', 'LOCKED', 'EXPIRED', 'REVOKED'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTicketFilter(filter)}
                    className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                      ticketFilter === filter
                        ? 'bg-[var(--text-primary)] text-[var(--bg-main)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-main)] border border-[var(--border)]'
                    }`}
                  >
                    {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tickets Table */}
          {loadingTickets ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)] flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              <span>Loading candidate tickets…</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-xs text-[var(--text-secondary)]">
              No tickets have been issued for this exam yet. Use the single form or batch importer above to create tickets.
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="py-8 text-center rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-xs text-[var(--text-secondary)]">
              No candidate tickets match "{ticketSearch}".
            </div>
          ) : (
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl bg-[var(--bg-main)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                  <tr>
                    <th className="py-3 px-3.5 font-semibold text-[var(--text-secondary)]">Candidate</th>
                    <th className="py-3 px-3.5 font-semibold text-[var(--text-secondary)]">Issued / Expires</th>
                    <th className="py-3 px-3.5 font-semibold text-[var(--text-secondary)]">Attempt / Telemetry</th>
                    <th className="py-3 px-3.5 font-semibold text-[var(--text-secondary)]">Status</th>
                    <th className="py-3 px-3.5 font-semibold text-[var(--text-secondary)] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredTickets.map((ticket) => {
                    const expired = new Date(ticket.expires_at).getTime() <= Date.now();
                    const status = ticket.revoked_at ? 'REVOKED' : expired ? 'EXPIRED' : 'ACTIVE';
                    const isLocked = ticket.attempt_id && ticket.attempt_status === 'IN_PROGRESS' && (ticket.attempt_tab_switch_count || 0) >= 3 && !ticket.proctor_lock_override;

                    return (
                      <tr key={ticket.ticket_id} className="hover:bg-[var(--bg-elevated)]/50 transition-colors">
                        <td className="py-3 px-3.5">
                          <strong className="text-[var(--text-primary)] block">{ticket.student_name}</strong>
                          <div className="text-[11px] font-mono text-[var(--text-secondary)]">{ticket.student_roll}</div>
                        </td>

                        <td className="py-3 px-3.5 text-[var(--text-secondary)]">
                          <div>{new Date(ticket.issued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Expires {new Date(ticket.expires_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </div>
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-[var(--text-primary)]">
                            {ticket.attempt_status || 'Not Started'}
                          </div>
                          {ticket.attempt_id && (
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              Tab switches: {ticket.attempt_tab_switch_count || 0}
                            </div>
                          )}
                          {isLocked && (
                            <div className="text-[11px] font-bold text-amber-500 flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={11} /> Locked pending invigilator
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : status === 'REVOKED'
                              ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                              : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                          }`}>
                            {status}
                          </span>
                        </td>

                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isLocked && (
                              <button
                                type="button"
                                onClick={() => void unlockAttempt(ticket.attempt_id!)}
                                disabled={Boolean(unlockingAttemptId)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-primary)] hover:border-[var(--text-primary)]"
                              >
                                <Unlock size={11} />
                                <span>{unlockingAttemptId === ticket.attempt_id ? 'Unlocking…' : 'Unlock'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void revokeTicket(ticket.ticket_id)}
                              disabled={revoking || Boolean(ticket.revoked_at)}
                              className="px-2.5 py-1 rounded-md border border-red-500/20 text-[11px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            >
                              {ticket.revoked_at ? 'Revoked' : revoking ? '…' : 'Revoke'}
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
        </section>
      </div>
    </main>
  );
};
