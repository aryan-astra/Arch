import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

export interface NavTabItem {
  key: string
  title: string
  icon: LucideIcon
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
          return (
            <motion.button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              animate={{
                gap: isSelected ? 6 : 0,
                paddingLeft: isSelected ? 16 : 10,
                paddingRight: isSelected ? 16 : 10,
              }}
              transition={transition}
              className={`expandable-nav-btn${isSelected ? " active" : ""}`}
              aria-label={tab.title}
              aria-current={isSelected ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={isSelected ? 2.5 : 2} />
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
