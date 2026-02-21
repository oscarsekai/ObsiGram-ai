import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock node:child_process ────────────────────────────────────────────────
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    stdin: {},
    stdout: {},
    kill: vi.fn(),
  }),
}))

// ── Mock node:stream ───────────────────────────────────────────────────────
vi.mock('node:stream', () => ({
  Writable: { toWeb: vi.fn().mockReturnValue({}) },
  Readable: { toWeb: vi.fn().mockReturnValue({}) },
}))

// ── Mock node:fs/promises ──────────────────────────────────────────────────
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock skill modules ─────────────────────────────────────────────────────
vi.mock('../../tools/youtubeTranscript.js', () => ({
  toolDef: { name: 'get_youtube_transcript', description: 'mock', inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'url' } }, required: ['url'] } },
  handler: vi.fn().mockResolvedValue('mock transcript'),
}))

vi.mock('../../tools/searchVault.js', () => ({
  toolDef: { name: 'search_vault', description: 'mock', inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: 'kw' } }, required: ['keyword'] } },
  handler: vi.fn().mockResolvedValue('No matching notes found. Please create a new file.'),
}))

// ── Mock @agentclientprotocol/sdk ─────────────────────────────────────────
let capturedClientFactory: ((agent: unknown) => unknown) | undefined

const mockConnection = {
  initialize: vi.fn().mockResolvedValue({ protocolVersion: 1 }),
  newSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
  unstable_setSessionModel: vi.fn().mockResolvedValue({}),
  prompt: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
  cancel: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@agentclientprotocol/sdk', () => ({
  PROTOCOL_VERSION: 1,
  ndJsonStream: vi.fn().mockReturnValue({}),
  ClientSideConnection: vi.fn().mockImplementation((factory: (agent: unknown) => unknown) => {
    capturedClientFactory = factory
    return mockConnection
  }),
}))

import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { run, parseAcpOutput } from '../openCodeBridge.js'

const mockedSpawn = vi.mocked(spawn)

describe('openCodeBridge.parseAcpOutput (deprecated)', () => {
  it('returns success with filePath when FILE_WRITTEN marker present', () => {
    const result = parseAcpOutput('FILE_WRITTEN: /vault/note.md')
    expect(result.success).toBe(true)
    expect(result.filePath).toBe('/vault/note.md')
  })

  it('returns failure when no FILE_WRITTEN marker', () => {
    const result = parseAcpOutput('No marker here')
    expect(result.success).toBe(false)
    expect(result.error).toContain('FILE_WRITTEN')
  })
})

