// Server logs: one JSON object per line in production (level, time, message, fields), readable lines in
// development. Fields that may hold secrets are redacted wherever they are, and credentials in URLs are
// masked, so a log never holds a password, token, cookie, connection string's password or form submission.
// Requests carry a correlation id (`x-request-id`, see middleware/request-id.ts): pass `requestId`.

type Level = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

/** Field names whose values are never logged. */
const SENSITIVE = /pass(?:word|phrase)?|secret|token|authorization|cookie|api[-_]?key|credential|submission|signature/i
const URL_CREDENTIALS = /(\/\/)[^/@\s:]+(?::[^/@\s]*)?@/g

const mask = (text: string) => text.replace(URL_CREDENTIALS, '$1[redacted]@')

/** `value` with sensitive fields replaced by "[redacted]", at any depth, and credentials in URLs masked. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string')
    return mask(value)
  if (value instanceof Error)
    return { name: value.name, message: mask(value.message), ...value.stack ? { stack: mask(value.stack) } : {} }
  if (depth > 8 || value === null || typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(item => redact(item, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE.test(key) ? '[redacted]' : redact(item, depth + 1)]))
}

const json = () => process.env.NUXT_ATELIER_LOG_FORMAT === 'json' || (process.env.NUXT_ATELIER_LOG_FORMAT !== 'text' && process.env.NODE_ENV === 'production')

function write(level: Level, message: string, fields: LogFields = {}): void {
  const safe = redact(fields) as LogFields
  const line = json()
    ? JSON.stringify({ level, time: new Date().toISOString(), source: 'nuxt-atelier', message: mask(message), ...safe })
    : `[nuxt-atelier] ${mask(message)}${Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : ''}`

  ;(level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'info' ? console.info : console.debug)(line)
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
  error: (message: string, fields?: LogFields) => write('error', message, fields),
}
