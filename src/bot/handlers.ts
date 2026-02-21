import type { SessionBuffer } from '../buffer/SessionBuffer.js'
import { fetchUrl } from '../fetcher/jinaReader.js'
import { isSocialMediaUrl } from '../fetcher/apifyFetcher.js'

// Stop matching at the start of the next URL to handle adjacent URLs with no whitespace
const URL_REGEX_GLOBAL = /https?:\/\/(?:(?!https?:\/\/)\S)*/gi

/** Returns true for youtube.com and youtu.be URLs. */
export function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url)
}

export type BotContext = {
  from?: { id: number }
  message?: { text?: string }
  reply: (text: string, extra?: object) => Promise<unknown>
  answerCallbackQuery: (text?: string) => Promise<unknown>
}

type MiddlewareFn = (ctx: BotContext, next: () => Promise<void>) => Promise<void>

export function createWhitelistGuard(allowedUserId: number): MiddlewareFn {
  return async (ctx, next) => {
    if (ctx.from?.id === allowedUserId) {
      await next()
    }
  }
}

export async function handleTextMessage(ctx: BotContext, buffer: SessionBuffer): Promise<void> {
  const userId = String(ctx.from!.id)
  const text = ctx.message?.text ?? ''

  // Extract all URLs from the message
  const urls = text.match(URL_REGEX_GLOBAL) ?? []
  // Remaining text after removing all URLs
  const remainingText = text.replace(URL_REGEX_GLOBAL, '').trim()

  let addedCount = 0

  if (urls.length > 0) {
    const hasYouTube = urls.some(isYouTubeUrl)
    const hasSocialMedia = urls.some(isSocialMediaUrl)
    if (hasYouTube) {
      await ctx.reply('🎬 偵測到 YouTube！將交由 AI 工具擷取字幕並生成筆記。')
    } else if (hasSocialMedia) {
      await ctx.reply('🛡️ 偵測到社群媒體！已派出 Apify 重裝部隊，約需 30 秒，請先喝口水 ☕')
    } else {
      await ctx.reply('⏳ 正在解析網址...')
    }
    for (const url of urls) {
      if (isYouTubeUrl(url)) {
        // YouTube URLs: skip Jina/Apify, store raw URL so aggregateFlow can fetch transcript
        buffer.push(userId, { type: 'url', content: url, addedAt: new Date().toISOString() })
      } else {
        const content = await fetchUrl(url)
        buffer.push(userId, { type: 'url', content, addedAt: new Date().toISOString() })
      }
      addedCount++
    }
  }

  if (remainingText) {
    buffer.push(userId, { type: 'text', content: remainingText, addedAt: new Date().toISOString() })
    addedCount++
  }

  const count = buffer.count(userId)
  await ctx.reply(`✅ 已收錄 ${addedCount} 筆。目前暫存區有 ${count} 筆資料。`)
}

export async function handleClearCommand(ctx: BotContext, buffer: SessionBuffer): Promise<void> {
  const userId = String(ctx.from!.id)
  buffer.clear(userId)
  await ctx.reply('🗑️ 暫存區已清空。')
}

export async function handleHelpCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(
    '📖 可用指令：\n\n' +
    '/start - 歡迎訊息\n' +
    '/buffer - 查看暫存區內容\n' +
    '/delete <編號> - 刪除暫存區中特定一筆（例：/delete 2）\n' +
    '/clear - 清空整個暫存區\n' +
    '/help - 顯示此說明\n\n' +
    '💡 直接傳文字或網址即可加入暫存區，準備好後點選「聚合」按鈕。'
  )
}

export async function handleDeleteCommand(ctx: BotContext, buffer: SessionBuffer): Promise<void> {
  const userId = String(ctx.from!.id)
  const text = ctx.message?.text ?? ''
  const num = parseInt(text.trim().split(/\s+/)[1] ?? '', 10)

  if (isNaN(num) || num < 1) {
    await ctx.reply('⚠️ 請指定要刪除的編號，例：/delete 2')
    return
  }

  const removed = buffer.remove(userId, num - 1)
  if (!removed) {
    await ctx.reply(`⚠️ 找不到第 ${num} 筆資料，請先用 /buffer 確認清單。`)
    return
  }

  const count = buffer.count(userId)
  await ctx.reply(`🗑️ 已刪除第 ${num} 筆。暫存區剩 ${count} 筆。`)
}

export async function handleBufferCommand(ctx: BotContext, buffer: SessionBuffer): Promise<void> {
  const userId = String(ctx.from!.id)
  const items = buffer.get(userId)

  if (items.length === 0) {
    await ctx.reply('暫存區是空的。請先傳送網址或靈感。')
    return
  }

  const summary = items
    .map((item, i) => `${i + 1}. [${item.type}] ${item.content.slice(0, 60)}...`)
    .join('\n')
  await ctx.reply(`📋 暫存區共 ${items.length} 筆：\n\n${summary}`)
}
