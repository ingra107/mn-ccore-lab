import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Button } from './ui/Button'

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
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: 'var(--ink)', fontWeight: 500 }}>Something went wrong</h2>
          <p style={{ color: 'var(--slate)', marginTop: 'var(--sp-sm)' }}>{this.state.error?.message}</p>
          <Button
            variant="primary"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 'var(--sp-lg)' }}
          >
            Try Again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
