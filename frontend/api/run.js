// Server-side code runner proxy: avoids browser CORS / per-IP rate limits and tries several engines in order.
// POST { language, code, stdin } -> { stdout, stderr, compileOutput, exitCode, time, memory, statusDescription, isError, engineUsed }

const WANDBOX_LANG = {
  Python: { language: 'Python', prefer: ['cpython-3.14.0', 'cpython-3.13.0', 'cpython-3.12.0', 'cpython-head'], match: /^cpython-\d/ },
  'C++': { language: 'C++', prefer: ['gcc-13.2.0', 'gcc-14.1.0', 'gcc-head'], match: /^gcc-\d+(\.\d+)*$/ },
  C: { language: 'C', prefer: ['gcc-13.2.0-c', 'gcc-14.1.0-c', 'gcc-head-c'], match: /^gcc-\d+(\.\d+)*-c$/ },
  Java: { language: 'Java', prefer: ['openjdk-jdk-21+35', 'openjdk-head'], match: /^openjdk-/ }
};
const PISTON_LANG = { Python: 'python', 'C++': 'c++', C: 'c', Java: 'java' };
const JUDGE0_ID = { Python: 71, 'C++': 54, C: 50, Java: 62 };

let wandboxList = null;
let wandboxListAt = 0;

async function withTimeout(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

async function resolveWandboxCompilers(lang) {
  const cfg = WANDBOX_LANG[lang];
  if (!cfg) return [];
  const out = [];
  try {
    if (!wandboxList || Date.now() - wandboxListAt > 6 * 3600 * 1000) {
      const r = await withTimeout('https://wandbox.org/api/list.json', {}, 4000);
      if (r.ok) {
        wandboxList = await r.json();
        wandboxListAt = Date.now();
      }
    }
    if (Array.isArray(wandboxList)) {
      const names = wandboxList.filter((c) => c.language === cfg.language).map((c) => c.name);
      for (const p of cfg.prefer) if (names.includes(p)) out.push(p);
      const ver = (n) => (n.match(/\d+(\.\d+)*/) || ['0'])[0].split('.').map(Number);
      const cmp = (a, b) => {
        const x = ver(b), y = ver(a);
        for (let i = 0; i < 4; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
        return 0;
      };
      names.filter((n) => cfg.match.test(n)).sort(cmp).forEach((n) => { if (!out.includes(n)) out.push(n); });
    }
  } catch {}
  for (const p of cfg.prefer) if (!out.includes(p)) out.push(p);
  return out.slice(0, 3);
}

async function runWandbox(lang, code, stdin) {
  const compilers = await resolveWandboxCompilers(lang);
  let lastErr = 'no compiler';
  for (const compiler of compilers) {
    try {
      const src = lang === 'Java' ? code.replace(/\bpublic\s+class\b/g, 'class') : code;
      const r = await withTimeout('https://wandbox.org/api/compile.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compiler, code: src, stdin: stdin || '' })
      }, 9000);
      if (!r.ok) { lastErr = `wandbox ${compiler} HTTP ${r.status}`; continue; }
      const d = await r.json();
      const status = parseInt(d.status || '0', 10);
      const msg = String(d.compiler_error || d.compiler_output || '').trim();
      const out = d.program_output || '';
      const perr = d.program_error || null;
      const buildFailed = status !== 0 && !out && !perr && msg !== '';
      return {
        stdout: out,
        stderr: perr,
        compileOutput: buildFailed ? msg : null,
        exitCode: status,
        time: '0.03s',
        memory: 4096,
        statusDescription: status === 0 ? 'Accepted' : (buildFailed ? 'Compilation Error' : 'Runtime Error'),
        isError: status !== 0,
        engineUsed: `Wandbox ${compiler}`
      };
    } catch (e) {
      lastErr = String(e && e.message || e);
    }
  }
  throw new Error(lastErr);
}

async function runPiston(lang, code, stdin) {
  const language = PISTON_LANG[lang];
  const r = await withTimeout('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, version: '*', files: [{ name: lang === 'Java' ? 'Main.java' : undefined, content: code }], stdin: stdin || '' })
  }, 9000);
  if (!r.ok) throw new Error(`piston HTTP ${r.status}`);
  const d = await r.json();
  if (!d.run) throw new Error('piston: ' + (d.message || 'bad response'));
  const comp = d.compile && d.compile.code !== 0 ? (d.compile.stderr || d.compile.output || 'Compilation failed') : null;
  const isError = Boolean(comp) || d.run.code !== 0;
  return {
    stdout: d.run.stdout || '',
    stderr: d.run.stderr || null,
    compileOutput: comp,
    exitCode: d.run.code ?? 0,
    time: '0.03s',
    memory: 4096,
    statusDescription: comp ? 'Compilation Error' : (isError ? 'Runtime Error' : 'Accepted'),
    isError,
    engineUsed: 'Piston'
  };
}

async function runJudge0(lang, code, stdin) {
  const r = await withTimeout('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: code, language_id: JUDGE0_ID[lang], stdin: stdin || '' })
  }, 12000);
  if (!r.ok) throw new Error(`judge0 HTTP ${r.status}`);
  const d = await r.json();
  const comp = d.compile_output || null;
  const isError = Boolean(d.status && d.status.id > 3);
  return {
    stdout: d.stdout || '',
    stderr: d.stderr || null,
    compileOutput: comp && isError ? comp : null,
    exitCode: isError ? 1 : 0,
    time: d.time ? `${d.time}s` : '0.02s',
    memory: d.memory ? Math.round(d.memory) : 3200,
    statusDescription: (d.status && d.status.description) || 'Executed',
    isError,
    engineUsed: 'Judge0 CE'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { language, code, stdin } = body;
  if (!WANDBOX_LANG[language] || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Unsupported language or empty code' });
  }
  if (code.length > 100000) return res.status(413).json({ error: 'Code too large' });

  let cleanCode = code;
  if (language === 'Python' && !cleanCode.includes('from __future__ import annotations')) {
    cleanCode = `from __future__ import annotations\nimport sys\nimport typing\nfrom typing import *\n${cleanCode}`;
  }

  const errors = [];
  for (const runner of [runWandbox, runPiston, runJudge0]) {
    try {
      return res.status(200).json(await runner(language, cleanCode, stdin || ''));
    } catch (e) {
      errors.push(String(e && e.message || e));
    }
  }
  return res.status(502).json({ error: 'All compilers unreachable', details: errors });
}
