// The mail transports a URL names (see mail.ts); no server state, so they can be tested alone.
export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}
export interface MailAdapter {
  send: (message: MailMessage & { from: string }) => Promise<void>
}

interface Nodemailer { createTransport: (url: string) => { sendMail: (message: Record<string, unknown>) => Promise<unknown> } }
type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** An adapter for a mail URL, or undefined for a scheme it doesn't know. */
export function mailAdapterFor(url: string, deps: { fetch?: Fetch, nodemailer?: () => Promise<Nodemailer> } = {}): MailAdapter | undefined {
  const { protocol, username, password, hostname } = new URL(url)
  const key = decodeURIComponent(hostname || username || password)
  const post = async (endpoint: string, headers: Record<string, string>, body: unknown) => {
    const response = await (deps.fetch ?? fetch)(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json', ...headers }, body: JSON.stringify(body) })
    if (!response.ok)
      throw new Error(`${endpoint} answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  }
  switch (protocol) {
    case 'smtp:':
    case 'smtps:': {
      let transport: ReturnType<Nodemailer['createTransport']> | undefined
      return {
        async send(message) {
          if (!transport) {
            const nodemailer = await deps.nodemailer?.()
            if (!nodemailer)
              throw new Error('SMTP needs the nodemailer package: install it in your app')
            transport = nodemailer.createTransport(url)
          }
          await transport.sendMail({ ...message })
        },
      }
    }
    case 'resend:':
      return { send: m => post('https://api.resend.com/emails', { authorization: `Bearer ${key}` }, { from: m.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }) }
    case 'postmark:':
      return { send: m => post('https://api.postmarkapp.com/email', { 'x-postmark-server-token': key }, { From: m.from, To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: m.html, MessageStream: 'outbound' }) }
  }
}
