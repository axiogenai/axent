import { MCQOption, MCQDifficulty } from '../types/mcq';

export interface ParsedGoogleFormQuestion {
  id: string;
  text: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  marks: number;
  negativeMarks: number;
  explanation: string;
  difficulty: MCQDifficulty;
  subject?: string;
  topic?: string;
  hasExplicitAnswer?: boolean;
}

export interface GoogleFormParseResult {
  questions: ParsedGoogleFormQuestion[];
  errors: string[];
  totalParsed: number;
}

/**
 * Robust parser for Google Forms quiz exports, copy-pasted quiz text,
 * Markdown, TSV, CSV, and structured question blocks.
 */
export function parseGoogleFormQuizText(
  rawInput: string,
  defaultSubject = 'General',
  defaultTopic = 'Technical'
): GoogleFormParseResult {
  const text = rawInput.trim();
  if (!text) {
    return { questions: [], errors: [], totalParsed: 0 };
  }

  const errors: string[] = [];
  const questions: ParsedGoogleFormQuestion[] = [];

  // ── Mode 1: JSON Format ──
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      list.forEach((item, idx) => {
        if (!item.text || !item.options || item.options.length < 2) {
          errors.push(`Item #${idx + 1}: Missing question text or requires at least 2 options.`);
          return;
        }

        const options = item.options.map((opt: any) => ({
          id: crypto.randomUUID(),
          text: typeof opt === 'string' ? opt.trim() : String(opt.text || '').trim(),
          isCorrect: typeof opt === 'object' ? Boolean(opt.isCorrect) : false
        }));

        const hasCorrect = options.some((o: any) => o.isCorrect);
        if (!hasCorrect && options.length > 0) {
          options[0].isCorrect = true;
        }

        questions.push({
          id: crypto.randomUUID(),
          text: String(item.text).trim(),
          options,
          marks: Number(item.marks) || 1,
          negativeMarks: Number(item.negativeMarks) || 0,
          explanation: String(item.explanation || '').trim(),
          difficulty: item.difficulty === 'HARD' || item.difficulty === 'EASY' ? item.difficulty : 'MEDIUM',
          subject: item.subject || defaultSubject,
          topic: item.topic || defaultTopic,
          hasExplicitAnswer: hasCorrect
        });
      });

      return { questions, errors, totalParsed: questions.length };
    } catch {
      // If JSON parsing fails, continue to text/tab/CSV parsing
    }
  }

  // ── Mode 2: TSV / Tabular (e.g. copied from Google Sheets / Google Form response sheet) ──
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isTsvOrCsv = rawLines.length >= 2 && (rawLines[0].includes('\t') || (rawLines[0].includes(',') && rawLines[0].split(',').length >= 5));

  if (isTsvOrCsv) {
    const isTab = rawLines[0].includes('\t');
    const separator = isTab ? '\t' : ',';
    let startIndex = 0;

    // Check if header row
    const firstLow = rawLines[0].toLowerCase();
    if (firstLow.includes('question') || firstLow.includes('option') || firstLow.includes('prompt')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < rawLines.length; i++) {
      const line = rawLines[i];
      const cols = line.split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 4) continue;

      const qText = cols[0];
      const optCols = cols.slice(1, Math.min(cols.length, 6)); // up to 4 options
      let ansCol = cols[5] || cols[cols.length - 1]; // answer column if present

      if (!qText || optCols.length < 2) continue;

      let correctIndex = 0;
      let explicit = false;

      // Check if answer is specified as letter or number or text
      if (ansCol) {
        const cleanAns = ansCol.toUpperCase().trim();
        if (cleanAns === 'A' || cleanAns === '1') { correctIndex = 0; explicit = true; }
        else if (cleanAns === 'B' || cleanAns === '2') { correctIndex = 1; explicit = true; }
        else if (cleanAns === 'C' || cleanAns === '3') { correctIndex = 2; explicit = true; }
        else if (cleanAns === 'D' || cleanAns === '4') { correctIndex = 3; explicit = true; }
        else {
          const matchIdx = optCols.findIndex((o) => o.toLowerCase() === ansCol.toLowerCase());
          if (matchIdx !== -1) {
            correctIndex = matchIdx;
            explicit = true;
          }
        }
      }

      const options = optCols.map((optText, idx) => ({
        id: crypto.randomUUID(),
        text: optText,
        isCorrect: idx === correctIndex
      }));

      questions.push({
        id: crypto.randomUUID(),
        text: qText,
        options,
        marks: 1,
        negativeMarks: 0,
        explanation: '',
        difficulty: 'MEDIUM',
        subject: defaultSubject,
        topic: defaultTopic,
        hasExplicitAnswer: explicit
      });
    }

    if (questions.length > 0) {
      return { questions, errors, totalParsed: questions.length };
    }
  }

  // ── Mode 3: Plain Text / Google Forms Quiz Copy-Paste ──
  // Split into question blocks. Questions can be separated by double newlines or question number prefixes
  const blocks: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentBlockLines: string[] = [];
  const isQuestionStart = (line: string) => {
    return (
      /^(?:Q(?:uestion)?\s*[\d]+[\.\:\)]?|\d+[\.\)])\s+/i.test(line) ||
      /^Problem\s*[\d]+[\.\:\)]/i.test(line)
    );
  };

  const hasExplicitNumbering = lines.some((l) => isQuestionStart(l));

  if (hasExplicitNumbering) {
    for (const line of lines) {
      if (isQuestionStart(line) && currentBlockLines.length > 0) {
        blocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [line];
      } else {
        currentBlockLines.push(line);
      }
    }
    if (currentBlockLines.length > 0) {
      blocks.push(currentBlockLines.join('\n'));
    }
  } else {
    // Split by empty lines
    const rawBlocks = text.split(/\n\s*\n+/);
    for (const b of rawBlocks) {
      if (b.trim()) blocks.push(b.trim());
    }
  }

  // Process each block
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    const bLines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (bLines.length < 2) continue;

    let questionText = '';
    const rawOptions: { text: string; isCorrect: boolean }[] = [];
    let detectedAnswerLetter = '';
    let explanation = '';
    let marks = 1;
    let hasExplicitCorrect = false;

    for (let i = 0; i < bLines.length; i++) {
      const line = bLines[i];

      // Check for Answer line
      const ansMatch = line.match(/^(?:Answer|Ans|Correct(?:\s*Answer)?|Key)\s*[:=\-]\s*(.+)/i);
      if (ansMatch) {
        detectedAnswerLetter = ansMatch[1].trim();
        hasExplicitCorrect = true;
        continue;
      }

      // Check for Explanation line
      const expMatch = line.match(/^(?:Explanation|Reason|Notes?)\s*[:=\-]\s*(.+)/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      // Check for Marks / Points line
      const marksMatch = line.match(/^(?:Points?|Marks?)\s*[:=\-]\s*(\d+(?:\.\d+)?)/i);
      if (marksMatch) {
        marks = parseFloat(marksMatch[1]) || 1;
        continue;
      }

      // Check for Google Form Quiz Starred / Checked option: * Option text, [x] Option text, (x) Option text
      const starMatch = line.match(/^(\*|\[x\]|\(x\)|\✓|\✔)\s*(.+)/i);
      if (starMatch && questionText) {
        rawOptions.push({ text: starMatch[2].trim(), isCorrect: true });
        hasExplicitCorrect = true;
        continue;
      }

      // Check for standard option prefix: A) B) C) D) or A. B. C. D. or a) b) c) d) or (A) (B) (C) or 1) 2) 3) or - •
      const optionPrefixMatch = line.match(/^(?:([A-Za-z0-9])[\.\)]|\(([A-Za-z0-9])\)|\-|\•|\[\s*\]|\(\s*\))\s*(.+)/);
      if (optionPrefixMatch && questionText) {
        let optText = (optionPrefixMatch[3] || '').trim();
        let isCorrect = false;

        // Check if option ends with (correct) or (ans) or *
        if (/\s*[\(\[]?(?:correct|answer)[\)\]]?\s*$/i.test(optText) || optText.endsWith('*')) {
          optText = optText.replace(/\s*[\(\[]?(?:correct|answer)[\)\]]?\s*$/i, '').replace(/\*+$/, '').trim();
          isCorrect = true;
          hasExplicitCorrect = true;
        }

        rawOptions.push({ text: optText, isCorrect });
        continue;
      }

      // If question text not yet captured
      if (!questionText) {
        questionText = line.replace(/^(?:Q(?:uestion)?\s*[\d]+[\.\:\)]?|\d+[\.\)])\s+/i, '').trim();
      } else if (rawOptions.length === 0 && !optionPrefixMatch) {
        // Multi-line question prompt
        questionText += ' ' + line;
      } else {
        // Raw option line without prefix
        let optText = line;
        let isCorrect = false;
        if (/\s*[\(\[]?(?:correct|answer)[\)\]]?\s*$/i.test(optText) || optText.endsWith('*')) {
          optText = optText.replace(/\s*[\(\[]?(?:correct|answer)[\)\]]?\s*$/i, '').replace(/\*+$/, '').trim();
          isCorrect = true;
          hasExplicitCorrect = true;
        }
        rawOptions.push({ text: optText, isCorrect });
      }
    }

    // Apply detectedAnswerLetter if available
    if (detectedAnswerLetter && rawOptions.length > 0) {
      const cleanLtr = detectedAnswerLetter.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanLtr.length === 1 && cleanLtr >= 'A' && cleanLtr <= 'Z') {
        const idx = cleanLtr.charCodeAt(0) - 65;
        if (idx >= 0 && idx < rawOptions.length) {
          rawOptions.forEach((o, i) => { o.isCorrect = (i === idx); });
          hasExplicitCorrect = true;
        }
      } else {
        // Try matching option text
        const matchIdx = rawOptions.findIndex((o) =>
          o.text.toLowerCase().includes(detectedAnswerLetter.toLowerCase()) ||
          detectedAnswerLetter.toLowerCase().includes(o.text.toLowerCase())
        );
        if (matchIdx !== -1) {
          rawOptions.forEach((o, i) => { o.isCorrect = (i === matchIdx); });
          hasExplicitCorrect = true;
        }
      }
    }

    // Ensure at least 1 option is marked correct
    const correctCount = rawOptions.filter((o) => o.isCorrect).length;
    if (correctCount === 0 && rawOptions.length > 0) {
      rawOptions[0].isCorrect = true; // Fallback to first option
    }

    if (questionText && rawOptions.length >= 2) {
      questions.push({
        id: crypto.randomUUID(),
        text: questionText,
        options: rawOptions.map((o) => ({
          id: crypto.randomUUID(),
          text: o.text,
          isCorrect: o.isCorrect
        })),
        marks,
        negativeMarks: 0,
        explanation,
        difficulty: 'MEDIUM',
        subject: defaultSubject,
        topic: defaultTopic,
        hasExplicitAnswer: hasExplicitCorrect
      });
    } else {
      errors.push(`Block #${bIdx + 1}: Found "${questionText.slice(0, 40)}..." but requires at least 2 options.`);
    }
  }

  return {
    questions,
    errors,
    totalParsed: questions.length
  };
}
