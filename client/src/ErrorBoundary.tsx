import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Must be a class component — there is no hook equivalent of
// componentDidCatch, so a render error thrown anywhere below this in the
// tree would otherwise just blank the whole page with no feedback.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in component tree', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="pixel-title text-2xl">Something went wrong</h1>
          <p className="text-sm text-[var(--color-shadow)]/70">
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            type="button"
            className="pixel-btn"
            onClick={() => {
              this.setState({ error: null })
              window.location.href = '/'
            }}
          >
            Back to Home
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
