// Signed tokens, keyed per purpose with Nuxt's `deriveSecret` (HKDF from `runtimeConfig.appSecret`), so a
// token signed for one thing (a preview link) is never accepted as another. HMAC-SHA256, all Web Crypto.
import { deriveSecret } from 'nuxt/server'

/** Shared preview links (api/preview-links.ts): the type, the entry id (a singleton's name), and when it expires (ms). */
export const PREVIEW_PURPOSE = 'nuxt-atelier:preview-link'
export interface PreviewToken { t: string, i: string, e: number }

const encoder = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
function fromBase64url(text: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
  }
  catch {
    return undefined
  }
}

/** The HMAC key for `purpose`, from `secret` (a derived secret) or `deriveSecret(purpose)`. */
async function keyFor(purpose: string, secret?: string): Promise<CryptoKey> {
  const derived = secret ?? await deriveSecret(purpose)
  if (!keys.has(derived))
    keys.set(derived, crypto.subtle.importKey('raw', encoder.encode(derived), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']))
  return keys.get(derived)!
}

/** `payload` as a signed token for `purpose`: `<base64url JSON>.<base64url HMAC>`. `secret` overrides the derived one (tests). */
export async function signToken(purpose: string, payload: object, secret?: string): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)))
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(purpose, secret), encoder.encode(body)))
  return `${body}.${base64url(signature)}`
}

/** The payload of a token signed for `purpose`, or undefined when it's malformed or the signature is wrong. */
export async function verifyToken<T>(purpose: string, token: string, secret?: string): Promise<T | undefined> {
  const [body, signature, ...rest] = token.split('.')
  const bytes = signature === undefined ? undefined : fromBase64url(signature)
  if (!body || !bytes || rest.length || token.length > 4096)
    return undefined
  if (!await crypto.subtle.verify('HMAC', await keyFor(purpose, secret), bytes, encoder.encode(body)))
    return undefined
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64url(body))) as T
  }
  catch {
    return undefined
  }
}
