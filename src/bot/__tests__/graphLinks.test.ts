import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { enforceGraphConnections } from '../aggregateFlow.js'

describe('aggregateFlow - enforceGraphConnections', () => {
  it('appends related wikilinks when catalog has semantic overlap', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsigram-graph-'))
    const notePath = join(root, 'projects', '2026-02-21-react-doctor.md')
    mkdirSync(join(root, 'projects'), { recursive: true })
    mkdirSync(join(root, '.obsigram'), { recursive: true })

    writeFileSync(notePath, '---\ntitle: React Doctor\ntags: [react,tool]\n---\n\n## 詳細內容\n- text\n', 'utf8')
    writeFileSync(
      join(root, '.obsigram', 'vault-catalog.md'),
      '# Vault Catalog\n\n## projects\n- projects/2026-02-21-react-performance-guide.md | title: React performance guide | tags: react,performance\n- projects/2026-02-21-claude-code-system-prompts-system-prompts.md | title: Claude prompts | tags: prompts\n',
      'utf8',
    )

    enforceGraphConnections(notePath, join(root, '.obsigram', 'vault-catalog.md'))
    const content = readFileSync(notePath, 'utf8')
    expect(content).toContain('## 關聯地圖 (MOC)')
    expect(content).toContain('[[2026-02-21-react-performance-guide]]')
    expect(content).not.toContain('[[2026-02-21-claude-code-system-prompts-system-prompts]]')
  })

  it('keeps note unchanged when wikilinks already exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsigram-graph-'))
    const notePath = join(root, 'projects', 'note.md')
    mkdirSync(join(root, 'projects'), { recursive: true })
    const original = '## 關鍵實體與概念\n- [[React]]\n- [[TypeScript]]\n'
    writeFileSync(notePath, original, 'utf8')

    enforceGraphConnections(notePath)
    expect(readFileSync(notePath, 'utf8')).toBe(original)
  })

  it('writes 無 when there is no meaningful related note', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsigram-graph-'))
    const notePath = join(root, 'projects', 'note.md')
    mkdirSync(join(root, 'projects'), { recursive: true })
    mkdirSync(join(root, '.obsigram'), { recursive: true })
    writeFileSync(notePath, '---\ntitle: Unique Topic\n---\n\n## 詳細內容\n- text\n', 'utf8')
    writeFileSync(
      join(root, '.obsigram', 'vault-catalog.md'),
      '# Vault Catalog\n\n## projects\n- projects/alpha.md | title: Totally Different Subject | tags: unrelated\n',
      'utf8',
    )

    enforceGraphConnections(notePath, join(root, '.obsigram', 'vault-catalog.md'))
    expect(readFileSync(notePath, 'utf8')).toContain('## 關聯地圖 (MOC)\n無')
  })

  it('prefers relevant MOC notes when available', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsigram-graph-'))
    const notePath = join(root, 'projects', 'js-types.md')
    mkdirSync(join(root, 'projects'), { recursive: true })
    mkdirSync(join(root, '.obsigram'), { recursive: true })
    writeFileSync(notePath, '---\ntitle: JavaScript Types Guide\ntags: [javascript,learning]\n---\n\n## 詳細內容\n- text\n', 'utf8')
    writeFileSync(
      join(root, '.obsigram', 'vault-catalog.md'),
      '# Vault Catalog\n\n## programming/javascript\n- programming/javascript/JavaScript MOC.md | title: JavaScript MOC | tags: javascript,moc\n- projects/react-notes.md | title: React Notes | tags: react\n',
      'utf8',
    )

    enforceGraphConnections(notePath, join(root, '.obsigram', 'vault-catalog.md'))
    const content = readFileSync(notePath, 'utf8')
    expect(content).toContain('[[JavaScript MOC]]')
  })
})
