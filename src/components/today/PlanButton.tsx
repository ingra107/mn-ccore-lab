// PlanButton -- the Plan button with its note under it, for a surface that
// places them together: the gold Plan your week row (QuestionsCard). This week
// and Planned today place them apart (button in the header, note under it),
// through usePlanControl.

import { usePlanControl } from '../../hooks/usePlanControl'

export function PlanButton() {
  const { buttonEl, noteEl } = usePlanControl()
  return <>{buttonEl}{noteEl}</>
}
