import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Writable, Readable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import { toolDef as ytToolDef, handler as ytHandler } from '../tools/youtubeTranscript.js'
import { toolDef as svToolDef, handler as svHandler } from '../tools/searchVault.js'

// Registry of client-side tool handlers keyed by tool name.
// These are exposed to the Agent via clientCapabilities.tools (ACP extension).
// If opencode routes tool_call requests to the client, they will be executed here.
const TOOL_REGISTRY: Record<string, (params: Record<string, unknown>) => Promise<string>> = {
  [ytToolDef.name]: (p) => ytHandler(p as { url: string }),
  [svToolDef.name]: (p) => svHandler(p as { keyword: string }),
}

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
  /** First written file path, kept for backward compatibility */
  filePath?: string
  /** All file paths written by opencode during this run */
  writtenFiles?: string[]
  error?: string
}

/**
 * @deprecated File-marker parsing is no longer used. Kept for existing unit tests.
 */
export function parseAcpOutput(output: string): AcpResult {
  const match = output.match(/FILE_WRITTEN:\s*(.+)/)
  if (match) return { success: true, filePath: match[1].trim() }
  return { success: false, error: 'No FILE_WRITTEN marker found in output' }
}

const DEFAULT_MODEL = process.env.OPENCODE_MODEL ?? 'github-copilot/gpt-5-mini'

class OpencodeClient implements acp.Client {
  /** Files tracked via ACP writeTextFile capability */
  readonly writtenFiles: string[] = []
  /** Accumulated agent text, used to parse FILE_WRITTEN: markers as fallback */
  private _textBuffer = ''

  /**
   * Files announced via FILE_WRITTEN: marker in agent message text.
   * opencode currently writes files using its own internal tools (not the ACP
   * fs.writeTextFile capability), so this is the primary source of file paths.
   */
  get textWrittenFiles(): string[] {
    const results: string[] = []
    // Match all occurrences of FILE_WRITTEN: <path> on their own line
    const re = /FILE_WRITTEN:\s*(\S+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(this._textBuffer)) !== null) {
      results.push(m[1].trim())
    }
    return results
  }

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    // Auto-approve all permission requests — bot is fully automated
    const first = params.options[0]
    process.stdout.write(`[opencode] auto-approving: ${params.toolCall.title}\n`)
    return { outcome: { outcome: 'selected', optionId: first.optionId } }
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content.type === 'text') {
          this._textBuffer += update.content.text
          process.stdout.write(`[opencode] ${update.content.text.slice(0, 120)}\n`)
        }
        break
      case 'tool_call': {
        const title: string = (update as { title?: string }).title ?? ''
        process.stdout.write(`[opencode] tool: ${title} (${(update as { status?: string }).status ?? ''})\n`)
        // Forward-compatible: if opencode routes client-side tool calls here,
        // execute the registered handler and return the result.
        const toolName = title.toLowerCase().replace(/\s+/g, '_')
        if (toolName in TOOL_REGISTRY) {
          const rawParams = (update as { input?: Record<string, unknown> }).input ?? {}
          try {
            const result = await TOOL_REGISTRY[toolName](rawParams)
            process.stdout.write(`[tool:${toolName}] result length: ${result.length}\n`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            process.stdout.write(`[tool:${toolName}] error: ${msg}\n`)
          }
        }
        break
      }
      default:
        break
    }
  }

  async readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    const content = await readFile(params.path, 'utf-8')
    return { content }
  }

  async writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    await writeFile(params.path, params.content, 'utf-8')
    this.writtenFiles.push(params.path)
    return {}
  }
}

export async function run(
  prompt: string,
  timeoutMs = 240_000,
  model = DEFAULT_MODEL,
  cwd = process.cwd(),
): Promise<AcpResult> {
  let proc: ReturnType<typeof spawn> | undefined
  let cleanup: (() => void) | undefined

  try {
    const client = new OpencodeClient()

    ensureBotConfig()
    proc = spawn('opencode', ['acp'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd,
      env: { ...process.env, XDG_CONFIG_HOME: BOT_XDG_CONFIG },
    })

    cleanup = (): void => {
      try { proc?.kill() } catch { /* ignore */ }
    }

    const input = Writable.toWeb(proc.stdin!)
    const output = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>
    const stream = acp.ndJsonStream(input, output)
    const connection = new acp.ClientSideConnection((_agent) => client, stream)

    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        // tools: client-side tool definitions exposed to the Agent (ACP extension).
        // opencode may use this to allow the LLM to call local tools.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [ytToolDef, svToolDef],
      } as any,
    })

    const session = await connection.newSession({ cwd, mcpServers: [] })
    const sessionId = session.sessionId

    try {
      await connection.unstable_setSessionModel({ sessionId, modelId: model })
    } catch {
      // not all opencode builds support setSessionModel — ignore
    }

    // Race the prompt against the timeout
    const timeoutError = Symbol('timeout')
    let timer: ReturnType<typeof setTimeout>

    const timeoutRace = new Promise<typeof timeoutError>((resolve) => {
      timer = setTimeout(async () => {
        try { await connection.cancel({ sessionId }) } catch { /* ignore */ }
        cleanup?.()
        resolve(timeoutError)
      }, timeoutMs)
    })

    const winner = await Promise.race([
      connection.prompt({ sessionId, prompt: [{ type: 'text', text: prompt }] }),
      timeoutRace,
    ])

    clearTimeout(timer!)

    if (winner === timeoutError) {
      return { success: false, error: `opencode process timeout after ${timeoutMs}ms` }
    }

    const result = winner
    if (result.stopReason !== 'end_turn') {
      return { success: false, error: `opencode stopped with reason: ${result.stopReason}` }
    }

    // Prefer files tracked via ACP writeTextFile; fall back to FILE_WRITTEN: text markers
    // (opencode uses its own internal tools for writes, so textWrittenFiles is the primary source)
    const writtenFiles = client.writtenFiles.length > 0
      ? client.writtenFiles
      : client.textWrittenFiles

    return {
      success: true,
      writtenFiles,
      filePath: writtenFiles[0],
    }
  } catch (err) {
    cleanup?.()
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Failed to spawn opencode: ${message}` }
  } finally {
    cleanup?.()
  }
}

// No-op: kept for compatibility
export async function startAcpServer(_cwd: string, _port: number): Promise<void> {
  console.log('[opencode] using opencode acp mode (per-request spawn)')
}

export const server = {
  stop: () => {},
}
