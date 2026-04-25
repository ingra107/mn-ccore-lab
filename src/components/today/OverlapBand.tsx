// OverlapBand — placeholder for the side-by-side dashed band that renders
// when two meetings collide on the timeline (CD spec — `timeToMin(a.time) <
// timeToMin(b.end)` triggers the band).
//
// Per HANDOFF §2 this component is "not implemented yet, leave as TODO."
// Once Hub MeetingRow exposes `time` + `end` fields the Timeline can detect
// overlap and pass colliding events here for grid layout.
//
// TODO: implement when calendar integration ships time + end on MeetingRow.
//   - Accept `events: TodayEvent[]` (the colliding cluster).
//   - Render a dashed-bordered "⚠ Overlap · N" header band.
//   - Lay out events as a side-by-side grid using grid-template-columns:
//     repeat(N, 1fr).
//   - Forward onDismiss / onNote down to inner EventRow children.

import type { TodayEvent } from './constants'

interface OverlapBandProps {
  events: TodayEvent[]
  onDismiss: (id: string) => void
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
}

export function OverlapBand(_props: OverlapBandProps) {
  // Intentionally returns null — the existing Timeline rendering path renders
  // each meeting individually and does not yet detect overlap. Reintroduce
  // this component when the calendar integration provides start + end times.
  return null
}
