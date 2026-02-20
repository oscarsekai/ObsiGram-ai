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
  TELEGRAM_BOT_TOKEN: assertEnv('TELEGRAM_BOT_TOKEN'),
  ALLOWED_USER_ID: parseInt(assertEnv('ALLOWED_USER_ID'), 10),
  VAULT_PATH: assertEnv('VAULT_PATH'),
  OPENCODE_TIMEOUT_MS: parseInt(process.env.OPENCODE_TIMEOUT_MS ?? '120000', 10),
  OPENCODE_ACP_PORT: parseInt(process.env.OPENCODE_ACP_PORT ?? '19999', 10),
  APIFY_TOKEN: process.env.APIFY_TOKEN ?? '',
}
