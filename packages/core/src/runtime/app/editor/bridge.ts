// The page side of the visual editor (loaded only in an edit session, see plugins/editor.client.ts): it
// renders the editor's unsaved state, tells the editor where every block and marked field is, and passes on
// clicks, hovers and in-place text edits. It draws nothing itself: the editor's overlay is in the parent,
// so the site's CSS and the editor's never meet.
import type { useNuxtApp } from '#imports'
import type { ChildMessage } from '../../shared/bridge'
import { nextTick } from 'vue'
import { useAtelierPreview } from '../composables/useAtelierPreview'
import { BRIDGE_VERSION, ParentMessage, readMessage } from '../../shared/bridge'
import { frameChecks } from './frames'

type Out = ChildMessage extends infer M ? M extends { version: number } ? Omit<M, 'version'> : never : never

export function startBridge(nuxtApp: ReturnType<typeof useNuxtApp>): void {
  const parent = window.parent
  if (parent === window)
    return // not in the editor's frame
  const send = (message: Out) => parent.postMessage({ ...message, version: BRIDGE_VERSION }, location.origin)
  nuxtApp.runWithContext(() => {
    useAtelierPreview().value = true
  })

  /**
   * Every copy of the entry this page fetched (the catch-all page's route entry, `useAtelierEntry`'s,
   * `useAtelierRouteEntry`'s in a layout) gets the edited data.
   */
  const applyState = (id: string, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(nuxtApp.payload.data)) {
      if (!value || typeof value !== 'object')
        continue
      const found = value as { id?: unknown, data?: unknown, entry?: { id?: unknown } }
      const next = found.entry?.id === id
        ? { ...found, entry: { ...found.entry, data } }
        : found.id === id && found.data && typeof found.data === 'object' ? { ...found, data } : undefined
      if (!next)
        continue
      const asyncData = nuxtApp._asyncData?.[key] as { data: { value: unknown } } | undefined
      if (asyncData)
        asyncData.data.value = next
      nuxtApp.payload.data[key] = next
    }
  }

  // --- geometry: where blocks and marked fields are, whenever anything may have moved
  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  }
  const fieldPath = (el: Element) => {
    const name = el.getAttribute('data-at-field')!
    // the block it's in: itself, when a block renders the field as its root element
    const block = el.closest('[data-at-block]')
    return block ? `${block.getAttribute('data-at-block')}/${name}` : name
  }
  let frame = 0
  const measure = () => {
    if (frame)
      return
    frame = requestAnimationFrame(() => {
      frame = 0
      frameChecks.forEach(check => check())
      send({
        type: 'atelier:geometry',
        blocks: [...document.querySelectorAll('[data-at-block]')].map(el => ({
          id: el.getAttribute('data-at-block')!,
          type: el.getAttribute('data-at-type') ?? '',
          rect: rectOf(el),
          ...el.hasAttribute('data-at-placeholder') ? { placeholder: true } : {},
        })),
        fields: [...document.querySelectorAll('[data-at-field]')].map(el => ({ path: fieldPath(el), rect: rectOf(el) })),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })
    })
  }
  new ResizeObserver(measure).observe(document.documentElement)
  new MutationObserver(measure).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  addEventListener('scroll', measure, { passive: true, capture: true })
  addEventListener('resize', measure)

  // --- the pointer: a click selects the innermost block (and follows no link); hovering reports it
  const blockAt = (target: EventTarget | null) => (target instanceof Element ? target.closest('[data-at-block]') : null)?.getAttribute('data-at-block') ?? null
  addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest?.('[contenteditable]'))
      return // typing in place
    const id = blockAt(event.target)
    event.preventDefault()
    event.stopPropagation()
    if (id)
      send({ type: 'atelier:select', id })
  }, { capture: true })
  let hovered: string | null = null
  addEventListener('pointermove', (event) => {
    const id = blockAt(event.target)
    if (id !== hovered)
      send({ type: 'atelier:hover', id: hovered = id })
  }, { passive: true })

  // --- in place: a double click on a marked field makes it editable as text; each change goes to the editor.
  // While someone types, the editor's state waits: rendering it would move the caret.
  let editing: HTMLElement | null = null
  let deferred: [string, Record<string, unknown>] | undefined
  let latest: Record<string, unknown> = {}
  /** A field's value in the latest state: the entry's own, or the block's (`<block id>/<field>`). */
  const valueAt = (path: string): unknown => {
    const [blockId, name] = path.includes('/') ? path.split('/') as [string, string] : [null, path]
    if (!blockId)
      return latest[name]
    const find = (value: unknown): Record<string, unknown> | undefined => {
      if (Array.isArray(value))
        return value.reduce<Record<string, unknown> | undefined>((found, item) => found ?? find(item), undefined)
      if (!value || typeof value !== 'object')
        return undefined
      const block = value as { id?: unknown, props?: Record<string, unknown> }
      return block.id === blockId && block.props ? block.props : find(Object.values(value))
    }
    return find(latest)?.[name]
  }
  /** The field's rendered nodes set aside while it's edited, put back after (Vue renders the edit into them). */
  const editIn = (field: HTMLElement, replacement: Node[], end: () => void) => {
    const owned = [...field.childNodes]
    field.replaceChildren(...replacement)
    editing = field
    return () => {
      end()
      field.replaceChildren(...owned)
      editing = null
      // what the editor sent meanwhile, now that Vue may render again
      if (deferred)
        applyState(...deferred)
      deferred = undefined
    }
  }
  /** Rich text: the editor's in-place rich-text editor (loaded on first use), until focus leaves it. */
  const editRich = async (field: HTMLElement) => {
    const { inlineRich } = await import('#atelier-inline-rich')
    if (!inlineRich || editing)
      return
    const path = fieldPath(field)
    let destroy = () => {}
    const finish = editIn(field, [], () => destroy())
    destroy = inlineRich(field, valueAt(path) ?? null, doc => send({ type: 'atelier:inline', path, value: doc }))
    const leave = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && field.contains(event.relatedTarget))
        return
      field.removeEventListener('focusout', leave)
      finish()
    }
    field.addEventListener('focusout', leave)
  }
  addEventListener('dblclick', (event) => {
    const field = (event.target as Element | null)?.closest?.('[data-at-field]') as HTMLElement | null
    if (!field || field.isContentEditable || editing)
      return
    event.preventDefault()
    if (field.hasAttribute('data-at-rich')) {
      void editRich(field)
      return
    }
    // typing would change the nodes Vue renders into: set them aside, edit a plain copy of the text, and
    // put them back when the edit ends (Vue then renders the edited value into them)
    const path = fieldPath(field)
    const input = () => send({ type: 'atelier:inline', path, value: field.textContent?.trim() ?? '' })
    const done = editIn(field, [document.createTextNode(field.textContent?.trim() ?? '')], () => {
      field.removeAttribute('contenteditable')
      field.removeEventListener('input', input)
      field.removeEventListener('blur', done)
    })
    field.setAttribute('contenteditable', 'plaintext-only')
    field.focus()
    field.addEventListener('input', input)
    field.addEventListener('blur', done)
  }, { capture: true })

  // --- from the editor
  addEventListener('message', (event) => {
    const message = readMessage(ParentMessage, event, { origin: location.origin, source: parent })
    if (!message)
      return
    if (message.type === 'atelier:state') {
      latest = message.data
      if (editing)
        deferred = [message.id, message.data]
      else
        applyState(message.id, message.data)
      void nextTick(measure)
    }
    else if (message.type === 'atelier:select' && message.id) {
      document.querySelector(`[data-at-block="${CSS.escape(message.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
  send({ type: 'atelier:ready' })
  measure()
}
