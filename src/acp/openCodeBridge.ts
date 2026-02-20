import { spawn } from 'child_process'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Minimal opencode config dir that omits user-installed plugins.
// The superpowers.js plugin injects synthetic noReply messages without an
// agent field, causing Agent.get(undefined) → TypeError in opencode 1.2.6.
const BOT_XDG_CONFIG = join(tmpdir(), 'obsigram-opencode-xdg')

function ensureBotConfig(): void {
  const dir = join(BOT_XDG_CONFIG, 'opencode')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'opencode.json'), '{}')
  }
}

export interface AcpResult {
  success: boolean
  filePath?: string
  error?: string
}

// Kept for unit tests
export function parseAcpOutput(output: string): AcpResult {
  const match = output.match(/FILE_WRITTEN:\s*(.+)/)
  if (match) return { success: true, filePath: match[1].trim() }
  return { success: false, error: 'No FILE_WRITTEN marker found in output' }
}

const DEFAULT_MODEL = process.env.OPENCODE_MODEL ?? 'github-copilot/gpt-5-mini'

export async function run(
  prompt: string,
  timeoutMs = 240_000,
  model = DEFAULT_MODEL,
  cwd = process.cwd(),
): Promise<AcpResult> {
  return new Promise((resolve) => {
    const args = [
      'run',
      '--model', model,
      '--agent', 'build',
      '--format', 'json',
      '--print-logs',
      '--',
      prompt,
    ]

    ensureBotConfig()
    const proc = spawn('opencode', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      env: { ...process.env, XDG_CONFIG_HOME: BOT_XDG_CONFIG },
    })

    let output = ''
    let timedOut = false
    let resolved = false

    const finish = (result: AcpResult): void => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill()
      finish({ success: false, error: `opencode process timeout after ${timeoutMs}ms` })
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        output += line + '\n'
        // Stream interesting events to console
        try {
          const event = JSON.parse(line) as { type?: string; part?: { type?: string; text?: string } }
          if (event.type === 'text' && event.part?.text) {
            process.stdout.write(`[opencode] ${event.part.text.slice(0, 120)}\n`)
          }
          if (event.type?.toLowerCase().includes('question')) {
            proc.kill()
            finish({ success: false, error: 'opencode asked a follow-up question; please tighten prompt to avoid interactive Q&A' })
            return
          }
        } catch { /* not JSON */ }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      process.stderr.write(`[opencode log] ${text}`)
      if (text.includes('service=question') && text.includes('asking')) {
        proc.kill()
        finish({ success: false, error: 'opencode entered question flow; prompt now requires no follow-up questions' })
      }
    })

    proc.on('exit', (code) => {
      if (resolved) return
      if (timedOut) return

      if (code !== 0) {
        console.error('[opencode] process exited with code', code)
        finish({ success: false, error: `opencode exited with code ${code}` })
        return
      }

      const fileMatch = output.match(/FILE_WRITTEN:\s*(\S+)/)
      if (fileMatch) {
        finish({ success: true, filePath: fileMatch[1].trim() })
        return
      }

      finish({ success: false, error: `No FILE_WRITTEN marker. Output: ${output.slice(0, 300)}` })
    })

    proc.on('error', (err) => {
      if (resolved) return
      if (timedOut) return
      finish({ success: false, error: `Failed to spawn opencode: ${err.message}` })
    })
  })
}

// No-op: startAcpServer kept for compatibility, does nothing in this implementation
export async function startAcpServer(_cwd: string, _port: number): Promise<void> {
  console.log('[opencode] using opencode run mode (per-request spawn)')
}

export const server = {
  stop: () => {},
}
