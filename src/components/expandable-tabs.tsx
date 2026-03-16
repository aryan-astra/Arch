import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

export interface NavTabItem {
  key: string
  title: string
  icon: LucideIcon
  badgeCount?: number
}

interface ExpandableNavProps {
  tabs: NavTabItem[]
  activeKey: string
  onSelect: (key: string) => void
  className?: string
}

const transition = { delay: 0.05, type: "spring" as const, bounce: 0, duration: 0.5 }

export function ExpandableNav({ tabs, activeKey, onSelect }: ExpandableNavProps) {
  return (
    <nav className="expandable-nav" role="navigation" aria-label="Main navigation">
      <div className="expandable-nav-inner">
        {tabs.map((tab) => {
          const isSelected = activeKey === tab.key
          const Icon = tab.icon
          const badgeCount = typeof tab.badgeCount === "number" ? Math.max(0, Math.floor(tab.badgeCount)) : 0
          const showBadge = badgeCount > 0
          const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount)
          return (
            <motion.button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              animate={{
                gap: isSelected ? 6 : 0,
                paddingLeft: isSelected ? 16 : 10,
                paddingRight: isSelected ? (showBadge ? 22 : 16) : (showBadge ? 14 : 10),
              }}
              transition={transition}
              className={`expandable-nav-btn${isSelected ? " active" : ""}${showBadge ? " has-badge" : ""}`}
              aria-label={tab.title}
              aria-current={isSelected ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={isSelected ? 2.5 : 2} />
              {showBadge && (
                <span className="expandable-nav-badge" aria-label={`${badgeCount} notifications`}>
                  {badgeLabel}
                </span>
              )}
              <AnimatePresence initial={false}>
                {isSelected && (
                  <motion.span
                    key="label"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={transition}
                    className="expandable-nav-label"
                  >
                    {tab.title}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
