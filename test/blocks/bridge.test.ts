// The visual editor's bridge protocol: only messages from the expected window and origin, in the
// protocol's shape and version, are read.
import { describe, expect, it } from 'vitest'
import { BRIDGE_VERSION, ChildMessage, ParentMessage, readMessage } from '../../packages/core/src/runtime/shared/bridge'

const parent = {}
const origin = 'https://site.test'
const state = { type: 'atelier:state', version: BRIDGE_VERSION, id: 'p1', data: { title: 'Hi' } }

describe('bridge protocol', () => {
  it('reads a well-formed message from the expected window and origin', () => {
    expect(readMessage(ParentMessage, { origin, source: parent, data: state }, { origin, source: parent })).toEqual(state)
    const select = { type: 'atelier:select', version: BRIDGE_VERSION, id: 'b1' }
    expect(readMessage(ChildMessage, { origin, source: parent, data: select }, { origin, source: parent })).toEqual(select)
  })

  it('ignores another origin, another window, a missing source', () => {
    expect(readMessage(ParentMessage, { origin: 'https://evil.test', source: parent, data: state }, { origin, source: parent })).toBeUndefined()
    expect(readMessage(ParentMessage, { origin, source: {}, data: state }, { origin, source: parent })).toBeUndefined()
    expect(readMessage(ParentMessage, { origin, source: null, data: state }, { origin, source: null })).toBeUndefined()
  })

  it('ignores malformed messages, unknown types and other versions', () => {
    const read = (data: unknown) => readMessage(ParentMessage, { origin, source: parent, data }, { origin, source: parent })
    expect(read({ ...state, version: 2 })).toBeUndefined()
    expect(read({ type: 'atelier:state', version: BRIDGE_VERSION, data: 'not an object' })).toBeUndefined()
    expect(read({ type: 'atelier:delete-everything', version: BRIDGE_VERSION })).toBeUndefined()
    expect(read('atelier:state')).toBeUndefined()
    expect(read(null)).toBeUndefined()
  })
})
