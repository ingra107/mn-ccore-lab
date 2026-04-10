/**
 * Parse "[Carried forward]" prefix from action item descriptions.
 * Returns clean text + flag for badge rendering.
 */
export function parseCarriedForward(description: string): { isCarried: boolean; clean: string } {
  const isCarried = /^\[Carried forward\]\s*/i.test(description)
  const clean = description.replace(/^\[Carried forward\]\s*/i, '')
  return { isCarried, clean }
}
