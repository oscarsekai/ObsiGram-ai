import { spawn, type ChildProcess } from 'child_process'

const READY_POLL_MS = 500
const READY_TIMEOUT_MS = 90_000

export interface AcpSendResult {
  success: boolean
  filePath?: string
  error?: string
}

interface MessageResponse {
  parts: Array<{ type: string; text?: string }>
}

export class AcpServer {
  private proc: ChildProcess | null = null
  private baseUrl = ''
  private isReady = false

  async start(cwd: string, port: number): Promise<void> {
    this.baseUrl = `http://127.0.0.1:${port}`
    this.isReady = false

    // Kill any existing process on this port before starting
    try {
      const { execSync } = await import('child_process')
      const pid = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim()
      if (pid) {
        console.log(`[ACP] killing existing process on port ${port} (pid ${pid})`)
        execSync(`kill -9 ${pid}`)
        await new Promise((r) => setTimeout(r, 500))
      }
    } catch {
      // no existing process — fine
    }

    this.proc = spawn('opencode', ['acp', '--port', String(port), '--cwd', cwd], {
      stdio: ['ignore', 'pipe', 'pipe'], // capture both stdout and stderr
    })

    const logOutput = (chunk: Buffer) => {
      console.log('[ACP]', chunk.toString().trimEnd())
    }
    this.proc.stdout?.on('data', logOutput)
    this.proc.stderr?.on('data', logOutput)

    this.proc.on('exit', (code) => {
      this.isReady = false
      if (code != null && code !== 0) {
        console.error(`[ACP] server process exited with code ${code}`)
      }
    })

    try {
      await this.waitReady()
    } catch (err) {
      this.stop() // kill lingering process so port is freed on retry
      throw err
    }
    this.isReady = true
    // After ready, suppress verbose startup logs — only keep errors
    this.proc?.stdout?.removeAllListeners('data')
    this.proc?.stderr?.removeAllListeners('data')
    this.proc?.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString()
      if (line.includes('ERROR')) console.error('[ACP]', line.trimEnd())
    })
    console.log(`[ACP] server ready at ${this.baseUrl}`)
  }

  private async waitReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    let lastLog = Date.now()
    while (Date.now() < deadline) {
      if (Date.now() - lastLog > 10_000) {
        const elapsed = Math.round((Date.now() - (deadline - READY_TIMEOUT_MS)) / 1000)
        console.log(`[ACP] still waiting for server... (${elapsed}s elapsed)`)
        lastLog = Date.now()
      }
      try {
        const r = await fetch(`${this.baseUrl}/session`, {
          signal: AbortSignal.timeout(1000),
        })
        if (r.ok || r.status === 405) return
      } catch {
        await new Promise((r) => setTimeout(r, READY_POLL_MS))
      }
    }
    throw new Error(`[ACP] server did not become ready within ${READY_TIMEOUT_MS}ms`)
  }

  async send(prompt: string, model: string, timeoutMs: number): Promise<AcpSendResult> {
    if (!this.isReady) {
      return { success: false, error: 'ACP server is not ready yet — please try again in a moment' }
    }
    // Create a fresh session per request (stateless)
    const sessResp = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    })
    if (!sessResp.ok) {
      return { success: false, error: `Session create failed: ${sessResp.status}` }
    }
    const session = (await sessResp.json()) as { id: string }

    const slashIdx = model.indexOf('/')
    const providerID = slashIdx > 0 ? model.slice(0, slashIdx) : 'github-copilot'
    const modelID = slashIdx > 0 ? model.slice(slashIdx + 1) : model

    let msgResp: Response
    try {
      msgResp = await fetch(`${this.baseUrl}/session/${session.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: prompt }],
          model: { providerID, modelID },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      return { success: false, error: `fetch timeout or error: ${String(err)}` }
    }

    if (!msgResp.ok) {
      const body = await msgResp.text().catch(() => '')
      return { success: false, error: `Message failed ${msgResp.status}: ${body.slice(0, 300)}` }
    }

    const msg = (await msgResp.json()) as MessageResponse
    const text = msg.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('\n')

    const match = text.match(/FILE_WRITTEN:\s*(.+)/)
    if (match) return { success: true, filePath: match[1].trim() }

    return { success: false, error: `No FILE_WRITTEN marker. Response: ${text.slice(0, 300)}` }
  }

  stop(): void {
    this.proc?.kill()
  }
}
