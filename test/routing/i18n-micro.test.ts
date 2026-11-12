import { fileURLToPath } from 'node:url'
import { i18nSuite } from './i18n'

i18nSuite('nuxt-i18n-micro', fileURLToPath(new URL('../fixtures/i18n-micro', import.meta.url)))
