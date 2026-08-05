// Contract test for the lifecycle-metadata pair in shared/activityKinds.ts.
//
// These two functions read and write `activity_entries.metadata_json`, which is
// an opaque TEXT column — nothing in the schema stops a malformed or partial
// value from reaching a reader. Before they were lifted here the parse lived in
// two hand-rolled copies (LifecycleActivityLine's glyph picker and
// ActivityStream's creation-dedupe scan), so "what happens on garbage" was
// answered twice and asserted nowhere.
//
// The consequential branch is the SILENT one: lifecycleEventOf swallowing bad
// input and returning null. A throw here would take down a whole project feed
// on one bad row, so the swallow is deliberate — and therefore worth pinning.

import { describe, it, expect } from 'vitest'
import { lifecycleEventOf, lifecycleMetadata } from '../../../shared/activityKinds'

describe('lifecycleEventOf', () => {
  it('reads the event name off a well-formed row', () => {
    expect(lifecycleEventOf('{"event":"created","lifecycle":true}')).toBe('created')
    expect(lifecycleEventOf('{"event":"completed","lifecycle":true}')).toBe('completed')
  })

  it('returns null when the column is empty — the common case for non-lifecycle rows', () => {
    expect(lifecycleEventOf(null)).toBeNull()
    expect(lifecycleEventOf(undefined)).toBeNull()
    expect(lifecycleEventOf('')).toBeNull()
  })

  it('swallows malformed JSON rather than throwing — one bad row must not kill a feed', () => {
    expect(lifecycleEventOf('{not json')).toBeNull()
    expect(lifecycleEventOf('[1,2,3')).toBeNull()
  })

  it('returns null when the JSON parses but carries no usable event', () => {
    expect(lifecycleEventOf('{"lifecycle":true}')).toBeNull()
    expect(lifecycleEventOf('{"event":42}')).toBeNull()
    expect(lifecycleEventOf('{"event":null}')).toBeNull()
    expect(lifecycleEventOf('null')).toBeNull()
    // A JSON array parses fine and has no `event` — must not throw on md?.event.
    expect(lifecycleEventOf('[]')).toBeNull()
  })
})

describe('lifecycleMetadata', () => {
  it('round-trips through lifecycleEventOf', () => {
    for (const ev of ['created', 'completed', 'reopened']) {
      expect(lifecycleEventOf(lifecycleMetadata(ev))).toBe(ev)
    }
  })

  it('matches the shape the server writer emits', () => {
    // api/lib/lifecycle-activity.ts stores {event, lifecycle:true}; a client-built
    // row has to be indistinguishable from a stored one or the glyph diverges.
    expect(JSON.parse(lifecycleMetadata('created'))).toEqual({ event: 'created', lifecycle: true })
  })
})
