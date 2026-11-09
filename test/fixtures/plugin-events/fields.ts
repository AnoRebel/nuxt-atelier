import type { StandardSchema } from '#atelier/server'
import { defineFieldType } from '#atelier/server'

// A Standard Schema written by hand: any validation library's would do
const point = {
  '~standard': {
    version: 1,
    vendor: 'atelier-events',
    validate: (value: unknown) => {
      const p = value as { lat?: unknown, lng?: unknown } | null
      const ok = !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
      return ok ? { value } : { issues: [{ message: 'expected { lat, lng } in degrees' }] }
    },
  },
} satisfies StandardSchema

/** Where an event happens. */
export const geoPoint = defineFieldType({ name: 'geo-point', storage: 'json', schema: point })
