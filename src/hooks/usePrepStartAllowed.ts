import { useLauncherInstalled } from './useLauncherInstalled'
import { useAuth } from './useAuth'

/** True when this browser may show Prep & start at all (PI + launcher), so a
 *  caller can skip a wrapper that would hold nothing. */
export function usePrepStartAllowed(): boolean {
  const [launcherInstalled] = useLauncherInstalled()
  const { user } = useAuth()
  return launcherInstalled && !!user?.isPi
}
