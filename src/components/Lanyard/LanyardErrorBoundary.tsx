import { Component, type ReactNode } from 'react'

type Props = {
  fallback: ReactNode
  children: ReactNode
  onError?: (err: unknown) => void
}

type State = { hasError: boolean }

// Catches WebGL / R3F / Rapier initialization failures and substitutes a
// static fallback so the login flow remains usable on low-end devices.
export default class LanyardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(err: unknown) {
    this.props.onError?.(err)
    if (typeof console !== 'undefined') {
      console.warn('[lanyard] WebGL/physics failure; falling back to static card.', err)
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
