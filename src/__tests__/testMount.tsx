// Shared react-dom mount for browser-mode tests (#8637).
//
// The repo carries no testing-library, so every browser-mode test used to
// re-derive the same boilerplate: create a host div, createRoot, poll for a
// selector (React 19 commits asynchronously), track the mounts, unmount and
// remove them in afterEach. Four files carried a near-verbatim copy; this is
// the one copy. A new browser-mode test imports `mount` + calls
// `cleanupMountsAfterEach()` once at file level, and never re-derives this.

import { afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let mounted: { host: HTMLElement; root: Root }[] = []

export interface MountOptions {
  /** Truthy once the tree has committed what the test needs (e.g. `h => h.querySelector('textarea')`). */
  ready: (host: HTMLElement) => unknown
  /** Names what never rendered, for the timeout error. */
  label: string
  /** Host width, for tests that MEASURE layout (scrollHeight vs clientHeight). */
  width?: string
}

/** Mount `node` into a fresh host under document.body and resolve with the host
 *  once `ready(host)` is truthy. Polls up to ~1s; throws naming `label` after that. */
export async function mount(node: ReactElement, opts: MountOptions): Promise<HTMLElement> {
  const host = document.createElement('div')
  if (opts.width) host.style.width = opts.width
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  // React 19 commits asynchronously; poll rather than assume one tick is enough.
  for (let i = 0; i < 100; i++) {
    if (opts.ready(host)) return host
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`${opts.label} never rendered`)
}

/** Unmount + remove every host this module mounted. */
export function unmountAll(): void {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
}

/** Call once at the top level of a test file: registers the afterEach that
 *  tears down every mount from that file's tests. */
export function cleanupMountsAfterEach(): void {
  afterEach(unmountAll)
}
