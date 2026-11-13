// What AI assist was used for: one row per request, for limits and the usage report.
import { defineTables } from '#atelier/server'

export default defineTables({
  atelier_ai_usage: {
    columns: {
      user_id: { type: 'string', required: true, index: true },
      action: { type: 'string', required: true },
      content_type: { type: 'string' },
      site: { type: 'string', required: true },
      input_tokens: { type: 'number', required: true },
      output_tokens: { type: 'number', required: true },
      created_at: { type: 'string', required: true, index: true },
    },
  },
})
