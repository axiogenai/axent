import { StudentInfo, ExamCategory } from '../types/dna';

export interface DecodedTokenResult {
  success: boolean;
  data?: Partial<StudentInfo>;
  error?: string;
  tokenType?: 'base64' | 'json' | 'delimited';
  meta?: {
    issuedAt?: string;
    expiresAt?: string;
    issuer?: string;
  };
}

/**
 * Encodes student exam credentials into an official CodeDNA Exam Token.
 */
export function generateExamToken(
  info: Partial<StudentInfo>,
  options: { issuer?: string; expiresInMinutes?: number } = {}
): string {
  const payload = {
    app: 'CodeDNA',
    version: '2.0',
    type: 'EXAM_ADMIT_TOKEN',
    issuer: options.issuer || 'Department Examination Cell',
    issuedAt: new Date().toISOString(),
    expiresAt: options.expiresInMinutes
      ? new Date(Date.now() + options.expiresInMinutes * 60 * 1000).toISOString()
      : undefined,
    candidate: {
      name: info.name?.trim() || '',
      rollNumber: info.rollNumber?.trim() || '',
      department: info.department?.trim() || '',
      course: info.course?.trim() || '',
      semester: info.semester?.trim() || '',
      examType: info.examType || 'Internal Assessment (CIE)',
      assignmentTitle: info.assignmentTitle?.trim() || '',
      labId: info.labId || 'LAB-01',
      labName: info.labName || '',
      stationNumber: info.stationNumber || 'Station #01',
      invigilatorName: info.invigilatorName || '',
      examDurationMinutes: info.examDurationMinutes !== undefined ? info.examDurationMinutes : 90,
      examMode: info.examMode || 'CODING',
      mcqExamId: info.mcqExamId || ''
    }
  };

  try {
    const jsonStr = JSON.stringify(payload);
    // Safe base64 encoding for utf-8 strings
    const base64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    ));
    return `CDNA-TK-${base64}`;
  } catch (err) {
    console.error('Failed to encode token:', err);
    return `CDNA-JSON-${JSON.stringify(payload.candidate)}`;
  }
}

/**
 * Parses and validates an imported candidate exam token.
 * Supports:
 *  1. CDNA-TK-<base64>
 *  2. Raw Base64 string
 *  3. Raw JSON object
 *  4. Pipe/Colon delimited format: NAME|USN|DEPT|LAB|STATION|MINS|TITLE
 */
export function parseExamToken(rawToken: string): DecodedTokenResult {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return { success: false, error: 'Token string is empty. Please enter or paste a valid exam token.' };
  }

  // 1. Try Base64 Token (with or without prefix)
  let cleanB64 = trimmed;
  if (cleanB64.startsWith('CDNA-TK-')) {
    cleanB64 = cleanB64.replace('CDNA-TK-', '');
  } else if (cleanB64.startsWith('CDNA-')) {
    cleanB64 = cleanB64.replace(/^CDNA-([A-Z0-9]+-)?/, '');
  }

  try {
    const decodedUtf8 = decodeURIComponent(
      Array.prototype.map
        .call(atob(cleanB64), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(decodedUtf8);
    const candidateData = parsed.candidate || parsed;

    if (candidateData && (candidateData.name || candidateData.rollNumber)) {
      if (parsed.expiresAt) {
        const expiresAt = Date.parse(parsed.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          return { success: false, error: 'This admit token has expired or has an invalid expiry date. Request a new token from the invigilator.' };
        }
      }
      return {
        success: true,
        tokenType: 'base64',
        meta: {
          issuedAt: parsed.issuedAt,
          expiresAt: parsed.expiresAt,
          issuer: parsed.issuer
        },
        data: sanitizeCandidateData(candidateData)
      };
    }
  } catch {
    // Not valid base64 JSON, continue to next parsers
  }

  // 2. Try Raw JSON parsing
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      const candidateData = parsedJson.candidate || parsedJson;
      if (candidateData && (candidateData.name || candidateData.rollNumber)) {
        if (parsedJson.expiresAt) {
          const expiresAt = Date.parse(parsedJson.expiresAt);
          if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            return { success: false, error: 'This admit token has expired or has an invalid expiry date. Request a new token from the invigilator.' };
          }
        }
        return {
          success: true,
          tokenType: 'json',
          meta: {
            issuedAt: parsedJson.issuedAt,
            issuer: parsedJson.issuer
          },
          data: sanitizeCandidateData(candidateData)
        };
      }
    } catch {
      // Not valid JSON
    }
  }

  // 3. Try Delimited Format: Name | RollNo | Dept | Lab | Station | Duration | Title
  if (trimmed.includes('|') || (trimmed.includes(':') && !trimmed.startsWith('http'))) {
    const sep = trimmed.includes('|') ? '|' : ':';
    const parts = trimmed.split(sep).map((p) => p.trim());
    // Filter out leading protocol prefix if present like CDNA:
    const filteredParts = parts[0].toUpperCase() === 'CDNA' ? parts.slice(1) : parts;

    if (filteredParts.length >= 2) {
      const durationNum = parseInt(filteredParts[5], 10);
      return {
        success: true,
        tokenType: 'delimited',
        data: {
          name: filteredParts[0] || '',
          rollNumber: filteredParts[1] || '',
          department: filteredParts[2] || '',
          labId: filteredParts[3] || 'LAB-01',
          stationNumber: filteredParts[4] || 'Station #01',
          examDurationMinutes: !isNaN(durationNum) ? durationNum : 90,
          assignmentTitle: filteredParts[6] || '',
          examType: 'Internal Assessment (CIE)'
        }
      };
    }
  }

  return {
    success: false,
    error: 'Unrecognized token format. Please verify the token string was copied completely.'
  };
}

