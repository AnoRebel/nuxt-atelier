import { registerContentAdapter } from '#atelier/server'
import { acme } from '../utils/acme'

// acme-pages live in the "acme" backend; the app shows each at /acme/<id>
export default () => {
  registerContentAdapter(acme, { collections: ['acme-pages'], preview: ref => ref.kind === 'collection' ? `/acme/${ref.id}` : undefined })
}
