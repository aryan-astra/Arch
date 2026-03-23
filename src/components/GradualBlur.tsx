import { useMemo } from "react"
import type { ReactNode } from "react";
import type { CSSProperties } from "react"

type BlurPosition = "top" | "bottom" | "left" | "right"

type GradualBlurProps = {
  position?: BlurPosition
  strength?: number
  height?: string
  width?: string
  divCount?: number
  exponential?: boolean
  zIndex?: number
  opacity?: number
  curve?: "linear" | "bezier" | "ease-in" | "ease-out" | "ease-in-out"
  target?: "parent" | "page"
  className?: string
  style?: CSSProperties
}

const CURVES: Record<NonNullable<GradualBlurProps["curve"]>, (p: number) => number> = {
  linear: (p) => p,
  bezier: (p) => p * p * (3 - 2 * p),
  "ease-in": (p) => p * p,
  "ease-out": (p) => 1 - (1 - p) * (1 - p),
  "ease-in-out": (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2),
}

function gradientDirection(position: BlurPosition): string {
  if (position === "top") return "to top"
  if (position === "left") return "to left"
  if (position === "right") return "to right"
  return "to bottom";
}

export function GradualBlur({
  position = "bottom",
  strength = 1.5,
  height = "7rem",
  width,
  divCount = 3,
  exponential = true,
  zIndex = 8,
  opacity = 0.8,
  curve = "bezier",
  target = "parent",
  className = "",
  style,
}: GradualBlurProps) {
  const layers = useMemo(() => {
    const list: ReactNode[] = []
    const dir = gradientDirection(position)
    const curveFn = CURVES[curve]

    for (let i = 1; i <= divCount; i += 1) {
      const rawProgress = i / divCount
      const progress = curveFn(rawProgress)
      const blur = exponential
        ? Math.pow(2, progress * 3.7) * 0.075 * strength
        : (0.12 + progress * 0.9) * strength

      const segment = 100 / divCount
      const start = Math.max(0, (i - 1) * segment)
      const mid = Math.min(100, i * segment)
      const end = Math.min(100, (i + 1) * segment)

      list.push(
        <div
          key={`gradual-blur-layer-${i}`}
          className="gradual-blur-layer"
          style={{
            opacity,
            backdropFilter: `blur(${blur.toFixed(3)}rem)`,
            WebkitBackdropFilter: `blur(${blur.toFixed(3)}rem)`,
            maskImage: `linear-gradient(${dir}, transparent ${start}%, black ${mid}%, transparent ${end}%)`,
            WebkitMaskImage: `linear-gradient(${dir}, transparent ${start}%, black ${mid}%, transparent ${end}%)`,
          }}
        />,
      )
    }

    return list;
  }, [curve, divCount, exponential, opacity, position, strength])

  const baseStyle: CSSProperties = {
    position: target === "page" ? "fixed" : "absolute",
    pointerEvents: "none",
    inset: "auto",
    zIndex,
    ...style,
  }

  if (position === "top" || position === "bottom") {
    baseStyle[position] = 0
    baseStyle.left = 0
    baseStyle.right = 0
    baseStyle.height = height;
    baseStyle.width = width ?? "100%"
  } else {
    baseStyle[position] = 0
    baseStyle.top = 0
    baseStyle.bottom = 0
    baseStyle.width = width ?? height
    baseStyle.height = "100%"
  }

  return (
    <div className={`gradual-blur gradual-blur-${position} ${className}`.trim()} style={baseStyle}>
      {layers}
    </div>
  )
}
