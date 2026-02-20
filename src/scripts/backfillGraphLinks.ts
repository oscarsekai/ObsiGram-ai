import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { enforceGraphConnections } from '../bot/aggregateFlow.js'

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
    if (!inline) return []
    return inline
      .split(',')
      .map((tag) => tag.trim().replace(/^["'#]+|["']+$/g, '').toLowerCase())
      .filter(Boolean)
  } catch {
    return []
  }
}

function collectMarkdownFiles(root: string): string[] {
  const result: string[] = []
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.obsigram')) continue
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result.push(absolute)
      }
    }
  }
  walk(root)
  return result
}

function buildCatalog(vaultPath: string, files: string[]): string {
  const lines: string[] = []
  lines.push('# Vault Catalog')
  lines.push(`generated_at: ${new Date().toISOString()}`)
  lines.push('mode: backfill')
  lines.push('')

  const grouped = new Map<string, Array<{ rel: string; filePath: string; mtime: number }>>()
  for (const filePath of files) {
    const rel = path.relative(vaultPath, filePath)
    const folder = path.dirname(rel)
    if (!grouped.has(folder)) grouped.set(folder, [])
    grouped.get(folder)!.push({ rel, filePath, mtime: statSync(filePath).mtimeMs })
  }

  for (const [folder, entries] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${folder}`)
    for (const entry of entries.sort((a, b) => b.mtime - a.mtime).slice(0, 30)) {
      const title = extractTitleFromMarkdown(entry.filePath)
      const tags = extractTagsFromMarkdown(entry.filePath)
      lines.push(`- ${entry.rel} | title: ${title}${tags.length > 0 ? ` | tags: ${tags.join(',')}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function main(): void {
  const vaultPath = process.argv[2] ?? process.env.VAULT_PATH
  if (!vaultPath || !existsSync(vaultPath)) {
    throw new Error('Usage: npm run backfill:links -- /absolute/vault/path')
  }

  const files = collectMarkdownFiles(vaultPath)
  const catalogDir = path.join(vaultPath, '.obsigram')
  mkdirSync(catalogDir, { recursive: true })
  const catalogPath = path.join(catalogDir, 'vault-catalog.md')
  writeFileSync(catalogPath, buildCatalog(vaultPath, files), 'utf8')

  for (const filePath of files) {
    enforceGraphConnections(filePath, catalogPath)
  }
  console.log(`Backfilled graph links for ${files.length} notes using ${catalogPath}`)
}

main()
