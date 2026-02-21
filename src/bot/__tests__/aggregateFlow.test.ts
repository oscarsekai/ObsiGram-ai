import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../acp/openCodeBridge.js', () => ({ run: vi.fn() }))
vi.mock('../../acp/vaultValidator.js', () => ({
  validateVaultPath: vi.fn(),
  validateFilePath: vi.fn(),
}))
vi.mock('../../git/gitSync.js', () => ({ sync: vi.fn() }))
vi.mock('../handlers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../handlers.js')>()
  return { ...actual, isYouTubeUrl: vi.fn(() => false) }
})
vi.mock('../../tools/youtubeTranscript.js', () => ({
  toolDef: { name: 'get_youtube_transcript', description: '', inputSchema: { type: 'object', properties: {}, required: [] } },
  handler: vi.fn().mockResolvedValue('mock transcript'),
}))
vi.mock('../../tools/searchVault.js', () => ({
  toolDef: { name: 'search_vault', description: '', inputSchema: { type: 'object', properties: {}, required: [] } },
  handler: vi.fn().mockResolvedValue('No matching notes found. Please create a new file.'),
}))

import { run } from '../../acp/openCodeBridge.js'
import { validateVaultPath, validateFilePath } from '../../acp/vaultValidator.js'
import { sync } from '../../git/gitSync.js'
import { SessionBuffer } from '../../buffer/SessionBuffer.js'
import { aggregateAndSave } from '../aggregateFlow.js'

const mockedRun = vi.mocked(run)
const mockedValidateVaultPath = vi.mocked(validateVaultPath)
const mockedValidateFilePath = vi.mocked(validateFilePath)
const mockedSync = vi.mocked(sync)

function makeMockCtx() {
  return { reply: vi.fn().mockResolvedValue(undefined) } as any
}

describe('aggregateFlow - aggregateAndSave', () => {
  let buffer: SessionBuffer
  const userId = '42'
  const vaultPath = '/test/vault'

  beforeEach(() => {
    buffer = new SessionBuffer()
    buffer.push(userId, { type: 'text', content: 'some idea', addedAt: new Date().toISOString() })
    vi.clearAllMocks()
  })

  it('returns empty buffer message when buffer is empty', async () => {
    const ctx = makeMockCtx()
    const emptyBuffer = new SessionBuffer()
    await aggregateAndSave(ctx, emptyBuffer, userId, vaultPath)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('⚠️'))
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('sends working message and calls ACP bridge on success path', async () => {
    const ctx = makeMockCtx()
    mockedRun.mockResolvedValue({ success: true, filePath: `${vaultPath}/notes/note.md` })
    mockedSync.mockResolvedValue({ success: true, commitHash: 'abc1234' })

    await aggregateAndSave(ctx, buffer, userId, vaultPath)

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('🤖'))
    expect(mockedRun).toHaveBeenCalled()
    expect(mockedRun.mock.calls[0]?.[3]).toBe(vaultPath)
  })

  it('sends success message with file path and clears buffer on full success', async () => {
    const ctx = makeMockCtx()
    mockedRun.mockResolvedValue({ success: true, filePath: `${vaultPath}/notes/note.md` })
    mockedSync.mockResolvedValue({ success: true, commitHash: 'abc1234' })

    await aggregateAndSave(ctx, buffer, userId, vaultPath)

    const replies = ctx.reply.mock.calls.map((c: any[]) => c[0])
    expect(replies.some((r: string) => r.includes('🎉'))).toBe(true)
    expect(buffer.count(userId)).toBe(0)
  })

  it('sends error message when ACP bridge fails', async () => {
    const ctx = makeMockCtx()
    mockedRun.mockResolvedValue({ success: false, error: 'opencode crashed' })

    await aggregateAndSave(ctx, buffer, userId, vaultPath)

    const replies = ctx.reply.mock.calls.map((c: any[]) => c[0])
    expect(replies.some((r: string) => r.includes('❌'))).toBe(true)
    expect(buffer.count(userId)).toBe(1)
  })

  it('sends warning when git sync fails but note is still written', async () => {
    const ctx = makeMockCtx()
    mockedRun.mockResolvedValue({ success: true, filePath: `${vaultPath}/notes/note.md` })
    mockedSync.mockResolvedValue({ success: false, error: 'network error' })

    await aggregateAndSave(ctx, buffer, userId, vaultPath)

    const replies = ctx.reply.mock.calls.map((c: any[]) => c[0])
    expect(replies.some((r: string) => r.includes('⚠️'))).toBe(true)
  })

  it('sends security error when filePath is outside vault', async () => {
    const ctx = makeMockCtx()
    mockedRun.mockResolvedValue({ success: true, filePath: '/etc/passwd' })
    mockedValidateFilePath.mockImplementation(() => { throw new Error('Security error') })

    await aggregateAndSave(ctx, buffer, userId, vaultPath)

    const replies = ctx.reply.mock.calls.map((c: any[]) => c[0])
    expect(replies.some((r: string) => r.includes('❌'))).toBe(true)
    expect(mockedSync).not.toHaveBeenCalled()
  })

  it('blocks duplicate aggregate requests while one is in progress', async () => {
    const ctx1 = makeMockCtx()
    const ctx2 = makeMockCtx()
    let releaseRun!: () => void
    mockedRun.mockImplementation(
      () => new Promise((resolve) => {
        releaseRun = () => resolve({ success: false, error: 'opencode crashed' })
      })
    )

    const first = aggregateAndSave(ctx1, buffer, userId, vaultPath)
    const second = aggregateAndSave(ctx2, buffer, userId, vaultPath)

    // Wait for first call to reach acpRun (takes a few microtasks due to enrichBufferItems/getVaultSearchHint)
    await vi.waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(1))

    const secondReplies = ctx2.reply.mock.calls.map((c: any[]) => c[0])
    expect(secondReplies.some((r: string) => r.includes('正在分析中'))).toBe(true)

    releaseRun()
    await Promise.all([first, second])
  })
})
