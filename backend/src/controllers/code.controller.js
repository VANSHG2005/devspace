/**
 * Code Execution Controller — DevSpace
 * Strategy:
 *   - JavaScript / TypeScript → Node.js vm (no external API needed, always works)
 *   - All other languages → Judge0 CE API (free tier, handles C, C++, Java, Python, Go, Rust etc)
 *   - HTML/React/Vue/Svelte → static analysis only (rendered client-side in iframe)
 */
import vm from 'vm'
import { writeFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

const TIMEOUT_MS = parseInt(process.env.CODE_EXEC_TIMEOUT_MS) || 10000

// ── Judge0 language IDs ────────────────────────────────────────────────────
const JUDGE0_LANG = {
  python:     71,   // Python 3.8
  py:         71,
  c:          50,   // C (GCC 9.2)
  cpp:        54,   // C++ (GCC 9.2)
  'c++':      54,
  java:       62,   // Java (OpenJDK 13)
  go:         60,   // Go 1.13
  rust:       73,   // Rust 1.40
  rs:         73,
  nodejs:     63,   // Node.js 12
  node:       63,
  typescript: 74,   // TypeScript 3.7 (Judge0 native TS)
  ts:         74,
  ruby:       72,   // Ruby 2.7
  php:        68,   // PHP 7.4
  kotlin:     78,   // Kotlin 1.3
  swift:      83,   // Swift 5.2
  csharp:     51,   // C# Mono 6.6
  'c#':       51,
  bash:       46,   // Bash 5.0
  r:          80,   // R 4.0
}

// ── Judge0 submission ───────────────────────────────────────────────────────
// Uses free public Judge0 CE instance — no API key required
// Docs: https://github.com/judge0/judge0
const JUDGE0_HOSTS = [
  'https://judge0-ce.p.rapidapi.com',   // RapidAPI (needs key, pay per use)
  'https://api.judge0.com',             // Official free public instance
]

const runOnJudge0 = async (code, languageId) => {
  const apiKey  = process.env.JUDGE0_API_KEY  // optional - only for RapidAPI
  const baseUrl = process.env.JUDGE0_URL || 'https://judge0-ce.p.rapidapi.com'

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers['X-RapidAPI-Key']  = apiKey
    headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com'
  }

  let submitRes
  try {
    submitRes = await fetch(`${baseUrl}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
        cpu_time_limit: 10,
        memory_limit: 128000,
      }),
    })
  } catch (e) {
    return { output: null, error: `Could not reach code execution server: ${e.message}` }
  }

  if (!submitRes.ok) {
    const txt = await submitRes.text().catch(() => '')
    return { output: null, error: `Execution server error (${submitRes.status}): ${txt.slice(0,200)}` }
  }

  const result = await submitRes.json()
  const stdout = result.stdout?.trim() || ''
  const stderr = (result.stderr || result.compile_output || '')?.trim()
  const status = result.status?.description || ''

  if (result.status?.id === 5)  return { output: null, error: `⏱ Time Limit Exceeded` }
  if (result.status?.id === 6)  return { output: null, error: stderr || 'Compilation Error' }
  if (result.status?.id >= 7)   return { output: stdout || null, error: stderr || `Runtime Error: ${status}` }

  return {
    output: stdout || '(no output)',
    error: stderr && !stdout ? stderr : null,
  }
}

// ── Main handler ────────────────────────────────────────────────────────────
export const executeCode = async (req, res, next) => {
  const { code, language = 'javascript' } = req.body
  if (!code?.trim()) return res.status(400).json({ error: 'No code provided' })

  const lang = language.toLowerCase()
  let output = '', error = null

  try {

    // ── JavaScript — always runs locally in vm sandbox ────────────────────
    if (lang === 'javascript' || lang === 'js') {
      const logs = []
      const ctx = vm.createContext({
        console: {
          log:   (...a) => logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)).join(' ')),
          error: (...a) => logs.push('stderr: ' + a.map(String).join(' ')),
          warn:  (...a) => logs.push('warn: '  + a.map(String).join(' ')),
          info:  (...a) => logs.push(a.map(String).join(' ')),
          table: (...a) => logs.push(JSON.stringify(a[0], null, 2)),
          dir:   (...a) => logs.push(JSON.stringify(a[0], null, 2)),
        },
        Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Error,
        parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
        setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {}, clearInterval: () => {},
        Promise, Map, Set, WeakMap, WeakSet, Symbol,
        process: { env: {}, argv: [], version: process.version },
      })
      try {
        const result = new vm.Script(code, { timeout: TIMEOUT_MS }).runInContext(ctx, { timeout: TIMEOUT_MS })
        if (result !== undefined && logs.length === 0) logs.push(String(result))
        output = logs.join('\n') || '(no output)'
      } catch (err) {
        error = err.message
      }

    // ── TypeScript — strip types, run as JS locally ───────────────────────
    } else if (lang === 'typescript' || lang === 'ts') {
      // Try Judge0 native TS first, fall back to local strip-and-run
      const judgeId = JUDGE0_LANG['typescript']
      if (process.env.JUDGE0_API_KEY) {
        const r = await runOnJudge0(code, judgeId)
        output = r.output || ''; error = r.error
      } else {
        const stripped = code
          .replace(/:\s*\w[\w\s|&<>\[\]]*(?=[,)=;\n{])/g, '')
          .replace(/<[A-Z]\w*>/g, '')
          .replace(/^(interface|type)\s+\w+[^{]*\{[^}]*\}/gm, '')
          .replace(/\b(public|private|protected|readonly|abstract|override)\s+/g, '')
          .replace(/^export\s+/gm, '')
        const logs = []
        const ctx = vm.createContext({
          console: { log: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push('stderr: '+a.join(' ')), warn: (...a) => logs.push('warn: '+a.join(' ')), info: (...a) => logs.push(a.join(' ')) },
          Math, JSON, Array, Object, String, Number, Boolean, Date, parseInt, parseFloat, isNaN, Promise, Map, Set,
          setTimeout: ()=>{}, setInterval: ()=>{},
        })
        try {
          const result = new vm.Script(stripped, { timeout: TIMEOUT_MS }).runInContext(ctx, { timeout: TIMEOUT_MS })
          if (result !== undefined && logs.length === 0) logs.push(String(result))
          output = logs.join('\n') || '(no output)'
        } catch (err) { error = err.message }
      }

    // ── HTML/CSS/Tailwind — rendered in iframe client-side ────────────────
    } else if (['html', 'tailwind'].includes(lang)) {
      output = '🌐 Click the Preview tab to see your HTML rendered live in the browser.'
      error = null

    // ── React / Vue / Svelte / Next — client-side iframe preview ─────────
    } else if (['react', 'react-ts', 'jsx', 'tsx', 'nextjs', 'vue', 'svelte'].includes(lang)) {
      const lines = code.split('\n').length
      const hasExport = code.includes('export default')
      output = `✅ ${lang.toUpperCase()} component ready!\n📄 ${lines} lines · ${hasExport ? '✓ has export default' : '⚠ no export default found'}\n\n🌐 Click the Preview tab to render it live.`
      error = null

    // ── Node.js / Express — run via Judge0 as Node ────────────────────────
    } else if (['nodejs', 'node', 'express'].includes(lang)) {
      const safeCode = code
        .replace(/server\.listen\s*\([^)]*\)/g, "console.log('Server would start here')")
        .replace(/app\.listen\s*\([^)]*\)/g,    "console.log('Express server would start here')")
      const r = await runOnJudge0(safeCode, JUDGE0_LANG['nodejs'])
      output = r.output || ''; error = r.error

    // ── Flask / Django — run as Python via Judge0 ─────────────────────────
    } else if (['flask', 'django'].includes(lang)) {
      const wrapper = `
import sys
from unittest.mock import MagicMock
# Mock web framework imports so logic runs without a server
for mod in ['flask','django','django.db','django.db.models','django.http','django.urls','django.conf']:
    sys.modules[mod] = MagicMock()
try:
    exec("""${code.replace(/"/g, '\\"').replace(/\\/g, '\\\\')}""")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
`
      const r = await runOnJudge0(wrapper, JUDGE0_LANG['python'])
      output = r.output || `✅ ${lang} code loaded (mock mode — no real server)`;
      error = r.error

    // ── All other languages via Judge0 ────────────────────────────────────
    } else {
      const langId = JUDGE0_LANG[lang]
      if (!langId) {
        return res.status(400).json({ error: `Language "${language}" is not supported.` })
      }
      const r = await runOnJudge0(code, langId)
      output = r.output || ''; error = r.error
    }

    res.json({ output, error, language, executedAt: new Date().toISOString() })

  } catch (err) {
    next(err)
  }
}