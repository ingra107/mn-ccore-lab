// The full task editor, loaded on demand. Every caller mounts the panel only
// when a task is open, but a static import still put its ~109 kB chunk on the
// critical path of every page that can open it (Today, My Tasks, Lab Overview,
// Project, Deadlines, Meetings). Import THIS, not ./TaskDetailPanel.
//
// The chunk is fetched when the browser goes idle after the importing page
// loads, so the first open is normally instant; if it is not there yet the
// panel area stays empty for that fetch (its own Suspense, so the page around
// it never blanks). lazyRoute adds the stale-chunk reload.
import { Suspense, type ComponentProps } from 'react'
import { lazyRoute } from '../../lib/lazyRoute'

const load = () => import('./TaskDetailPanel')
const Panel = lazyRoute(load)

if (typeof window !== 'undefined') {
  const prefetch = () => { load().catch(() => { /* lazyRoute handles it on open */ }) }
  if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 4000 })
  else setTimeout(prefetch, 2000)
}

export default function LazyTaskDetailPanel(props: ComponentProps<typeof Panel>) {
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  )
}
