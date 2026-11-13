// Telling someone about a mention, a reply or a lock takeover: in the admin, live to their open sessions,
// and by email when it's set up (mail.ts).
import type { RequestEvent } from 'nuxt/server'
import type { NotificationKind } from './store'
import { getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { useAtelierAuth, useAtelierCollab, useAtelierSchema } from '../index'
import { logger } from '../logger'
import { sendMail } from '../mail'
import { publish, userTopic } from './realtime'

export interface NotificationData { type: string, entry: string, by: string, comment?: string, thread?: string, excerpt?: string }

const SUBJECTS: Record<NotificationKind, (by: string) => string> = {
  mention: by => `${by} mentioned you`,
  reply: by => `${by} replied to your comment`,
  takeover: by => `${by} took over your edit`,
}

/** The admin page of an entry or singleton. */
async function adminPath(type: string, entry: string): Promise<string> {
  const base = (useRuntimeConfig().public.atelier as { admin?: { base?: string } }).admin?.base ?? '/admin'
  const singleton = !!(await useAtelierSchema()).singletons[type]
  return singleton ? `${base}/singletons/${type}` : `${base}/collections/${type}/${entry}`
}

export async function notifyUser(event: RequestEvent, userId: string, kind: NotificationKind, data: NotificationData): Promise<void> {
  const users = (await useAtelierAuth()).users
  const [to, from] = await Promise.all([users.get(userId).catch(() => null), users.get(data.by).catch(() => null)])
  const byName = from?.name || from?.email || 'Someone'
  await (await useAtelierCollab()).notify(userId, kind, { ...data, byName })
  publish(userTopic(userId), 'notifications')
  if (!to?.email)
    return
  try {
    const siteUrl = (useRuntimeConfig().public.atelier as { siteUrl?: string }).siteUrl || getRequestURL(event).origin
    const link = new URL(await adminPath(data.type, data.entry), siteUrl).href
    const subject = SUBJECTS[kind](byName)
    await sendMail({ to: to.email, subject, text: `${subject}${data.excerpt ? `:\n\n${data.excerpt}` : '.'}\n\n${link}\n` })
  }
  catch (error) {
    logger.warn('Couldn\'t queue a notification email', { error })
  }
}
