import { defineSingleton, text } from '#atelier/server'

// each site's own
export default defineSingleton({ fields: { tagline: text() } })
