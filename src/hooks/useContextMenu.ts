import { useState, useCallback } from 'react'

export interface ContextMenuState {
  isOpen: boolean
  position: { x: number; y: number }
  taskId: string | null
}

const INITIAL_STATE: ContextMenuState = {
  isOpen: false,
  position: { x: 0, y: 0 },
  taskId: null,
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>(INITIAL_STATE)

  const openMenu = useCallback((e: React.MouseEvent, taskId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Calculate position, keeping menu within viewport
    const x = e.clientX
    const y = e.clientY

    setState({ isOpen: true, position: { x, y }, taskId })
  }, [])

  const closeMenu = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return { state, openMenu, closeMenu }
}
