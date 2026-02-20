import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { run } from '../openCodeBridge.js'

const mockedSpawn = vi.mocked(spawn)

function makeMockProcess(stdoutData: string, exitCode: number | null, stderrData = '') {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  // Emit data and exit on next tick (stdin is ignored in real code)
  process.nextTick(() => {
    proc.stdout.emit('data', stdoutData)
    if (stderrData) proc.stderr.emit('data', stderrData)
    proc.emit('exit', exitCode)
  })
  return proc
}

describe('openCodeBridge - run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('spawns opencode with --agent build flag', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess('FILE_WRITTEN: /test/note.md', 0))
    await run('test prompt')
    expect(mockedSpawn).toHaveBeenCalledWith(
      'opencode',
      expect.arrayContaining(['--agent', 'build']),
      expect.any(Object)
    )
  })

  it('returns success with filePath when stdout contains FILE_WRITTEN', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess(
      'Some output\nFILE_WRITTEN: /test/vault/notes/2026-01-01-topic.md',
      0
    ))
    const result = await run('test prompt')
    expect(result.success).toBe(true)
    expect(result.filePath).toBe('/test/vault/notes/2026-01-01-topic.md')
  })

  it('returns failure when process exits with non-zero code', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess('', 1, 'some error'))
    const result = await run('test prompt')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns failure when stdout has no FILE_WRITTEN marker', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess('No file written here', 0))
    const result = await run('test prompt')
    expect(result.success).toBe(false)
    expect(result.error).toContain('FILE_WRITTEN')
  })

  it('returns failure with timeout error when process exceeds timeout', async () => {
    const proc = new EventEmitter() as any
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn(() => {
      process.nextTick(() => proc.emit('exit', null))
    })
    mockedSpawn.mockReturnValue(proc)

    const result = await run('test prompt', 50)
    expect(result.success).toBe(false)
    expect(result.error).toContain('timeout')
    expect(proc.kill).toHaveBeenCalled()
  })

  it('fails fast when opencode enters question flow', async () => {
    const proc = new EventEmitter() as any
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn(() => {
      process.nextTick(() => proc.emit('exit', null))
    })
    mockedSpawn.mockReturnValue(proc)

    process.nextTick(() => {
      proc.stderr.emit('data', 'INFO service=question id=abc asking')
    })

    const result = await run('test prompt')
    expect(result.success).toBe(false)
    expect(result.error).toContain('question')
    expect(proc.kill).toHaveBeenCalled()
  })
})
