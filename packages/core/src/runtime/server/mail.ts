// Sending email: one URL picks the transport (`mail.url`, NUXT_ATELIER_MAIL_URL):
//   smtp://user:pass@host:587, smtps://user:pass@host:465   SMTP, through `nodemailer` (install it; Node only)
//   resend://<api key>                                       Resend's HTTP API
//   postmark://<server token>                                Postmark's HTTP API
// or an adapter of your own (`registerMailAdapter`). Messages go out as background jobs, retried on failure.
import { useAtelierJobs, useAtelierServerConfig } from './index'
import { defineJob } from './jobs'
import { logger } from './logger'
import { mailAdapterFor } from './mail-transports'
import type { MailAdapter, MailMessage } from './mail-transports'

export type { MailAdapter, MailMessage } from './mail-transports'

const MAIL_JOB = 'atelier:mail'

let custom: (() => MailAdapter | Promise<MailAdapter>) | undefined
let adapter: Promise<MailAdapter | undefined> | undefined

/** Sends the CMS's email through your own adapter instead of `mail.url`. Call it from a server plugin. */
export function registerMailAdapter(factory: () => MailAdapter | Promise<MailAdapter>): void {
  custom = factory
  adapter = undefined
}

const mailConfig = () => (useAtelierServerConfig() as unknown as { mail: { url: string, from: string } }).mail

/** The configured adapter, or undefined when email isn't set up. */
export function useAtelierMail(): Promise<MailAdapter | undefined> {
  adapter ??= (async () => {
    if (custom)
      return custom()
    const { url } = mailConfig()
    if (!url)
      return undefined
    const { nodemailer } = await import('#atelier-mailer')
    const found = mailAdapterFor(url, { nodemailer })
    if (!found)
      logger.warn(`mail.url: unknown scheme "${new URL(url).protocol}", expected smtp:, smtps:, resend: or postmark:`)
    return found
  })()
  return adapter
}

/** Queues an email; nothing happens when email isn't set up. Answers whether it was queued. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!await useAtelierMail())
    return false
  await (await useAtelierJobs()).enqueue(MAIL_JOB, message as unknown as Record<string, unknown>, { maxAttempts: 5 })
  return true
}

/** The job that sends queued email (registered by the jobs plugin). */
export function defineMailJob(): void {
  defineJob<MailMessage>(MAIL_JOB, async (message) => {
    const mail = await useAtelierMail()
    if (mail)
      await mail.send({ ...message, from: mailConfig().from })
  })
}
