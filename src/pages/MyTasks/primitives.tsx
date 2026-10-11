// Shared inline primitives for the MyTasks page tree:
//   Chip      — re-exported from ui/Chip (P5) with bordered=true default for
//               the MyTasks border-style variant. Callers use filled+bordered
//               for tinted pills and bordered-only for outline pills.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx. Per HANDOFF spec these
// have no dedicated file — they sit alongside the rest of MyTasks/ because
// Card / LaneRow / ListRow / InlineDetail / TaskDrawer all import them.

import { INK_MUTED } from './constants'
import { Chip as UiChip, type ChipProps } from '../../components/ui/Chip'

// MyTasks Chip: always bordered (the distinct variant vs today/TaskRow's filled-only).
// filled defaults to false (border-only outline); callers pass filled for tinted pills.
export function Chip({ color = INK_MUTED, filled = false, ...rest }: ChipProps) {
  return <UiChip color={color} filled={filled} bordered={true} {...rest} />
}
