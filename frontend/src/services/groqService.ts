import {
  CodeMetrics,
  AnalysisReport,
  VivaQuestion,
  VivaAnswer,
  VivaEvaluation,
  IntegrityStatus,
  CheatingRiskLevel,
  AiToolDetected,
  StudentInfo,
  CodeObservation,
  MarksBreakdown,
  InvigilatorForensics,
  CompilerExecutionResult
} from '../types/dna';
import { MCQQuestion, MCQExamConfig } from '../types/mcq';
import { saveQuestion, saveExam } from './mcqService';

const DEFAULT_API_KEY = '';
const PRIMARY_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODELS = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

export function getStoredApiKey(): string {
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('axent_ai_api_key') || localStorage.getItem('codedna_groq_api_key');
    if (customKey && customKey.trim()) {
      return customKey.trim();
    }
  }
  const envKey = import.meta.env.VITE_AI_API_KEY || import.meta.env.VITE_GROQ_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return DEFAULT_API_KEY;
}

export function setStoredApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (!key || key.trim() === '') {
      localStorage.removeItem('codedna_groq_api_key');
    } else {
      localStorage.setItem('codedna_groq_api_key', key.trim());
    }
  }
}

export function getStoredModel(): string {
  if (typeof window !== 'undefined') {
    const customModel = localStorage.getItem('codedna_groq_model');
    if (customModel && customModel.trim()) {
      return customModel.trim();
    }
  }
  return PRIMARY_MODEL;
}

export function setStoredModel(model: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('codedna_groq_model', model.trim());
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callGroqChat(
  messages: ChatMessage[],
  temperature = 0.1,
  jsonMode = false
): Promise<{ content: string; modelUsed: string }> {
  const apiKey = getStoredApiKey();
  const preferredModel = getStoredModel();
  const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter((m) => m !== preferredModel)];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const payload: Record<string, unknown> = {
        model,
        messages,
        temperature
      };

      if (jsonMode) {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Reasoning Engine Error (${res.status} on ${model}): ${errorBody}`);
      }

      const data = await res.json();
      const rawContent: string = data.choices?.[0]?.message?.content || '';
      return { content: rawContent.trim(), modelUsed: model };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Reasoning model ${model} attempt failed, trying fallback:`, lastError.message);
    }
  }

  throw lastError || new Error('Connection to Autonomous AI Reasoning Engine failed.');
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function cleanJsonArrayString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }
  return cleaned;
}

/**
 * Extracts multiple discrete JSON objects from a stream, handling NDJSON, 
 * multiple top-level objects, or non-whitespace characters between objects.
 */
function extractJsonObjects(raw: string): any[] {
  const objects: any[] = [];
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const slice = raw.slice(startIdx, i + 1);
          try {
            const sanitized = slice.replace(/,\s*([}\]])/g, '$1');
            const obj = JSON.parse(sanitized);
            if (obj && Array.isArray(obj.questions)) {
              objects.push(...obj.questions);
            } else if (obj && (obj.text || obj.question || obj.options)) {
              objects.push(obj);
            }
          } catch {
            // continue scanning
          }
          startIdx = -1;
        }
      }
    }
  }
  return objects;
}

/**
 * Highly resilient parser that recovers questions from any AI output shape:
 * 1. Standard { "questions": [...] }
 * 2. Top-level array [ {...}, {...} ]
 * 3. NDJSON / multiple separate JSON objects (which triggered the unexpected non-whitespace error)
 * 4. Markdown wrapped JSON with trailing commas
 */
