import type { SessionBuffer } from '../buffer/SessionBuffer.js'
import { buildPrompt } from '../acp/buildPrompt.js'
import { classifyForPrompt } from '../acp/classifier.js'
import { buildVaultCatalog } from '../acp/vaultCatalog.js'
import { run as acpRun } from '../acp/openCodeBridge.js'
import { validateVaultPath, validateFilePath } from '../acp/vaultValidator.js'
import { sync as gitSync } from '../git/gitSync.js'
import type { BotContext } from './handlers.js'
import { isYouTubeUrl } from './handlers.js'
import { handler as ytHandler } from '../tools/youtubeTranscript.js'
import { handler as svHandler } from '../tools/searchVault.js'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import type { BufferItem } from '../buffer/types.js'

/**
 * Pre-processes buffer items: YouTube URLs are replaced with their transcript content
 * so opencode receives the full text rather than a raw URL.
 */
async function enrichBufferItems(items: BufferItem[]): Promise<BufferItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.type === 'url' && isYouTubeUrl(item.content)) {
        const transcript = await ytHandler({ url: item.content })
        return {
          ...item,
          content: `[YouTube URL: ${item.content}]\n\n${transcript}`,
        }
      }
      return item
    }),
  )
}

/**
 * Calls search_vault with the classification theme to surface existing related notes.
 * Returns a hint string to inject into the prompt.
 */
async function getVaultSearchHint(classification: ReturnType<typeof classifyForPrompt>): Promise<string> {
  const keyword = classification.candidates[0] ?? classification.signals
    .find((s) => s.startsWith('theme='))?.replace('theme=', '') ?? ''
  if (!keyword) return ''
  return svHandler({ keyword })
}

const inFlightUsers = new Set<string>()

interface CatalogEntry {
  noteBase: string
  title: string
  tags: string[]
  isMoc: boolean
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,./:;!?()[\]{}"']+/)
    .map(normalizeToken)
    .filter((token) => token.length > 1)
}

