// UnifiedMyTasks — entry-point shim. The implementation lives at
// src/pages/MyTasks/ per HANDOFF "Component extraction." This file re-exports
// the parent so existing imports (`./pages/portal/UnifiedMyTasks`) keep
// working without touching App.tsx.
//
// New code should import from `src/pages/MyTasks` directly.

export { default } from '../MyTasks'
