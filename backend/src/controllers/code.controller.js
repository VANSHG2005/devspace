/**
 * Code Execution Controller — DevSpace
 * Supports: JavaScript, TypeScript, Python, C, C++, Java, Go (if installed),
 *           Rust (if installed), Flask (Python), Django (Python)
 * Uses: child_process for compiled/interpreted langs, vm for JS (sandboxed)
 */
import vm from 'vm'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)
const TIMEOUT_MS = parseInt(process.env.CODE_EXEC_TIMEOUT_MS) || 10000

// ── Helpers ────────────────────────────────────────────────────────────────

const cleanup = async (...paths) => {
  for (const p of paths) {
    if (!p) continue
    await rm(p, { recursive: true, force: true }).catch(() => {})
  }
}

const runExec = async (cmd, opts = {}) => {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      ...opts,
    })
    return { stdout: stdout?.trim() || '', stderr: stderr?.trim() || '', error: null }
  } catch (err) {
    if (err.killed || err.signal === 'SIGTERM') {
      return { stdout: '', stderr: '', error: `⏱ Execution timed out (${TIMEOUT_MS / 1000}s limit)` }
    }
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      error: err.stderr?.trim() || err.message,
    }
  }
}

const tmpId = () => uuidv4().replace(/-/g, '').slice(0, 12)

// ── Main handler ───────────────────────────────────────────────────────────

