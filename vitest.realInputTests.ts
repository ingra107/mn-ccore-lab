// Tests that drive real browser input (cdp(), userEvent). Each event is a trip through
// vitest's Node process, and beside the other test files one took up to 2.3 s (2026-11-05),
// which turned a swipe into a press-and-hold or ran the test out of time. These files run
// after the main suite, one at a time, in their own process: vitest.config.realinput.ts.
// src/lib/__tests__/realInputTests.test.ts refuses a real-input test left out of this list.
export const REAL_INPUT_TESTS = [
  'src/components/grants/GrantGantt.test.tsx',
  'src/__tests__/color-back-depth.test.tsx',
]
