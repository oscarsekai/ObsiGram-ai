import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

vi.mock('simple-git')
vi.mock('fs')

import * as fs from 'fs'
import { simpleGit } from 'simple-git'
import { sync } from '../gitSync.js'

const mockedFs = vi.mocked(fs)
const mockedSimpleGit = vi.mocked(simpleGit)

function makeGitMock(opts: {
  commitSummary?: object
  pushFails?: boolean
  nothingToCommit?: boolean
}) {
  const git: any = {
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(
      opts.nothingToCommit
        ? { summary: { changes: 0 }, branch: '', commit: '' }
        : { summary: { changes: 1 }, branch: 'main', commit: 'abc1234' }
    ),
    push: opts.pushFails
      ? vi.fn().mockRejectedValue(new Error('network error'))
      : vi.fn().mockResolvedValue(undefined),
    revparse: vi.fn().mockResolvedValue('abc1234567890'),
  }
  return git
}

describe('gitSync - sync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns success with commitHash when all steps succeed', async () => {
    mockedFs.existsSync = vi.fn().mockReturnValue(true)
    mockedSimpleGit.mockReturnValue(makeGitMock({}))

    const result = await sync('/test/vault', '/test/vault/notes/2026-01-01-note.md')
    expect(result.success).toBe(true)
    expect(result.commitHash).toBeDefined()
  })

  it('returns failure with error when push fails (error isolation)', async () => {
    mockedFs.existsSync = vi.fn().mockReturnValue(true)
    mockedSimpleGit.mockReturnValue(makeGitMock({ pushFails: true }))

    const result = await sync('/test/vault', '/test/vault/notes/note.md')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns skipped:true when nothing to commit', async () => {
    mockedFs.existsSync = vi.fn().mockReturnValue(true)
    mockedSimpleGit.mockReturnValue(makeGitMock({ nothingToCommit: true }))

    const result = await sync('/test/vault', '/test/vault/notes/note.md')
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
  })

  it('returns not-a-git-repo error when .git does not exist', async () => {
    mockedFs.existsSync = vi.fn().mockReturnValue(false)

    const result = await sync('/test/vault', '/test/vault/notes/note.md')
    expect(result.success).toBe(false)
    expect(result.error).toBe('not-a-git-repo')
  })
})
