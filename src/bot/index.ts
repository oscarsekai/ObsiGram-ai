import { Bot, InlineKeyboard, GrammyError } from 'grammy'
import type { Context } from 'grammy'
import { config } from '../config.js'
import { SessionBuffer } from '../buffer/SessionBuffer.js'
import {
  createWhitelistGuard,
  handleTextMessage,
  handleClearCommand,
  handleBufferCommand,
  handleHelpCommand,
  handleDeleteCommand,
} from './handlers.js'
import { aggregateAndSave } from './aggregateFlow.js'

const buffer = new SessionBuffer()
const bot = new Bot<Context>(config.TELEGRAM_BOT_TOKEN)

// Whitelist guard
const guard = createWhitelistGuard(config.ALLOWED_USER_ID)
bot.use((ctx, next) => guard(ctx as any, next))

const aggregateKeyboard = new InlineKeyboard().text('整理成 Obsidian 筆記', 'aggregate')

// Commands
bot.command('start', async (ctx) => {
  await ctx.reply(
    '👋 歡迎使用 ObsiGram AI！\n\n' +
    '傳送網址或靈感文字給我，收錄後直接點訊息下方的按鈕聚合成 Obsidian 筆記。\n\n' +
    '輸入 /help 查看所有指令。',
  )
})

bot.command('help', async (ctx) => {
  await handleHelpCommand(ctx as any)
})

bot.command('buffer', async (ctx) => {
  await handleBufferCommand(ctx as any, buffer)
})

bot.command('delete', async (ctx) => {
  await handleDeleteCommand(ctx as any, buffer)
})

bot.command('clear', async (ctx) => {
  await handleClearCommand(ctx as any, buffer)
})

bot.command('aggregate', async (ctx) => {
  const userId = String(ctx.from!.id)
  await aggregateAndSave(ctx as any, buffer, userId, config.VAULT_PATH)
})

// Text/URL messages — add to buffer and show aggregate button inline
bot.on('message:text', async (ctx) => {
  await handleTextMessage(ctx as any, buffer)
  const count = buffer.count(String(ctx.from.id))
  if (count > 0) {
    await ctx.reply('準備好了嗎？', { reply_markup: aggregateKeyboard })
  }
})

// Aggregate callback (from inline keyboard)
bot.callbackQuery('aggregate', async (ctx) => {
  try {
    await ctx.answerCallbackQuery()
  } catch (error) {
    if (!(error instanceof GrammyError) || !error.description.includes('query is too old')) {
      throw error
    }
  }
  const userId = String(ctx.from.id)
  await aggregateAndSave(ctx as any, buffer, userId, config.VAULT_PATH)
})

bot.catch((err) => {
  const ctx = err.ctx
  console.error(`[Bot] error handling update ${ctx.update.update_id}:`, err.error)
  ctx.reply('⚠️ 發生內部錯誤，請稍後再試。').catch(() => {})
})

export { bot }
