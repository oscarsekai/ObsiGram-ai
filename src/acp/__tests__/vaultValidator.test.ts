import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs')

import * as fs from 'fs'
import { validateVaultPath, validateFilePath } from '../vaultValidator.js'

const mockedFs = vi.mocked(fs)

describe('validateVaultPath', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not throw when vault path exists', () => {
    mockedFs.existsSync = vi.fn().mockReturnValue(true)
    expect(() => validateVaultPath('/test/vault')).not.toThrow()
  })

  it('throws when vault path does not exist', () => {
    mockedFs.existsSync = vi.fn().mockReturnValue(false)
    expect(() => validateVaultPath('/missing/vault')).toThrow('/missing/vault')
  })
})

describe('validateFilePath', () => {
  it('does not throw when filePath is inside vault', () => {
    expect(() =>
      validateFilePath('/test/vault/notes/2026-01-01-topic.md', '/test/vault')
    ).not.toThrow()
  })

  it('throws security error when filePath is outside vault', () => {
    expect(() =>
      validateFilePath('/etc/passwd', '/test/vault')
    ).toThrow('Security')
  })

  it('throws security error for path traversal attempt', () => {
    expect(() =>
      validateFilePath('/test/vault/../../../etc/passwd', '/test/vault')
    ).toThrow('Security')
  })
})
