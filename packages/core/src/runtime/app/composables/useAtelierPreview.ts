import type { Ref } from 'vue'
import { useState } from '#imports'

/**
 * Whether this render is an editing preview. Only then do `<AtelierBlocks>` and `<AtelierField>` add
 * the attributes the visual editor uses; public pages never carry them.
 */
export function useAtelierPreview(): Ref<boolean> {
  return useState('atelier:preview', () => false)
}
