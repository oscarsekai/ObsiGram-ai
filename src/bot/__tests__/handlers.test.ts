import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../fetcher/jinaReader.js', () => ({
  fetchUrl: vi.fn().mockResolvedValue('# Fetched Content'),
}))

vi.mock('../../fetcher/apifyFetcher.js', () => ({
  isSocialMediaUrl: vi.fn((url: string) => url.includes('facebook.com') || url.includes('instagram.com')),
}))

import { fetchUrl } from '../../fetcher/jinaReader.js'
import { SessionBuffer } from '../../buffer/SessionBuffer.js'
import {
  createWhitelistGuard,
  handleTextMessage,
  handleClearCommand,
  handleBufferCommand,
  isYouTubeUrl,
} from '../handlers.js'

const ALLOWED_USER_ID = 42

function makeMockCtx(overrides: Record<string, any> = {}) {
  return {
    from: { id: ALLOWED_USER_ID },
    message: { text: 'hello' },
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('createWhitelistGuard', () => {
  it('calls next() for allowed userId', async () => {
    const guard = createWhitelistGuard(ALLOWED_USER_ID)
    const ctx = makeMockCtx()
    const next = vi.fn()
    await guard(ctx, next)
    expect(next).toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('does not call next() for unknown userId', async () => {
    const guard = createWhitelistGuard(ALLOWED_USER_ID)
    const ctx = makeMockCtx({ from: { id: 9999 } })
    const next = vi.fn()
    await guard(ctx, next)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('handleTextMessage', () => {
  let buffer: SessionBuffer

  beforeEach(() => {
    buffer = new SessionBuffer()
    vi.clearAllMocks()
  })

  it('calls fetchUrl and pushes to buffer when text is a URL', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://example.com' } })
    await handleTextMessage(ctx, buffer)
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com')
    expect(buffer.count(String(ALLOWED_USER_ID))).toBe(1)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'))
  })

  it('splits adjacent URLs correctly (no whitespace between them)', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://example.comhttps://www.facebook.com/humansofnewyork/' } })
    await handleTextMessage(ctx, buffer)
    expect(fetchUrl).toHaveBeenCalledTimes(2)
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com')
    expect(fetchUrl).toHaveBeenCalledWith('https://www.facebook.com/humansofnewyork/')
    expect(buffer.count(String(ALLOWED_USER_ID))).toBe(2)
  })

  it('sends comfort message for social media URLs', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://www.instagram.com/p/C8Example/' } })
    await handleTextMessage(ctx, buffer)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Apify'))
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('☕'))
  })

  it('sends regular loading message for non-social URLs', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://example.com' } })
    await handleTextMessage(ctx, buffer)
    expect(ctx.reply).toHaveBeenCalledWith('⏳ 正在解析網址...')
  })
  it('pushes plain text directly to buffer without fetching', async () => {
    const ctx = makeMockCtx({ message: { text: 'just a thought' } })
    await handleTextMessage(ctx, buffer)
    expect(fetchUrl).not.toHaveBeenCalled()
    expect(buffer.count(String(ALLOWED_USER_ID))).toBe(1)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'))
  })
})

describe('handleClearCommand', () => {
  it('clears the buffer and replies confirmation', async () => {
    const buffer = new SessionBuffer()
    buffer.push(String(ALLOWED_USER_ID), { type: 'text', content: 'hi', addedAt: new Date().toISOString() })
    const ctx = makeMockCtx()
    await handleClearCommand(ctx, buffer)
    expect(buffer.count(String(ALLOWED_USER_ID))).toBe(0)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('🗑️'))
  })
})

describe('handleBufferCommand', () => {
  it('shows empty buffer message when no items', async () => {
    const buffer = new SessionBuffer()
    const ctx = makeMockCtx()
    await handleBufferCommand(ctx, buffer)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('空'))
  })

  it('shows count when buffer has items', async () => {
    const buffer = new SessionBuffer()
    buffer.push(String(ALLOWED_USER_ID), { type: 'text', content: 'item1', addedAt: new Date().toISOString() })
    const ctx = makeMockCtx()
    await handleBufferCommand(ctx, buffer)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('1'))
  })
})

describe('isYouTubeUrl', () => {
  it('returns true for youtube.com URL', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
  })

  it('returns true for youtu.be short URL', () => {
    expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true)
  })

  it('returns false for non-YouTube URL', () => {
    expect(isYouTubeUrl('https://example.com')).toBe(false)
  })

  it('returns false for facebook.com URL', () => {
    expect(isYouTubeUrl('https://www.facebook.com/video/123')).toBe(false)
  })
})

describe('handleTextMessage - YouTube URL handling', () => {
  let buffer: SessionBuffer

  beforeEach(() => {
    buffer = new SessionBuffer()
    vi.clearAllMocks()
  })

  it('skips fetchUrl and stores raw URL for youtube.com links', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://www.youtube.com/watch?v=abc' } })
    await handleTextMessage(ctx, buffer)
    expect(fetchUrl).not.toHaveBeenCalled()
    expect(buffer.count(String(ALLOWED_USER_ID))).toBe(1)
    const items = buffer.get(String(ALLOWED_USER_ID))
    expect(items[0].content).toBe('https://www.youtube.com/watch?v=abc')
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('YouTube'))
  })

  it('skips fetchUrl and stores raw URL for youtu.be links', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://youtu.be/abc123' } })
    await handleTextMessage(ctx, buffer)
    expect(fetchUrl).not.toHaveBeenCalled()
    const items = buffer.get(String(ALLOWED_USER_ID))
    expect(items[0].content).toBe('https://youtu.be/abc123')
  })

  it('still calls fetchUrl for non-YouTube, non-social URLs', async () => {
    const ctx = makeMockCtx({ message: { text: 'https://example.com/article' } })
    await handleTextMessage(ctx, buffer)
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com/article')
    expect(buffer.count(String(ALLOWED_USER_ID))).toBe(1)
  })
})
