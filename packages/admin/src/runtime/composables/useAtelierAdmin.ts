// The admin's base path and its client for the CMS API: JSON, the session cookie, and the CSRF token the
// server set in the `atelier-csrf` cookie echoed in a header on writes. Errors come back as `AdminApiError`.
import type { AdminApiError } from '../types'
import { useRuntimeConfig } from '#imports'

const csrf = () => globalThis.document?.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))?.slice('atelier-csrf='.length)

// With several sites: the one the admin works on, chosen in the site switcher and remembered in this browser;
// sent as `x-atelier-site` (the server checks the user may). None: the site of the address the admin is at.
const SITE_KEY = 'atelier-admin-site'
const storage = () => {
  try {
    return globalThis.localStorage
  }
  catch {
    return undefined
  }
}
export const chosenSite = () => storage()?.getItem(SITE_KEY) ?? undefined
export function chooseSite(site: string | undefined) {
  if (site)
    storage()?.setItem(SITE_KEY, site)
  else
    storage()?.removeItem(SITE_KEY)
}

interface RequestOptions { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown, query?: Record<string, string | number | undefined> }

function toAdminApiError(error: unknown): AdminApiError {
  const e = error as { status?: number, statusCode?: number, message?: string, data?: { message?: string, statusMessage?: string, data?: Record<string, unknown> } }
  const details = e.data?.data ?? {}
  return {
    status: e.status ?? e.statusCode ?? 0,
    message: e.data?.message ?? e.data?.statusMessage ?? e.message ?? 'Request failed',
    ...typeof details.code === 'string' ? { code: details.code } : {},
    ...Array.isArray(details.errors) ? { errors: details.errors as AdminApiError['errors'] } : {},
    ...Array.isArray(details.fields) ? { fields: details.fields as string[] } : {},
  }
}

/** A CMS API request (`path` under `/api/_atelier`). */
export async function atelierFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = csrf()
  try {
    // a plain fetch: the response type is the caller's, not inferred from the app's server routes
    const request = $fetch as unknown as (url: string, options: Record<string, unknown>) => Promise<T>
    return await request(`/api/_atelier${path}`, {
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      query: options.query,
      headers: { ...token ? { 'x-atelier-csrf': token } : {}, ...chosenSite() ? { 'x-atelier-site': chosenSite()! } : {} },
    })
  }
  catch (error) {
    throw toAdminApiError(error)
  }
}

export function useAtelierAdmin() {
  const config = useRuntimeConfig().public.atelier as { admin?: { base?: string, passkeys?: boolean }, locales?: { codes: string[], default: string } } | undefined
  const base = config?.admin?.base ?? '/admin'
  return {
    base,
    passkeys: config?.admin?.passkeys ?? false,
    api: atelierFetch,
    /** An admin path: `to('collections', 'posts')` is `/admin/collections/posts`. */
    to: (...segments: string[]) => [base, ...segments.map(encodeURIComponent)].join('/'),
  }
}
