# Security review (task 26.3), 2026-11-15

Scope: auth, CSRF, SSRF, XSS, uploads, tenant (site and demo) isolation, secrets in logs and in the repository.
Every finding is resolved; none is open.

## Findings

| | Finding | Resolution |
|---|---|---|
| HIGH-1 | Demo visitors' edits reached the shared entry, redirect and page caches, so the next visitor could be served another's copy | demo sessions bypass every shared cache (5a06620) |
| HIGH-2 | With sites, a user manager on one site could list every user, give themselves other sites, reset passwords of users on other sites and edit the roles every site shares | a non-admin manager manages only users whose access is their site at most, never their own access; roles are admin-only with sites (cac67d1) |
| MEDIUM-1 | Webhook targets were checked at resolve time, then resolved again by `fetch` (DNS rebinding) | on Node, Bun and Deno the delivery's own connection refuses internal addresses (b5ae032) |
| LOW-1 | The per-email sign-in limit let anyone lock an account out | device cookies: a browser that signed in as that email before skips the per-email limit only (fed4bf1) |
| LOW-2 | Private media reached any signed-in user, across sites | `onSite` check, else 404 (ef1e72e) |
| LOW-3 | The page cache didn't recognise `_atelier_preview` links | added to the private query pattern (5a06620) |
| LOW-4 | Passkeys survived an administrator's password reset | a reset removes them (fed4bf1) |
| LOW-5 | A fresh public deploy could be claimed by whoever ran setup first | optional `NUXT_ATELIER_AUTH_SETUP_TOKEN` (45f2d60) |
| LOW-6 | Uploads were served inline without a sandbox | `CSP: sandbox` on every upload but PDFs, `attachment` for non-media types (ef1e72e) |

Accepted, noted: in the public demo a new session restarts any per-user allowance (the demo doesn't install the AI package), and the demo's template users are visible to demo visitors (they're demo accounts).

## Checklist

- [x] **Auth:** session ids random 256-bit, stored hashed, sealed HTTP-only cookie, revoked on sign-out, password change and deletion; scrypt (or PBKDF2 600k) compared in constant time with a dummy hash for unknown emails; production app-secret check; sign-in rate limits per IP and email, per email (device cookies exempt), per IP.
- [x] **Passkeys:** user verification required, one-use challenge in a sealed cookie, counter checked, deletion limited to the owner, removed on a password reset.
- [x] **Policy:** `admin` can't be redefined; non-admins can't grant `admin`, change an admin or their own role; the last admin is protected; per-site managers stay on their site.
- [x] **API tokens:** 256-bit, stored hashed, per site, expiring, revocable, content permissions only.
- [x] **CSRF:** Sec-Fetch-Site and Origin checks plus a per-session token on every unsafe `/api/_atelier/**` route; SameSite cookies; the WebSocket upgrade checks the origin and a signed one-minute ticket.
- [x] **SSRF:** webhook targets refuse private, loopback, link-local, metadata and IPv4-mapped ranges and credentials in URLs, don't follow redirects, and are checked at connect time; mail, Turnstile and AI call fixed or configured endpoints only.
- [x] **XSS:** rich-text allowlist and `safeUrl` on save and on render; JSON-LD and search snippets escaped; no `v-html` of user content; the editor bridge checks origin, source and message shape; admin CSP with script hashes and `object-src 'none'`.
- [x] **Uploads:** type detected from content; size enforced while streaming; storage keys sanitized; path traversal blocked; `nosniff`, sandbox CSP, attachments for non-media; form files as attachments; CSV export guards formulas.
- [x] **Tenant isolation:** every site-scoped store takes a site; endpoint-by-endpoint tests in `test/sites`; demo sessions isolated per copy, and out of shared caches (`test/demo`).
- [x] **Edit and preview tokens:** HMAC keyed per purpose; editor tokens bound to user and site, two-minute expiry; preview links bound to one entry, expiring, public-readable fields only.
- [x] **Secrets in logs:** sensitive keys redacted at any depth, URL credentials masked, API errors carry controlled messages only, readiness answers `ok`/`error`.
- [x] **Secrets in the repository:** every revision searched for keys, tokens, private keys and connection-string passwords; only placeholders found; `.mcp.json`, `.env` and `.env.*` ignored.
