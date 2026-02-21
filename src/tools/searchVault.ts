import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

export const toolDef: ToolDefinition = {
  name: 'search_vault',
  description:
    'Searches the Obsidian vault for existing notes whose filename contains the given keyword. Use this before creating a new note to detect duplicates and decide whether to create a new file or append to an existing one.',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: 'The keyword to search for in note filenames (case-insensitive)',
      },
    },
    required: ['keyword'],
  },
}

function getMdFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { recursive: true, withFileTypes: false })
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.endsWith('.md')) {
        results.push(join(dir, entry))
      }
    }
  } catch {
    return results
  }
  return results
}

function readFirstLines(filePath: string, n: number): string {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content.split('\n').slice(0, n).join('\n')
  } catch {
    return ''
  }
}

export async function handler(params: { keyword: string }): Promise<string> {
  const vaultPath = process.env.VAULT_PATH
  if (!vaultPath) {
    return 'VAULT_PATH is not configured.'
  }

  const keyword = params.keyword.toLowerCase()
  const allFiles = getMdFiles(vaultPath)
  const hits = allFiles.filter((f) => {
    const basename = f.split('/').pop() ?? ''
    return basename.toLowerCase().includes(keyword)
  })

  if (hits.length === 0) {
    return 'No matching notes found. Please create a new file.'
  }

  const lines: string[] = [`Found ${hits.length} matching note${hits.length > 1 ? 's' : ''}:`]
  for (const filePath of hits) {
    const preview = readFirstLines(filePath, 3).replace(/\n/g, '\\n')
    lines.push(`- ${filePath}`)
    lines.push(`  (preview: ${preview})`)
  }
  return lines.join('\n')
}