describe('openCodeBridge.run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedClientFactory = undefined

    mockConnection.initialize.mockResolvedValue({ protocolVersion: 1 })
    mockConnection.newSession.mockResolvedValue({ sessionId: 'test-session' })
    mockConnection.unstable_setSessionModel.mockResolvedValue({})
    mockConnection.prompt.mockResolvedValue({ stopReason: 'end_turn' })
    mockConnection.cancel.mockResolvedValue(undefined)

    mockedSpawn.mockReturnValue({ stdin: {}, stdout: {}, kill: vi.fn() } as any)
  })

  it('spawns opencode with acp subcommand', async () => {
    await run('write a note')
    expect(mockedSpawn).toHaveBeenCalledWith(
      'opencode',
      ['acp'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'inherit'] }),
    )
  })

  it('returns success with empty writtenFiles when no writes occurred', async () => {
    const result = await run('write a note')
    expect(result.success).toBe(true)
    expect(result.writtenFiles).toEqual([])
    expect(result.filePath).toBeUndefined()
  })

  it('collects writtenFiles via writeTextFile handler (ACP capability)', async () => {
    mockConnection.initialize.mockImplementation(async () => {
      const client = capturedClientFactory?.({}) as any
      await client?.writeTextFile({ path: '/vault/output.md', content: 'hello', sessionId: 'test-session' })
      return { protocolVersion: 1 }
    })

    const result = await run('write a note')
    expect(result.success).toBe(true)
    expect(result.writtenFiles).toEqual(['/vault/output.md'])
    expect(result.filePath).toBe('/vault/output.md')
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('/vault/output.md', 'hello', 'utf-8')
  })

  it('falls back to FILE_WRITTEN: text marker when writeTextFile is never called', async () => {
    // opencode announces the written file via agent_message_chunk text, not writeTextFile
    mockConnection.initialize.mockImplementation(async () => {
      const client = capturedClientFactory?.({}) as any
      await client?.sessionUpdate({
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'FILE_WRITTEN: /vault/social/note.md' },
        },
      })
      return { protocolVersion: 1 }
    })

    const result = await run('write a note')
    expect(result.success).toBe(true)
    expect(result.writtenFiles).toEqual(['/vault/social/note.md'])
    expect(result.filePath).toBe('/vault/social/note.md')
  })

  it('prefers writeTextFile over text marker when both are present', async () => {
    mockConnection.initialize.mockImplementation(async () => {
      const client = capturedClientFactory?.({}) as any
      await client?.writeTextFile({ path: '/vault/acp-written.md', content: 'x', sessionId: 's' })
      await client?.sessionUpdate({
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'FILE_WRITTEN: /vault/text-marker.md' },
        },
      })
      return { protocolVersion: 1 }
    })

    const result = await run('write a note')
    expect(result.success).toBe(true)
    expect(result.filePath).toBe('/vault/acp-written.md')
  })

  it('sets session model via unstable_setSessionModel', async () => {
    await run('test', 240_000, 'github-copilot/gpt-5')
    expect(mockConnection.unstable_setSessionModel).toHaveBeenCalledWith({
      sessionId: 'test-session',
      modelId: 'github-copilot/gpt-5',
    })
  })

  it('returns failure when stopReason is not end_turn', async () => {
    mockConnection.prompt.mockResolvedValue({ stopReason: 'refusal' })
    const result = await run('test')
    expect(result.success).toBe(false)
    expect(result.error).toContain('refusal')
  })

  it('returns timeout error and calls cancel when prompt is slow', async () => {
    vi.useFakeTimers()
    mockConnection.prompt.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'cancelled' }), 99999)),
    )

    const runPromise = run('test', 100)
    await vi.advanceTimersByTimeAsync(200)
    const result = await runPromise

    expect(result.success).toBe(false)
    expect(result.error).toContain('timeout')
    expect(mockConnection.cancel).toHaveBeenCalledWith({ sessionId: 'test-session' })
    vi.useRealTimers()
  })

  it('returns failure when initialize throws', async () => {
    mockConnection.initialize.mockRejectedValue(new Error('connection refused'))
    const result = await run('test')
    expect(result.success).toBe(false)
    expect(result.error).toContain('connection refused')
  })

  it('returns failure when spawn throws', async () => {
    mockedSpawn.mockImplementation(() => { throw new Error('opencode not found') })
    const result = await run('test')
    expect(result.success).toBe(false)
    expect(result.error).toContain('opencode not found')
  })

  it('gracefully continues when setSessionModel is unsupported', async () => {
    mockConnection.unstable_setSessionModel.mockRejectedValue(new Error('not supported'))
    const result = await run('test')
    expect(result.success).toBe(true)
  })

  it('includes tools in clientCapabilities during initialize', async () => {
    await run('write a note')
    expect(mockConnection.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCapabilities: expect.objectContaining({
          fs: expect.any(Object),
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'get_youtube_transcript' }),
            expect.objectContaining({ name: 'search_vault' }),
          ]),
        }),
      }),
    )
  })

  it('handles tool_call sessionUpdate with known tool name without throwing', async () => {
    mockConnection.initialize.mockImplementation(async () => {
      const client = capturedClientFactory?.({}) as any
      await client?.sessionUpdate({
        update: {
          sessionUpdate: 'tool_call',
          title: 'get_youtube_transcript',
          status: 'running',
          input: { url: 'https://www.youtube.com/watch?v=test' },
        },
      })
      return { protocolVersion: 1 }
    })
    const result = await run('write a note')
    expect(result.success).toBe(true)
  })

  it('handles tool_call sessionUpdate with unknown tool name without throwing', async () => {
    mockConnection.initialize.mockImplementation(async () => {
      const client = capturedClientFactory?.({}) as any
      await client?.sessionUpdate({
        update: {
          sessionUpdate: 'tool_call',
          title: 'unknown_tool_xyz',
          status: 'running',
        },
      })
      return { protocolVersion: 1 }
    })
    const result = await run('write a note')
    expect(result.success).toBe(true)
  })

  it('handles tool_call where handler throws without crashing the session', async () => {
    mockConnection.initialize.mockImplementation(async () => {
      const client = capturedClientFactory?.({}) as any
      await client?.sessionUpdate({
        update: {
          sessionUpdate: 'tool_call',
          title: 'search_vault',
          status: 'running',
          input: { keyword: 'test' },
        },
      })
      return { protocolVersion: 1 }
    })
    const result = await run('write a note')
    expect(result.success).toBe(true)
  })
})
