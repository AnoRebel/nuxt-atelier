// Public forms (the atelier-forms collection), for visitors:
//   GET   /api/_atelier/forms/<id>?locale=de      the published form, labels in that locale, a token, the challenge
//   POST  /api/_atelier/forms/<id>/submit         values as JSON or multipart (files), with `_token`, `_hp`, `_locale`,
//                                                 `_challenge`: { ok, message?, redirect? }, or 422 with field errors
// Submissions, for roles with the `forms` capability:
//   GET     /api/_atelier/forms/<id>/submissions?from&to&q&limit&offset   { items, total }; `format=csv|json` exports all
//   DELETE  /api/_atelier/forms/<id>/submissions/<submission>
//   GET     /api/_atelier/forms/<id>/submissions/<submission>/files/<field>
//   POST    /api/_atelier/forms/erase { email }   every submission, of any form, with that email: { deleted }
import type { RequestEvent } from 'nuxt/server'
import type { FormDefinition, FormField } from '../../shared/forms'
import type { StoredFileInfo, Submission } from '../forms'
import { defineEventHandler, getQuery, getRequestURL, useRuntimeConfig, useServerHooks } from 'nuxt/server'
import * as v from 'valibot'
import { emailsOf, fileProblem, FORMS, labelOf, submissionSchema } from '../../shared/forms'
import { clientIp } from '../auth/rate-limit'
import { segments } from '../content-access'
import { apiError, readValid, validated } from '../errors'
import { assertMigrated, audit, requireUser, useAtelierChallenge, useAtelierEntries, useAtelierRateLimiter, useAtelierServerConfig, useAtelierStorage, useAtelierSubmissions } from '../index'
import { logger } from '../logger'
import { sendMail } from '../mail'
import { storageKey } from '../media/storage'
import { signToken, verifyToken } from '../secrets'
import { queueWebhookEvent } from '../webhook-jobs'

const PREFIX = '/api/_atelier/forms/'
const TOKEN = 'nuxt-atelier:form'
const config = () => (useAtelierServerConfig() as unknown as { forms: { minFillTime: number, submissionsPerHour: number }, auth: { trustProxy: boolean } })
const List = v.object({
  from: v.optional(v.pipe(v.string(), v.isoDate('from: expected a date'))),
  to: v.optional(v.pipe(v.string(), v.isoDate('to: expected a date'))),
  q: v.optional(v.pipe(v.string(), v.maxLength(200))),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'limit: expected a number'), v.transform(Number), v.maxValue(500))),
  offset: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'offset: expected a number'), v.transform(Number))),
  format: v.optional(v.picklist(['csv', 'json'], 'format: expected csv or json')),
})
const Erase = v.object({ email: v.pipe(v.string('email: expected an email address'), v.trim(), v.email('email: expected an email address')) })

/** The published form: what visitors fill in. */
async function published(id: string): Promise<{ definition: FormDefinition, version: number }> {
  const entry = await (await useAtelierEntries()).get(FORMS, id)
  if (!entry)
    throw apiError(404, 'No such form')
  return { definition: entry.data as unknown as FormDefinition, version: entry.version }
}

/** The values a request sent, and its files by field name. */
async function received(event: RequestEvent, fields: FormField[]): Promise<{ values: Record<string, unknown>, files: Map<string, File> }> {
  const files = new Map<string, File>()
  if (!(event.req.headers.get('content-type') ?? '').includes('multipart/form-data'))
    return { values: (await event.req.json().catch(() => ({}))) as Record<string, unknown>, files }
  const form = await event.req.formData()
  const values: Record<string, unknown> = {}
  for (const [key, value] of form.entries() as Iterable<[string, string | File]>) {
    if (typeof value === 'string')
      values[key] = value
    else if (value.size)
      files.set(key, value)
  }
  // a checkbox posted from HTML sends "on", or nothing at all
  for (const field of fields) {
    if (field.type === 'checkbox' || field.type === 'consent')
      values[field.name] = values[field.name] === 'on' || values[field.name] === 'true'
  }
  return { values, files }
}