function parseCurrentNoteContext(content: string): { title: string; tags: string[]; tokens: Set<string> } {
  const title = content.match(/^\s*title:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '').trim() ?? ''
  const tagInline = content.match(/^\s*tags:\s*\[(.+)\]\s*$/m)?.[1] ?? ''
  const tags = tagInline
    .split(',')
    .map((tag) => normalizeToken(tag.replace(/^["'#]+|["']+$/g, '')))
    .filter(Boolean)
  const tokens = new Set<string>([...tokenize(title), ...tokenize(content)])
  return { title, tags, tokens }
}

function parseCatalogEntries(catalogPath: string, currentFilePath?: string): CatalogEntry[] {
  const currentBase = currentFilePath ? path.basename(currentFilePath, '.md') : ''
  const lines = readFileSync(catalogPath, 'utf8').split('\n')
  const entries: CatalogEntry[] = []
  for (const line of lines) {
    const match = line.match(/^- (.+?\.md)\s+\|\s+title:\s*(.+?)(?:\s+\|\s+tags:\s*(.+))?$/)
    if (!match) continue
    const noteBase = path.basename(match[1], '.md')
    if (!noteBase || noteBase === currentBase) continue
    const title = (match[2] ?? '').trim()
    const tags = (match[3] ?? '')
      .split(',')
      .map((tag) => normalizeToken(tag.trim()))
      .filter(Boolean)
    const lower = `${noteBase} ${title}`.toLowerCase()
    const isMoc = lower.includes('moc')
    entries.push({ noteBase, title, tags, isMoc })
  }
  return entries
}

function scoreCatalogEntry(entry: CatalogEntry, current: { tags: string[]; tokens: Set<string> }): number {
  const titleTokens = tokenize(entry.title)
  const baseTokens = tokenize(entry.noteBase)
  let score = 0

  for (const token of [...titleTokens, ...baseTokens]) {
    if (current.tokens.has(token)) score += 2
  }
  for (const tag of entry.tags) {
    if (current.tags.includes(tag)) score += 4
  }
  if (entry.isMoc) {
    const mocTokens = new Set([...titleTokens, ...entry.tags])
    let overlap = 0
    for (const token of mocTokens) {
      if (current.tokens.has(token)) overlap += 1
    }
    if (overlap > 0) score += 5
  }
  return score
}

function extractCatalogLinks(catalogPath?: string, currentFilePath?: string): string[] {
  if (!catalogPath || !existsSync(catalogPath)) return []
  if (!currentFilePath || !existsSync(currentFilePath)) return []
  const currentContent = readFileSync(currentFilePath, 'utf8')
  const current = parseCurrentNoteContext(currentContent)
  const entries = parseCatalogEntries(catalogPath, currentFilePath)
  return entries
    .map((entry) => ({ entry, score: scoreCatalogEntry(entry, current) }))
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score || a.entry.noteBase.localeCompare(b.entry.noteBase))
    .slice(0, 3)
    .map((item) => item.entry.noteBase)
}

export function enforceGraphConnections(filePath: string, catalogPath?: string): void {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  const existingLinks = content.match(/\[\[[^\]]+\]\]/g) ?? []
  if (existingLinks.length >= 2) return

  const linkTargets = extractCatalogLinks(catalogPath, filePath)
  const linkLines = linkTargets.length > 0
    ? linkTargets.map((name) => `- [[${name}]]`).join('\n')
    : '無'

  let nextContent = content
  if (nextContent.includes('## 關聯地圖 (MOC)')) {
    nextContent = nextContent.replace(
      /## 關聯地圖 \(MOC\)\s*\n(?:[^\n]*\n)*/m,
      (block) => `${block.trimEnd()}\n${linkLines}\n`,
    )
  } else if (nextContent.includes('## 關聯筆記')) {
    nextContent = nextContent.replace(
      /## 關聯筆記\s*\n(?:[^\n]*\n)*/m,
      (block) => `${block.trimEnd()}\n${linkLines}\n`,
    )
  } else {
    nextContent = `${nextContent.trimEnd()}\n\n## 關聯地圖 (MOC)\n${linkLines}\n`
  }
  writeFileSync(filePath, nextContent, 'utf8')
}

export function applyClassificationPathPolicy(
  filePath: string,
  vaultPath: string,
  classification: ReturnType<typeof classifyForPrompt>,
): string {
  const avoidWorkflow = classification.policyHints.includes('avoid_workflow_folder_for_github_repo')
  const preferFrontend = classification.policyHints.includes('prefer_frontend_folder')
    || classification.signals.includes('theme=frontend')
  const preferBackend = classification.policyHints.includes('prefer_backend_folder')
    || classification.signals.includes('theme=backend')
  const preferWorkflow = classification.policyHints.includes('prefer_workflow_folder')
    || classification.signals.includes('theme=workflow')

  if (avoidWorkflow && /workflow/i.test(filePath)) {
    const preferred = classification.candidates.find((folder) => !/workflow/i.test(folder))
    if (preferred) {
      return path.join(vaultPath, preferred, path.basename(filePath))
    }
  }

  if (avoidWorkflow) {
    const rel = path.relative(vaultPath, filePath)
    const parts = rel.split(path.sep)
    const idx = parts.findIndex((part) => /workflow/i.test(part))
    if (idx >= 0) {
      parts[idx] = /^[A-Z]/.test(parts[idx]) ? 'Projects' : 'projects'
      return path.join(vaultPath, ...parts)
    }
  }

  if ((preferFrontend || preferBackend) && /reference/i.test(filePath)) {
    const intentTokens = preferFrontend
      ? ['frontend', 'react', 'javascript', 'typescript', 'css', 'web', 'ui']
      : ['backend', 'api', 'server', 'database', 'db', 'infra', 'node']
    const preferred = classification.candidates.find((folder) =>
      !/reference/i.test(folder) && intentTokens.some((token) => new RegExp(token, 'i').test(folder)),
    ) ?? classification.candidates.find((folder) => !/reference/i.test(folder))
    if (preferred) {
      return path.join(vaultPath, preferred, path.basename(filePath))
    }
  }

  if (preferWorkflow && !/workflow/i.test(filePath)) {
    const preferred = classification.candidates.find((folder) => /workflow/i.test(folder))
    if (preferred) {
      return path.join(vaultPath, preferred, path.basename(filePath))
    }
  }

  return filePath
}

export async function aggregateAndSave(
  ctx: BotContext,
  buffer: SessionBuffer,
  userId: string,
  vaultPath: string
): Promise<void> {
  if (inFlightUsers.has(userId)) {
    await ctx.reply('⏳ 正在分析中，請稍候上一個任務完成。')
    return
  }
  inFlightUsers.add(userId)

  try {
    const items = buffer.get(userId)

    if (items.length === 0) {
      await ctx.reply('⚠️ 暫存區是空的，請先傳送網址或靈感。')
      return
    }

    await ctx.reply('🤖 正在分析 Vault 並生成筆記，請稍候...')

    try {
      validateVaultPath(vaultPath)
    } catch (err) {
      await ctx.reply(`❌ 找不到 Obsidian Vault，請確認路徑正確。`)
      return
    }

    const classification = classifyForPrompt(items, vaultPath)
    const catalogPath = buildVaultCatalog(vaultPath, classification)
    const enrichedItems = await enrichBufferItems(items)
    const vaultSearchHint = await getVaultSearchHint(classification)
    const prompt = buildPrompt(enrichedItems, vaultPath, classification, catalogPath ?? undefined, vaultSearchHint || undefined)
    const acpResult = await acpRun(prompt, undefined, undefined, vaultPath)

    if (!acpResult.success || !acpResult.filePath) {
      await ctx.reply(`❌ OpenCode 執行失敗：${acpResult.error ?? '未知錯誤'}`)
      return
    }

    try {
      validateFilePath(acpResult.filePath, vaultPath)
    } catch {
      await ctx.reply(`❌ 安全錯誤：寫入路徑不在 Vault 目錄內，已取消同步。`)
      return
    }

    let finalFilePath = acpResult.filePath
    const policyPath = applyClassificationPathPolicy(acpResult.filePath, vaultPath, classification)
    if (policyPath !== acpResult.filePath && existsSync(acpResult.filePath)) {
      mkdirSync(path.dirname(policyPath), { recursive: true })
      renameSync(acpResult.filePath, policyPath)
      finalFilePath = policyPath
    }

    enforceGraphConnections(finalFilePath, catalogPath ?? undefined)

    const relativePath = path.relative(vaultPath, finalFilePath)
    const gitResult = await gitSync(vaultPath, finalFilePath)

    if (!gitResult.success) {
      await ctx.reply(
        `✅ 筆記已寫入 Vault：${relativePath}\n` +
        `⚠️ Git 同步失敗：${gitResult.error}。請稍後手動執行 git push。`
      )
      return
    }

    buffer.clear(userId)

    if (gitResult.skipped) {
      await ctx.reply(`🎉 筆記已成功分類並寫入 Vault！\n📄 路徑：${relativePath}\n（內容未變更，無需重新提交）`)
    } else {
      await ctx.reply(
        `🎉 筆記已成功分類並寫入 Vault，Git 同步完成！\n` +
        `📄 路徑：${relativePath}\n` +
        `🔖 Commit：${gitResult.commitHash}`
      )
    }
  } finally {
    inFlightUsers.delete(userId)
  }
}
