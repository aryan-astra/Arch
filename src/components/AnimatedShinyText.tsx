import type { CSSProperties, ReactNode } from "react"

type AnimatedShinyTextProps = {
  children: ReactNode
  className?: string
  shimmerWidth?: number
}

export function AnimatedShinyText({
  children,
  className = "",
  shimmerWidth = 92,
}: AnimatedShinyTextProps) {
  return (
    <span
      style={{ "--shiny-width": `${shimmerWidth}px` } as CSSProperties}
      className={`animated-shiny-text ${className}`.trim()}
    >
      <span className="animated-shiny-text-base">{children}</span>
      <span className="animated-shiny-text-shine" aria-hidden="true">{children}</span>
    </span>
  )
}
