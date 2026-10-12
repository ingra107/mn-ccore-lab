/**
 * schema-v128: award terms on products (period_start, period_end, amount_usd),
 * each allowed only on the kinds that have it. Driven on the migration-chain
 * database, so the CHECKs here are the CHECKs D1 runs.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'

const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
let db: InstanceType<typeof Database>

function product(id: string, kind: string, stage: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'products', { id, project_id: PROJECT, kind, stage, is_home: 0, ...extra })
}

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'projects', { id: PROJECT, slug: 'k23', title: 'K23', category: 'MNCCORE', status: 'active', stage: 'idea' })
})

describe('schema-v128 award terms', () => {
  it('an award holds a start, an end after it, and an amount', () => {
    product('prd_01KXH4E23G0DTFGFBYS2C8RAAA', 'award', 'active',
      { period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588 })
    const r = db.prepare("SELECT period_start, period_end, amount_usd FROM products WHERE id = 'prd_01KXH4E23G0DTFGFBYS2C8RAAA'").get()
    expect(r).toEqual({ period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588 })
  })

  it('an application holds a proposed start only: no end, no amount', () => {
    product('prd_01KXH4E23G0DTFGFBYS2C8RBBB', 'grant_application', 'preparing', { period_start: '2027-07-01' })
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RBBC', 'grant_application', 'preparing',
      { period_start: '2027-07-01', period_end: '2032-06-30' })).toThrow(/products_period_end_kind/)
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RBBD', 'grant_application', 'preparing',
      { amount_usd: 100 })).toThrow(/products_amount_usd_kind/)
  })

  it.each(['manuscript', 'abstract', 'talk', 'honor', 'trial_ops', 'infrastructure'])('a %s holds none of them', (kind) => {
    const stage = (db.prepare('SELECT stage FROM product_stages WHERE kind = ? ORDER BY ordinal LIMIT 1').get(kind) as { stage: string }).stage
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RCCC', kind, stage, { period_start: '2027-01-01' }))
      .toThrow(/products_period_start_kind/)
  })

  it('an end on or before the start, a bad date and a negative or fractional amount are refused', () => {
    const base = { period_start: '2024-01-01' }
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RDD1', 'award', 'active', { ...base, period_end: '2024-01-01' })).toThrow(/period_end/)
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RDD2', 'award', 'active', { period_start: '2024-13-01' })).toThrow(/period_start/)
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RDD3', 'award', 'active', { period_start: '2024-1-1' })).toThrow(/period_start/)
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RDD4', 'award', 'active', { amount_usd: -1 })).toThrow(/amount_usd/)
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RDD5', 'award', 'active', { amount_usd: 1.5 })).toThrow(/amount_usd/)
    expect(() => product('prd_01KXH4E23G0DTFGFBYS2C8RDD6', 'award', 'active', { period_end: '2025-01-01' })).toThrow(/period_end/)
  })

  it('an award cannot change kind while it holds an end or an amount', () => {
    product('prd_01KXH4E23G0DTFGFBYS2C8REEE', 'award', 'active', { period_start: '2024-01-01', amount_usd: 5 })
    expect(() => db.prepare("UPDATE products SET kind = 'grant_application', stage = 'preparing' WHERE id = 'prd_01KXH4E23G0DTFGFBYS2C8REEE'").run())
      .toThrow(/amount_usd/)
  })

  it('the migration is recorded', () => {
    expect(db.prepare('SELECT filename FROM schema_migrations WHERE version = 128').get())
      .toEqual({ filename: 'schema-v128-product-award-terms.sql' })
  })
})
