// Password hashes in a PHC-style string that records the algorithm and its parameters, so stronger
// settings can be adopted later: a hash with older settings verifies, then is replaced on sign-in.
//
//   $scrypt$ln=17,r=8,p=1$<salt>$<hash>        node:crypto scrypt (N = 2^ln)
//   $pbkdf2-sha256$i=600000$<salt>$<hash>      Web Crypto, where scrypt isn't available (edge runtimes)

const SCRYPT = { ln: 17, r: 8, p: 1 } // OWASP: N=2^17, r=8, p=1
const PBKDF2_ITERATIONS = 600_000 // OWASP, for PBKDF2-HMAC-SHA256
const KEY_LENGTH = 32

const encoder = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')
const unb64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))

type Scrypt = (password: string, salt: Uint8Array, keylen: number, options: { N: number, r: number, p: number, maxmem: number }, callback: (error: Error | null, key: Uint8Array) => void) => void

let scryptImpl: Promise<Scrypt | undefined> | undefined
let scryptFailed = false // present but unusable here, e.g. over a memory limit
// node:crypto where the runtime has it (Node, Bun, Deno, workerd with nodejs_compat)
const loadScrypt = () => scryptImpl ??= import('node:crypto').then(m => m.scrypt as unknown as Scrypt, () => undefined)

async function scrypt(password: string, salt: Uint8Array, params: typeof SCRYPT): Promise<Uint8Array | undefined> {
  const impl = await loadScrypt()
  if (!impl)
    return undefined
  const N = 2 ** params.ln
  return new Promise(resolve => impl(password, salt, KEY_LENGTH, { N, r: params.r, p: params.p, maxmem: 256 * N * params.r }, (error, key) => {
    scryptFailed ||= Boolean(error)
    resolve(error ? undefined : new Uint8Array(key))
  }))
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, KEY_LENGTH * 8))
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/** Hashes a password with scrypt, or PBKDF2 where scrypt isn't available or fails (e.g. memory limits). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await scrypt(password, salt, SCRYPT)
  if (key)
    return `$scrypt$ln=${SCRYPT.ln},r=${SCRYPT.r},p=${SCRYPT.p}$${b64(salt)}$${b64(key)}`
  return `$pbkdf2-sha256$i=${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`
}

export interface Verification {
  valid: boolean
  /** The hash uses weaker settings than a new one would: store `hashPassword(password)` instead. */
  needsRehash: boolean
}

/** Checks a password against a stored hash, in constant time for the comparison. */
export async function verifyPassword(password: string, encoded: string): Promise<Verification> {
  const [, algorithm, rawParams, salt, hash] = encoded.split('$')
  const params = Object.fromEntries((rawParams ?? '').split(',').map(kv => kv.split('=')).map(([k, v]) => [k, Number(v)]))
  if (!salt || !hash)
    return { valid: false, needsRehash: false }
  let key: Uint8Array | undefined
  if (algorithm === 'scrypt' && params.ln && params.r && params.p)
    key = await scrypt(password, unb64(salt), { ln: params.ln, r: params.r, p: params.p })
  else if (algorithm === 'pbkdf2-sha256' && params.i)
    key = await pbkdf2(password, unb64(salt), params.i)
  if (!key || !equal(key, unb64(hash)))
    return { valid: false, needsRehash: false }

  const scryptAvailable = Boolean(await loadScrypt()) && !scryptFailed
  const current = algorithm === 'scrypt'
    ? params.ln! >= SCRYPT.ln && params.r! >= SCRYPT.r && params.p! >= SCRYPT.p
    : !scryptAvailable && params.i! >= PBKDF2_ITERATIONS
  return { valid: true, needsRehash: !current }
}
