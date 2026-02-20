import { existsSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import type { BufferItem } from '../buffer/types.js'

export type NoteType = 'daily' | 'meeting' | 'idea' | 'project' | 'general'
type Theme = 'frontend' | 'backend' | 'workflow' | 'idea' | 'daily' | 'data' | 'ai' | 'general'

export interface ClassificationResult {
  noteType: NoteType
  candidates: string[]
  signals: string[]
  policyHints: string[]
}

const NOTE_TYPE_KEYWORDS: Record<NoteType, string[]> = {
  daily: ['daily', 'journal', 'today', 'log', 'reflection'],
  meeting: ['meeting', 'minutes', 'attendees', 'agenda', '1:1', 'standup'],
  idea: ['idea', 'brainstorm', 'hypothesis', 'concept', 'thought'],
  project: ['project', 'github', 'repo', 'release', 'library', 'tool', 'api', 'implementation', 'architecture'],
  general: [],
}

const THEME_MARKERS: Record<Exclude<Theme, 'general'>, string[]> = {
  frontend: ['frontend', 'react', 'nextjs', 'javascript', 'typescript', 'css', 'tailwind', 'ui', 'web'],
  backend: ['backend', 'api', 'server', 'database', 'sql', 'node', 'express', 'auth', 'cache', 'queue'],
  workflow: ['workflow', 'workflows', 'pipeline', 'ci', 'cd', 'automation', 'github-actions', 'actions'],
  idea: ['idea', 'brainstorm', 'concept', 'hypothesis', 'draft'],
  daily: ['daily', 'journal', 'today', 'log', 'reflection'],
  data: ['data', 'analytics', 'warehouse', 'etl', 'clickhouse', 'metrics'],
  ai: ['ai', 'llm', 'agent', 'prompt', 'rag', 'embedding', 'inference', 'model'],
}

const FOLDER_HINTS: Record<NoteType, string[]> = {
  daily: ['daily', 'journal'],
  meeting: ['meeting', 'meetings'],
  idea: ['idea', 'ideas', 'brainstorm'],
  project: ['project', 'projects', 'dev', 'engineering', 'code', 'repo', 'tool', 'tools', 'opensource'],
  general: ['inbox', 'notes', 'general'],
}

const URL_REGEX = /https?:\/\/[^\s)]+/g

function normalize(text: string): string {
  return text.toLowerCase()
}

function tokenize(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter((t) => t.length > 1)
}

function getCombinedText(items: BufferItem[]): string {
  return items.map((item) => item.content).join('\n')
}

function getUrls(items: BufferItem[]): string[] {
  const urls: string[] = []
  for (const item of items) {
    if (item.type === 'url') {
      urls.push(item.content.trim())
    } else {
      const matches = item.content.match(URL_REGEX)
      if (matches) urls.push(...matches)
    }
  }
  return urls
}

function inferTheme(tokens: string[]): Theme {
  let best: Theme = 'general'
  let bestScore = 0

  for (const [theme, markers] of Object.entries(THEME_MARKERS) as Array<[Exclude<Theme, 'general'>, string[]]>) {
    const score = markers.reduce((sum, marker) => sum + (tokens.includes(marker) ? 1 : 0), 0)
    if (score > bestScore) {
      best = theme
      bestScore = score
    }
  }
  return bestScore >= 2 ? best : 'general'
}

function scoreNoteType(tokens: string[], urls: string[], theme: Theme): NoteType {
  const score: Record<NoteType, number> = {
    daily: 0,
    meeting: 0,
    idea: 0,
    project: 0,
    general: 0,
  }

  for (const [type, keywords] of Object.entries(NOTE_TYPE_KEYWORDS) as Array<[NoteType, string[]]>) {
    for (const keyword of keywords) {
      if (tokens.includes(keyword)) score[type] += 2
    }
  }

  const hasGitHubUrl = urls.some((url) => url.includes('github.com/'))
  if (hasGitHubUrl) score.project += 4
  if (theme === 'frontend' || theme === 'backend' || theme === 'workflow' || theme === 'data' || theme === 'ai') {
    score.project += 3
  }
  if (theme === 'idea') score.idea += 3
  if (theme === 'daily') score.daily += 3

  const maxEntry = (Object.entries(score) as Array<[NoteType, number]>).sort((a, b) => b[1] - a[1])[0]
  if (!maxEntry || maxEntry[1] <= 0) return 'general'
  return maxEntry[0]
}

