import { useEffect } from 'react'
import { attachSender, detachSender } from '../lib/clientErrors'

/**
 * Turns on error reporting for a signed-in member (src/lib/clientErrors.ts).
 * Mounted only by RequireAuth, and only once the caller is a confirmed member,
 * so a public page never has a sender. Renders nothing.
 */
export default function ErrorReporterBinding() {
  useEffect(() => {
    attachSender()
    return () => detachSender()
  }, [])
  return null
}
