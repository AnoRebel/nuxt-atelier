// The Vite transform for macro-style blocks: removes `defineBlock(...)` (the schema was read at build
// time) and rewrites the field helpers in `defineProps` into plain prop declarations, so a block's
// client code carries no schema and no field helpers. Source maps follow the edits (magic-string).
import type { Field } from '../runtime/shared/fields'
import { parse as parseSfc } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import { parseBlockSfc } from './parse'

/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree nodes, walked generically */
type Node = any

/** A plain prop for a field: any type (the server validates values), with a fresh default per instance. */
function propFor(field: Field): string {
  const value = field.default
  if (value === undefined)
    return '{ type: null }'
  const literal = JSON.stringify(value)
  return value !== null && typeof value === 'object' ? `{ type: null, default: () => (${literal}) }` : `{ type: null, default: ${literal} }`
}

/** Names referenced in a program, other than where they're imported and property names. */
function referenced(node: Node, names = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object')
    return names
  if (node.type === 'ImportDeclaration')
    return names
  if (node.type === 'Identifier')
    names.add(node.name)
  for (const [key, value] of Object.entries(node)) {
    // `{ text: … }` and `a.text` name a property, not the variable `text`
    if ((key === 'key' && node.type === 'Property' && !node.computed) || (key === 'property' && node.type === 'MemberExpression' && !node.computed))
      continue
    if (Array.isArray(value))
      value.forEach(child => referenced(child, names))
    else if (value && typeof value === 'object' && 'type' in value)
      referenced(value, names)
  }
  return names
}

export function transformBlockSfc(code: string, id: string): { code: string, map: ReturnType<MagicString['generateMap']> } | undefined {
  const block = parseBlockSfc(code, id)
  if (!block)
    return undefined
  const s = new MagicString(code)
  s.remove(block.macro!.start, block.macro!.end)
  for (const prop of block.props ?? [])
    s.overwrite(prop.start, prop.end, propFor(prop.field))

  // drop the `#atelier` imports nothing uses any more (defineBlock, the helpers)
  const script = parseSfc(s.toString(), { filename: id }).descriptor.scriptSetup!
  const used = referenced(parseSync('block.ts', script.content, { sourceType: 'module' }).program)
  const original = parseSfc(code, { filename: id }).descriptor.scriptSetup!
  const offset = original.loc.start.offset
  for (const statement of parseSync('block.ts', original.content, { sourceType: 'module' }).program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== '#atelier' || statement.importKind === 'type')
      continue
    const kept = statement.specifiers.filter((sp: Node) => sp.importKind === 'type' || used.has(sp.local.name))
    if (kept.length === statement.specifiers.length)
      continue
    s.overwrite(offset + statement.start, offset + statement.end, kept.length
      ? `import { ${kept.map((sp: Node) => original.content.slice(sp.start, sp.end)).join(', ')} } from '#atelier'`
      : '')
  }
  return { code: s.toString(), map: s.generateMap({ source: id, hires: true, includeContent: true }) }
}