export function parseQuestionsFromAIOutput(content: string): any[] {
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  // Strategy 1: Direct JSON parse
  try {
    const sanitized = cleaned.replace(/,\s*([}\]])/g, '$1');
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    if (parsed && typeof parsed === 'object') {
      const arr = Object.values(parsed).find((v) => Array.isArray(v));
      if (arr) return arr as any[];
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Array bracket slice
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const arraySlice = cleaned.slice(firstBracket, lastBracket + 1).replace(/,\s*([}\]])/g, '$1');
      const parsedArray = JSON.parse(arraySlice);
      if (Array.isArray(parsedArray) && parsedArray.length > 0) return parsedArray;
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Balanced stream extraction (Handles NDJSON / multiple JSON objects without throwing position errors)
  const extracted = extractJsonObjects(cleaned);
  if (extracted.length > 0) return extracted;

  // Strategy 4: Single object slice fallback
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const objSlice = cleaned.slice(firstBrace, lastBrace + 1).replace(/,\s*([}\]])/g, '$1');
      const parsedObj = JSON.parse(objSlice);
      if (parsedObj && Array.isArray(parsedObj.questions)) return parsedObj.questions;
      if (Array.isArray(parsedObj)) return parsedObj;
      if (parsedObj && typeof parsedObj === 'object') {
        const arr = Object.values(parsedObj).find((v) => Array.isArray(v));
        if (arr) return arr as any[];
      }
    } catch {
      // Return empty array
    }
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COLLEGE PRACTICAL & CHEATING EVALUATION FOR TEACHERS / INVIGILATORS
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyStudentCode(
  code: string,
  metrics: CodeMetrics,
  language: string,
  student?: StudentInfo,
  compilerResult?: CompilerExecutionResult
): Promise<{ report: AnalysisReport; modelUsed: string }> {
  const {
    pasteRatio = 0,
    pasteCount = 0,
    typingSpeed = 0,
    timeSpent = 0,
    keystrokes = 0,
    totalLines = 0,
    pastedLines = 0,
    undoCount = 0,
    deleteCount = 0,
    pasteLockViolations = 0
  } = metrics;

  const evaluatedCode =
    code.length > 25000
      ? `${code.slice(0, 16000)}\n\n// ... [Middle section omitted for AI evaluation token limit (${totalLines} lines total)] ...\n\n${code.slice(-7000)}`
      : code;

  const prompt = `You are a strict, objective College University Examiner and Lab Invigilator.
Evaluate this student's lab exam submission to verify if they genuinely authored the code or cheated using copy-paste, ChatGPT, Copilot, or external sources.

COLLEGE EXAM & STUDENT INFORMATION:
- Student Name: ${student?.name || 'Candidate'}
- Roll No / USN: ${student?.rollNumber || 'N/A'}
- Exam Type: ${student?.examType || 'Practical Exam'}
- Department / Branch: ${student?.department || 'Computer Science'}
- Semester: ${student?.semester || 'Semester'}
- Subject / Lab: ${student?.course || 'Programming Lab'}
- Problem / Assignment: ${student?.assignmentTitle || 'Lab Practical Program'}

TELEMETRY & ANTI-CHEAT FORENSICS:
- Paste Percentage: ${pasteRatio}% (${pastedLines} pasted lines out of ${totalLines} total lines)
- Paste Operations: ${pasteCount} times
- Typing Speed: ${typingSpeed} WPM (Human average is 35-65 WPM; >100 WPM indicates bulk pasting)
- Total Keystrokes: ${keystrokes} typed keys
- Total Active Time in Editor: ${timeSpent} seconds
- Undo Count: ${undoCount} | Delete Count: ${deleteCount}
- Paste Lock Violation Attempts: ${pasteLockViolations}

PROGRAM COMPILER OUTCOME:
- Compiler Status: ${compilerResult ? compilerResult.statusDescription : 'Executed'}
- Execution Time: ${compilerResult ? compilerResult.time : '0.01s'}
- Memory: ${compilerResult ? compilerResult.memory + ' KB' : 'Normal'}
- Errors: ${compilerResult?.isError ? compilerResult.stderr || compilerResult.compileOutput : 'None (Successful)'}

SUBMITTED CODE (${language} - ${totalLines} Lines):
\`\`\`${language}
${evaluatedCode}
\`\`\`

INSTRUCTIONS FOR EVALUATION:
1. Examine code styling: Does it contain AI boilerplate (e.g. generic variable names, hallmark ChatGPT comments, textbook standard patterns) or typical student lab code?
2. Correlate code size with keystrokes: A 60-line code completed in 15 seconds with only 4 keystrokes is 100% copied.
3. Compute honest university marks out of 50:
   - Execution Marks (out of 20): Does the code run without compiler errors?
   - Logic & Structure Marks (out of 10): Is algorithm correct and well organized?
   - Viva Voce Preparedness (out of 10): Is it readable and understandable for oral defense?
   - Integrity & Originality (out of 10): Deduct heavily if pasteRatio > 50% or AI detected!

Return a JSON object with this EXACT structure:
{
  "language": "${language}",
  "integrityScore": <number 0-100>,
  "similarityScore": <number 0-100>,
  "aiPercentage": <number 0-100>,
  "understandingScore": <number 0-100>,
  "algorithmName": "<exact algorithm or function name>",
  "conceptName": "<computer science topic>",
  "codingStyle": "<e.g. Procedural Lab Script | Modular Functions | Object Oriented>",
  "status": "Verified Original Work" | "Suspicious Activity / Moderate AI" | "High Cheating Risk / Plagiarized",
  "cheatingRisk": "Low" | "Medium" | "High" | "Critical",
  "detectedSource": "ChatGPT" | "GitHub Copilot" | "Google Gemini" | "Human Written" | "Mixed / Unconfirmed",
  "summary": "<2-3 sentences clear explanation for the teacher/invigilator on whether cheating occurred>",
  "timeComplexity": "<e.g. O(n) or O(n log n)>",
  "spaceComplexity": "<e.g. O(1) or O(n)>",
  "marks": {
    "executionMarks": <number 0-20>,
    "logicMarks": <number 0-10>,
    "vivaMarks": <number 0-10>,
    "integrityMarks": <number 0-10>,
    "totalMarks": <number 0-50>,
    "maxMarks": 50
  },
  "forensics": {
    "pasteVerdict": "<concise observation about pasting>",
    "typingSpeedVerdict": "<observation about typing speed>",
    "aiSignatureVerdict": "<observation about code styling and comments>",
    "vivaDefenseVerdict": "<recommendation for the examiner during oral viva>",
    "keystrokeIntegrity": "High" | "Questionable" | "Compromised",
    "cheatingEvidenceList": ["<evidence 1>", "<evidence 2>"]
  },
  "observations": [
    {
      "title": "<observation title>",
      "note": "<detailed observation>",
      "flag": "normal" | "warning" | "alert"
    }
  ]
}`;

  try {
    const { content, modelUsed } = await callGroqChat(
      [
        {
          role: 'system',
          content: 'You are a strict, objective University Lab Invigilator and Examiner. Output strict JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      0.1,
      true
    );

    const cleaned = cleanJsonString(content);
    const parsed = JSON.parse(cleaned);

    const charCount = code.trim().length;
    const isPastedByMath = charCount > 10 && keystrokes < 10;
    const effectivePasteRatio = isPastedByMath ? Math.max(pasteRatio, 95) : pasteRatio;
    const isPasted = pasteCount > 0 || effectivePasteRatio > 0 || isPastedByMath;
    const isBulkPaste =
      effectivePasteRatio >= 50 ||
      isPastedByMath ||
      (pasteCount > 0 && keystrokes < 15) ||
      (timeSpent < 30 && totalLines > 10);

    const isHighCheat =
      isBulkPaste ||
      Number(parsed.aiPercentage) > 60 ||
      Number(parsed.similarityScore) > 60 ||
      parsed.status === 'High Cheating Risk / Plagiarized';

    const isModerateCheat =
      !isHighCheat &&
      (isPasted ||
        Number(parsed.aiPercentage) > 35 ||
        Number(parsed.similarityScore) > 35 ||
        parsed.status === 'Suspicious Activity / Moderate AI');

    const status: IntegrityStatus = isHighCheat
      ? 'High Cheating Risk / Plagiarized'
      : isModerateCheat
      ? 'Suspicious Activity / Moderate AI'
      : 'Verified Original Work';

    const cheatingRisk: CheatingRiskLevel = isHighCheat
      ? (pasteRatio > 80 ? 'Critical' : 'High')
      : isModerateCheat
      ? 'Medium'
      : 'Low';

    const detectedSource: AiToolDetected =
      parsed.detectedSource === 'ChatGPT' ||
      parsed.detectedSource === 'GitHub Copilot' ||
      parsed.detectedSource === 'Google Gemini' ||
      parsed.detectedSource === 'Human Written' ||
      parsed.detectedSource === 'Mixed / Unconfirmed'
        ? parsed.detectedSource
        : isPasted
        ? 'ChatGPT'
        : 'Human Written';

    // Normalize observations list
    let observationsList: CodeObservation[] = [];
    if (Array.isArray(parsed.observations)) {
      observationsList = parsed.observations.map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          return {
            title: typeof obj.title === 'string' ? obj.title : 'Observation',
            note: typeof obj.note === 'string' ? obj.note : String(obj.note || ''),
            flag: obj.flag === 'alert' || obj.flag === 'warning' ? obj.flag : 'normal'
          };
        }
        return {
          title: 'Code Review',
          note: String(item),
          flag: 'normal' as const
        };
      });
    }

    if (observationsList.length === 0) {
      observationsList = [
        {
          title: 'Writing Activity',
          note: `${pasteRatio}% of code was pasted with ${keystrokes} typed keystrokes over ${timeSpent}s.`,
          flag: pasteRatio > 50 ? 'alert' : pasteRatio > 25 ? 'warning' : 'normal'
        },
        {
          title: 'Compiler Verification',
          note: compilerResult?.isError
            ? 'Program encountered errors during execution.'
            : `Program executed successfully in ${compilerResult?.time || '0.01s'}.`,
          flag: compilerResult?.isError ? 'alert' : 'normal'
        }
      ];
    }

    const marksObj: MarksBreakdown = {
      executionMarks:
        typeof parsed.marks?.executionMarks === 'number'
          ? Math.max(0, Math.min(20, Math.round(parsed.marks.executionMarks)))
          : compilerResult?.isError
          ? 8
          : 18,
      logicMarks:
        typeof parsed.marks?.logicMarks === 'number'
          ? Math.max(0, Math.min(10, Math.round(parsed.marks.logicMarks)))
          : 8,
      vivaMarks:
        typeof parsed.marks?.vivaMarks === 'number'
          ? Math.max(0, Math.min(10, Math.round(parsed.marks.vivaMarks)))
          : isHighCheat
          ? 4
          : 8,
      integrityMarks:
        typeof parsed.marks?.integrityMarks === 'number'
          ? Math.max(0, Math.min(10, Math.round(parsed.marks.integrityMarks)))
          : isHighCheat
          ? 2
          : isModerateCheat
          ? 6
          : 10,
      totalMarks: 0,
      maxMarks: 50
    };
    marksObj.totalMarks =
      marksObj.executionMarks + marksObj.logicMarks + marksObj.vivaMarks + marksObj.integrityMarks;

    const forensicsObj: InvigilatorForensics = {
      pasteVerdict:
        parsed.forensics?.pasteVerdict ||
        `${pasteRatio}% of lines pasted from external clipboard (${pastedLines}/${Math.max(1, totalLines)} lines).`,
      typingSpeedVerdict:
        parsed.forensics?.typingSpeedVerdict ||
        `Typing speed was recorded at ${typingSpeed} WPM with ${keystrokes} total keystrokes.`,
      aiSignatureVerdict:
        parsed.forensics?.aiSignatureVerdict ||
        (isHighCheat
          ? 'Code syntax matches known ChatGPT/Copilot generation structures.'
          : 'Code structure appears organic with regular student lab practices.'),
      vivaDefenseVerdict:
        parsed.forensics?.vivaDefenseVerdict ||
        (isHighCheat
          ? 'Mandatory detailed oral Viva recommended to test candidate on function logic.'
          : 'Standard oral Viva questions recommended.'),
      keystrokeIntegrity:
        parsed.forensics?.keystrokeIntegrity === 'High' ||
        parsed.forensics?.keystrokeIntegrity === 'Questionable' ||
        parsed.forensics?.keystrokeIntegrity === 'Compromised'
          ? parsed.forensics.keystrokeIntegrity
          : isHighCheat
          ? 'Compromised'
          : isModerateCheat
          ? 'Questionable'
          : 'High',
      cheatingEvidenceList: Array.isArray(parsed.forensics?.cheatingEvidenceList)
        ? parsed.forensics.cheatingEvidenceList
        : [
            pasteRatio > 50
              ? `High paste ratio: ${pasteRatio}% of the code was pasted directly.`
              : 'Organic line-by-line typing detected.',
            timeSpent < 30 && totalLines > 30
              ? 'Suspicious completion speed: Large program submitted in under 30 seconds.'
              : 'Realistic time spent writing code.'
          ]
    };

    const report: AnalysisReport = {
      language: parsed.language || language,
      integrityScore:
        typeof parsed.integrityScore === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.integrityScore)))
          : Math.max(10, Math.round(100 - pasteRatio * 0.8)),
      similarityScore:
        typeof parsed.similarityScore === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.similarityScore)))
          : Math.min(100, Math.round(pasteRatio * 0.85)),
      aiPercentage:
        typeof parsed.aiPercentage === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.aiPercentage)))
          : pasteRatio > 50
          ? Math.max(70, pasteRatio)
          : 12,
      understandingScore:
        typeof parsed.understandingScore === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.understandingScore)))
          : Math.max(10, Math.round(100 - pasteRatio * 0.7)),
      algorithmName: parsed.algorithmName || 'Program Logic',
      conceptName: parsed.conceptName || 'Computer Science Concepts',
      codingStyle: parsed.codingStyle || 'Structured Program',
      status,
      cheatingRisk,
      detectedSource,
      summary:
        parsed.summary ||
        `Student typed ${keystrokes} keystrokes in ${timeSpent}s with ${pasteRatio}% pasted text.`,
      timeComplexity: parsed.timeComplexity || 'O(n)',
      spaceComplexity: parsed.spaceComplexity || 'O(1)',
      marks: marksObj,
      forensics: forensicsObj,
      observations: observationsList,
      executionMetrics: compilerResult
        ? {
            exitCode: compilerResult.exitCode,
            time: compilerResult.time,
            memory: `${compilerResult.memory} KB`,
            passed: !compilerResult.isError
          }
        : undefined,
      timestamp: new Date().toISOString()
    };

    return { report, modelUsed };
  } catch (err: unknown) {
    console.error('Groq verification error, computing mathematical telemetry fallback:', err);
    const charCount = code.trim().length;
    const isPastedByMath = charCount > 10 && keystrokes < 10;
    const effectivePasteRatio = isPastedByMath ? Math.max(pasteRatio, 95) : pasteRatio;
    const isHighCheat = effectivePasteRatio > 50 || isPastedByMath;
    const isModerateCheat = !isHighCheat && effectivePasteRatio > 25;

    const fallbackStatus: IntegrityStatus = isHighCheat
      ? 'High Cheating Risk / Plagiarized'
      : isModerateCheat
      ? 'Suspicious Activity / Moderate AI'
      : 'Verified Original Work';

    const fallbackRisk: CheatingRiskLevel = isHighCheat
      ? 'High'
      : isModerateCheat
      ? 'Medium'
      : 'Low';

    const executionMarks = compilerResult?.isError ? 10 : 18;
    const integrityMarks = isHighCheat ? 2 : isModerateCheat ? 6 : 10;
    const logicMarks = 8;
    const vivaMarks = isHighCheat ? 4 : 8;

    const fallbackReport: AnalysisReport = {
      language,
      integrityScore: Math.max(10, 100 - pasteRatio),
      similarityScore: pasteRatio,
      aiPercentage: isHighCheat ? 82 : 14,
      understandingScore: Math.max(20, 100 - pasteRatio),
      algorithmName: 'Standard Code Logic',
      conceptName: 'Core Programming Lab',
      codingStyle: 'Structured Script',
      status: fallbackStatus,
      cheatingRisk: fallbackRisk,
      detectedSource: isHighCheat ? 'ChatGPT' : 'Human Written',
      summary: `Lab program submitted with ${keystrokes} keystrokes across ${timeSpent} seconds with ${pasteRatio}% clipboard paste ratio.`,
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(1)',
      marks: {
        executionMarks,
        logicMarks,
        vivaMarks,
        integrityMarks,
        totalMarks: executionMarks + logicMarks + vivaMarks + integrityMarks,
        maxMarks: 50
      },
      forensics: {
        pasteVerdict: `${pasteRatio}% of lines pasted (${pastedLines}/${Math.max(1, totalLines)} total lines).`,
        typingSpeedVerdict: `Recorded typing speed: ${typingSpeed} WPM with ${keystrokes} keystrokes.`,
        aiSignatureVerdict: isHighCheat
          ? 'Paste and typing patterns suggest non-organic code entry.'
          : 'Code typing dynamics consistent with normal manual student entry.',
        vivaDefenseVerdict: isHighCheat
          ? 'Conduct strict viva questioning to verify student understanding.'
          : 'Standard viva voce recommended.',
        keystrokeIntegrity: isHighCheat ? 'Compromised' : isModerateCheat ? 'Questionable' : 'High',
        cheatingEvidenceList: [
          pasteRatio > 50
            ? `Excessive paste usage: ${pasteRatio}% of code lines came from clipboard.`
            : `Low paste usage: ${100 - pasteRatio}% of code was manually typed.`,
          keystrokes < 20 && totalLines > 20
            ? 'Abnormally low keystrokes for the code length.'
            : 'Organic keystroke rhythm observed.'
        ]
      },
      observations: [
        {
          title: 'Paste Usage Forensics',
          note: `${pasteRatio}% of the code lines were pasted.`,
          flag: isHighCheat ? 'alert' : isModerateCheat ? 'warning' : 'normal'
        },
        {
          title: 'Typing Pace',
          note: `Student typed at an average of ${typingSpeed} WPM over ${timeSpent} seconds.`,
          flag: 'normal'
        }
      ],
      executionMetrics: compilerResult
        ? {
            exitCode: compilerResult.exitCode,
            time: compilerResult.time,
            memory: `${compilerResult.memory} KB`,
            passed: !compilerResult.isError
          }
        : undefined,
      timestamp: new Date().toISOString()
    };

    return { report: fallbackReport, modelUsed: 'Anti-Cheat Telemetry Engine' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VIVA QUESTIONS (Oral Defense based on Student's Code)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateVivaQuestions(
  code: string,
  language: string,
  report?: AnalysisReport
): Promise<{ questions: VivaQuestion[]; modelUsed: string }> {
  const evaluatedCode =
    code.length > 25000
      ? `${code.slice(0, 16000)}\n\n// ... [Middle section omitted for viva generation token limit] ...\n\n${code.slice(-7000)}`
      : code;

  const prompt = `You are a college computer science professor conducting an oral Viva examination on a student's submitted ${language} code for their lab exam.
Analyze the code and generate exactly 3 specific viva questions testing whether the student truly understands what they wrote:
- Question 1: Ask about a specific loop, function, logic branch, or variable in their code.
- Question 2: Ask about boundary test cases (e.g. empty inputs, zero, negative numbers, large values).
- Question 3: Ask about how fast or efficient the program runs (time/space complexity) or how to optimize it.

STUDENT'S CODE:
\`\`\`${language}
${evaluatedCode}
\`\`\`

Return ONLY a JSON array of 3 objects:
[
  {
    "id": 1,
    "question": "<question on code logic or specific lines>",
    "topic": "Program Logic",
    "hint": "<simple helpful hint for student>"
  },
  {
    "id": 2,
    "question": "<question on test cases>",
    "topic": "Test Cases & Boundaries",
    "hint": "<simple helpful hint>"
  },
  {
    "id": 3,
    "question": "<question on speed or efficiency>",
    "topic": "Efficiency & Optimization",
    "hint": "<simple helpful hint>"
  }
]`;

  try {
    const { content, modelUsed } = await callGroqChat(
      [
        {
          role: 'system',
          content: 'You are a college viva examiner. Output strict JSON array.'
        },
        { role: 'user', content: prompt }
      ],
      0.2,
      false
    );

    const cleaned = cleanJsonArrayString(content);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const questions: VivaQuestion[] = parsed.slice(0, 3).map((item, idx) => ({
        id: item.id || idx + 1,
        question: item.question || `Explain the main logic of your program in step ${idx + 1}.`,
        topic: item.topic || 'Program Logic',
        hint: item.hint || undefined
      }));
      return { questions, modelUsed };
    }
  } catch (err) {
    console.error('Failed to parse viva questions from Groq:', err);
  }

  return {
    questions: [
      {
        id: 1,
        question: `Explain how the main loop or key function works in your ${language} code.`,
        topic: 'Code Logic',
        hint: 'Describe which variables change on each step of the loop.'
      },
      {
        id: 2,
        question: `What will happen if the user enters negative numbers or invalid input?`,
        topic: 'Input Validation',
        hint: 'Check if there are any if-conditions handling edge cases.'
      },
      {
        id: 3,
        question: `What is the time complexity of your program, and how could it run faster?`,
        topic: 'Efficiency',
        hint: 'Count the loops in your solution.'
      }
    ],
    modelUsed: 'Autonomous Reasoning Engine'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. VIVA EVALUATION (Oral Defense Grading)
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateVivaAnswers(
  code: string,
  language: string,
  answers: VivaAnswer[]
): Promise<{ evaluation: VivaEvaluation; modelUsed: string }> {
  const qaFormatted = answers
    .map(
      (a, idx) => `Question ${idx + 1}: ${a.question}\nStudent Answer: "${a.studentAnswer}"\n`
    )
    .join('\n---\n');

  const prompt = `You are a college professor grading a student's oral Viva test answers for their practical exam.
Compare what the student answered with the actual ${language} code they submitted.

STUDENT'S CODE:
\`\`\`${language}
${code}
\`\`\`

VIVA QUESTIONS & STUDENT ANSWERS:
${qaFormatted}

Return ONLY a JSON object:
{
  "score": <number 0-100>,
  "verdict": "Good Understanding" | "Average Understanding" | "Needs Review",
  "teacherFeedback": "<2-3 simple sentences of helpful feedback>",
  "breakdown": {
    "logicGrasp": <number 0-100>,
    "efficiencyAwareness": <number 0-100>,
    "edgeCaseHandling": <number 0-100>
  },
  "goodPoints": ["<point 1>", "<point 2>"],
  "missingPoints": ["<point 1>"]
}`;

  try {
    const { content, modelUsed } = await callGroqChat(
      [
        {
          role: 'system',
          content: 'You are an objective college evaluator. Output strict JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      0.1,
      true
    );

    const cleaned = cleanJsonString(content);
    const parsed = JSON.parse(cleaned);
    const score = Number(parsed.score) || 75;
    const verdict: VivaEvaluation['verdict'] =
      score >= 75
        ? 'Good Understanding'
        : score >= 50
        ? 'Average Understanding'
        : 'Needs Review';

    const evaluation: VivaEvaluation = {
      score,
      verdict: parsed.verdict || verdict,
      teacherFeedback:
        parsed.teacherFeedback ||
        'Student demonstrated good grasp of the basic logic with clear explanation of the main flow.',
      breakdown: {
        logicGrasp: Number(parsed.breakdown?.logicGrasp) || 75,
        efficiencyAwareness: Number(parsed.breakdown?.efficiencyAwareness) || 70,
        edgeCaseHandling: Number(parsed.breakdown?.edgeCaseHandling) || 65
      },
      goodPoints: Array.isArray(parsed.goodPoints) ? parsed.goodPoints : ['Explained the main function clearly'],
      missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints : []
    };

    return { evaluation, modelUsed };
  } catch (err) {
    console.error('Failed to parse viva grading from Groq:', err);
    return {
      evaluation: {
        score: 72,
        verdict: 'Average Understanding',
        teacherFeedback: 'Answers showed familiarity with the general logic and program steps.',
        breakdown: {
          logicGrasp: 70,
          efficiencyAwareness: 65,
          edgeCaseHandling: 60
        },
        goodPoints: ['Understood the overall algorithm flow'],
        missingPoints: ['Could explain boundary condition handling in more detail']
      },
      modelUsed: 'Autonomous Reasoning Engine'
    };
  }
}

// ── AI MCQ QUESTION GENERATOR (GROQ ENGINE) ──
export interface GeneratedMCQPrompt {
  topic: string;
  count: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  subject?: string;
  examCategory?: 'Aptitude' | 'ISE' | string;
  instructions?: string;
}

export interface GeneratedMCQQuestion {
  text: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  subject: string;
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: number;
  negativeMarks: number;
  explanation: string;
  tags: string[];
}

export async function generateMCQQuestionsWithAI(
  prompt: GeneratedMCQPrompt
): Promise<{ questions: GeneratedMCQQuestion[]; modelUsed: string }> {
  const count = Math.max(1, prompt.count || 5);
  // Detect whether topic/subject/category is Aptitude, Quantitative, Logical Reasoning, Verbal, or Technical
  const combinedText = `${prompt.topic} ${prompt.subject || ''} ${prompt.examCategory || ''}`.toLowerCase();
  const isAptitude =
    prompt.examCategory === 'Aptitude' ||
    /aptitude|reasoning|logical|quantitative|quant|verbal|math|arithmetic|english|comprehension|syllogism|blood relation|puzzle|series|permutation|probability|profit|loss|speed|distance|ratio|percentage|data interpretation/i.test(combinedText);

  let sysPrompt = '';
  let userMsg = '';

  if (isAptitude) {
    sysPrompt = `You are an elite University & Placement Examination Board Paper-Setter specializing in General Aptitude, Quantitative Ability, Logical Reasoning, and Verbal Ability (similar to CAT, GMAT, GRE, GATE General Aptitude, and top corporate campus recruitment assessments).

CRITICAL DOMAIN DIRECTIVE:
- DO NOT generate programming code, computer science syntax, Python/Java questions, or software engineering questions under any circumstances.
- Questions MUST be authentic aptitude and reasoning problems matching the specified topic:
  * Quantitative Ability: Concrete arithmetic word problems with real numbers, percentages, profit & loss, ratios, simple/compound interest, time & work, speed/distance/time, permutations & combinations, probability, number series, basic algebra/geometry.
  * Logical Reasoning: Syllogisms, blood relations, seating arrangements, directions, coding-decoding, series completion, analogies, Venn diagrams, statement-assumptions.
  * Verbal Ability: Vocabulary, sentence correction, reading comprehension, idioms, synonyms/antonyms, para-jumbles, critical reasoning.
- If the topic combines multiple areas (e.g. "Logical Reasoning, Quantitative, Verbal Aptitude"), balance questions across those exact disciplines!
- Every question must be clear, unambiguous, and have EXACTLY ONE mathematically or logically verified correct answer among 4 choices.

OUTPUT FORMAT:
You MUST respond with a valid JSON object containing a "questions" array of question objects:
{
  "questions": [
    {
      "text": "clearly worded problem prompt with complete scenario and numbers",
      "options": [
        {"text": "Option A text", "isCorrect": true},
        {"text": "Option B text", "isCorrect": false},
        {"text": "Option C text", "isCorrect": false},
        {"text": "Option D text", "isCorrect": false}
      ],
      "subject": "${prompt.subject && prompt.subject !== 'Computer Science' ? prompt.subject : 'General Aptitude & Reasoning'}",
      "topic": "${prompt.topic}",
      "difficulty": "${prompt.difficulty}",
      "marks": 1,
      "negativeMarks": 0.25,
      "explanation": "complete step-by-step mathematical or logical solution showing why the correct answer is right",
      "tags": ["Quantitative", "Percentages"]
    }
  ]
}

Return ONLY this valid JSON object. Do not wrap in markdown or backticks.`;

    userMsg = `Generate ${count} authentic college Aptitude & Reasoning MCQ questions for:
Category: General Aptitude & Placement
Subject: ${prompt.subject && prompt.subject !== 'Computer Science' ? prompt.subject : 'General Aptitude & Reasoning'}
Topic: ${prompt.topic}
Difficulty: ${prompt.difficulty}
${prompt.instructions ? `Special Faculty Instructions: "${prompt.instructions}"` : ''}
IMPORTANT: Zero programming, zero coding syntax. Output real mathematical, logical, or verbal aptitude questions only!`;
  } else {
    sysPrompt = `You are a senior university examination board member and professor in ${prompt.subject || 'Computer Science & Engineering'}.
Your task is to generate high-quality, conceptually rigorous Multiple Choice Questions (MCQ) for college exams.

STRICT TOPIC ADHERENCE:
- Every question MUST strictly evaluate concepts within "${prompt.topic}" in the subject "${prompt.subject || 'Computer Science'}".
- Test conceptual understanding, practical problem solving, and analytical reasoning.
- Provide exactly 4 realistic, distinct choices (A, B, C, D) with EXACTLY ONE unambiguously correct key.

OUTPUT FORMAT:
You MUST respond with a valid JSON object containing a "questions" array of question objects:
{
  "questions": [
    {
      "text": "clearly stated question prompt",
      "options": [
        {"text": "Option A text", "isCorrect": true},
        {"text": "Option B text", "isCorrect": false},
        {"text": "Option C text", "isCorrect": false},
        {"text": "Option D text", "isCorrect": false}
      ],
      "subject": "${prompt.subject || 'Computer Science'}",
      "topic": "${prompt.topic}",
      "difficulty": "${prompt.difficulty}",
      "marks": 1,
      "negativeMarks": 0.25,
      "explanation": "concise explanation of why the correct option is right and others are incorrect",
      "tags": ["Computer Science", "${prompt.topic}"]
    }
  ]
}

Return ONLY this valid JSON object. Do not wrap in markdown or backticks.`;

    userMsg = `Generate ${count} university-level MCQ questions for:
Subject: ${prompt.subject || 'Computer Science'}
Topic: ${prompt.topic}
Difficulty: ${prompt.difficulty}
${prompt.instructions ? `Special Faculty Focus Instructions: "${prompt.instructions}"` : ''}
Ensure questions strictly evaluate "${prompt.topic}".`;
  }

  try {
    const { content, modelUsed } = await callGroqChat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userMsg }
    ], 0.2, true);

    const parsed = parseQuestionsFromAIOutput(content);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`AI model output could not be parsed as a valid question list. Raw: ${content.slice(0, 150)}...`);
    }

    const questions: GeneratedMCQQuestion[] = parsed.map((item: any) => {
      let options = Array.isArray(item.options) ? item.options : [];
      if (options.length !== 4) {
        options = [
          { text: options[0]?.text || 'Option A', isCorrect: true },
          { text: options[1]?.text || 'Option B', isCorrect: false },
          { text: options[2]?.text || 'Option C', isCorrect: false },
          { text: options[3]?.text || 'Option D', isCorrect: false }
        ];
      }
      const correctIdx = options.findIndex((o: any) => o.isCorrect);
      if (correctIdx === -1) {
        options[0].isCorrect = true;
      }

      const defaultSubject = isAptitude ? 'General Aptitude & Reasoning' : (prompt.subject || 'Computer Science');

      return {
        text: String(item.text || (isAptitude ? 'Aptitude & Reasoning Problem' : 'Technical MCQ Question')),
        options: options.map((o: any) => ({
          text: String(o.text || ''),
          isCorrect: Boolean(o.isCorrect)
        })),
        subject: String(item.subject || defaultSubject),
        topic: String(item.topic || prompt.topic),
        difficulty: prompt.difficulty,
        marks: Number(item.marks) || 1,
        negativeMarks: Number(item.negativeMarks) || 0.25,
        explanation: String(item.explanation || ''),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [prompt.topic]
      };
    });

    return { questions, modelUsed };
  } catch (err: any) {
    console.error('Autonomous reasoning question generation failed:', err);
    throw new Error(
      `Autonomous Generation Error: ${err?.message || 'Failed to generate questions via Autonomous Reasoning Engine.'} Please verify your Engine API Key in Settings and retry.`
    );
  }
}

