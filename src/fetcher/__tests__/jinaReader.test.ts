import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

vi.mock('axios')
vi.mock('../apifyFetcher.js', () => ({
  isSocialMediaUrl: vi.fn((url: string) => url.includes('instagram.com') || url.includes('facebook.com')),
  fetchWithApify: vi.fn(async (url: string) => `[Apify result for ${url}]`),
}))

const mockedAxios = vi.mocked(axios)

describe('jinaReader - fetchUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns markdown content on success', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: '# Title\n\nContent here' })
    const { fetchUrl } = await import('../jinaReader.js')
    const result = await fetchUrl('https://example.com')
    expect(result).toBe('# Title\n\nContent here')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com',
      expect.objectContaining({ timeout: 20000 })
    )
  })

  it('routes social media URLs to Apify (facebook.com)', async () => {
    const { fetchUrl } = await import('../jinaReader.js')
    const { fetchWithApify } = await import('../apifyFetcher.js')
    const url = 'https://www.facebook.com/post/123'
    const result = await fetchUrl(url)
    expect(fetchWithApify).toHaveBeenCalledWith(url)
    expect(result).toBe(`[Apify result for ${url}]`)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('routes social media URLs to Apify (instagram.com)', async () => {
    const { fetchUrl } = await import('../jinaReader.js')
    const { fetchWithApify } = await import('../apifyFetcher.js')
    const url = 'https://www.instagram.com/p/abc123'
    await fetchUrl(url)
    expect(fetchWithApify).toHaveBeenCalledWith(url)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('throws on invalid URL format', async () => {
    const { fetchUrl } = await import('../jinaReader.js')
    await expect(fetchUrl('not-a-url')).rejects.toThrow('Invalid URL')
  })

  it('returns original URL as fallback on timeout', async () => {
    const timeoutError = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })
    mockedAxios.get = vi.fn().mockRejectedValue(timeoutError)
    const { fetchUrl } = await import('../jinaReader.js')
    const result = await fetchUrl('https://example.com/slow')
    expect(result).toBe('https://example.com/slow')
  })

  it('returns original URL as fallback on HTTP 4xx error', async () => {
    const httpError = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    })
    mockedAxios.get = vi.fn().mockRejectedValue(httpError)
    const { fetchUrl } = await import('../jinaReader.js')
    const result = await fetchUrl('https://example.com/404')
    expect(result).toBe('https://example.com/404')
  })

  it('returns original URL as fallback on HTTP 5xx error', async () => {
    const httpError = Object.assign(new Error('Server Error'), {
      response: { status: 500 },
    })
    mockedAxios.get = vi.fn().mockRejectedValue(httpError)
    const { fetchUrl } = await import('../jinaReader.js')
    const result = await fetchUrl('https://example.com/error')
    expect(result).toBe('https://example.com/error')
  })
})
