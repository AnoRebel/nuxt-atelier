// Outgoing webhooks: content events POSTed to URLs administrators configure, signed per Standard Webhooks
// (https://www.standardwebhooks.com): `webhook-id`, `webhook-timestamp` and
// `webhook-signature: v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`, keyed by the base64 part of
// the `whsec_…` secret. Delivered by background jobs, so a target that's down gets retries.
//
// Server-side request forgery: a target must be http(s), and its host must not resolve to a private,
// loopback, link-local or otherwise internal address, unless the host is allowlisted (`webhooks.allow`).
// That's checked when the webhook is saved and again before every delivery; redirects aren't followed.
// Where the platform has node:http (Node, Bun, Deno), the delivery's own connection checks the addresses it
// connects to as well, so a host that resolves differently a moment later (DNS rebinding) is still refused.
import type { AtelierDriver } from './db/driver'
import type { Db } from './db/entries'
import { and, desc, eq, lt } from 'drizzle-orm'
import { buildTables } from './db/tables'

export const WEBHOOK_EVENTS = ['entry.saved', 'entry.published', 'entry.unpublished', 'entry.deleted', 'form.submitted'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export interface Webhook {
  id: string
  url: string
  events: WebhookEvent[]
  /** Collections and singletons it's for; null for all. */
  types: string[] | null
  active: boolean
  createdBy: string
  createdAt: string
}

export interface Delivery {
  id: string
  webhookId: string
  messageId: string
  event: string
  attempt: number
  status: number | null
  error: string | null
  durationMs: number
  at: string
}

const encoder = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))

// ---- signing ----

/** A new signing secret: `whsec_` and 24 random bytes in base64. */
export const newSecret = () => `whsec_${base64(crypto.getRandomValues(new Uint8Array(24)))}`

/** The `webhook-signature` header for a message: `v1,<base64 signature>`. */
export async function sign(secret: string, messageId: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', fromBase64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${messageId}.${timestamp}.${body}`))
  return `v1,${base64(new Uint8Array(signature))}`
}

// ---- secrets at rest ----

/** AES-GCM under `key` (hex, from deriveSecret): `<iv>.<ciphertext>`, base64. */
export async function encryptSecret(secret: string, key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), encoder.encode(secret))
  return `${base64(iv)}.${base64(new Uint8Array(cipher))}`
}

export async function decryptSecret(stored: string, key: string): Promise<string> {
  const [iv, cipher] = stored.split('.') as [string, string]
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await aesKey(key), fromBase64(cipher)))
}

const aesKey = (hex: string) => crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g)!.map(h => Number.parseInt(h, 16))), 'AES-GCM', false, ['encrypt', 'decrypt'])

// ---- where a webhook may go ----

/** Whether an IP address (v4, v6, or v4-mapped v6) is private, loopback, link-local or otherwise not public. */
export function isInternalAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '')
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || a >= 224 // this network, private, loopback, multicast and reserved
      || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
      || (a === 169 && b === 254) // link-local, including cloud metadata (169.254.169.254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && Number(v4[3]) === 0) // IETF protocol assignments
      || (a === 198 && (b === 18 || b === 19)) // benchmarking
  }
  if (!ip.includes(':'))
    return true // not an address: refuse
  return ip === '::' || ip === '::1'
    || /^f[cd]/.test(ip) // unique local
    || /^fe[89ab]/.test(ip) // link-local
    || ip.startsWith('ff') // multicast
    || ip.startsWith('64:ff9b:') // NAT64, which reaches IPv4 addresses
    || ip.startsWith('::ffff:') // mapped, in hex form
}

export type Lookup = (host: string) => Promise<string[]>
/** POSTs `body` to `url`, resolving with the status; never follows redirects. */
export type Send = (url: string, init: { headers: Record<string, string>, body: string, timeoutMs: number }) => Promise<number>

const fetchSend: Send = async (url, init) => {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual', // a redirect could lead anywhere, internal addresses included
    signal: AbortSignal.timeout(init.timeoutMs),
    headers: init.headers,
    body: init.body,
  })
  await response.body?.cancel()
  return response.status
}

