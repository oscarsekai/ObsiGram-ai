import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { classifyForPrompt } from '../classifier.js'
import type { BufferItem } from '../../buffer/types.js'

describe('classifier - classifyForPrompt', () => {
  it('infers project type for GitHub URLs', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsigram-classifier-'))
    mkdirSync(join(vault, 'projects'))
    mkdirSync(join(vault, 'workflow'))

    const items: BufferItem[] = [
      { type: 'url', content: 'https://github.com/millionco/react-doctor', addedAt: new Date().toISOString() },
      { type: 'text', content: 'investigate react performance tool and release notes', addedAt: new Date().toISOString() },
    ]

    const result = classifyForPrompt(items, vault)
    expect(result.noteType).toBe('project')
  })

  it('de-prioritizes workflow folder for GitHub repo links without workflow intent', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsigram-classifier-'))
    mkdirSync(join(vault, 'projects'))
    mkdirSync(join(vault, 'workflow'))

    const items: BufferItem[] = [
      { type: 'url', content: 'https://github.com/millionco/react-doctor', addedAt: new Date().toISOString() },
      { type: 'text', content: 'React Doctor repository analysis and usage notes', addedAt: new Date().toISOString() },
    ]

    const result = classifyForPrompt(items, vault)
    expect(result.candidates[0]).toBe('projects')
    expect(result.policyHints).toContain('avoid_workflow_folder_for_github_repo')
  })

  it('keeps workflow possibility for github workflow content', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsigram-classifier-'))
    mkdirSync(join(vault, 'workflow'))
    mkdirSync(join(vault, 'projects'))

    const items: BufferItem[] = [
      { type: 'url', content: 'https://github.com/actions/runner', addedAt: new Date().toISOString() },
      { type: 'text', content: 'workflow pipeline ci cd github-actions setup and troubleshooting', addedAt: new Date().toISOString() },
    ]

    const result = classifyForPrompt(items, vault)
    expect(result.signals).toContain('theme=workflow')
    expect(result.policyHints).toContain('prefer_workflow_folder')
    expect(result.policyHints).not.toContain('avoid_workflow_folder_for_github_repo')
  })

  it('prefers frontend folder for frontend content instead of reference', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsigram-classifier-'))
    mkdirSync(join(vault, 'reference'))
    mkdirSync(join(vault, 'frontend'))
    mkdirSync(join(vault, 'frontend', 'react'))

    const items: BufferItem[] = [
      { type: 'url', content: 'https://developer.chrome.com/docs/devtools', addedAt: new Date().toISOString() },
      { type: 'text', content: 'React TypeScript CSS component patterns for frontend UI performance', addedAt: new Date().toISOString() },
    ]

    const result = classifyForPrompt(items, vault)
    expect(result.policyHints).toContain('prefer_frontend_folder')
    expect(result.signals).toContain('theme=frontend')
    expect(result.candidates[0]).toContain('frontend')
  })

  it('adds inferred theme back to candidate list when missing', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsigram-classifier-'))
    mkdirSync(join(vault, 'reference'))

    const items: BufferItem[] = [
      { type: 'text', content: 'backend api server database auth cache design', addedAt: new Date().toISOString() },
    ]

    const result = classifyForPrompt(items, vault)
    expect(result.signals).toContain('theme=backend')
    expect(result.candidates[0]).toBe('backend')
    expect(result.policyHints).toContain('prefer_backend_folder')
  })
})
