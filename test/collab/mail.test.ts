// Mail transports named by a URL: the HTTP providers' requests, and SMTP handed to nodemailer.
import { describe, expect, it, vi } from 'vitest'
import { mailAdapterFor } from '../../packages/core/src/runtime/server/mail-transports'

const message = { from: 'CMS <cms@example.com>', to: 'ann@example.com', subject: 'Hi', text: 'Hello' }

describe('mail transports', () => {
  it('posts to Resend and Postmark with the key from the URL', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    await mailAdapterFor('resend://re_123', { fetch })!.send(message)
    await mailAdapterFor('postmark://pm-token', { fetch })!.send(message)
    const [[resend, resendInit], [postmark, postmarkInit]] = fetch.mock.calls as unknown as [[string, RequestInit], [string, RequestInit]]
    expect(resend).toBe('https://api.resend.com/emails')
    expect(resendInit.headers).toMatchObject({ authorization: 'Bearer re_123' })
    expect(JSON.parse(resendInit.body as string)).toMatchObject({ from: message.from, to: ['ann@example.com'], subject: 'Hi', text: 'Hello' })
    expect(postmark).toBe('https://api.postmarkapp.com/email')
    expect(postmarkInit.headers).toMatchObject({ 'x-postmark-server-token': 'pm-token' })
    expect(JSON.parse(postmarkInit.body as string)).toMatchObject({ From: message.from, To: 'ann@example.com', TextBody: 'Hello' })
  })

  it('fails on a provider error, so the job retries', async () => {
    const fetch = vi.fn(async () => new Response('bad key', { status: 401 }))
    await expect(mailAdapterFor('resend://wrong', { fetch })!.send(message)).rejects.toThrow(/401: bad key/)
  })

  it('sends SMTP through nodemailer with the URL, and says when it isn\'t installed', async () => {
    const sendMail = vi.fn(async () => ({}))
    const createTransport = vi.fn(() => ({ sendMail }))
    await mailAdapterFor('smtps://u:p@mail.example.com:465', { nodemailer: async () => ({ createTransport }) })!.send(message)
    expect(createTransport).toHaveBeenCalledWith('smtps://u:p@mail.example.com:465')
    expect(sendMail).toHaveBeenCalledWith(message)
    await expect(mailAdapterFor('smtp://mail.example.com')!.send(message)).rejects.toThrow(/nodemailer/)
    expect(mailAdapterFor('carrier-pigeon://coop')).toBeUndefined()
  })
})
