import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) }
})

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('reads all required env vars correctly', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.ALLOWED_USER_ID = '12345'
    process.env.VAULT_PATH = '/test/vault'
    process.env.OPENCODE_TIMEOUT_MS = '60000'
    process.env.APIFY_TOKEN = 'test-apify-token'

    const { config } = await import('./config.js')
    expect(config.TELEGRAM_BOT_TOKEN).toBe('test-token')
    expect(config.ALLOWED_USER_ID).toBe(12345)
    expect(config.VAULT_PATH).toBe('/test/vault')
    expect(config.OPENCODE_TIMEOUT_MS).toBe(60000)
    expect(config.APIFY_TOKEN).toBe('test-apify-token')
  })

  it('throws when TELEGRAM_BOT_TOKEN is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    process.env.ALLOWED_USER_ID = '12345'
    process.env.VAULT_PATH = '/test/vault'

    await expect(import('./config.js')).rejects.toThrow('TELEGRAM_BOT_TOKEN')
  })

  it('throws when ALLOWED_USER_ID is missing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    delete process.env.ALLOWED_USER_ID
    process.env.VAULT_PATH = '/test/vault'

    await expect(import('./config.js')).rejects.toThrow('ALLOWED_USER_ID')
  })

  it('uses default OPENCODE_TIMEOUT_MS of 120000 when not set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.ALLOWED_USER_ID = '12345'
    process.env.VAULT_PATH = '/test/vault'
    delete process.env.OPENCODE_TIMEOUT_MS

    const { config } = await import('./config.js')
    expect(config.OPENCODE_TIMEOUT_MS).toBe(120000)
  })
})
