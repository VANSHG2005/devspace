import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

const TIMEOUT_MS = parseInt(process.env.EXECUTION_TIMEOUT_MS) || 10000;
const ALLOWED_LANGUAGES = ['javascript', 'python'];

/**
 * POST /api/execute
 * Sandboxed code execution for JavaScript and Python
 */
export const executeCode = async (req, res, next) => {
  const { code, language } = req.body;

  if (!ALLOWED_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: `Language '${language}' not supported. Use: ${ALLOWED_LANGUAGES.join(', ')}` });
  }

  if (!code?.trim()) return res.status(400).json({ error: 'No code provided' });

  // Security: Detect dangerous patterns
  const FORBIDDEN_PATTERNS = [
    /require\s*\(\s*['"]child_process['"]\s*\)/,
    /require\s*\(\s*['"]fs['"]\s*\)/,
    /process\.exit/,
    /\beval\b/,
    /import\s+\w+\s+from\s+['"]fs['"]/,
    /__import__\s*\(\s*['"]os['"]/,
    /subprocess\./,
    /os\.system/,
  ];

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return res.status(403).json({ error: 'Code contains forbidden operations' });
    }
  }

  const tmpFile = join(tmpdir(), `devspace-${uuidv4()}.${language === 'python' ? 'py' : 'js'}`);

  try {
    await writeFile(tmpFile, code, 'utf8');

    const cmd = language === 'python' ? 'python3' : 'node';
    const args = [tmpFile];

    const output = await new Promise((resolve, reject) => {
      const proc = execFile(cmd, args, {
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB output limit
        env: { PATH: process.env.PATH }, // Minimal env for security
      }, (error, stdout, stderr) => {
        if (error) {
          if (error.killed) return reject(new Error(`Execution timed out after ${TIMEOUT_MS / 1000}s`));
          return reject(new Error(stderr || error.message));
        }
        resolve(stdout);
      });

      // Kill after timeout
      setTimeout(() => proc.kill(), TIMEOUT_MS);
    });

    res.json({ output: output || '(no output)', language, exitCode: 0 });
  } catch (err) {
    logger.warn(`Code execution error: ${err.message}`);
    res.status(200).json({ output: `Error: ${err.message}`, language, exitCode: 1 });
  } finally {
    unlink(tmpFile).catch(() => {}); // Always clean up tmp file
  }
};