/**
 * Why `url` can't be a webhook target, or undefined when it can: an http(s) URL whose host isn't
 * allowlisted must resolve only to public addresses. `lookup` resolves a host name (none: on platforms
 * without DNS, like Workers, only literal addresses and `localhost` are checked).
 */
export async function targetProblem(url: string, allow: string[], lookup?: Lookup): Promise<string | undefined> {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return 'Use a full http(s):// URL'
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    return 'Use a full http(s):// URL'
  if (parsed.username || parsed.password)
    return 'Put credentials in a header your receiver checks, not in the URL'
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (allow.map(h => h.toLowerCase()).includes(host))
    return undefined
  const literal = /^[\d.]+$/.test(host) || host.includes(':')
  if (host === 'localhost' || host.endsWith('.localhost') || (literal && isInternalAddress(host)))
    return `${host} is an internal address; allowlist it in webhooks.allow if that's intended`
  if (literal || !lookup)
    return undefined
  let addresses: string[]
  try {
    addresses = await lookup(host)
  }
  catch {
    return `${host} doesn't resolve`
  }
  const internal = addresses.find(isInternalAddress)
  if (internal)
    return `${host} resolves to an internal address (${internal}); allowlist it in webhooks.allow if that's intended`
  if (!addresses.length)
    return `${host} doesn't resolve`
}

/**
 * A Send over node:http(s) whose connection refuses internal addresses itself, unless the host is
 * allowlisted: the addresses checked are the ones connected to. Undefined without node:http (Workers).
 */
export async function connectionCheckedSend(allow: string[]): Promise<Send | undefined> {
  let modules
  try {
    modules = await Promise.all([import('node:http'), import('node:https'), import('node:dns')])
  }
  catch {
    return undefined
  }
  const [http, https, dns] = modules
  const allowed = allow.map(h => h.toLowerCase())
  return (url, init) => new Promise<number>((resolve, reject) => {
    const parsed = new URL(url)
    const trusted = allowed.includes(parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase())
    // literal addresses never reach this: targetProblem checked them
    const lookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
      dns.lookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
        const internal = !trusted && addresses?.find(a => isInternalAddress(a.address))
        if (error || internal || !addresses?.length)
          return callback(error ?? new Error(internal ? `${hostname} resolves to an internal address (${internal.address})` : `${hostname} doesn't resolve`))
        if (options.all)
          callback(null, addresses)
        else
          callback(null, addresses[0]!.address, addresses[0]!.family)
      })
    }) as never
    const request = (parsed.protocol === 'https:' ? https : http).request(parsed, {
      method: 'POST',
      headers: { ...init.headers, 'content-length': String(new TextEncoder().encode(init.body).length) },
      lookup,
    }, (response) => {
      clearTimeout(timer)
      response.resume() // the body isn't read
      resolve(response.statusCode ?? 0)
    })
    const timer = setTimeout(() => request.destroy(new Error('timed out')), init.timeoutMs)
    request.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    request.end(init.body)
  })
}

// ---- stored webhooks and deliveries ----