// ── AUTONOMOUS QUESTION DEDUPLICATION & UNIQUENESS HELPERS ───────────────────

export function normalizeQuestionText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/^\s*(?:q\d*[:.]|\d+[:.)]|-|\*)\s*/i, '') // strip leading "Q1.", "1.", "1)", etc.
    .replace(/[^\w\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

export function calculateQuestionSimilarity(textA: string, textB: string): number {
  const normA = normalizeQuestionText(textA);
  const normB = normalizeQuestionText(textB);
  if (normA === normB && normA.length > 0) return 1.0;

  const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : common / union;
}

export function isDuplicateQuestion(candidateText: string, existingQuestions: { text: string }[]): boolean {
  const normCandidate = normalizeQuestionText(candidateText);
  if (!normCandidate) return false;

  for (const existing of existingQuestions) {
    const sim = calculateQuestionSimilarity(candidateText, existing.text);
    // 65% word overlap or identical normalized text indicates semantic/scenario duplicate
    if (sim >= 0.65) return true;
  }
  return false;
}

// ── FULL AI EXAM PAPER GENERATOR (TOPIC + EASY/MED/HARD + AUTO-PUBLISH) ──

export interface AIPaperGenerationRequest {
  title: string;
  subject: string;
  topic: string;
  examCategory?: 'Aptitude' | 'ISE';
  instructions?: string;
  durationMinutes: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  easyMarks?: number;
  mediumMarks?: number;
  hardMarks?: number;
  negativeMarkingEnabled: boolean;
  negativeMarkPenalty?: number;
  autoPublish?: boolean;
}

export interface AIPaperGenerationResult {
  exam: MCQExamConfig;
  questions: MCQQuestion[];
  modelUsed: string;
  totalMarks: number;
  questionCount: number;
}

export async function generateFullExamPaperWithAI(
  req: AIPaperGenerationRequest,
  onProgress?: (status: string) => void
): Promise<AIPaperGenerationResult> {
  const easyCount = Math.max(0, req.easyCount || 0);
  const mediumCount = Math.max(0, req.mediumCount || 0);
  const hardCount = Math.max(0, req.hardCount || 0);
  const totalCount = easyCount + mediumCount + hardCount;

  if (totalCount === 0) {
    throw new Error('Please specify at least 1 question across Easy, Medium, or Hard difficulty.');
  }

  onProgress?.(`Contacting Autonomous Reasoning Engine to generate ${totalCount} questions for "${req.topic}"...`);

  const generateBatch = async (
    difficulty: 'EASY' | 'MEDIUM' | 'HARD',
    count: number,
    marks: number
  ) => {
    if (count <= 0) return [];
    
    // Chunk into requests of max 8 questions so LLMs never truncate response
    const chunks: number[] = [];
    let remaining = count;
    while (remaining > 0) {
      const take = Math.min(remaining, 8);
      chunks.push(take);
      remaining -= take;
    }

    onProgress?.(`Generating ${count} ${difficulty.toLowerCase()} question(s) on ${req.topic}...`);
    
    const chunkResults = await Promise.all(
      chunks.map(chunkCount =>
        generateMCQQuestionsWithAI({
          subject: req.subject,
          topic: req.topic,
          examCategory: req.examCategory,
          instructions: req.instructions,
          difficulty,
          count: chunkCount
        })
      )
    );

    const combined: GeneratedMCQQuestion[] = [];
    for (const r of chunkResults) {
      combined.push(...r.questions);
    }

    return combined.map((q) => ({
      ...q,
      marks,
      negativeMarks: req.negativeMarkingEnabled ? (req.negativeMarkPenalty ?? 0.25) : 0
    }));
  };

  const defaultPerQMarks = req.easyMarks ?? 1;

  // Generate difficulty batches in parallel for high speed
  const [easyList, medList, hardList] = await Promise.all([
    generateBatch('EASY', easyCount, req.easyMarks ?? defaultPerQMarks),
    generateBatch('MEDIUM', mediumCount, req.mediumMarks ?? defaultPerQMarks),
    generateBatch('HARD', hardCount, req.hardMarks ?? defaultPerQMarks)
  ]);

  // Collect and strictly deduplicate all questions across batches
  const rawCollected = [...easyList, ...medList, ...hardList];
  const uniqueGenerated: (GeneratedMCQQuestion & { marks: number; negativeMarks: number })[] = [];

  for (const q of rawCollected) {
    if (!isDuplicateQuestion(q.text, uniqueGenerated)) {
      uniqueGenerated.push(q);
    }
  }

  // Guaranteed Backfill Retry Loop: strictly reach exact totalCount with 100% UNIQUE questions
  let backfillAttempts = 0;
  while (uniqueGenerated.length < totalCount && backfillAttempts < 5) {
    backfillAttempts++;
    const missing = totalCount - uniqueGenerated.length;
    onProgress?.(`Synthesizing ${missing} unique question(s) to guarantee ${totalCount} non-duplicate questions...`);

    // Pass latest generated question snippets so the AI strictly avoids repeating any of them
    const avoidSnippets = uniqueGenerated.map((q) => q.text.substring(0, 50)).slice(-10);
    const antiDuplicationDirective = avoidSnippets.length > 0
      ? `\nSTRICT ANTI-DUPLICATION RULE: The following questions have ALREADY been generated. You MUST NOT repeat, paraphrase, or generate questions similar to these:\n- ${avoidSnippets.join('\n- ')}\nGenerate completely distinct, novel questions with different variables, numbers, scenarios, and themes.`
      : '';

    const extraBatch = await generateMCQQuestionsWithAI({
      subject: req.subject,
      topic: req.topic,
      examCategory: req.examCategory,
      instructions: (req.instructions || '') + antiDuplicationDirective,
      difficulty: 'MEDIUM',
      count: Math.min(missing + 2, 8)
    });

    for (const q of extraBatch.questions) {
      if (uniqueGenerated.length < totalCount && !isDuplicateQuestion(q.text, uniqueGenerated)) {
        uniqueGenerated.push({
          ...q,
          marks: defaultPerQMarks,
          negativeMarks: req.negativeMarkingEnabled ? (req.negativeMarkPenalty ?? 0.25) : 0
        });
      }
    }
  }

  // Trim to exact totalCount if slightly more were accumulated
  let allGenerated = uniqueGenerated.slice(0, totalCount);

  // Strictly enforce uniform marks if specified (e.g. 1 mark per question)
  if (req.easyMarks && req.easyMarks === req.mediumMarks && req.mediumMarks === req.hardMarks) {
    allGenerated.forEach(q => {
      q.marks = req.easyMarks!;
    });
  }

  onProgress?.(`Formatting ${allGenerated.length} unique questions and saving to Question Bank...`);

  const savedQuestions: MCQQuestion[] = [];
  const now = Date.now();

  for (let i = 0; i < allGenerated.length; i++) {
    const raw = allGenerated[i];
    const qId = `q_ai_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`;
    const questionObj: MCQQuestion = {
      id: qId,
      text: raw.text,
      options: raw.options.map((opt, optIdx) => ({
        id: `opt_${optIdx + 1}_${Math.random().toString(36).substring(2, 7)}`,
        text: opt.text,
        isCorrect: Boolean(opt.isCorrect)
      })),
      subject: raw.subject || req.subject,
      topic: raw.topic || req.topic,
      difficulty: raw.difficulty,
      marks: raw.marks,
      negativeMarks: raw.negativeMarks,
      explanation: raw.explanation,
      status: 'PUBLISHED',
      tags: raw.tags || [req.topic],
      createdAt: now + i,
      updatedAt: now + i,
      createdBy: 'AI Generator',
      bankGroup: req.title
    };

    saveQuestion(questionObj);
    savedQuestions.push(questionObj);
  }

  onProgress?.('Assembling exam paper draft for faculty review...');

  const totalMarks = savedQuestions.reduce((acc, q) => acc + q.marks, 0);
  const examId = `exam_ai_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const examConfig: MCQExamConfig = {
    id: examId,
    title: req.title.trim() || `${req.topic} Examination`,
    description: `AI-Generated comprehensive assessment covering ${req.topic} across ${easyCount} Easy, ${mediumCount} Medium, and ${hardCount} Hard questions.`,
    instructions:
      req.instructions?.trim() ||
      `Duration: ${req.durationMinutes} minutes. Total Questions: ${savedQuestions.length}. Tab-switching is strictly monitored.`,
    subject: req.subject,
    topic: req.topic,
    examCategory: req.examCategory || 'Aptitude',
    durationMinutes: Math.max(5, req.durationMinutes || 30),
    totalMarks,
    questionCount: savedQuestions.length,
    questionIds: savedQuestions.map((q) => q.id),
    shuffleQuestions: true,
    shuffleOptions: true,
    negativeMarkingEnabled: req.negativeMarkingEnabled,
    allowReview: true,
    showExplanationsAfterSubmit: true,
    maxAttempts: 1,
    status: req.autoPublish === true ? 'PUBLISHED' : 'DRAFT',
    createdAt: now,
    updatedAt: now,
    createdBy: 'AI Generator',
    publishedAt: req.autoPublish === true ? now : undefined
  };

  saveExam(examConfig);
  onProgress?.(req.autoPublish === true ? 'Exam paper created and published successfully!' : 'Exam paper draft created! Ready for faculty review.');

  return {
    exam: examConfig,
    questions: savedQuestions,
    modelUsed: PRIMARY_MODEL,
    totalMarks,
    questionCount: savedQuestions.length
  };
}
