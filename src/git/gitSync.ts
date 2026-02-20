import { existsSync } from 'fs'
import path from 'path'
import { simpleGit } from 'simple-git'

export interface GitSyncResult {
  success: boolean
  commitHash?: string
  skipped?: boolean
  error?: string
}

function buildCommitMessage(filePath: string): string {
  return `Auto-dump: ${path.basename(filePath)}`
}

export async function sync(vaultPath: string, filePath: string): Promise<GitSyncResult> {
  if (!existsSync(path.join(vaultPath, '.git'))) {
    return { success: false, error: 'not-a-git-repo' }
  }

  const git = simpleGit(vaultPath)

  try {
    await git.add('.')
    const commitResult = await git.commit(buildCommitMessage(filePath))

    if (commitResult.summary.changes === 0) {
      return { success: true, skipped: true }
    }

    await git.push()

    const hash = await git.revparse(['HEAD'])
    return { success: true, commitHash: hash.trim().slice(0, 7) }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