function sanitizeCandidateData(raw: Record<string, any>): Partial<StudentInfo> {
  const examCategories: ExamCategory[] = [
    'Internal Assessment (CIE)',
    'External University Practical (SEE)',
    'Semester End Exam (SEE)',
    'Weekly Lab Practical',
    'College Coding Competition',
    'Coding Hackathon / Contest',
    'Project Viva & Defense',
    'Lab Practical Evaluation',
    'Multiple Choice Question (MCQ) Examination'
  ];

  const matchedExamType = examCategories.find((cat) => cat === raw.examType) || 'Internal Assessment (CIE)';

  return {
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    rollNumber: typeof raw.rollNumber === 'string' ? raw.rollNumber.trim() : (typeof raw.usn === 'string' ? raw.usn.trim() : ''),
    department: typeof raw.department === 'string' ? raw.department.trim() : (typeof raw.branch === 'string' ? raw.branch.trim() : ''),
    course: typeof raw.course === 'string' ? raw.course.trim() : (typeof raw.subject === 'string' ? raw.subject.trim() : ''),
    semester: typeof raw.semester === 'string' ? raw.semester.trim() : '',
    assignmentTitle: typeof raw.assignmentTitle === 'string' ? raw.assignmentTitle.trim() : (typeof raw.problemTitle === 'string' ? raw.problemTitle.trim() : ''),
    labId: typeof raw.labId === 'string' ? raw.labId.trim() : 'LAB-01',
    labName: typeof raw.labName === 'string' ? raw.labName.trim() : '',
    stationNumber: typeof raw.stationNumber === 'string' ? raw.stationNumber.trim() : (typeof raw.station === 'string' ? raw.station.trim() : 'Station #01'),
    invigilatorName: typeof raw.invigilatorName === 'string' ? raw.invigilatorName.trim() : '',
    examDurationMinutes: typeof raw.examDurationMinutes === 'number' ? raw.examDurationMinutes : 90,
    examType: matchedExamType,
    examMode: raw.examMode === 'MCQ' ? 'MCQ' : 'CODING',
    mcqExamId: typeof raw.mcqExamId === 'string' ? raw.mcqExamId.trim() : ''
  };
}

/**
 * High-fidelity test token for instant preview and validation demonstration.
 */
export const SAMPLE_CANDIDATE_TOKEN = generateExamToken({
  name: 'Devraj Sengupta',
  rollNumber: '1RV22CS088',
  department: 'Computer Science & Engineering',
  course: 'CS402 - Advanced Data Structures & Algorithms Lab',
  semester: '4th Semester',
  examType: 'Internal Assessment (CIE)',
  assignmentTitle: 'Implementation of Red-Black Tree Balancing & Self-Auditing',
  labId: 'LAB-01',
  labName: 'Alan Turing Computing Lab',
  stationNumber: 'Station #07',
  invigilatorName: 'Dr. S. K. Raman',
  examDurationMinutes: 90,
  examMode: 'CODING'
});

export const SAMPLE_MCQ_TOKEN = generateExamToken({
  name: 'Ananya Sharma',
  rollNumber: '1RV22CS042',
  department: 'Computer Science & Engineering',
  course: 'CS301 - Data Structures & Algorithms',
  semester: '4th Semester',
  examType: 'Internal Assessment (CIE)',
  assignmentTitle: 'Data Structures & Algorithms MCQ Evaluation',
  labId: 'LAB-01',
  labName: 'Alan Turing Computing Lab',
  stationNumber: 'Station #04',
  invigilatorName: 'Dr. S. K. Raman',
  examDurationMinutes: 45,
  examMode: 'MCQ'
});