export const executeCode = async (req, res, next) => {
  const { code, language = 'javascript' } = req.body
  if (!code?.trim()) return res.status(400).json({ error: 'No code provided' })

  const lang = language.toLowerCase()
  let output = '', error = null, tmpFile = null, tmpDir = null

  try {

    // ── JavaScript (sandboxed vm) ────────────────────────────────────────
    if (lang === 'javascript' || lang === 'js') {
      const logs = []
      const ctx = vm.createContext({
        console: {
          log:   (...a) => logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)).join(' ')),
          error: (...a) => logs.push('stderr: ' + a.map(String).join(' ')),
          warn:  (...a) => logs.push('warn: ' + a.map(String).join(' ')),
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

    // ── TypeScript (transpile with esbuild-wasm or fallback strip types) ─
    } else if (lang === 'typescript' || lang === 'ts') {
      // Strip basic TS syntax and run as JS (handles most beginner code)
      const stripped = code
        .replace(/:\s*\w+(\[\])?(\s*\|?\s*\w+(\[\])?)*(?=[,)=;\n{])/g, '')  // type annotations
        .replace(/<[A-Z]\w*>/g, '')                                           // generics
        .replace(/^(interface|type)\s+.*?(?=\n\n|\nconst|\nfunction|\nclass|$)/gms, '') // interfaces
        .replace(/\b(public|private|protected|readonly|abstract|override)\s+/g, '')
        .replace(/^export\s+/gm, '')
      const logs = []
      const ctx = vm.createContext({
        console: {
          log:  (...a) => logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)).join(' ')),
          error:(...a) => logs.push('stderr: ' + a.map(String).join(' ')),
          warn: (...a) => logs.push('warn: ' + a.map(String).join(' ')),
          info: (...a) => logs.push(a.map(String).join(' ')),
        },
        Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp,
        parseInt, parseFloat, isNaN, isFinite, Promise, Map, Set,
        setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {},
      })
      try {
        const result = new vm.Script(stripped, { timeout: TIMEOUT_MS }).runInContext(ctx, { timeout: TIMEOUT_MS })
        if (result !== undefined && logs.length === 0) logs.push(String(result))
        output = logs.join('\n') || '(no output)'
      } catch (err) {
        error = err.message
      }

    // ── Python ───────────────────────────────────────────────────────────
    } else if (lang === 'python' || lang === 'py') {
      tmpFile = join(tmpdir(), `ds_${tmpId()}.py`)
      await writeFile(tmpFile, code, 'utf8')
      const r = await runExec(`python3 "${tmpFile}"`)
      output = r.stdout || '(no output)'; error = r.error || (r.stderr && !r.stdout ? r.stderr : null)

    // ── C ────────────────────────────────────────────────────────────────
    } else if (lang === 'c') {
      tmpDir = join(tmpdir(), `ds_${tmpId()}`)
      await mkdir(tmpDir, { recursive: true })
      tmpFile = join(tmpDir, 'main.c')
      const binFile = join(tmpDir, 'main_out')
      await writeFile(tmpFile, code, 'utf8')
      const compile = await runExec(`gcc "${tmpFile}" -o "${binFile}" -lm -std=c11`)
      if (compile.error) {
        error = compile.stderr || compile.error
      } else {
        const run = await runExec(`"${binFile}"`)
        output = run.stdout || '(no output)'; error = run.error || (run.stderr && !run.stdout ? run.stderr : null)
      }

    // ── C++ ──────────────────────────────────────────────────────────────
    } else if (lang === 'cpp' || lang === 'c++') {
      tmpDir = join(tmpdir(), `ds_${tmpId()}`)
      await mkdir(tmpDir, { recursive: true })
      tmpFile = join(tmpDir, 'main.cpp')
      const binFile = join(tmpDir, 'main_out')
      await writeFile(tmpFile, code, 'utf8')
      const compile = await runExec(`g++ "${tmpFile}" -o "${binFile}" -std=c++17 -lm`)
      if (compile.error) {
        error = compile.stderr || compile.error
      } else {
        const run = await runExec(`"${binFile}"`)
        output = run.stdout || '(no output)'; error = run.error || (run.stderr && !run.stdout ? run.stderr : null)
      }

    // ── Java ─────────────────────────────────────────────────────────────
    } else if (lang === 'java') {
      tmpDir = join(tmpdir(), `ds_${tmpId()}`)
      await mkdir(tmpDir, { recursive: true })
      // Extract class name from code (must match filename)
      const classMatch = code.match(/public\s+class\s+(\w+)/)
      const className = classMatch ? classMatch[1] : 'Main'
      tmpFile = join(tmpDir, `${className}.java`)
      await writeFile(tmpFile, code, 'utf8')
      const compile = await runExec(`javac "${tmpFile}"`, { cwd: tmpDir })
      if (compile.error) {
        error = compile.stderr || compile.error
      } else {
        const run = await runExec(`java -cp "${tmpDir}" ${className}`)
        output = run.stdout || '(no output)'; error = run.error || (run.stderr && !run.stdout ? run.stderr : null)
      }

    // ── Go ───────────────────────────────────────────────────────────────
    } else if (lang === 'go') {
      tmpFile = join(tmpdir(), `ds_${tmpId()}.go`)
      await writeFile(tmpFile, code, 'utf8')
      const r = await runExec(`go run "${tmpFile}"`)
      output = r.stdout || '(no output)'; error = r.error || (r.stderr && !r.stdout ? r.stderr : null)

    // ── Rust ─────────────────────────────────────────────────────────────
    } else if (lang === 'rust' || lang === 'rs') {
      tmpDir = join(tmpdir(), `ds_${tmpId()}`)
      await mkdir(tmpDir, { recursive: true })
      tmpFile = join(tmpDir, 'main.rs')
      const binFile = join(tmpDir, 'main_out')
      await writeFile(tmpFile, code, 'utf8')
      const compile = await runExec(`rustc "${tmpFile}" -o "${binFile}"`)
      if (compile.error) {
        error = compile.stderr || compile.error
      } else {
        const run = await runExec(`"${binFile}"`)
        output = run.stdout || '(no output)'; error = run.error || (run.stderr && !run.stdout ? run.stderr : null)
      }

    // ── Flask (Python) ───────────────────────────────────────────────────
    } else if (lang === 'flask') {
      // Run as regular Python to test logic, not as a server
      // Wrap: mock Flask app, call routes, capture output
      const wrapper = `
import sys
from io import StringIO
from unittest.mock import MagicMock

# Mock Flask so code can be imported and routes extracted
class MockFlask:
    def __init__(self, *a, **kw):
        self.routes = {}
    def route(self, path, **kw):
        def decorator(f):
            self.routes[path] = f
            return f
        return decorator
    def run(self, *a, **kw):
        pass
    def get(self, path, **kw):
        return self.route(path, **kw)
    def post(self, path, **kw):
        return self.route(path, **kw)
    def jsonify(self, *a, **kw):
        import json
        return json.dumps(a[0] if a else kw)

flask_mock = MockFlask()
sys.modules['flask'] = type(sys)('flask')
sys.modules['flask'].Flask = MockFlask
sys.modules['flask'].jsonify = flask_mock.jsonify
sys.modules['flask'].request = MagicMock()

# Capture user code output
captured = StringIO()
sys.stdout = captured
try:
    exec(compile('''${code.replace(/'/g, "\\'")}''', '<flask_app>', 'exec'))
    sys.stdout = sys.__stdout__
    out = captured.getvalue()
    if not out.strip():
        # Try to call root route if defined
        try:
            app_vars = {k:v for k,v in locals().items() if hasattr(v,'routes')}
            if app_vars:
                app = list(app_vars.values())[0]
                if '/' in app.routes:
                    result = app.routes['/']()
                    print("GET / =>", result)
        except Exception as e:
            print("(Flask app loaded - use python3 to run server)")
    print(out, end='')
except Exception as e:
    sys.stdout = sys.__stdout__
    print(f"Error: {e}", file=sys.stderr)
`
      tmpFile = join(tmpdir(), `ds_${tmpId()}.py`)
      await writeFile(tmpFile, wrapper, 'utf8')
      const r = await runExec(`python3 "${tmpFile}"`)
      output = r.stdout || '✅ Flask app loaded successfully\n(Start server with app.run() locally)'
      error = r.error || (r.stderr && !r.stdout ? r.stderr : null)

    // ── Django (Python) ──────────────────────────────────────────────────
    } else if (lang === 'django') {
      // Run the code as plain Python (test models/logic, not full server)
      const wrapper = `
import sys, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')

# Mock Django modules so code doesn't crash on import
from unittest.mock import MagicMock
for mod in ['django','django.db','django.db.models','django.http',
            'django.urls','django.conf','django.core','django.contrib']:
    sys.modules[mod] = MagicMock()

try:
    exec(compile("""${code.replace(/"/g, '\\"')}""", '<django_app>', 'exec'))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
`
      tmpFile = join(tmpdir(), `ds_${tmpId()}.py`)
      await writeFile(tmpFile, wrapper, 'utf8')
      const r = await runExec(`python3 "${tmpFile}"`)
      output = r.stdout || '✅ Django code loaded\n(Run full server locally with: python manage.py runserver)'
      error = r.error || (r.stderr && !r.stdout ? r.stderr : null)

    // ── HTML/CSS/JS (return as-is with preview hint) ──────────────────────
    } else if (lang === 'html') {
      output = '🌐 HTML file — open in browser to preview\n\n' +
               'Tip: Use the "Share" button to share your workspace link,\n' +
               'or download the file and open in Chrome/Firefox.'
      error = null

    // ── React/Next/Vue/Svelte (static analysis) ───────────────────────────
    } else if (['react', 'react-ts', 'nextjs', 'vue', 'svelte', 'tailwind'].includes(lang)) {
      // Count components, detect syntax errors via simple checks
      const lines = code.split('\n').length
      const hasExport = code.includes('export default') || code.includes('module.exports')
      const hasReturn = code.includes('return (') || code.includes('return(')
      const hasSyntaxIssue = !hasReturn && !code.includes('//') && code.length > 50

      if (hasSyntaxIssue) {
        error = 'Warning: No return statement found. Make sure your component returns JSX.'
      } else {
        output = `✅ ${lang.toUpperCase()} component looks valid!\n` +
                 `📄 ${lines} lines · ${hasExport ? '✓ default export' : '⚠ no default export'}\n\n` +
                 `To run locally:\n` +
                 (lang === 'nextjs' ? '  npx create-next-app@latest\n  Replace app/page.tsx with this file' :
                  lang === 'vue'    ? '  npm create vue@latest\n  Replace App.vue with this file' :
                  lang === 'svelte' ? '  npm create svelte@latest\n  Replace App.svelte with this file' :
                                     '  npx create-react-app my-app\n  Replace src/App.jsx with this file')
      }

    // ── Node.js (run with child process) ─────────────────────────────────
    } else if (lang === 'nodejs' || lang === 'node') {
      tmpFile = join(tmpdir(), `ds_${tmpId()}.js`)
      // Replace server.listen / app.listen so it doesn't hang
      const safeCode = code
        .replace(/server\.listen\s*\(.*?\)/g, "console.log('Server would start here')")
        .replace(/app\.listen\s*\(.*?\)/g,    "console.log('Express server would start here')")
      await writeFile(tmpFile, safeCode, 'utf8')
      const r = await runExec(`node "${tmpFile}"`)
      output = r.stdout || '(no output)'; error = r.error || (r.stderr && !r.stdout ? r.stderr : null)

    // ── Express (run as Node, stub listen) ────────────────────────────────
    } else if (lang === 'express') {
      tmpFile = join(tmpdir(), `ds_${tmpId()}.js`)
      const safeCode = `
const express = (() => {
  try { return require('express') } catch(e) {
    const app = { _routes: {}, use(){return this}, get(p,cb){this._routes['GET '+p]=cb;return this},
      post(p,cb){this._routes['POST '+p]=cb;return this}, listen(port,cb){
        console.log('Express server would run on port '+port)
        const mockReq=(path)=>({path,query:{},params:{},body:{},headers:{},method:'GET'})
        const mockRes={json:(d)=>{console.log('Response:',JSON.stringify(d,null,2))},send:(d)=>console.log('Response:',d),status(){return this}}
        if(cb)cb()
        return this
      }
    }
    const fn = () => app; fn.Router=()=>app; return fn
  }
})()
${code.replace(/require\s*\(\s*['"]express['"]\s*\)/g, 'express')}
`
      await writeFile(tmpFile, safeCode, 'utf8')
      const r = await runExec(`node "${tmpFile}"`)
      output = r.stdout || '(no output)'; error = r.error || (r.stderr && !r.stdout ? r.stderr : null)

    } else {
      return res.status(400).json({ error: `Language "${language}" is not supported.` })
    }

    // Clean up temp files
    await cleanup(tmpFile, tmpDir)

    res.json({ output, error, language, executedAt: new Date().toISOString() })

  } catch (err) {
    await cleanup(tmpFile, tmpDir).catch(() => {})
    next(err)
  }
}
