import { describe, it, expect, beforeEach } from 'vitest'
import { SessionBuffer } from '../SessionBuffer.js'

describe('SessionBuffer', () => {
  let buffer: SessionBuffer

  beforeEach(() => {
    buffer = new SessionBuffer()
  })

  it('count returns 1 after push', () => {
    buffer.push('u1', { type: 'text', content: 'hello', addedAt: new Date().toISOString() })
    expect(buffer.count('u1')).toBe(1)
  })

  it('get returns the pushed items', () => {
    const item = { type: 'url' as const, content: 'https://example.com', addedAt: new Date().toISOString() }
    buffer.push('u1', item)
    expect(buffer.get('u1')).toEqual([item])
  })

  it('clear resets count to 0', () => {
    buffer.push('u1', { type: 'text', content: 'hi', addedAt: new Date().toISOString() })
    buffer.clear('u1')
    expect(buffer.count('u1')).toBe(0)
  })

  it('get returns empty array when no items', () => {
    expect(buffer.get('unknown')).toEqual([])
  })

  it('throws when pushing more than 20 items', () => {
    for (let i = 0; i < 20; i++) {
      buffer.push('u1', { type: 'text', content: `item${i}`, addedAt: new Date().toISOString() })
    }
    expect(() =>
      buffer.push('u1', { type: 'text', content: 'overflow', addedAt: new Date().toISOString() })
    ).toThrow('Buffer limit')
  })

  it('different userIds are isolated', () => {
    buffer.push('u1', { type: 'text', content: 'for u1', addedAt: new Date().toISOString() })
    buffer.push('u2', { type: 'text', content: 'for u2', addedAt: new Date().toISOString() })
    expect(buffer.count('u1')).toBe(1)
    expect(buffer.count('u2')).toBe(1)
    expect(buffer.get('u1')[0].content).toBe('for u1')
    expect(buffer.get('u2')[0].content).toBe('for u2')
  })
})
