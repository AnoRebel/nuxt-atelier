// Block schemas, read from source without running it. Two styles:
//
//   Hero.vue        `defineBlock({ label, options, areas, … })` in <script setup>, and field helpers in
//                   `defineProps({ title: text({ required: true }) })`
//   Hero.block.ts   `defineBlock({ component: UCard, fields: { … }, … })`, the component imported from anywhere
//
// Only literals (strings, numbers, booleans, null, objects, arrays, template strings without
// expressions) and calls to the field helpers imported from `#atelier` are understood. Anything else is
// refused with the file, line and column, rather than evaluated: block files never run at build time.
import type { AreaRules, BlockSchema } from '../runtime/shared/blocks'
import type { Field, Fields } from '../runtime/shared/fields'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parseSync } from 'oxc-parser'
import * as helpers from '../runtime/shared/fields'

/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree nodes, walked generically */
type Node = any

/** Where the block's component comes from: the SFC itself, or an import of a `.block.ts` file. */
type BlockComponent = { self: true } | { from: string, export: string }

export interface ParsedBlock {
  schema: BlockSchema
  component: BlockComponent
  /** Source ranges the Vite transform rewrites (SFC style). */
  macro?: { start: number, end: number }
  props?: { start: number, end: number, field: Field }[]
}

export class BlockDefinitionError extends Error {
  constructor(readonly file: string, readonly line: number, readonly column: number, readonly reason: string) {
    super(`[nuxt-atelier] ${file}:${line}:${column}: ${reason}`)
  }
}

const HELPERS = new Set(['text', 'textarea', 'richText', 'number', 'boolean', 'select', 'multiSelect', 'date', 'email', 'url', 'slug', 'color', 'json', 'media', 'relation', 'object', 'repeater', 'blocks'])
const META_KEYS = new Set(['name', 'label', 'description', 'group', 'tags', 'icon', 'options', 'areas', 'editor'])
const FILE_KEYS = new Set([...META_KEYS, 'component', 'fields'])
const AREA_KEYS = new Set(['label', 'allow', 'deny', 'min', 'max'])
const BLOCK_NAME = /^[A-Z][A-Za-z0-9]*$/
const FIELD_KEY = /^[a-z][a-z0-9]*$/i

/** `my-hero.vue` → `MyHero` */
export const blockNameFromFile = (file: string) =>
  file.replace(/^.*[\\/]/, '').replace(/\.(?:vue|block\.[mc]?[jt]s)$/, '').replace(/(?:^|[-_ .])([a-z0-9])/gi, (_, c: string) => c.toUpperCase())

class Context {
  /** Local name → the import it binds. */
  readonly imports = new Map<string, { from: string, imported: string }>()
  constructor(readonly file: string, readonly source: string, readonly offset: number) {}

  fail(node: Node, reason: string): never {
    const at = this.offset + (node?.start ?? 0)
    const before = this.source.slice(0, at).split('\n')
    throw new BlockDefinitionError(this.file, before.length, before.at(-1)!.length + 1, reason)
  }

  snippet(node: Node) {
    const text = this.source.slice(this.offset + node.start, this.offset + node.end).replace(/\s+/g, ' ')
    return text.length > 40 ? `${text.slice(0, 37)}…` : text
  }

  /** The field helper a call invokes, when it's imported from `#atelier`. */
  helperOf(node: Node): string | undefined {
    if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier')
      return undefined
    const binding = this.imports.get(node.callee.name)
    return binding?.from === '#atelier' && HELPERS.has(binding.imported) ? binding.imported : undefined
  }

  /** A statically known value: literals, plain objects and arrays, and field helper calls. */
  evaluate(node: Node): unknown {
    switch (node.type) {
      case 'Literal':
        if (node.regex || typeof node.value === 'bigint')
          this.fail(node, `\`${this.snippet(node)}\` isn't supported here: use strings, numbers, booleans, null, objects and arrays`)
        return node.value
      case 'TemplateLiteral':
        if (node.expressions.length)
          this.fail(node, `\`${this.snippet(node)}\` has \${…} expressions, which can't be read without running the code`)
        return node.quasis.map((q: Node) => q.value.cooked).join('')
      case 'UnaryExpression':
        if (node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number')
          return -node.argument.value
        break
      case 'Identifier':
        if (node.name === 'undefined')
          return undefined
        return this.fail(node, `\`${node.name}\` is a variable: block definitions are read without running the code, so write the value in place`)
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
        return this.evaluate(node.expression)
      case 'ArrayExpression':
        return node.elements.map((element: Node) => {
          if (!element || element.type === 'SpreadElement')
            this.fail(element ?? node, 'spreads and holes aren\'t supported in block definitions')
          return this.evaluate(element)
        })
      case 'ObjectExpression': {
        const out: Record<string, unknown> = {}
        for (const property of node.properties) {
          if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method)
            this.fail(property, `\`${this.snippet(property)}\`: only plain \`key: value\` properties are supported`)
          out[this.key(property)] = this.evaluate(property.value)
        }
        return out
      }
      case 'CallExpression': {
        const helper = this.helperOf(node)
        if (helper) {
          const args = node.arguments.map((arg: Node) => this.evaluate(arg))
          return (helpers as unknown as Record<string, (...a: unknown[]) => Field>)[helper]!(...args)
        }
        break
      }
    }
    this.fail(node, `\`${this.snippet(node)}\` can't be read without running the code: use literals and field helpers imported from '#atelier'`)
  }

