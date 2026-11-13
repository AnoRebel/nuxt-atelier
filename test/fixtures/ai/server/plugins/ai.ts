import type { AiRequest } from '#atelier-ai'
import { registerAiAdapter } from '#atelier-ai'
import { useRuntimeConfig } from 'nuxt/server'

// Test probe: a provider that answers by the request's kind, and records every request it's sent
export const sent: AiRequest[] = []

export default () => {
  const key = useRuntimeConfig().aiKey as string
  registerAiAdapter(() => ({
    async generate(request) {
      if (!key)
        throw new Error('no key')
      sent.push(request)
      const usage = { inputTokens: 10, outputTokens: 5 }
      if (request.system.includes('JSON only: [')) {
        const id = /[0-9a-f-]{36}/.exec(request.prompt)?.[0]
        return { text: JSON.stringify([{ method: 'DELETE', path: `/api/_atelier/collections/posts/${id}`, summary: `Delete post ${id}` }, { method: 'POST', path: '/api/_atelier/users', body: { email: 'x@example.com' }, summary: 'Make a user' }]), usage }
      }
      if (request.system.includes('{"title"'))
        return { text: '{"title": "A suggested title", "description": "A suggested description."}', usage }
      if (request.system.includes('The content is JSON'))
        return { text: request.prompt.replaceAll('Hello', 'Bonjour').replace(/"id":"[^"]+"/, '"id":"changed"'), usage }
      if (request.system.includes('translate'))
        return { text: `[fr] ${request.prompt}`, usage }
      if (request.system.includes('alt text'))
        return { text: `A picture (${request.images?.length ?? 0} image)`, usage }
      return { text: `Better: ${request.prompt.split('\n\n').pop()}`, usage }
    },
  }))
}
