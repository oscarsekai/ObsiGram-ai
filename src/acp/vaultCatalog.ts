import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import type { ClassificationResult } from './classifier.js'

function extractTitleFromMarkdown(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf8').slice(0, 8000)
    const frontmatterTitle = content.match(/^\s*title:\s*(.+)$/m)?.[1]?.trim()
    if (frontmatterTitle) return frontmatterTitle.replace(/^["']|["']$/g, '')
    const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
    if (h1) return h1
  } catch {
    // ignore and fallback
  }
  return path.basename(filePath, '.md')
}

function extractTagsFromMarkdown(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf8').slice(0, 8000)
    const inline = content.match(/^\s*tags:\s*\[(.+)\]\s*$/m)?.[1]
    if (inline) {
      return inline
        .split(',')
        .map((tag) => tag.trim().replace(/^["'#]+|["']+$/g, '').toLowerCase())
        .filter(Boolean)
    }
  } catch {
    // ignore
  }
  return []
}

export function buildVaultCatalog(vaultPath: string, classification: ClassificationResult): string | null {
  try {
    const targetFolders = new Set<string>()
    for (const folder of classification.candidates) {
      targetFolders.add(folder)
      const parent = path.dirname(folder)
      if (parent && parent !== '.') targetFolders.add(parent)
    }

    const lines: string[] = []
    lines.push(`# Vault Catalog`)
    lines.push(`generated_at: ${new Date().toISOString()}`)
    lines.push(`note_type_hint: ${classification.noteType}`)
    lines.push('')

    for (const folder of [...targetFolders].sort()) {
      const absoluteFolder = path.join(vaultPath, folder)
      if (!existsSync(absoluteFolder)) continue

      lines.push(`## ${folder}`)
      const entries = readdirSync(absoluteFolder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => {
          const filePath = path.join(absoluteFolder, entry.name)
          const mtime = statSync(filePath).mtimeMs
          return { filePath, name: entry.name, mtime }
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 10)

      if (entries.length === 0) {
        lines.push('- (no markdown files found)')
      } else {
        for (const entry of entries) {
          const rel = path.relative(vaultPath, entry.filePath)
          const title = extractTitleFromMarkdown(entry.filePath)
          const tags = extractTagsFromMarkdown(entry.filePath)
          lines.push(`- ${rel} | title: ${title}${tags.length > 0 ? ` | tags: ${tags.join(',')}` : ''}`)
        }
      }
      lines.push('')
    }

    const catalogDir = path.join(vaultPath, '.obsigram')
    mkdirSync(catalogDir, { recursive: true })
    const catalogPath = path.join(catalogDir, 'vault-catalog.md')
    writeFileSync(catalogPath, lines.join('\n'), 'utf8')
    return catalogPath
  } catch {
    return null
  }
}