  key(property: Node): string {
    const k = property.key
    if (k.type === 'Identifier')
      return k.name
    if (k.type === 'Literal' && typeof k.value === 'string')
      return k.value
    this.fail(k, 'expected a plain property name')
  }

  collectImports(program: Node) {
    for (const statement of program.body) {
      if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type')
        continue
      for (const specifier of statement.specifiers) {
        const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : specifier.type === 'ImportNamespaceSpecifier' ? '*' : (specifier.imported.name ?? specifier.imported.value)
        this.imports.set(specifier.local.name, { from: statement.source.value, imported })
      }
    }
  }
}

/** Calls to `name(…)` anywhere in the program, outermost first. */
function* callsTo(node: Node, name: string): Generator<Node> {
  if (!node || typeof node !== 'object')
    return
  if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name) {
    yield node
    return
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value)
        yield* callsTo(child, name)
    }
    else if (value && typeof value === 'object' && 'type' in value) {
      yield* callsTo(value, name)
    }
  }
}

function single(context: Context, program: Node, name: string): Node | undefined {
  const calls = [...callsTo(program, name)]
  if (calls.length > 1)
    context.fail(calls[1], `${name}() appears more than once`)
  return calls[0]
}

function fieldsOf(context: Context, node: Node, what: string): Fields {
  if (node.type !== 'ObjectExpression')
    context.fail(node, `${what}: expected an object of field helpers`)
  const fields: Fields = {}
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed)
      context.fail(property, `${what}: only plain \`key: helper()\` properties are supported`)
    const key = context.key(property)
    if (!FIELD_KEY.test(key))
      context.fail(property.key, `${what}: "${key}" must be letters and digits, starting with a letter`)
    if (!context.helperOf(property.value))
      context.fail(property.value, `${what}.${key}: expected a field helper imported from '#atelier', like text()`)
    fields[key] = context.evaluate(property.value) as Field
  }
  return fields
}

/** Builds the schema from `defineBlock({...})`'s argument, checking every key. */
function schemaFrom(context: Context, call: Node, defaultName: string, keys: Set<string>): { schema: BlockSchema, object: Node } {
  const [argument] = call.arguments
  if (call.arguments.length !== 1 || argument.type !== 'ObjectExpression')
    context.fail(call, 'defineBlock() takes one object')
  const schema: BlockSchema = { name: defaultName, fields: {}, options: {}, areas: {} }
  for (const property of argument.properties) {
    if (property.type !== 'Property' || property.computed)
      context.fail(property, 'defineBlock(): only plain `key: value` properties are supported')
    const key = context.key(property)
    if (!keys.has(key))
      context.fail(property.key, `defineBlock(): unknown option "${key}"; accepted: ${[...keys].join(', ')}`)
    if (key === 'component')
      continue // resolved by the caller
    if (key === 'fields' || key === 'options') {
      schema[key] = fieldsOf(context, property.value, key)
      continue
    }
    const value = context.evaluate(property.value)
    if (key === 'areas') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        context.fail(property.value, 'areas: expected an object of area rules, like { children: { allow: [\'Card\'] } }')
      for (const [area, rules] of Object.entries(value as Record<string, AreaRules>)) {
        if (!FIELD_KEY.test(area))
          context.fail(property.value, `areas: "${area}" must be letters and digits, starting with a letter`)
        for (const rule of Object.keys(rules ?? {})) {
          if (!AREA_KEYS.has(rule))
            context.fail(property.value, `areas.${area}: unknown rule "${rule}"; accepted: ${[...AREA_KEYS].join(', ')}`)
        }
        for (const list of ['allow', 'deny'] as const) {
          if (rules[list] !== undefined && (!Array.isArray(rules[list]) || rules[list].some(x => typeof x !== 'string')))
            context.fail(property.value, `areas.${area}.${list}: expected a list of block names, 'group:<name>' or 'tag:<name>'`)
        }
        for (const bound of ['min', 'max'] as const) {
          if (rules[bound] !== undefined && (!Number.isInteger(rules[bound]) || rules[bound]! < 0))
            context.fail(property.value, `areas.${area}.${bound}: expected a whole number`)
        }
      }
      schema.areas = value as Record<string, AreaRules>
    }
    else if (key === 'tags') {
      if (!Array.isArray(value) || value.some(t => typeof t !== 'string'))
        context.fail(property.value, 'tags: expected a list of strings')
      schema.tags = value as string[]
    }
    else if (key === 'editor') {
      schema.editor = value as BlockSchema['editor']
    }
    else {
      if (typeof value !== 'string')
        context.fail(property.value, `${key}: expected a string`)
      ;(schema as unknown as Record<string, string>)[key] = value
    }
  }
  if (!BLOCK_NAME.test(schema.name))
    context.fail(argument, `the block name "${schema.name}" must be PascalCase, like Hero or PricingTable`)
  return { schema, object: argument }
}

