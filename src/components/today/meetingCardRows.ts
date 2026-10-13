// meetingCardRows -- how a Today meeting card tells TodayPage which tasks it is
// showing, so the task groups can leave them out (each task shows once).
// A plain function through context; the default is a no-op, so a card rendered
// anywhere else (Meetings, tests) registers nothing.

import { createContext } from 'react'

export type RegisterCardRows = (meetingId: string, taskIds: string[]) => void

export const MeetingCardRowsContext = createContext<RegisterCardRows>(() => {})