export function createWebhookStore(driver: AtelierDriver) {
  const { atelier_webhooks: webhooks, atelier_webhook_deliveries: deliveries } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db
  const toWebhook = (r: Record<string, unknown>): Webhook => ({
    id: r.id as string,
    url: r.url as string,
    events: r.events as WebhookEvent[],
    types: (r.types as string[] | null) ?? null,
    active: Boolean(r.active),
    createdBy: r.createdBy as string,
    createdAt: r.createdAt as string,
  })

  return {
    async list(): Promise<Webhook[]> {
      return (await db.select().from(webhooks).orderBy(desc(webhooks.createdAt))).map(toWebhook)
    },
    async get(id: string): Promise<Webhook | undefined> {
      const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1)
      return row && toWebhook(row)
    },
    /** The stored (encrypted) secret. */
    async secret(id: string): Promise<string | undefined> {
      const [row] = await db.select({ secret: webhooks.secret }).from(webhooks).where(eq(webhooks.id, id)).limit(1)
      return row?.secret
    },
    async create(input: { url: string, events: WebhookEvent[], types: string[] | null, encryptedSecret: string, createdBy: string }): Promise<Webhook> {
      const row = { id: crypto.randomUUID(), url: input.url, events: input.events, types: input.types, secret: input.encryptedSecret, active: true, createdBy: input.createdBy, createdAt: new Date().toISOString() }
      await db.insert(webhooks).values(row)
      return toWebhook(row)
    },
    async update(id: string, changes: Partial<Pick<Webhook, 'url' | 'events' | 'types' | 'active'>>): Promise<Webhook | undefined> {
      if (Object.keys(changes).length)
        await db.update(webhooks).set(changes).where(eq(webhooks.id, id))
      return this.get(id)
    },
    async remove(id: string): Promise<boolean> {
      await db.delete(deliveries).where(eq(deliveries.webhookId, id))
      const [row] = await db.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.id, id)).limit(1)
      await db.delete(webhooks).where(eq(webhooks.id, id))
      return !!row
    },
    /** Active webhooks subscribed to `event` on `type`. */
    async subscribed(event: WebhookEvent, type: string): Promise<Webhook[]> {
      return (await this.list()).filter(w => w.active && w.events.includes(event) && (!w.types || w.types.includes(type)))
    },
    async logDelivery(delivery: Omit<Delivery, 'id' | 'at'>): Promise<void> {
      await db.insert(deliveries).values({ id: crypto.randomUUID(), at: new Date().toISOString(), ...delivery })
    },
    /** A webhook's delivery attempts, newest first. */
    async deliveries(webhookId: string, limit = 50): Promise<Delivery[]> {
      return db.select().from(deliveries).where(eq(deliveries.webhookId, webhookId)).orderBy(desc(deliveries.at)).limit(limit)
    },
    /** Deletes delivery records older than `olderThan`. */
    async pruneDeliveries(olderThan: Date): Promise<void> {
      await db.delete(deliveries).where(lt(deliveries.at, olderThan.toISOString()))
    },
    /** For tests: one webhook's deliveries of a message. */
    async attemptsOf(webhookId: string, messageId: string): Promise<Delivery[]> {
      return db.select().from(deliveries).where(and(eq(deliveries.webhookId, webhookId), eq(deliveries.messageId, messageId))).orderBy(desc(deliveries.at))
    },
  }
}

export type WebhookStore = ReturnType<typeof createWebhookStore>

// ---- delivering ----

export interface Message {
  /** The webhook-id header: one per event and webhook, the same on every retry so receivers can dedupe. */
  id: string
  event: WebhookEvent
  /** When the event happened (ms). */
  at: number
  data: Record<string, unknown>
}

/**
 * POSTs a message to a webhook's URL, signed with its (decrypted) secret: resolves when the target answers
 * 2xx, throws otherwise (the job retries). Every attempt is logged.
 */
export async function deliver(store: WebhookStore, webhook: Webhook, secret: string, message: Message, options: { attempt: number, allow: string[], lookup?: Lookup, send?: Send, timeoutMs?: number }): Promise<void> {
  const started = Date.now()
  const log = (status: number | null, error: string | null) =>
    store.logDelivery({ webhookId: webhook.id, messageId: message.id, event: message.event, attempt: options.attempt, status, error, durationMs: Date.now() - started })
  const problem = await targetProblem(webhook.url, options.allow, options.lookup)
  if (problem) {
    await log(null, `Refused: ${problem}`)
    throw new Error(`Webhook ${webhook.id} refused: ${problem}`)
  }
  const body = JSON.stringify({ type: message.event, timestamp: new Date(message.at).toISOString(), data: message.data })
  const timestamp = Math.floor(Date.now() / 1000)
  let status: number
  try {
    status = await (options.send ?? fetchSend)(webhook.url, {
      timeoutMs: options.timeoutMs ?? 10_000,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'nuxt-atelier-webhooks',
        'webhook-id': message.id,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': await sign(secret, message.id, timestamp, body),
      },
      body,
    })
  }
  catch (error) {
    const reason = error instanceof Error ? (error.name === 'TimeoutError' ? 'timed out' : error.message) : String(error)
    await log(null, reason)
    throw new Error(`Webhook ${webhook.id}: ${reason}`, { cause: error })
  }
  if (status < 200 || status >= 300) {
    await log(status, `Answered ${status}`)
    throw new Error(`Webhook ${webhook.id} answered ${status}`)
  }
  await log(status, null)
}
