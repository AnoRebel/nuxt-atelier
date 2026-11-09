// The CMS API's error shape: Nuxt's error body, with `data.code`, a stable machine-readable code, and
// details where there are any (`data.errors` for validation, `data.currentVersion` for a conflict).
//
//   { "status": 422, "message": "Invalid entry: …", "data": { "code": "validation_failed", "errors": [{ "path": "title", "message": "required" }] } }
import type { RequestEvent } from 'nuxt/server'
import * as v from 'valibot'
import { createError, readBody } from 'nuxt/server'

export type ErrorCode
  = | 'bad_request' | 'invalid_query' | 'unauthenticated' | 'forbidden' | 'csrf' | 'not_found' | 'method_not_allowed'
    | 'conflict' | 'referenced' | 'last_admin' | 'setup_done' | 'already_exists' | 'validation_failed'
    | 'rate_limited' | 'unsupported' | 'migrations_pending' | 'preview_expired'

const DEFAULT_CODES: Record<number, ErrorCode> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  410: 'preview_expired',
  409: 'conflict',
  422: 'validation_failed',
  429: 'rate_limited',
  501: 'unsupported',
  503: 'migrations_pending',
}

/** An API error: `code` defaults from the status (403 → `forbidden`). */
export function apiError(status: number, message: string, details: Record<string, unknown> = {}, code?: ErrorCode) {
  return createError({ status, message, data: { code: code ?? DEFAULT_CODES[status] ?? 'bad_request', ...details } })
}

/** A request body or query checked against a Valibot schema: 422 `validation_failed` with field `errors` when it fails. */
export function validated<S extends v.GenericSchema>(schema: S, input: unknown): v.InferOutput<S> {
  const result = v.safeParse(schema, input)
  if (result.success)
    return result.output
  const errors = result.issues.map(issue => ({ path: v.getDotPath(issue) ?? '', message: issue.message }))
  throw apiError(422, `Invalid request: ${errors.map(e => `${e.path || 'body'}: ${e.message}`).join('; ')}`, { errors })
}

/** The JSON body, checked against a Valibot schema (see `validated`). */
export const readValid = async <S extends v.GenericSchema>(event: RequestEvent, schema: S) =>
  validated(schema, await readBody(event).catch(() => {
    throw apiError(400, 'The request body isn\'t valid JSON')
  }))
