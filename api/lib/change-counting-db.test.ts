import { describe, it, expect } from 'vitest'
import { isWriteSql } from './change-counting-db'

describe('isWriteSql', () => {
  it('reads never count', () => {
    for (const sql of [
      'SELECT 1', '  select * from tasks', '-- note\nSELECT 1', '/* c */ SELECT 1',
      'PRAGMA table_info(tasks)', 'EXPLAIN QUERY PLAN SELECT 1', 'VALUES (1)',
      'WITH x AS (SELECT 1) SELECT * FROM x',
    ]) expect(isWriteSql(sql), sql).toBe(false)
  })
  it('writes count, including a WITH that writes', () => {
    for (const sql of [
      "UPDATE tasks SET priority = 'low'", 'INSERT INTO t VALUES (1)', 'INSERT OR IGNORE INTO t VALUES (1)',
      'DELETE FROM t', 'REPLACE INTO t VALUES (1)', '-- c\nUPDATE t SET a = 1',
      'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
    ]) expect(isWriteSql(sql), sql).toBe(true)
  })
})
