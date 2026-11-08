import { fileURLToPath } from 'node:url'
import { contentApiSuite } from './suite'

contentApiSuite('Nuxt 4', fileURLToPath(new URL('../fixtures/api', import.meta.url)))
