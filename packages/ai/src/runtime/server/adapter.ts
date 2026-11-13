// The AI provider behind AI assist: one call, text in (with images), text out. `aiSdkAdapter` puts any
// AI SDK model behind it; register yours from a server plugin. Credentials stay on the server.
import type { LanguageModel } from 'ai'
import { generateText } from 'ai'

export interface AiRequest {
  system: string
  prompt: string
  /** Images the model looks at (alt text): their bytes and type. */
  images?: { data: Uint8Array, mediaType: string }[]
  maxOutputTokens?: number
}
export interface AiResult {
  text: string
  /** Tokens, when the provider reports them. */
  usage?: { inputTokens?: number, outputTokens?: number }
}
export interface AiAdapter {
  generate: (request: AiRequest) => Promise<AiResult>
}

/** An adapter on the AI SDK: `aiSdkAdapter({ model: anthropic('claude-sonnet-5-5') })`, or any provider's model. */
export function aiSdkAdapter(options: { model: LanguageModel, temperature?: number }): AiAdapter {
  return {
    async generate(request) {
      const result = await generateText({
        model: options.model,
        system: request.system,
        ...options.temperature === undefined ? {} : { temperature: options.temperature },
        maxOutputTokens: request.maxOutputTokens ?? 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: request.prompt },
            ...(request.images ?? []).map(image => ({ type: 'file' as const, mediaType: image.mediaType, data: image.data })),
          ],
        }],
      })
      return { text: result.text, usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } }
    },
  }
}

let factory: (() => AiAdapter | Promise<AiAdapter>) | undefined
let adapter: Promise<AiAdapter> | undefined

/** Turns AI assist on with this provider. Call it from a server plugin. */
export function registerAiAdapter(create: () => AiAdapter | Promise<AiAdapter>): void {
  factory = create
  adapter = undefined
}

/** The registered adapter, or undefined: AI assist is off. */
export function useAiAdapter(): Promise<AiAdapter> | undefined {
  if (!factory)
    return undefined
  adapter ??= Promise.resolve(factory()).catch((error) => {
    adapter = undefined
    throw error
  })
  return adapter
}
