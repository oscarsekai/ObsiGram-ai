import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock node:fs ──────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { readdirSync, readFileSync } from 'node:fs'
import { toolDef, handler } from '../searchVault.js'

const mockedReaddir = vi.mocked(readdirSync)
const mockedReadFile = vi.mocked(readFileSync)

describe('searchVault toolDef', () => {
  it('has the correct tool name', () => {
    expect(toolDef.name).toBe('search_vault')
  })

  it('defines keyword as a required string parameter', () => {
    expect(toolDef.inputSchema.properties.keyword.type).toBe('string')
    expect(toolDef.inputSchema.required).toContain('keyword')
  })
})

describe('searchVault handler', () => {
  const VAULT = '/vault'

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VAULT_PATH = VAULT
  })

  it('returns VAULT_PATH not configured when env var is missing', async () => {
    delete process.env.VAULT_PATH
    const result = await handler({ keyword: 'react' })
    expect(result).toBe('VAULT_PATH is not configured.')
  })

  it('returns "no matching notes" when no files match the keyword', async () => {
    mockedReaddir.mockReturnValue(['unrelated.md', 'other.md'] as any)
    const result = await handler({ keyword: 'react' })
    expect(result).toBe('No matching notes found. Please create a new file.')
  })

  it('returns matching notes with preview when files are found', async () => {
    mockedReaddir.mockReturnValue(['React-Hooks.md', 'vue-basics.md'] as any)
    mockedReadFile.mockReturnValue('# React Hooks\n\n## Basic usage\nsome content' as any)
    const result = await handler({ keyword: 'react' })
    expect(result).toContain('Found 1 matching note')
    expect(result).toContain('React-Hooks.md')
    expect(result).toContain('preview:')
  })

  it('performs case-insensitive keyword matching', async () => {
    mockedReaddir.mockReturnValue(['React-Hooks.md'] as any)
    mockedReadFile.mockReturnValue('# React Hooks' as any)
    const result = await handler({ keyword: 'REACT' })
    expect(result).toContain('React-Hooks.md')
  })

  it('returns "no matching notes" for empty keyword match', async () => {
    mockedReaddir.mockReturnValue(['unrelated.md'] as any)
    const result = await handler({ keyword: 'typescript' })
    expect(result).toBe('No matching notes found. Please create a new file.')
  })

  it('handles multiple matched files', async () => {
    mockedReaddir.mockReturnValue(['React-Hooks.md', 'react-advanced.md', 'vue.md'] as any)
    mockedReadFile.mockReturnValue('# Title\nline2\nline3' as any)
    const result = await handler({ keyword: 'react' })
    expect(result).toContain('Found 2 matching note')
    expect(result).toContain('React-Hooks.md')
    expect(result).toContain('react-advanced.md')
  })

  it('handles readdirSync failure gracefully', async () => {
    mockedReaddir.mockImplementation(() => { throw new Error('ENOENT') })
    const result = await handler({ keyword: 'react' })
    expect(result).toBe('No matching notes found. Please create a new file.')
  })
})
