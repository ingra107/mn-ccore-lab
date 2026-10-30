// Today's "faces only for others" switch, in its own file so skin.tsx exports
// components only (react-refresh).

import { createContext } from 'react'

/** The viewer whose OWN rows show no owner face (Nick 2026-10-30, Today task
 *  rows: "Show faces only for others"). A row someone else owns still shows
 *  theirs. Null, the default, shows every owner face, so only a surface that
 *  provides it (Today) changes; the face slot keeps its width either way, so
 *  every card's right edge still lines up. */
export const HideViewerFaceContext = createContext<string | null>(null)
