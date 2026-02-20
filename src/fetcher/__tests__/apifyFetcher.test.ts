import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isSocialMediaUrl, fetchWithApify } from '../apifyFetcher.js'

vi.mock('apify-client', () => {
  const mockListItems = vi.fn()
  const mockDataset = vi.fn(() => ({ listItems: mockListItems }))
  const mockCall = vi.fn()
  const mockActor = vi.fn(() => ({ call: mockCall }))
  return {
    ApifyClient: vi.fn(() => ({
      actor: mockActor,
      dataset: mockDataset,
    })),
    _mockCall: mockCall,
    _mockListItems: mockListItems,
    _mockActor: mockActor,
  }
})

describe('apifyFetcher - isSocialMediaUrl', () => {
  it.each([
    'https://www.facebook.com/post/123',
    'https://fb.watch/abc',
    'https://www.instagram.com/p/abc',
    // 'https://www.threads.com/@user/post/abc',
    // 'https://www.reddit.com/r/programming/comments/abc',
  ])('returns true for %s', (url) => {
    expect(isSocialMediaUrl(url)).toBe(true)
  })

  it.each([
    'https://example.com',
    'https://github.com',
    'https://news.ycombinator.com',
  ])('returns false for %s', (url) => {
    expect(isSocialMediaUrl(url)).toBe(false)
  })
})

describe('apifyFetcher - fetchWithApify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns original URL on Apify error', async () => {
    const { ApifyClient } = await import('apify-client')
    vi.mocked(ApifyClient).mockImplementation(() => ({
      actor: vi.fn(() => ({
        call: vi.fn().mockRejectedValue(new Error('Apify error')),
      })),
      dataset: vi.fn(),
    }) as any)
    const url = 'https://www.facebook.com/post/123'
    const result = await fetchWithApify(url)
    expect(result).toBe(url)
  })

  it('returns original URL when dataset is empty', async () => {
    const { ApifyClient } = await import('apify-client')
    vi.mocked(ApifyClient).mockImplementation(() => ({
      actor: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds1' }),
      })),
      dataset: vi.fn(() => ({
        listItems: vi.fn().mockResolvedValue({ items: [] }),
      })),
    }) as any)
    const url = 'https://www.facebook.com/post/123'
    const result = await fetchWithApify(url)
    expect(result).toBe(url)
  })

  it('returns formatted Facebook post content', async () => {
    const { ApifyClient } = await import('apify-client')
    vi.mocked(ApifyClient).mockImplementation(() => ({
      actor: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds1' }),
      })),
      dataset: vi.fn(() => ({
        listItems: vi.fn().mockResolvedValue({
          items: [{ user: { name: 'Alice' }, text: 'Hello world' }],
        }),
      })),
    }) as any)
    const url = 'https://www.facebook.com/post/123'
    const result = await fetchWithApify(url)
    expect(result).toContain('FB 貼文')
    expect(result).toContain('Alice')
    expect(result).toContain('Hello world')
  })

  it('uses Facebook fallback fields when text is missing', async () => {
    const { ApifyClient } = await import('apify-client')
    vi.mocked(ApifyClient).mockImplementation(() => ({
      actor: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds1' }),
      })),
      dataset: vi.fn(() => ({
        listItems: vi.fn().mockResolvedValue({
          items: [{ pageName: 'HONY', caption: 'Caption only content' }],
        }),
      })),
    }) as any)
    const url = 'https://www.facebook.com/photo/?fbid=1&set=a.1'
    const result = await fetchWithApify(url)
    expect(result).toContain('HONY')
    expect(result).toContain('Caption only content')
  })

  it('returns original URL for Reddit because it is disabled', async () => {
    const url = 'https://www.reddit.com/r/test/comments/abc'
    const result = await fetchWithApify(url)
    expect(result).toBe(url)
  })
})