function checkNames(context: Context, node: Node, schema: BlockSchema) {
  const seen = new Map<string, string>()
  for (const [kind, names] of [['field', Object.keys(schema.fields)], ['option', Object.keys(schema.options)], ['area', Object.keys(schema.areas)]] as const) {
    for (const name of names) {
      if (seen.has(name))
        context.fail(node, `"${name}" is both a ${seen.get(name)} and an ${kind}: give them different names`)
      seen.set(name, kind)
    }
  }
}

const parseScript = (context: Context, code: string, lang: string) => {
  const result = parseSync(`block.${lang}`, code, { sourceType: 'module' })
  if (result.errors.length)
    context.fail({ start: result.errors[0]!.labels?.[0]?.start ?? 0 }, `syntax error: ${result.errors[0]!.message}`)
  context.collectImports(result.program)
  return result.program
}

/** A macro-style block (`.vue`), or undefined when the SFC doesn't call defineBlock(). */
export function parseBlockSfc(source: string, file: string): ParsedBlock | undefined {
  const { descriptor, errors } = parseSfc(source, { filename: file })
  if (errors.length)
    throw new BlockDefinitionError(file, 1, 1, `can't parse the SFC: ${errors[0]!.message}`)
  const script = descriptor.scriptSetup
  if (!script || !script.content.includes('defineBlock'))
    return undefined
  const context = new Context(file, source, script.loc.start.offset)
  const program = parseScript(context, script.content, script.lang === 'ts' ? 'ts' : 'js')
  const call = single(context, program, 'defineBlock')
  if (!call)
    return undefined
  const { schema } = schemaFrom(context, call, blockNameFromFile(file), META_KEYS)

  const props: NonNullable<ParsedBlock['props']> = []
  const defineProps = single(context, program, 'defineProps')
  const object = defineProps?.arguments[0]
  if (object?.type === 'ObjectExpression') {
    for (const property of object.properties) {
      if (property.type !== 'Property' || property.computed || !context.helperOf(property.value))
        continue // ordinary props stay as they are
      const key = context.key(property)
      if (!FIELD_KEY.test(key))
        context.fail(property.key, `prop "${key}" must be letters and digits, starting with a letter to be a field`)
      const field = context.evaluate(property.value) as Field
      schema.fields[key] = field
      props.push({ start: script.loc.start.offset + property.value.start, end: script.loc.start.offset + property.value.end, field })
    }
  }
  checkNames(context, call, schema)
  const statement = [...program.body].find((s: Node) => s.start <= call.start && s.end >= call.end)
  const macro = statement?.type === 'ExpressionStatement' && statement.expression === call ? statement : call
  return { schema, component: { self: true }, macro: { start: script.loc.start.offset + macro.start, end: script.loc.start.offset + macro.end }, props }
}

/** A schema-file block (`.block.ts`): the component is any import, including a library's. */
export function parseBlockFile(source: string, file: string): ParsedBlock {
  const context = new Context(file, source, 0)
  const program = parseScript(context, source, /\.[mc]?js$/.test(file) ? 'js' : 'ts')
  const call = single(context, program, 'defineBlock')
  if (!call)
    throw new BlockDefinitionError(file, 1, 1, 'a .block.ts file must call defineBlock({ component, fields })')
  const { schema, object } = schemaFrom(context, call, blockNameFromFile(file), FILE_KEYS)
  const property = object.properties.find((p: Node) => context.key(p) === 'component')
  if (!property)
    context.fail(object, 'defineBlock(): `component` is required in a .block.ts file: import the component and pass it')
  const binding = property.value.type === 'Identifier' ? context.imports.get(property.value.name) : undefined
  if (!binding || binding.imported === '*')
    return context.fail(property.value, '`component` must be a component imported in this file, like `import { UCard } from \'#components\'`')
  checkNames(context, call, schema)
  return { schema, component: { from: binding.from, export: binding.imported } }
}
