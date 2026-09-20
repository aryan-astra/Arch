import { useEffect, useRef } from 'react'
import {
  drawCardTexture,
  type CardData,
  type CardState,
  type CardTheme,
  DEFAULT_THEME,
} from './cardTextureDrawer'
import './StaticCardFallback.css'

type Props = {
  state: CardState
  data: CardData
  theme?: CardTheme
}

// Plain DOM/CSS ID card used when WebGL is unavailable, when the user opts out
// via ?nolanyard=1, or when the LanyardErrorBoundary catches a runtime error.
// Renders the same texture-drawer to a visible <canvas>, no physics.
export default function StaticCardFallback({ state, data, theme = DEFAULT_THEME }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cancel = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    cancel()

    if (state === 'filling') {
      const start = performance.now()
      const FILL_MS = 1100
      const tick = () => {
        const elapsed = performance.now() - start
        const p = Math.min(1, elapsed / FILL_MS)
        drawCardTexture(canvas, 'filling', data, theme, p)
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
        else drawCardTexture(canvas, 'ready', data, theme, 1)
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      drawCardTexture(canvas, state, data, theme, 1)
    }
    return cancel
  }, [state, data, theme])

  return (
    <div
      className={`static-card static-card-${state}`}
      data-state={state}
      role="img"
      aria-label={`Student ID card${data.name ? ` for ${data.name}` : ''}`}
    >
      <canvas ref={canvasRef} className="static-card-canvas" />
    </div>
  )
}
