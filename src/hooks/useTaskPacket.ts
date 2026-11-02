import { useQuery } from '@tanstack/react-query'
import type { PacketPayload } from '../components/today/PacketBlock'

export const packetQueryKey = (taskId: string) => ['task-packet', taskId] as const

async function fetchPacket(taskId: string): Promise<PacketPayload> {
  const res = await fetch(`/api/tasks/${taskId}/packet`)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  return res.json() as Promise<PacketPayload>
}

/** The task's packet view, shared by PacketBlock and the drawer (one query per task). */
export function useTaskPacket(taskId: string) {
  return useQuery({ queryKey: packetQueryKey(taskId), queryFn: () => fetchPacket(taskId), staleTime: 30 * 1000, retry: false })
}
