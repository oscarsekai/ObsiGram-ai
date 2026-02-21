import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock youtube-transcript ────────────────────────────────────────────────
vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}))

import { YoutubeTranscript } from 'youtube-transcript'
import { toolDef, handler } from '../youtubeTranscript.js'

const mockedFetch = vi.mocked(YoutubeTranscript.fetchTranscript)

describe('youtubeTranscript toolDef', () => {
  it('has the correct tool name', () => {
    expect(toolDef.name).toBe('get_youtube_transcript')
  })

  it('defines url as a required string parameter', () => {
    expect(toolDef.inputSchema.properties.url.type).toBe('string')
    expect(toolDef.inputSchema.required).toContain('url')
  })
})

describe('youtubeTranscript handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns joined transcript text when captions are available', async () => {
    mockedFetch.mockResolvedValue([
      { text: 'Hello', duration: 1, offset: 0 },
      { text: 'World', duration: 1, offset: 1 },
    ])
    const result = await handler({ url: 'https://www.youtube.com/watch?v=abc' })
    expect(result).toBe('Hello World')
    expect(mockedFetch).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc')
  })

  it('returns fallback message when video has no transcript', async () => {
    mockedFetch.mockResolvedValue([])
    const result = await handler({ url: 'https://youtu.be/abc' })
    expect(result).toBe('No transcript available for this video.')
  })

  it('returns fallback message when fetchTranscript throws (private video)', async () => {
    mockedFetch.mockRejectedValue(new Error('Transcript is disabled'))
    const result = await handler({ url: 'https://www.youtube.com/watch?v=private' })
    expect(result).toBe('No transcript available for this video.')
  })

  it('returns fallback message for any unexpected error', async () => {
    mockedFetch.mockRejectedValue(new TypeError('network error'))
    const result = await handler({ url: 'https://www.youtube.com/watch?v=err' })
    expect(result).toBe('No transcript available for this video.')
  })
})
