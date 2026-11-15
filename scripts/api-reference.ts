// Generates the API reference page from the source: the exports of `#atelier`, its composables and
// components, `#atelier/server` and `nuxt-atelier/adapter` with their signatures and TSDoc; the REST
// endpoints from the endpoint lines at the top of each API handler; the CLI from its usage text.
//   bun run docs:api   writes docs/content/3.reference/33.api.md
// test/docs/api-reference.test.ts fails when the committed page is out of date.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const REFERENCE_PATH = new URL('../docs/content/3.reference/33.api.md', import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const core = join(root, 'packages/core/src')

const program = ts.createProgram({
  rootNames: [
    join(core, 'runtime/app/index.ts'),
    join(core, 'runtime/server/index.ts'),
    join(core, 'adapter.ts'),
    ...readdirSync(join(core, 'runtime/app/composables')).map(f => join(core, 'runtime/app/composables', f)),
    ...readdirSync(join(core, 'runtime/app/components')).filter(f => f.endsWith('.ts')).map(f => join(core, 'runtime/app/components', f)),
  ],
  options: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, allowJs: false },
})
const checker = program.getTypeChecker()
const FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope | ts.TypeFormatFlags.WriteArrowStyleSignature

const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
/** Text safe in MDC: tags outside inline code (`<AtelierImage … />`) put in code, or they'd render. */
const mdSafe = (text: string) => text.split('`').map((part, i) => i % 2 ? part : part.replace(/<[A-Z][^>]*>(?:[^<`]*<\/[A-Z]+>)?|\{\{[^}]*\}\}/gi, m => `\`${m}\``)).join('`')
/** The first sentence of a symbol's TSDoc, or of the comment just above its declaration. */
function docOf(symbol: ts.Symbol): string {
  const tsdoc = ts.displayPartsToString(symbol.getDocumentationComment(checker))
  if (tsdoc)
    return tsdoc
  const declaration = symbol.declarations?.[0]
  if (!declaration)
    return ''
  const source = declaration.getSourceFile().text
  const statement = ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration
  const ranges = ts.getLeadingCommentRanges(source, statement.pos) ?? []
  return ranges.map(r => source.slice(r.pos, r.end).replace(/^\/\/\s?|^\/\*+\s?|\s*\*+\/$|^\s*\*\s?/gm, '')).join(' ').trim()
}

/** A value's signature: a function's or a class's call/construct signatures, else its type. */
function signatureOf(name: string, symbol: ts.Symbol): { kind: string, signature: string } {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration!)
  if (declaration && ts.isClassDeclaration(declaration)) {
    const constructs = type.getConstructSignatures()
    return { kind: 'class', signature: constructs.map(s => `new ${name}${checker.signatureToString(s, undefined, FLAGS & ~ts.TypeFormatFlags.WriteArrowStyleSignature)}`).join('\n') || `class ${name}` }
  }
  const fn = declaration && (ts.isFunctionDeclaration(declaration) ? declaration : ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) ? declaration.initializer : undefined)
  if (fn) {
    // as written: the source's own type names (inferred types can't resolve Nuxt's auto-imports here)
    const file = fn.getSourceFile()
    const generics = fn.typeParameters ? `<${fn.typeParameters.map(t => t.getText(file)).join(', ')}>` : ''
    const params = fn.parameters.map(p => p.getText(file)).join(', ')
    let returns = fn.type?.getText(file)
    if (!returns) {
      const inferred = checker.typeToString(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(fn)!), undefined, FLAGS)
      returns = /\bany\b/.test(inferred) ? undefined : inferred
    }
    return { kind: 'function', signature: `${name}${generics}(${params})${returns ? `: ${returns}` : ''}`.replace(/\s+/g, ' ') }
  }
  const calls = type.getCallSignatures()
  if (calls.length)
    return { kind: 'function', signature: calls.map(s => `${name}${checker.signatureToString(s, undefined, FLAGS & ~ts.TypeFormatFlags.WriteArrowStyleSignature)}`).join('\n') }
  return { kind: 'constant', signature: `${name}: ${checker.typeToString(type, undefined, FLAGS)}` }
}

