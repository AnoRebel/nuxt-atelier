// Undo and redo for the editor: snapshots of the entry's data before each change. Typing is coalesced
// (one undo step per pause), operations (add, move, delete) are a step each.
export function createHistory<T>(options: { coalesceMs?: number, limit?: number } = {}) {
  const coalesceMs = options.coalesceMs ?? 600
  const limit = options.limit ?? 200
  const past: T[] = []
  const future: T[] = []
  let last: { kind: string, at: number } | undefined
  return {
    /** Records the state before a change; `kind` 'typing' merges with the step before it, within the pause. */
    record(before: T, kind: 'typing' | 'operation') {
      const now = Date.now()
      if (!(kind === 'typing' && last?.kind === 'typing' && now - last.at < coalesceMs)) {
        past.push(before)
        if (past.length > limit)
          past.shift()
      }
      last = { kind, at: now }
      future.length = 0
    },
    /** The state to go back to (giving the current one to redo), or undefined. */
    undo(current: T): T | undefined {
      const previous = past.pop()
      if (previous !== undefined)
        future.push(current)
      last = undefined
      return previous
    },
    redo(current: T): T | undefined {
      const next = future.pop()
      if (next !== undefined)
        past.push(current)
      last = undefined
      return next
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}
