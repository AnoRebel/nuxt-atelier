// How many generated characters each source of a source map produced: enough to tell whose code a chunk is.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Decodes one segment's base64 VLQ fields. */
function fields(segment: string): number[] {
  const out: number[] = []
  let value = 0
  let shift = 0
  for (const char of segment) {
    const digit = CHARS.indexOf(char)
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
      continue
    }
    out.push(value & 1 ? -(value >>> 1) : value >>> 1)
    value = 0
    shift = 0
  }
  return out
}

/** Generated characters per source (a segment runs to the next one, or the end of its line). */
export function attribute(code: string, map: { sources: string[], mappings: string }): Map<string, number> {
  const lines = code.split('\n')
  const bytes = new Map<string, number>()
  let source = 0
  map.mappings.split(';').forEach((line, i) => {
    const length = lines[i]?.length ?? 0
    let column = 0
    const segments = line ? line.split(',').map(fields) : []
    segments.forEach((segment, j) => {
      column += segment[0]!
      if (segment.length >= 4)
        source += segment[1]!
      const end = j + 1 < segments.length ? column + segments[j + 1]![0]! : length
      if (segment.length >= 4) {
        const name = map.sources[source] ?? '?'
        bytes.set(name, (bytes.get(name) ?? 0) + Math.max(0, end - column))
      }
    })
  })
  return bytes
}
