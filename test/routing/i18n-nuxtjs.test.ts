import { fileURLToPath } from 'node:url'
import { i18nSuite } from './i18n'

i18nSuite('@nuxtjs/i18n', fileURLToPath(new URL('../fixtures/i18n-nuxtjs', import.meta.url)))
