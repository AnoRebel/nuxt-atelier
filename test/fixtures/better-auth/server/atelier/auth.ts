import { defineAtelierBetterAuth } from '@nuxt-atelier/auth-better-auth/config'
import { genericOAuth } from 'better-auth/plugins'

const provider = process.env.MOCK_OAUTH_URL ?? 'http://127.0.0.1:9'

export default defineAtelierBetterAuth({
  betterAuth: {
    // every test signs in from one address: Better Auth's per-IP limit would refuse the later ones
    rateLimit: { enabled: false },
    plugins: [genericOAuth({
      config: [{
        providerId: 'mock',
        clientId: 'atelier',
        clientSecret: 'mock-secret',
        authorizationUrl: `${provider}/authorize`,
        tokenUrl: `${provider}/token`,
        userInfoUrl: `${provider}/userinfo`,
        scopes: ['profile', 'email'],
      }],
    })],
  },
  // people from the CMS's own domain are editors; anyone else gets no CMS access until given a role
  mapRole: user => user.email.endsWith('@cms.example') ? 'editor' : null,
})
