import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { projects as seedProjects } from '../data/projects'
import { meetings as seedMeetings } from '../data/meetings'
import type { Project, Meeting, ActionItem, ProjectNote } from '../data/types'

const STORAGE_KEY = 'mnccore-data-v1'

interface DataStore {
  projects: Project[]
  meetings: Meeting[]
}

interface DataContextValue {
  projects: Project[]
  meetings: Meeting[]
  updateProject: (slug: string, updates: Partial<Project>) => void
  addProjectNote: (slug: string, note: string, author?: string) => void
  updateMeeting: (meetingId: string, updates: Partial<Meeting>) => void
  addMeeting: (meeting: Meeting) => void
  addActionItem: (meetingId: string, item: ActionItem) => void
  toggleActionItem: (meetingId: string, actionIndex: number) => void
  resetData: () => void
}

function loadFromStorage(): Partial<DataStore> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<DataStore>
  } catch {
    return null
  }
}

function saveToStorage(data: DataStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

function mergeProjects(seed: Project[], overrides?: Project[]): Project[] {
  if (!overrides) return seed
  // Use slug as key. Override fields take precedence over seed.
  const overrideMap = new Map(overrides.map((p) => [p.slug, p]))
  return seed.map((p) => {
    const override = overrideMap.get(p.slug)
    if (!override) return p
    return { ...p, ...override }
  })
}

function mergeMeetings(seed: Meeting[], overrides?: Meeting[]): Meeting[] {
  if (!overrides) return seed
  const overrideMap = new Map(overrides.map((m) => [m.id, m]))
  return seed.map((m) => {
    const override = overrideMap.get(m.id)
    if (!override) return m
    return { ...m, ...override }
  })
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<DataStore>(() => {
    const saved = loadFromStorage()
    return {
      projects: mergeProjects(seedProjects, saved?.projects),
      meetings: mergeMeetings(seedMeetings, saved?.meetings),
    }
  })

  // Persist on change
  useEffect(() => {
    saveToStorage(store)
  }, [store])

  const updateProject = useCallback((slug: string, updates: Partial<Project>) => {
    setStore((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.slug === slug ? { ...p, ...updates } : p
      ),
    }))
  }, [])

  const addProjectNote = useCallback((slug: string, note: string, author?: string) => {
    const newNote: ProjectNote = {
      timestamp: new Date().toISOString(),
      content: note,
      author,
    }
    setStore((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.slug === slug
          ? { ...p, notes: [...(p.notes ?? []), newNote] }
          : p
      ),
    }))
  }, [])

  const updateMeeting = useCallback((meetingId: string, updates: Partial<Meeting>) => {
    setStore((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) =>
        m.id === meetingId ? { ...m, ...updates } : m
      ),
    }))
  }, [])

  const addMeeting = useCallback((meeting: Meeting) => {
    setStore((prev) => ({
      ...prev,
      meetings: [...prev.meetings, meeting],
    }))
  }, [])

  const addActionItem = useCallback((meetingId: string, item: ActionItem) => {
    setStore((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) =>
        m.id === meetingId
          ? { ...m, actionItems: [...(m.actionItems ?? []), item] }
          : m
      ),
    }))
  }, [])

  const toggleActionItem = useCallback((meetingId: string, actionIndex: number) => {
    setStore((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) => {
        if (m.id !== meetingId || !m.actionItems) return m
        return {
          ...m,
          actionItems: m.actionItems.map((a, i) =>
            i === actionIndex ? { ...a, completed: !a.completed } : a
          ),
        }
      }),
    }))
  }, [])

  const resetData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setStore({
      projects: [...seedProjects],
      meetings: [...seedMeetings],
    })
  }, [])

  return (
    <DataContext.Provider
      value={{
        projects: store.projects,
        meetings: store.meetings,
        updateProject,
        addProjectNote,
        updateMeeting,
        addMeeting,
        addActionItem,
        toggleActionItem,
        resetData,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useProjects must be used within DataProvider')
  return {
    projects: ctx.projects,
    updateProject: ctx.updateProject,
    addProjectNote: ctx.addProjectNote,
    resetData: ctx.resetData,
  }
}

export function useMeetings() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useMeetings must be used within DataProvider')
  return {
    meetings: ctx.meetings,
    updateMeeting: ctx.updateMeeting,
    addMeeting: ctx.addMeeting,
    addActionItem: ctx.addActionItem,
    toggleActionItem: ctx.toggleActionItem,
    resetData: ctx.resetData,
  }
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
