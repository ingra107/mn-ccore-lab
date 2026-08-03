import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Button } from './ui/Button'
import { isStaleChunkError } from '../lib/lazyRoute'

interface Props { children: ReactNode; pageName?: string }
interface State { hasError: boolean; error: Error | null }

export default class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.pageName || 'Page'} error:`, error, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      // A stale chunk (this tab is running a build that was replaced by a
      // deploy) is the one error class where clearing state CANNOT help:
      // React's lazy() caches the rejected import promise, so re-rendering
      // replays the identical failure. lazyRoute() already tried one automatic
      // reload; reaching here means that did not settle it. Only a reload can
      // recover, so say so plainly and make the button do exactly that.
      const stale = isStaleChunkError(this.state.error)
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: 'var(--ink)', fontWeight: 500 }}>
            {stale ? 'This tab is running an old version' : 'Something went wrong'}
          </h2>
          <p style={{ color: 'var(--slate)', marginTop: 'var(--sp-sm)' }}>
            {stale
              ? 'The Hub was updated while this tab was open. Reload to get the current version.'
              : this.state.error?.message}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              if (stale) { window.location.reload(); return }
              this.setState({ hasError: false, error: null })
            }}
            style={{ marginTop: 'var(--sp-lg)' }}
          >
            {stale ? 'Reload' : 'Try Again'}
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
