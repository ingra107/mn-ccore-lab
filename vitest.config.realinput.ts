import { defineConfig } from 'vitest/config'
import base from './vitest.config'
import { REAL_INPUT_TESTS } from './vitest.realInputTests'

// Why these run apart: vitest.realInputTests.ts.
export default defineConfig({
  ...base,
  test: { ...base.test, include: REAL_INPUT_TESTS, exclude: [], fileParallelism: false },
})
