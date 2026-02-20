import type { BufferItem } from './types.js'

const MAX_BUFFER_SIZE = 20

export class SessionBuffer {
  private store = new Map<string, BufferItem[]>()

  private getOrCreate(userId: string): BufferItem[] {
    if (!this.store.has(userId)) this.store.set(userId, [])
    return this.store.get(userId)!
  }

  push(userId: string, item: BufferItem): void {
    const items = this.getOrCreate(userId)
    if (items.length >= MAX_BUFFER_SIZE) {
      throw new Error(`Buffer limit of ${MAX_BUFFER_SIZE} reached for user ${userId}`)
    }
    items.push(item)
  }

  get(userId: string): BufferItem[] {
    return this.store.get(userId) ?? []
  }

  clear(userId: string): void {
    this.store.set(userId, [])
  }

  count(userId: string): number {
    return this.store.get(userId)?.length ?? 0
  }

  remove(userId: string, index: number): boolean {
    const items = this.store.get(userId)
    if (!items || index < 0 || index >= items.length) return false
    items.splice(index, 1)
    return true
  }
}
