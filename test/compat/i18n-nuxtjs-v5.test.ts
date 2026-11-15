// Run by the non-blocking `compat` CI job only (ATELIER_COMPAT=1): see vitest.config.ts
import { fileURLToPath } from 'node:url'
import { i18nSuite } from '../routing/i18n'

i18nSuite('@nuxtjs/i18n, compatibilityVersion 5', fileURLToPath(new URL('../fixtures/i18n-nuxtjs-v5', import.meta.url)))
