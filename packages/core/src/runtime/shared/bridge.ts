// The visual editor's bridge: the messages between the editor (the parent, in the admin) and the page it
// edits (the child, the real site route in an iframe). Versioned, and checked on arrival: a message from
// another origin, from any window but the expected one, or of the wrong shape, is ignored.
import * as v from 'valibot'

export const BRIDGE_VERSION = 1

const version = v.literal(BRIDGE_VERSION)
const id = v.pipe(v.string(), v.maxLength(255))
const Rect = v.object({ x: v.number(), y: v.number(), width: v.number(), height: v.number() })

/** Editor → page. */
export const ParentMessage = v.variant('type', [
  /** The entry's data as edited, unsaved: what the page renders. `id`: the entry's (a singleton's name). */
  v.object({ type: v.literal('atelier:state'), version, id, data: v.record(v.string(), v.unknown()) }),
  /** The selected block (null: none), to scroll into view. */
  v.object({ type: v.literal('atelier:select'), version, id: v.nullable(id) }),
])
export type ParentMessage = v.InferOutput<typeof ParentMessage>

/** Page → editor. */
export const ChildMessage = v.variant('type', [
  /** The bridge is listening: send the state. */
  v.object({ type: v.literal('atelier:ready'), version }),
  /**
   * Where each block and marked field is, in the page's viewport: for the overlay the editor draws over
   * the frame. `placeholder`: a block that renders nothing, shown as a stand-in.
   */
  v.object({
    type: v.literal('atelier:geometry'),
    version,
    blocks: v.array(v.object({ id, type: v.string(), rect: Rect, placeholder: v.optional(v.boolean()) })),
    fields: v.array(v.object({ path: v.string(), rect: Rect })),
    viewport: v.object({ width: v.number(), height: v.number() }),
  }),
  /** A block was clicked. */
  v.object({ type: v.literal('atelier:select'), version, id }),
  /** An editor shortcut (Ctrl/⌘ + `key`: k, z, y) pressed while the page has focus. */
  v.object({ type: v.literal('atelier:key'), version, key: v.picklist(['k', 'z', 'y']), shift: v.boolean() }),
  /** The pointer is over a block (null: none). */
  v.object({ type: v.literal('atelier:hover'), version, id: v.nullable(id) }),
  /**
   * A marked field edited in place: `path` is `<field>` for the entry's own, `<block id>/<field>` for a
   * block's; its text, or a rich-text field's document (null: emptied).
   */
  v.object({ type: v.literal('atelier:inline'), version, path: v.pipe(v.string(), v.maxLength(512)), value: v.union([
    v.pipe(v.string(), v.maxLength(100_000)),
    v.pipe(v.looseObject({ type: v.literal('doc') }), v.check(doc => JSON.stringify(doc).length <= 1_000_000)),
    v.null(),
  ]) }),
])
export type ChildMessage = v.InferOutput<typeof ChildMessage>

/**
 * A message, if it's one to trust: from `origin` (the site's own: the editor and the page share it), sent
 * by `source` (the parent, or the frame), and of the protocol's shape. Anything else: undefined.
 */
export function readMessage<S extends typeof ParentMessage | typeof ChildMessage>(schema: S, event: { origin: string, source: unknown, data: unknown }, expected: { origin: string, source: unknown }): v.InferOutput<S> | undefined {
  if (event.origin !== expected.origin || event.source !== expected.source || event.source == null)
    return undefined
  const result = v.safeParse(schema, event.data)
  return result.success ? result.output : undefined
}
