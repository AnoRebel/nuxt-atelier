import type { ComputedRef, InjectionKey } from 'vue'
import { computed, inject } from 'vue'

/** The area a block is rendered in: see {@link useAtelierArea}. */
export interface AtelierArea<P extends Record<string, unknown> = Record<string, unknown>> {
  /** the area's name, which is also the slot's */
  name: string
  /** the props the parent block passes to the slot, like `side` in `<slot name="left" side="start" />` */
  props: P
  /** the block whose area it is */
  block: { id: string, type: string }
  /** the area that block is in, or `null` for a block at the top of its list */
  parent: AtelierArea | null
}

export const areaKey: InjectionKey<ComputedRef<AtelierArea | null>> = Symbol('atelier-area')

/**
 * The area the calling block is rendered in, with the props its parent passes to the slot, or `null` for a
 * block at the top of a list. Slot props reach nested blocks only through this, never as their props or
 * attributes, so they can't collide with a block's fields.
 */
export function useAtelierArea<P extends Record<string, unknown> = Record<string, unknown>>(): ComputedRef<AtelierArea<P> | null> {
  const area = inject(areaKey, null)
  return computed(() => (area?.value ?? null) as AtelierArea<P> | null)
}