async function submit(event: RequestEvent, id: string) {
  await assertMigrated()
  const { minFillTime, submissionsPerHour } = config().forms
  const limits = [{ key: `form:${id}:${clientIp(event, config().auth.trustProxy)}`, max: submissionsPerHour, window: 3600 }]
  const limiter = await useAtelierRateLimiter()
  await limiter.check(event, limits)
  await limiter.hit(limits)
  const { definition, version } = await published(id)
  const { values, files } = await received(event, definition.fields)
  const done = { ok: true, ...definition.success?.message ? { message: definition.success.message } : {}, ...definition.success?.redirect ? { redirect: definition.success.redirect } : {} }

  // spam: a filled honeypot, or faster than a person types, looks sent and goes nowhere
  if (typeof values._hp === 'string' && values._hp)
    return done
  const token = await verifyToken<{ f: string, t: number }>(TOKEN, String(values._token ?? ''))
  if (!token || token.f !== id || Date.now() - token.t > 24 * 3600_000)
    throw apiError(400, 'This form has expired: reload the page and send it again')
  if (Date.now() - token.t < minFillTime * 1000)
    return done
  const challenge = await useAtelierChallenge()
  if (challenge && !await challenge.verify(String(values._challenge ?? ''), clientIp(event, config().auth.trustProxy)))
    throw apiError(400, 'The check that you\'re a person failed: try again', {}, 'bad_request')

  // the same rules as in the browser; nothing is stored unless everything passes
  const result = v.safeParse(submissionSchema(definition), values)
  const errors = result.success ? [] : result.issues.map(issue => ({ path: v.getDotPath(issue) ?? '', message: issue.message }))
  for (const field of definition.fields.filter(f => f.type === 'file')) {
    const file = files.get(field.name)
    if (!file && field.required)
      errors.push({ path: field.name, message: 'required' })
    const problem = file && fileProblem(field, file)
    if (problem)
      errors.push({ path: field.name, message: problem })
  }
  if (errors.length || !result.success)
    throw apiError(422, `Invalid submission: ${errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, { errors })

  const submissionId = crypto.randomUUID()
  const data: Record<string, unknown> = { ...result.output }
  const storage = await useAtelierStorage()
  for (const field of definition.fields.filter(f => f.type === 'file')) {
    const file = files.get(field.name)
    if (!file)
      continue
    const key = `forms/${storageKey(submissionId, `${field.name}-${file.name}`)}`
    await storage.put(key, file.stream(), { contentType: file.type || 'application/octet-stream' })
    data[field.name] = { name: file.name, type: file.type, size: file.size, key } satisfies StoredFileInfo
  }
  for (const field of definition.fields.filter(f => f.type === 'hidden'))
    data[field.name] = field.value ?? ''
  const locale = typeof values._locale === 'string' ? values._locale.slice(0, 35) : ''
  const submission = await (await useAtelierSubmissions()).add({ id: submissionId, form: id, version, locale, data, emails: emailsOf(definition, data) })

  // what follows a submission doesn't fail it
  try {
    await afterSubmit(event, id, definition, submission)
  }
  catch (error) {
    logger.error('A form submission\'s follow-up failed', { form: id, submission: submissionId, error })
  }
  return done
}

/** Emails, hooks and webhooks for a stored submission. */
async function afterSubmit(event: RequestEvent, id: string, definition: FormDefinition, submission: Submission) {
  const lines = definition.fields.filter(f => f.type !== 'hidden').map((field) => {
    const value = submission.data[field.name]
    const shown = value && typeof value === 'object' ? (value as StoredFileInfo).name : value === true ? 'yes' : value === false ? 'no' : String(value ?? '')
    return `${labelOf(field, submission.locale)}: ${shown}`
  })
  const recipients = (definition.notify?.to ?? '').split(/[,;\s]+/).filter(address => address.includes('@'))
  const admin = useRuntimeConfig().public.atelier as { siteUrl?: string, admin?: { base?: string } }
  const link = new URL(`${admin.admin?.base ?? '/admin'}/collections/${FORMS}/${id}`, admin.siteUrl || getRequestURL(event).origin).href
  for (const to of recipients)
    await sendMail({ to, subject: definition.notify?.subject || `New submission: ${definition.title}`, text: `${lines.join('\n')}\n\n${link}\n` })
  const submitter = emailsOf(definition, submission.data)[0]
  if (definition.confirmation?.enabled && submitter)
    await sendMail({ to: submitter, subject: definition.confirmation.subject || definition.title, text: `${definition.confirmation.message || 'Thank you, we received your message.'}\n\n${lines.join('\n')}\n` })
  await useServerHooks().callHook('atelier:formSubmitted', { form: id, submission })
  await queueWebhookEvent('form.submitted', FORMS, { form: id, submission: submission.id, version: submission.version, locale: submission.locale, createdAt: submission.createdAt })
}

/** CSV with a header row: when, locale, version, then every field. */
function csvOf(fields: FormField[], items: Submission[]): string {
  const cell = (value: unknown) => {
    const text = value && typeof value === 'object' ? (value as StoredFileInfo).name ?? JSON.stringify(value) : String(value ?? '')
    // formulas stay text in spreadsheets
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
  }
  return [['submitted', 'locale', 'version', ...fields.map(f => f.name)], ...items.map(s => [s.createdAt, s.locale, s.version, ...fields.map(f => s.data[f.name])])]
    .map(row => row.map(cell).join(',')).join('\r\n')
}

export default defineEventHandler(async (event) => {
  const [id, action, submissionId, sub, field, ...rest] = segments(event, PREFIX)
  const method = event.req.method
  if (!id || rest.length)
    throw apiError(404, 'Not found')

  if (id === 'erase' && !action && method === 'POST') {
    const user = await requireUser(event, 'forms')
    const { email } = await readValid(event, Erase)
    const deleted = await (await useAtelierSubmissions()).erase(email)
    await audit(event, { action: 'forms.erased', actorId: user.id, target: { type: 'submissions', id: '' }, details: { deleted } })
    return { deleted }
  }
  if (!action && method === 'GET') {
    const { definition, version } = await published(id)
    const locale = typeof getQuery(event).locale === 'string' ? String(getQuery(event).locale) : undefined
    const challenge = await useAtelierChallenge()
    return {
      id,
      version,
      title: definition.title,
      submitLabel: definition.submitLabel ?? null,
      fields: definition.fields.map(({ labels: _, ...f }) => ({ ...f, label: labelOf({ ...f, labels: _ } as FormField, locale) })),
      token: await signToken(TOKEN, { f: id, t: Date.now() }),
      challenge: challenge ? { name: challenge.name, siteKey: challenge.siteKey } : null,
    }
  }
  if (action === 'submit' && !submissionId && method === 'POST')
    return submit(event, id)

  if (action !== 'submissions')
    throw apiError(404, 'Not found')
  await requireUser(event, 'forms')
  const store = await useAtelierSubmissions()
  if (!submissionId && method === 'GET') {
    const query = validated(List, getQuery(event))
    const { definition } = await published(id).catch(async () => ({ definition: (await (await useAtelierEntries()).get(FORMS, id, { stage: 'draft' }))?.data as unknown as FormDefinition | undefined }))
    if (!definition)
      throw apiError(404, 'No such form')
    if (query.format) {
      const { items } = await store.list(id, { from: query.from, to: query.to, q: query.q })
      event.res.headers.set('content-disposition', `attachment; filename="${id}-submissions.${query.format}"`)
      if (query.format === 'json')
        return items
      event.res.headers.set('content-type', 'text/csv; charset=utf-8')
      return csvOf(definition.fields, items)
    }
    return { fields: definition.fields.map(f => ({ name: f.name, label: f.label, type: f.type })), ...await store.list(id, { from: query.from, to: query.to, q: query.q, limit: query.limit ?? 50, offset: query.offset }) }
  }
  const submission = submissionId ? await store.get(submissionId) : undefined
  if (!submission || submission.form !== id)
    throw apiError(404, 'No such submission')
  if (!sub && method === 'DELETE') {
    await store.delete(submission.id)
    return { ok: true }
  }
  if (sub === 'files' && field && method === 'GET') {
    const file = await store.file(submission, field)
    if (!file)
      throw apiError(404, 'No such file')
    return new Response(file.stream, { headers: {
      'content-type': file.info.type || 'application/octet-stream',
      'content-disposition': `attachment; filename="${file.info.name.replace(/["\\\r\n]/g, '_')}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } })
  }
  throw apiError(404, 'Not found')
})