interface Item { name: string, kind: string, signature: string, doc: string }
/** The values (not types) a module exports, alphabetically. */
function exportsOf(file: string, only?: (name: string) => boolean): { values: Item[], types: string[] } {
  const source = program.getSourceFile(file)!
  const moduleSymbol = checker.getSymbolAtLocation(source)!
  const values: Item[] = []
  const types: string[] = []
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const name = exported.getName()
    if (only && !only(name))
      continue
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    if (!(symbol.flags & ts.SymbolFlags.Value)) {
      types.push(name)
      continue
    }
    values.push({ name, ...signatureOf(name, symbol), doc: docOf(symbol) })
  }
  return { values: values.toSorted((a, b) => a.name.localeCompare(b.name)), types: types.toSorted() }
}

function section(title: string, intro: string, { values, types }: { values: Item[], types: string[] }): string {
  const entries = values.map(v => `### \`${v.name}\`\n\n${v.doc ? `${mdSafe(v.doc)}\n\n` : ''}\`\`\`ts\n${v.signature}\n\`\`\``)
  const typeList = types.length ? `\n\nTypes: ${types.map(t => `\`${t}\``).join(', ')}.` : ''
  return `## ${title}\n\n${intro}${typeList}\n\n${entries.join('\n\n')}`
}

const VUE_TYPES: Record<string, string> = { String: 'string', Boolean: 'boolean', Number: 'number', Object: 'object', Array: 'unknown[]', Function: 'function' }
/** A prop's `type` as TypeScript: its PropType<…> when cast, else the constructors' types. */
function propType(text: string): string {
  const cast = /\bas PropType<([\s\S]+)>$/.exec(text)
  if (cast)
    return cast[1]!
  return text.replace(/^\[|\]$/g, '').split(',').map(t => VUE_TYPES[t.trim()] ?? t.trim()).join(' | ')
}

/** The default-exported component's options object in a component file. */
function componentOptions(source: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  const optionsOf = (expression: ts.Expression | undefined) => expression && ts.isCallExpression(expression) && expression.expression.getText(source) === 'defineComponent' && ts.isObjectLiteralExpression(expression.arguments[0]!) ? expression.arguments[0] : undefined
  for (const statement of source.statements) {
    if (!ts.isExportAssignment(statement))
      continue
    if (!ts.isIdentifier(statement.expression))
      return optionsOf(statement.expression)
    const name = statement.expression.text
    for (const s of source.statements) {
      if (ts.isVariableStatement(s)) {
        const found = s.declarationList.declarations.find(d => d.name.getText(source) === name)
        if (found)
          return optionsOf(found.initializer)
      }
    }
  }
  return undefined
}

/** The components' props: name, type, default, and the TSDoc on each. */
function components(): string {
  const dir = join(core, 'runtime/app/components')
  const out: string[] = []
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts')).toSorted()) {
    const source = program.getSourceFile(join(dir, file))!
    const options = componentOptions(source)
    if (!options)
      continue
    const option = (object: ts.ObjectLiteralExpression, key: string) => object.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(source) === key)?.initializer
    const nameNode = option(options, 'name')
    const componentName = nameNode && ts.isStringLiteral(nameNode) ? nameNode.text : `Atelier${file.replace('.ts', '')}`
    const props = option(options, 'props')
    const rows: string[] = []
    if (props && ts.isObjectLiteralExpression(props)) {
      for (const prop of props.properties) {
        if (!ts.isPropertyAssignment(prop))
          continue
        const settings = ts.isObjectLiteralExpression(prop.initializer) ? prop.initializer : undefined
        const typeText = propType((settings ? option(settings, 'type') : prop.initializer)?.getText(source) ?? 'unknown')
        const required = settings && option(settings, 'required')?.getText(source) === 'true'
        const fallback = settings && option(settings, 'default')?.getText(source)
        const doc = ts.getJSDocCommentsAndTags(prop).map(d => ts.getTextOfJSDocComment((d as ts.JSDoc).comment) ?? '').join(' ')
        rows.push(`| \`${prop.name.getText(source)}\` | \`${cell(typeText)}\` | ${required ? 'required' : fallback && fallback !== 'undefined' ? `\`${cell(fallback)}\`` : ''} | ${mdSafe(cell(doc))} |`)
      }
    }
    const intro = (ts.getLeadingCommentRanges(source.text, 0) ?? []).map(r => source.text.slice(r.pos, r.end).replace(/^\/\/\s?/gm, '')).join(' ').replace(/\s+/g, ' ').trim()
    out.push(`### \`<${componentName}>\`\n\n${mdSafe(intro)}${rows.length ? `\n\n| Prop | Type | Default | |\n|---|---|---|---|\n${rows.join('\n')}` : ''}`)
  }
  return `## Components\n\nRegistered globally with the \`Atelier\` prefix. \`<AtelierForm>\` (a form block's form) is documented with [forms](/reference/forms).\n\n${out.join('\n\n')}`
}

