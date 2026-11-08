import { fileURLToPath } from 'node:url'
import { contentApiSuite } from './suite'

contentApiSuite('compatibilityVersion 5', fileURLToPath(new URL('../fixtures/api-v5', import.meta.url)))
