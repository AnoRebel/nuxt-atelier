// Dragging blocks in the editor, shared by the structure tree, the block palette and the preview overlay.
// Native drag events: the editor lives in the admin's shadow root, where libraries listening on the window
// see the shadow host as every event's target.
import type { InjectionKey, Ref } from 'vue'

/** What's being dragged: a block already in the entry, or a new one from the palette. */
export type Dragged = { kind: 'block', id: string } | { kind: 'new', type: string }
/** Where it would go: index `index` of the list at `list`. */
export interface DropAt { list: string, index: number }

export interface Dnd {
  dragging: Ref<Dragged | null>
  dropAt: Ref<DropAt | null>
  start: (event: DragEvent, dragged: Dragged) => void
  /** Over a spot: whether it may go there (and the spot shown) or not (none shown). Call on dragover. */
  over: (event: DragEvent, at: DropAt) => void
  drop: (event: DragEvent) => void
  end: () => void
}
export const dndKey: InjectionKey<Dnd> = Symbol('atelier-editor-dnd')
