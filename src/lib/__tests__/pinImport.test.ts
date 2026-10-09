import { describe, it, expect } from 'vitest'
import { pinPostSettled, unsettledPins } from '../pinImport'

describe('legacy pin import', () => {
  it('2xx and 404 settle a slug; network failure, 401/403 and 5xx do not', () => {
    expect([201, 200, 404].map(pinPostSettled)).toEqual([true, true, true])
    expect([null, 401, 403, 500, 503].map(pinPostSettled)).toEqual([false, false, false, false, false])
  })

  it('keeps only the slugs whose POST did not settle', () => {
    expect(unsettledPins(['a', 'b', 'c', 'd'], [201, 404, 503, null])).toEqual(['c', 'd'])
    expect(unsettledPins(['a', 'b'], [201, 404])).toEqual([])
  })
})
