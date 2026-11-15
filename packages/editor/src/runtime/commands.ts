// The editor's command palette (Ctrl+K / ⌘K in the editor): its own commands, and any a plugin adds with
// `addEditorCommands` (from `#atelier-editor`, in a client plugin), given what the editor can do.

/** What a command can do in the editor. */
export interface EditorContext {
  /** The selected block's id, if any. */
  selected: string | null
  select: (id: string | null) => void
  /** Inserts a new block of `type` after the selected one (or at the end of the first list); false if it can't go there. */
  insert: (type: string) => boolean
  /** The entry's data as edited, and a way to replace it (one undoable step). */
  data: () => Record<string, unknown>
  setData: (data: Record<string, unknown>) => void
  undo: () => void
  redo: () => void
  save: () => Promise<void>
}
export interface EditorCommand {
  id: string
  label: string
  /** Shown beside the label: what kind of command it is. */
  group?: string
  run: (context: EditorContext) => void | Promise<void>
}
/** Gives the commands that apply now (asked each time the palette opens and as the user types). */
export type EditorCommands = (context: EditorContext) => EditorCommand[]

const added: EditorCommands[] = []
/** Adds commands to the editor's palette. */
export function addEditorCommands(commands: EditorCommands): void {
  added.push(commands)
}
export const addedCommands = (context: EditorContext): EditorCommand[] => added.flatMap(c => c(context))
