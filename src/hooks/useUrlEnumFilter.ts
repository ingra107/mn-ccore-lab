// useUrlEnumFilter — one URL-backed filter whose value is one of a fixed set (#125).
//
// Projects.tsx carried two line-for-line copies of this (`?category=` and
// `?status=`), and ManuscriptsPage a third shape of it. The contract:
//   - the value is read from the query string; anything that is not a valid key
//     (or is absent) reads as `defaultKey`, so a stale or hand-edited link cannot
//     put the page in a state no tab represents;
//   - choosing the default CLEARS the param instead of writing it, so the bare URL
//     stays the default view and a shared link carries only what differs;
//   - it writes with `replace`, so toggling a filter does not stack history entries,
//     and it keeps every other param (`?filter=stalled`, `?open=`, ...).

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useUrlEnumFilter(
  param: string,
  validKeys: ReadonlySet<string>,
  defaultKey: string,
): [active: string, set: (next: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(param)
  const active = raw && validKeys.has(raw) ? raw : defaultKey
  const set = useCallback((next: string) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next && next !== defaultKey) out.set(param, next)
      else out.delete(param)
      return out
    }, { replace: true })
  }, [setSearchParams, param, defaultKey])
  return [active, set]
}
