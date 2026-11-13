// AI assist's prompts and answers: exclusions, translations that can't change structure, proposals limited
// to the content API, and the AI SDK adapter (on the SDK's mock model).
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { aiSdkAdapter } from '../../packages/ai/src/runtime/server/adapter'
import { excluded, mergeTranslation, parseProposals, parseSeo, translatePrompt } from '../../packages/ai/src/runtime/server/prompts'

describe('AI assist prompts', () => {
  it('excludes whole types and single fields', () => {
    const exclude = ['secrets', 'posts.notes']
    expect(excluded(exclude, 'secrets')).toBe(true)
    expect(excluded(exclude, 'secrets', 'value')).toBe(true)
    expect(excluded(exclude, 'posts', 'notes')).toBe(true)
    expect(excluded(exclude, 'posts', 'title')).toBe(false)
    expect(excluded(exclude, 'posts')).toBe(false)
  })

  it('takes only the text from a translated JSON value: ids, types and links stay', () => {
    const block = { id: 'b1', type: 'Hero', props: { title: 'Hello', link: { href: '/en/about', label: 'About us' }, count: 3, items: [{ id: 'b2', type: 'Card', props: { heading: 'Hi' } }] } }
    const answer = '```json\n{"id":"x","type":"Héros","props":{"title":"Bonjour","link":{"href":"/fr/a-propos","label":"À propos"},"count":4,"items":[{"id":"y","type":"Carte","props":{"heading":"Salut"}}],"extra":"no"}}\n```'
    expect(mergeTranslation(block, answer)).toEqual({ id: 'b1', type: 'Hero', props: { title: 'Bonjour', link: { href: '/en/about', label: 'À propos' }, count: 3, items: [{ id: 'b2', type: 'Card', props: { heading: 'Salut' } }] } })
    expect(() => mergeTranslation(block, 'Sorry, I can\'t')).toThrow(/wasn't JSON/)
    expect(translatePrompt(block, 'fr').system).toContain('The content is JSON')
    expect(translatePrompt('Hello', 'fr').prompt).toBe('Hello')
  })

  it('reads an SEO answer, or refuses one without both parts', () => {
    expect(parseSeo('{"title":"T","description":"D"}')).toEqual({ title: 'T', description: 'D' })
    expect(() => parseSeo('{"title":"T"}')).toThrow()
  })

  it('keeps only content API requests among the assistant\'s proposals', () => {
    const answer = JSON.stringify([
      { method: 'delete', path: '/api/_atelier/collections/posts/p1', summary: 'Delete it' },
      { method: 'PATCH', path: '/api/_atelier/collections/posts/p1', body: { version: 2, data: { title: 'New' } }, summary: 'Rename it' },
      { method: 'GET', path: '/api/_atelier/collections/posts?filter={"title":{"eq":"x"}}', body: { ignored: true }, summary: 'Find' },
      { method: 'POST', path: '/api/_atelier/users', body: { role: 'admin' }, summary: 'Make me an admin' },
      { method: 'POST', path: '/api/_atelier/collections/../users', summary: 'Sneaky' },
      { method: 'PUT', path: '/api/_atelier/collections/posts', summary: 'Not a method we propose' },
      { method: 'GET', path: 'https://evil.example/api/_atelier/collections/posts', summary: 'Elsewhere' },
    ])
    expect(parseProposals(answer)).toEqual([
      { method: 'DELETE', path: '/api/_atelier/collections/posts/p1', summary: 'Delete it' },
      { method: 'PATCH', path: '/api/_atelier/collections/posts/p1', body: { version: 2, data: { title: 'New' } }, summary: 'Rename it' },
      { method: 'GET', path: '/api/_atelier/collections/posts?filter={"title":{"eq":"x"}}', summary: 'Find' },
    ])
    expect(parseProposals('I would delete everything')).toEqual([])
  })
})

describe('AI SDK adapter', () => {
  it('sends the system, prompt and images, and reports the tokens', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'A cat on a mat' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 4, text: 4, reasoning: undefined } },
        warnings: [],
      }),
    })
    const result = await aiSdkAdapter({ model }).generate({ system: 'Describe', prompt: 'cat.png', images: [{ data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }] })
    expect(result).toEqual({ text: 'A cat on a mat', usage: { inputTokens: 12, outputTokens: 4 } })
    const [call] = model.doGenerateCalls
    expect(call!.prompt[0]).toMatchObject({ role: 'system', content: 'Describe' })
    expect(call!.prompt[1]!.content).toEqual([expect.objectContaining({ type: 'text', text: 'cat.png' }), expect.objectContaining({ type: 'file', mediaType: 'image/png' })])
  })
})
