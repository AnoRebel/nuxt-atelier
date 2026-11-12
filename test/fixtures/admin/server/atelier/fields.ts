import type { StandardSchema } from '#atelier/server'
import { defineFieldType } from '#atelier/server'

const point = {
  '~standard': {
    version: 1,
    vendor: 'atelier-admin-fixture',
    validate: (value: unknown) => {
      const p = value as { lat?: unknown, lng?: unknown } | null
      const ok = !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
      return ok ? { value } : { issues: [{ message: 'expected { lat, lng } in degrees' }] }
    },
  },
} as StandardSchema

/** A place, edited in the admin with the app's own GeoPointInput component. */
export const geoPoint = defineFieldType({ name: 'geo-point', storage: 'json', schema: point, input: 'GeoPointInput' })
