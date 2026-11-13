// Webhooks in a running app: content changes queue a delivery job per subscribed webhook (see webhooks.ts).
import type { StoreChange } from './db/store'
import type { Lookup, Message, WebhookEvent } from './webhooks'
import { deriveSecret } from 'nuxt/server'
import { useAtelierJobs, useAtelierServerConfig, useAtelierWebhooks } from './index'
import { decryptSecret, deliver } from './webhooks'

export const WEBHOOK_JOB = 'atelier:webhook'
const SECRET_PURPOSE = 'nuxt-atelier:webhook-secrets'

/** The key webhook secrets are encrypted with, derived from the app secret. */
export const secretKey = () => deriveSecret(SECRET_PURPOSE)

/** The allowlist of internal hosts (`webhooks.allow`). */
export function allowedHosts(): string[] {
  const allow = (useAtelierServerConfig() as unknown as { webhooks: { allow: string[] | string } }).webhooks.allow
  return typeof allow === 'string' ? JSON.parse(allow) as string[] : allow
}

let resolver: Promise<Lookup | undefined> | undefined
/** DNS where the platform has it (not on Workers: there, literal addresses are still checked). */
export function lookup(): Promise<Lookup | undefined> {
  resolver ??= import('node:dns/promises')
    .then(dns => async (host: string) => (await dns.lookup(host, { all: true, verbatim: true })).map(a => a.address))
    .catch(() => undefined)
  return resolver
}

/** Queues a delivery to every active webhook subscribed to this change. */
export const queueWebhooks = (change: StoreChange): Promise<void> =>
  queueWebhookEvent(`entry.${change.action}` as WebhookEvent, change.type, { type: change.type, id: change.id, live: change.live })

/** Queues a delivery of `event` about `type` to every active webhook subscribed to it. */
export async function queueWebhookEvent(event: WebhookEvent, type: string, data: Record<string, unknown>): Promise<void> {
  const hooks = await (await useAtelierWebhooks()).subscribed(event, type)
  if (!hooks.length)
    return
  const jobs = await useAtelierJobs()
  const at = Date.now()
  for (const webhook of hooks) {
    const message: Message = { id: `msg_${crypto.randomUUID().replaceAll('-', '')}`, event, at, data }
    await jobs.enqueue(WEBHOOK_JOB, { webhookId: webhook.id, message: message as unknown as Record<string, unknown> }, { maxAttempts: 8 })
  }
}

/** The `atelier:webhook` job: one delivery attempt. */
export async function runDelivery(payload: { webhookId: string, message: Message }, attempt: number): Promise<void> {
  const store = await useAtelierWebhooks()
  const webhook = await store.get(payload.webhookId)
  if (!webhook?.active)
    return // deleted or paused since: nothing to deliver
  const secret = await decryptSecret((await store.secret(webhook.id))!, await secretKey())
  await deliver(store, webhook, secret, payload.message, { attempt, allow: allowedHosts(), lookup: await lookup() })
}
