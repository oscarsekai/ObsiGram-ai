import { existsSync } from 'fs'
import path from 'path'

export function validateVaultPath(vaultPath: string): void {
  if (!existsSync(vaultPath)) {
    throw new Error(`Vault path not found: ${vaultPath}`)
  }
}

export function validateFilePath(filePath: string, vaultPath: string): void {
  const resolved = path.resolve(filePath)
  const vaultResolved = path.resolve(vaultPath)
  if (!resolved.startsWith(vaultResolved + path.sep) && resolved !== vaultResolved) {
    throw new Error(`Security error: file path "${filePath}" is outside vault "${vaultPath}"`)
  }
}
