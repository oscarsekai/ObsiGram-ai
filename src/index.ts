import { bot } from './bot/index.js'
import { startAcpServer, server as acpServer } from './acp/openCodeBridge.js'

console.log('🤖 ObsiGram AI starting...')

bot.start({
  onStart: (info) => {
    console.log(`✅ Bot @${info.username} is running`)
    startAcpServer('', 0).catch(() => {})
  },
})

process.once('SIGINT', () => {
  acpServer.stop()
  bot.stop()
})

process.once('SIGTERM', () => {
  acpServer.stop()
  bot.stop()
})
