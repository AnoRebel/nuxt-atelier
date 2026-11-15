// In-place rich-text editing in the visual editor's preview, when @nuxt-atelier/editor provides it (it
// replaces the `#atelier-inline-rich` alias). Here, none: rich-text fields are edited in the editor's form.

/**
 * Mounts a rich-text editor in `element` (emptied) with `value` (a document, or null), calling `change`
 * with each edit; the returned function removes it.
 */
export type InlineRich = (element: HTMLElement, value: unknown, change: (doc: { type: 'doc', [key: string]: unknown } | null) => void) => () => void

export const inlineRich: InlineRich | undefined = undefined
