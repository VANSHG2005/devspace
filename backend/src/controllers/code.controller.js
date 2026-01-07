/**
 * Code Execution Controller
 * JavaScript: Node.js built-in vm module (no vm2 needed)
 * Python: child_process with temp file
 */
import vm from 'vm'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = parseInt(process.env.CODE_EXEC_TIMEOUT_MS) || 5000

export const executeCode = async (req, res, next) => {
  const { code, language = 'javascript' } = req.body
  if (!code?.trim()) return res.status(400).json({ error: 'No code provided' })

  try {
    let output = ''
    let error = null

    if (language === 'javascript') {
      const logs = []
      const context = vm.createContext({
        console: {
          log:   (...a) => logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)).join(' ')),
          error: (...a) => logs.push('[error] ' + a.map(String).join(' ')),
          warn:  (...a) => logs.push('[warn] '  + a.map(String).join(' ')),
          info:  (...a) => logs.push('[info] '  + a.map(String).join(' ')),
          table: (...a) => logs.push('[table] ' + JSON.stringify(a[0], null, 2)),
        },
        Math, JSON, Array, Object, String, Number, Boolean,
        parseInt, parseFloat, isNaN, isFinite,
        setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {}, clearInterval: () => {},
        Promise,
        // Allow require for common things (safe subset)
      })

      try {
        const script = new vm.Script(code, { timeout: TIMEOUT_MS })
        const result = script.runInContext(context, { timeout: TIMEOUT_MS })
        if (result !== undefined && logs.length === 0) logs.push(String(result))
        output = logs.join('\n') || '(no output)'
      } catch (err) {
        error = err.message
      }

    } else if (language === 'python') {
      const tmpFile = join(tmpdir(), `devspace_${uuidv4()}.py`)
      try {
        await writeFile(tmpFile, code)
        const { stdout, stderr } = await execFileAsync('python3', [tmpFile], {
          timeout: TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        })
        output = stdout || '(no output)'
        if (stderr) error = stderr
      } catch (err) {
        error = err.killed ? `Execution timeout (${TIMEOUT_MS}ms)` : (err.stderr || err.message)
      } finally {
        await unlink(tmpFile).catch(() => {})
      }

    } else {
      return res.status(400).json({ error: `Language "${language}" not supported. Use: javascript, python` })
    }

    res.json({ output, error, language, executedAt: new Date().toISOString() })
  } catch (err) { next(err) }
}
