import { describe, it, expect } from 'vitest'
import { applyClassificationPathPolicy } from '../aggregateFlow.js'

describe('aggregateFlow - applyClassificationPathPolicy', () => {
  const vaultPath = '/vault'

  it('redirects workflow path for github repo policy to non-workflow candidate', () => {
    const result = applyClassificationPathPolicy(
      '/vault/Development/Workflow/2026-02-21-react-doctor.md',
      vaultPath,
      {
        noteType: 'project',
        candidates: ['Development/Projects', 'Development/Workflow'],
        signals: ['source=github'],
        policyHints: ['avoid_workflow_folder_for_github_repo'],
      },
    )

    expect(result).toBe('/vault/Development/Projects/2026-02-21-react-doctor.md')
  })

  it('keeps workflow path when policy is absent', () => {
    const result = applyClassificationPathPolicy(
      '/vault/Development/Workflow/2026-02-21-react-doctor.md',
      vaultPath,
      {
        noteType: 'project',
        candidates: ['Development/Workflow'],
        signals: ['source=generic'],
        policyHints: [],
      },
    )

    expect(result).toBe('/vault/Development/Workflow/2026-02-21-react-doctor.md')
  })

  it('redirects reference path to frontend folder when frontend theme is detected', () => {
    const result = applyClassificationPathPolicy(
      '/vault/reference/frontend/react-rendering.md',
      vaultPath,
      {
        noteType: 'project',
        candidates: ['frontend/react', 'reference/frontend'],
        signals: ['source=generic', 'theme=frontend'],
        policyHints: ['prefer_frontend_folder'],
      },
    )

    expect(result).toBe('/vault/frontend/react/react-rendering.md')
  })

  it('redirects non-workflow path to workflow folder when workflow theme is detected', () => {
    const result = applyClassificationPathPolicy(
      '/vault/projects/actions-runner.md',
      vaultPath,
      {
        noteType: 'project',
        candidates: ['workflow/automation', 'projects'],
        signals: ['source=github', 'theme=workflow'],
        policyHints: ['prefer_workflow_folder'],
      },
    )

    expect(result).toBe('/vault/workflow/automation/actions-runner.md')
  })
})
