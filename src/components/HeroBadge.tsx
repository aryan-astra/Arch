import { motion, useAnimation, type Variants } from "framer-motion"
import type { ReactNode } from "react"

const EASE = [0.16, 1, 0.3, 1] as const

interface HeroBadgeProps {
  href?: string
  text: string
  icon?: ReactNode
  endIcon?: ReactNode
  variant?: "default" | "outline" | "ghost"
  size?: "sm" | "md" | "lg"
  className?: string
  onClick?: () => void
  highlighted?: boolean
}

const variantClass: Record<NonNullable<HeroBadgeProps["variant"]>, string> = {
  default: "hero-badge--default",
  outline: "hero-badge--outline",
  ghost: "hero-badge--ghost",
}

const sizeClass: Record<NonNullable<HeroBadgeProps["size"]>, string> = {
  sm: "hero-badge--sm",
  md: "hero-badge--md",
  lg: "hero-badge--lg",
}

const iconAnimationVariants: Variants = {
  initial: { rotate: 0 },
  hover: { rotate: -10 },
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

export function HeroBadge({
  href,
  text,
  icon,
  endIcon,
  variant = "default",
  size = "md",
  className,
  onClick,
  highlighted = false,
}: HeroBadgeProps) {
  const controls = useAnimation()
  const badge = (
    <motion.span
      className={cx(
        "hero-badge",
        variantClass[variant],
        sizeClass[size],
        highlighted && "hero-badge--highlighted",
        className,
      )}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
      onHoverStart={() => {
        void controls.start("hover")
      }}
      onHoverEnd={() => {
        void controls.start("initial")
      }}
    >
      {icon ? (
        <motion.span
          className="hero-badge-icon"
          variants={iconAnimationVariants}
          initial="initial"
          animate={controls}
          transition={{ type: "spring", stiffness: 300, damping: 10 }}
        >
          {icon}
        </motion.span>
      ) : null}
      <span className="hero-badge-text">{text}</span>
      {endIcon ? <span className="hero-badge-end-icon">{endIcon}</span> : null}
    </motion.span>
  )

  if (href) {
    return (
      <a className="hero-badge-wrap" href={href}>
        {badge}
      </a>
    )
  }

  return (
    <button className="hero-badge-wrap hero-badge-btn" type="button" onClick={onClick}>
      {badge}
    </button>
  )
}

