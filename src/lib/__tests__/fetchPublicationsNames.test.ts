import { describe, it, expect } from 'vitest'
import { printedName } from '../../../scripts/fetch-publications'

describe('printedName', () => {
  it('prints a name as the paper did, without a degree or suffix', () => {
    expect(printedName({ raw_author_name: 'Nicholas E. Ingraham, MD' })).toBe('Nicholas E. Ingraham')
    expect(printedName({ raw_author_name: 'Smith, John, Jr' })).toBe('John Smith')
    expect(printedName({ raw_author_name: 'MacDonald, D.M.' })).toBe('D.M. MacDonald')
    expect(printedName({ author: { display_name: 'Cluster Name' } })).toBe('Cluster Name')
  })
})
