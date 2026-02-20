import { readFileSync } from 'fs'
import type { BufferItem } from '../buffer/types.js'
import type { ClassificationResult } from './classifier.js'

const PROMPT_TEMPLATE = readFileSync(
  new URL('./prompts/obsidian-note-prompt.md', import.meta.url),
  'utf8',
)

export function buildPrompt(
  items: BufferItem[],
  vaultPath: string,
  classification?: ClassificationResult,
  catalogPath?: string,
): string {
  const itemsText = items
    .map((item, i) => `### Item ${i + 1} (${item.type})\n${item.content}`)
    .join('\n\n')

  const classificationText = classification
    ? `
**Pre-classification (local heuristic)**:
- Suggested note type: ${classification.noteType}
- Candidate folders (priority order): ${classification.candidates.length > 0 ? classification.candidates.join(', ') : '(none)'}
- Signals: ${classification.signals.join(', ')}
`
    : ''

  const policyText = classification && classification.policyHints.length > 0
    ? `\n**Classification policy hints**:\n${classification.policyHints.map((hint) => `- ${hint}`).join('\n')}\n`
    : ''

  const folderRule = classification && classification.candidates.length > 0
    ? `2. Choose the target folder from these candidate folders first: ${classification.candidates.join(', ')}. Prefer content-topic folders (frontend/backend/workflow/data/ai/idea and other domain folders) over generic reference. Only if none is truly suitable, explain why and then pick another existing folder.`
    : '2. Analyse the content below and choose the most appropriate existing topical folder by content domain first; use reference only as fallback. Only create a new folder if no existing one fits.'

  const noteTypeRule = classification
    ? `3. Respect the suggested note type "${classification.noteType}" unless the content clearly contradicts it; if overridden, explain the reason in frontmatter field "classification_reason".`
    : '3. Determine a suitable note type and keep metadata consistent with content.'

  const catalogHint = catalogPath
    ? `- Priority context file: ${catalogPath}（先讀這份目錄索引與既有 title，再決定最終分類）`
    : '- Priority context file: (none)'

  return PROMPT_TEMPLATE
    .replaceAll('{{VAULT_PATH}}', vaultPath)
    .replace('{{CLASSIFICATION_TEXT}}', classificationText)
    .replace('{{POLICY_TEXT}}', policyText)
    .replace('{{FOLDER_RULE}}', folderRule)
    .replace('{{NOTE_TYPE_RULE}}', noteTypeRule)
    .replace('{{CATALOG_HINT}}', catalogHint)
    .replace('{{INPUT_CONTENT}}', `${itemsText}\n\n[Coverage requirement]\nYou must explicitly analyze all input items (Item 1..N). Do not ignore any URL/item.`)
}
