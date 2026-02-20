import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../buildPrompt.js'
import type { BufferItem } from '../../buffer/types.js'
import type { ClassificationResult } from '../classifier.js'

describe('buildPrompt', () => {
  const vaultPath = '/test/vault'
  const items: BufferItem[] = [
    { type: 'url', content: '# Article\n\nSome content', addedAt: '2026-01-01T00:00:00Z' },
    { type: 'text', content: 'My idea about this topic', addedAt: '2026-01-01T00:01:00Z' },
  ]

  it('includes all buffer item contents', () => {
    const prompt = buildPrompt(items, vaultPath)
    expect(prompt).toContain('# Article')
    expect(prompt).toContain('My idea about this topic')
  })

  it('contains instruction to read catalog hint', () => {
    const prompt = buildPrompt(items, vaultPath)
    expect(prompt).toContain('Catalog hint')
    expect(prompt).toMatch(/讀取|[Cc]atalog|索引/)
  })

  it('injects pre-classification context when provided', () => {
    const classification: ClassificationResult = {
      noteType: 'project',
      candidates: ['projects/tools', 'projects'],
      signals: ['note_type=project', 'source=github'],
      policyHints: ['avoid_workflow_folder_for_github_repo'],
    }
    const prompt = buildPrompt(items, vaultPath, classification, '/test/vault/.obsigram/vault-catalog.md')
    expect(prompt).toContain('Suggested note type: project')
    expect(prompt).toContain('projects/tools')
    expect(prompt).toContain('classification_reason')
    expect(prompt).toContain('avoid_workflow_folder_for_github_repo')
    expect(prompt).toContain('/test/vault/.obsigram/vault-catalog.md')
  })

  it('includes topical-folder priority guidance', () => {
    const prompt = buildPrompt(items, vaultPath)
    expect(prompt).toMatch(/topic folders|topical folder|reference only as fallback|content domain/i)
  })
})
