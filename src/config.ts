import { config as dotenvConfig } from 'dotenv'
import { existsSync } from 'fs'

// Load .env.local first (takes priority), then fall back to .env
if (existsSync('.env.local')) {
  dotenvConfig({ path: '.env.local' })
} else {
  dotenvConfig()
}

function assertEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  get TELEGRAM_BOT_TOKEN(): string {
    return assertEnv('TELEGRAM_BOT_TOKEN')
  },
  get ALLOWED_USER_ID(): number {
    return parseInt(assertEnv('ALLOWED_USER_ID'), 10)
  },
  get VAULT_PATH(): string {
    return assertEnv('VAULT_PATH')
  },
  get OPENCODE_TIMEOUT_MS(): number {
    return parseInt(process.env.OPENCODE_TIMEOUT_MS ?? '120000', 10)
  },
  get OPENCODE_ACP_PORT(): number {
    return parseInt(process.env.OPENCODE_ACP_PORT ?? '19999', 10)
  },
  get APIFY_TOKEN(): string {
    return process.env.APIFY_TOKEN ?? ''
  },
}