function scanFolders(vaultPath: string, maxDepth = 2): string[] {
  if (!existsSync(vaultPath)) return []
  const folders: string[] = []

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const absolute = join(dir, entry.name)
      folders.push(relative(vaultPath, absolute))
      walk(absolute, depth + 1)
    }
  }

  walk(vaultPath, 0)
  return folders
}

function scoreFolders(
  folders: string[],
  noteType: NoteType,
  tokens: string[],
  urls: string[],
  theme: Theme,
): string[] {
  const hasGitHubUrl = urls.some((url) => url.includes('github.com/'))
  const hasWorkflowIntent = THEME_MARKERS.workflow.some((token) => tokens.includes(token)) || theme === 'workflow'
  const themeMarkers = theme === 'general' ? [] : THEME_MARKERS[theme]

  const scored = folders.map((folder) => {
    const folderTokens = tokenize(folder)
    let score = 0

    for (const hint of FOLDER_HINTS[noteType]) {
      if (folderTokens.includes(hint)) score += 4
    }

    for (const token of tokens) {
      if (folderTokens.includes(token)) score += 2
    }

    for (const marker of themeMarkers) {
      if (folderTokens.includes(marker)) score += 4
    }

    if (hasGitHubUrl) {
      if (folderTokens.some((token) => FOLDER_HINTS.project.includes(token))) score += 2
      if (folderTokens.includes('workflow') && !hasWorkflowIntent) score -= 4
    }

    if (theme !== 'general' && folderTokens.includes('reference')) score -= 3

    return { folder, score }
  })

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.folder.localeCompare(b.folder))
    .slice(0, 5)
    .map((item) => item.folder)
}

function withThemeFallbackCandidate(candidates: string[], theme: Theme): string[] {
  if (theme === 'general') return candidates
  const alreadyHasTheme = candidates.some((candidate) => candidate.toLowerCase().includes(theme))
  if (alreadyHasTheme) return candidates
  return [theme, ...candidates].slice(0, 5)
}

export function classifyForPrompt(items: BufferItem[], vaultPath: string): ClassificationResult {
  const text = getCombinedText(items)
  const tokens = tokenize(text)
  const urls = getUrls(items)
  const theme = inferTheme(tokens)
  const noteType = scoreNoteType(tokens, urls, theme)
  const folders = scanFolders(vaultPath)
  const rankedCandidates = scoreFolders(folders, noteType, tokens, urls, theme)
  const candidates = withThemeFallbackCandidate(rankedCandidates, theme)
  const hasGitHubUrl = urls.some((url) => url.includes('github.com/'))
  const hasWorkflowIntent = THEME_MARKERS.workflow.some((token) => tokens.includes(token)) || theme === 'workflow'

  const signals = [
    `note_type=${noteType}`,
    `theme=${theme}`,
    hasGitHubUrl ? 'source=github' : 'source=generic',
    `candidate_count=${candidates.length}`,
  ]

  const policyHints: string[] = []
  if (hasGitHubUrl && !hasWorkflowIntent) {
    policyHints.push('avoid_workflow_folder_for_github_repo')
  }
  if (theme === 'frontend') {
    policyHints.push('prefer_frontend_folder')
  } else if (theme === 'backend') {
    policyHints.push('prefer_backend_folder')
  } else if (theme === 'workflow') {
    policyHints.push('prefer_workflow_folder')
  }

  return { noteType, candidates, signals, policyHints }
}
