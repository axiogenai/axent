import { CompilerExecutionResult } from '../types/dna';

// Judge0 Language ID Mapping for 14 major college programming languages
export const LANGUAGE_IDS: Record<
  string,
  { id: number; name: string; fileExt: string; compiler: string }
> = {
  Python: {
    id: 71,
    name: 'Python',
    fileExt: 'py',
    compiler: 'Python (3.8.1)'
  },
  'C++': {
    id: 54,
    name: 'C++',
    fileExt: 'cpp',
    compiler: 'GCC 9.2.0 (C++17)'
  },
  C: {
    id: 50,
    name: 'C',
    fileExt: 'c',
    compiler: 'GCC 9.2.0 (C11)'
  },
  Java: {
    id: 62,
    name: 'Java',
    fileExt: 'java',
    compiler: 'OpenJDK 13.0.1'
  },
  JavaScript: {
    id: 63,
    name: 'JavaScript',
    fileExt: 'js',
    compiler: 'Node.js 12.14.0'
  },
  TypeScript: {
    id: 74,
    name: 'TypeScript',
    fileExt: 'ts',
    compiler: 'TypeScript 3.7.4'
  },
  Go: {
    id: 60,
    name: 'Go',
    fileExt: 'go',
    compiler: 'Go 1.13.5'
  },
  Rust: {
    id: 73,
    name: 'Rust',
    fileExt: 'rs',
    compiler: 'Rust 1.40.0'
  },
  'C#': {
    id: 51,
    name: 'C#',
    fileExt: 'cs',
    compiler: 'Mono 6.6.0.161'
  },
  PHP: {
    id: 68,
    name: 'PHP',
    fileExt: 'php',
    compiler: 'PHP 7.4.1'
  },
  Ruby: {
    id: 72,
    name: 'Ruby',
    fileExt: 'rb',
    compiler: 'Ruby 2.7.0'
  },
  Kotlin: {
    id: 78,
    name: 'Kotlin',
    fileExt: 'kt',
    compiler: 'Kotlin 1.3.70'
  },
  Swift: {
    id: 83,
    name: 'Swift',
    fileExt: 'swift',
    compiler: 'Swift 5.2.3'
  },
  Bash: {
    id: 46,
    name: 'Bash',
    fileExt: 'sh',
    compiler: 'Bash 5.0.0'
  }
};

/**
 * Execute real code via public Judge0 CE API with automatic fallback.
 */
export async function runRealCode(
  sourceCode: string,
  language: string,
  stdin = ''
): Promise<CompilerExecutionResult> {
  const langConfig = LANGUAGE_IDS[language] || LANGUAGE_IDS['Python'];

  try {
    const res = await fetch('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: langConfig.id,
        stdin: stdin || ''
      })
    });

    if (!res.ok) {
      throw new Error(`Compiler endpoint returned HTTP ${res.status}`);
    }

    const data = await res.json();

    const stdout: string = data.stdout || '';
    const stderr: string | null = data.stderr || null;
    const compileOutput: string | null = data.compile_output || null;
    const statusDesc: string = data.status?.description || 'Executed';
    const isError = Boolean(
      (data.status?.id && data.status.id > 3) || stderr || compileOutput
    );

    return {
      stdout: stdout || (isError ? '' : 'Program finished with no output.'),
      stderr,
      compileOutput,
      exitCode: isError ? 1 : 0,
      time: data.time ? `${data.time}s` : '0.01s',
      memory: data.memory ? Math.round(data.memory) : 3200,
      statusDescription: statusDesc,
      isError,
      engineUsed: `Judge0 Cloud Compiler (${langConfig.compiler})`
    };
  } catch (err: unknown) {
    console.warn('Direct compiler API failed, falling back:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      stdout: '',
      stderr: `Execution Connection Error: ${msg}\nPlease verify internet connectivity.`,
      compileOutput: null,
      exitCode: 1,
      time: '0.00s',
      memory: 0,
      statusDescription: 'Connection Error',
      isError: true,
      engineUsed: 'Judge0 Cloud Compiler'
    };
  }
}
