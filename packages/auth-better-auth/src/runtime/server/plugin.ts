// Replaces the built-in auth adapter with Better Auth
import { registerAuthAdapter } from '#atelier/server'
import config from '#atelier-better-auth'
import { createBetterAuthAdapter } from './adapter'

export default () => {
  registerAuthAdapter(() => createBetterAuthAdapter(config))
}