/** Every `//   METHOD  /path   description` line at the top of the API handlers, with its continuation lines. */
function endpoints(): string {
  const files = [
    ...['packages/core/src/runtime/server/api', 'packages/core/src/runtime/server/api/auth'].flatMap(dir => readdirSync(join(root, dir)).filter(f => f.endsWith('.ts')).map(f => join(root, dir, f))),
    join(root, 'packages/ai/src/runtime/server/api.ts'),
  ]
  const rows: { method: string, path: string, text: string, file: string }[] = []
  for (const file of files) {
    let current: (typeof rows)[number] | undefined
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.startsWith('//'))
        break // the header comment only
      const match = /^\/\/\s+(GET|POST|PATCH|PUT|DELETE|ANY)\s+(\/\S+)(?:\s+(\S.*))?$/.exec(line)
      if (match) {
        current = { method: match[1]!, path: match[2]!, text: match[3] ?? '', file: relative(root, file) }
        rows.push(current)
      }
      else if (current && /^\/\/\s{20,}\S/.test(line)) {
        current.text += ` ${line.replace(/^\/\/\s+/, '')}`
      }
      else {
        current = undefined
      }
    }
  }
  const sorted = rows.toSorted((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  return `## REST endpoints\n\nThe CMS API, as each handler documents it. Signed-in calls from a browser send the session cookie and, for writes, \`x-atelier-csrf\`; other clients send an API token as \`Authorization: Bearer …\` (see [Content API](/reference/content-api)). \`GET /api/_atelier/openapi.json\` describes the content endpoints for this app's own collections.\n\n| Method | Path | |\n|---|---|---|\n${sorted.map(r => `| ${r.method} | \`${cell(r.path)}\` | ${mdSafe(cell(r.text))} |`).join('\n')}`
}

function cli(): string {
  const source = readFileSync(join(core, 'cli/index.ts'), 'utf8')
  const usage = /const USAGE = `([\s\S]*?)`/.exec(source)![1]!
  return `## CLI\n\nThe \`atelier\` command, installed with \`nuxt-atelier\` (\`bunx atelier\`, \`npx atelier\`).\n\n\`\`\`text\n${usage}\n\`\`\``
}

export function generateReference(): string {
  const composables = join(core, 'runtime/app/composables')
  const composableItems = readdirSync(composables).toSorted().flatMap(f => exportsOf(join(composables, f), n => n.startsWith('use')).values)
  const app = exportsOf(join(core, 'runtime/app/index.ts'), n => !n.startsWith('use'))
  return [
    `---\ntitle: API reference\ndescription: Every composable, component, server utility, endpoint and command, generated from the source.\n---`,
    `Generated from the source by \`bun run docs:api\`: signatures from the types, descriptions from their TSDoc. For guides to using them, follow the links in the rest of the reference.`,
    section('Composables', 'Auto-imported in the app.', { values: composableItems, types: [] }),
    components(),
    section('`#atelier`', 'Block authoring helpers and app-side utilities.', app),
    section('`#atelier/server`', 'Server utilities, in server routes, plugins and tasks.', exportsOf(join(core, 'runtime/server/index.ts'))),
    section('`nuxt-atelier/adapter`', 'The [content adapter](/reference/content-adapters) contract.', exportsOf(join(core, 'adapter.ts'))),
    endpoints(),
    cli(),
  ].join('\n\n').concat('\n')
}

if (import.meta.main) {
  writeFileSync(REFERENCE_PATH, generateReference())
  console.log(`Wrote ${fileURLToPath(REFERENCE_PATH)}`)
}
