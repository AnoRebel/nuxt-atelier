import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import type { InferEntry } from '../../packages/core/src/runtime/shared/infer'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as v from 'valibot'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEntryStore } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const geoPoint = f.defineFieldType({
  name: 'geo-point',
  storage: 'json',
  schema: v.object({
    lat: v.pipe(v.number(), v.minValue(-90, 'latitude must be between -90 and 90'), v.maxValue(90, 'latitude must be between -90 and 90')),
    lng: v.pipe(v.number(), v.minValue(-180, 'longitude must be between -180 and 180'), v.maxValue(180, 'longitude must be between -180 and 180')),
  }),
  input: 'GeoPointInput',
})
const sku = f.defineFieldType({ name: 'sku', storage: 'text', schema: v.pipe(v.string(), v.regex(/^[A-Z]{3}-\d{4}$/, 'expected a SKU like ABC-1234')) })

const places = { fields: { name: f.text(), location: geoPoint({ required: true }), code: sku({ unique: true }), stops: f.repeater({ fields: { at: geoPoint() } }) } }
const schema = { collections: { places }, singletons: {} }
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-custom-')), 'schema.json')
writeFileSync(schemaFile, f.serialiseFields(schema))

// the value type comes from the field type's schema
const typed: InferEntry<typeof places.fields> = { location: { lat: 1, lng: 2 }, code: 'ABC-1234' }
// @ts-expect-error a geo point has no `x`
const untyped: InferEntry<typeof places.fields> = { location: { x: 1 } }

describe.each(engines)('%s custom field types', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema)
  }, 120_000)
  afterAll(() => driver?.close())

  it('stores and reads back a valid value, nested ones too', async () => {
    const saved = await store.save('places', { data: { ...typed, name: 'Dar es Salaam', stops: [{ at: { lat: -6.8, lng: 39.28 } }] } })
    expect((await store.get('places', saved.id))!.data).toMatchObject({ location: { lat: 1, lng: 2 }, code: 'ABC-1234', stops: [{ at: { lat: -6.8, lng: 39.28 } }] })
    expect(untyped).toBeDefined()
  })

  it('validates with the field type\'s schema, and unique works on its column', async () => {
    await expect(store.save('places', { data: { location: { lat: 91, lng: 0 }, code: 'nope', stops: [{ at: 'here' }] } })).rejects.toMatchObject({
      statusCode: 422,
      errors: [
        { path: 'location', message: 'latitude must be between -90 and 90' },
        { path: 'code', message: 'expected a SKU like ABC-1234' },
        { path: 'stops.0.at', message: 'Invalid type: Expected Object but received "here"' },
      ],
    })
    await expect(store.save('places', { data: { location: { lat: 0, lng: 0 }, code: 'ABC-1234' } }))
      .rejects.toMatchObject({ errors: [{ path: 'code', message: 'already used by another entry' }] })
  })
})

describe('defineFieldType', () => {
  it('makes a serialisable descriptor naming its storage and input', () => {
    expect(JSON.parse(f.serialiseFields(geoPoint({ label: 'Where' }))))
      .toEqual({ type: 'custom', fieldType: 'geo-point', storage: 'json', input: 'GeoPointInput', label: 'Where' })
    expect(() => f.defineFieldType({ name: 'Geo Point', storage: 'json', schema: v.unknown() })).toThrow('Field type "Geo Point"')
  })
})
