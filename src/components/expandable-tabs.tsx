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
  trailing?: React.ReactNode
  onDockDragOver?: (event: React.DragEvent<HTMLDivElement>) => void
  onTabDragOver?: (key: string, event: React.DragEvent<HTMLButtonElement>) => void
  onDockDrop?: (event: React.DragEvent<HTMLDivElement>) => void
  dockDropActive?: boolean
  dockPlaceholderIndex?: number | null
  draggableTabKeys?: string[]
  onTabDragStart?: (key: string, event: React.DragEvent<HTMLButtonElement>) => void
  onTabDragEnd?: (key: string, event: React.DragEvent<HTMLButtonElement>) => void
}

const transition = { delay: 0.05, type: "spring" as const, bounce: 0, duration: 0.5 }

export function ExpandableNav({ tabs, activeKey, onSelect, trailing, onDockDragOver, onTabDragOver, onDockDrop, dockDropActive = false, dockPlaceholderIndex = null, draggableTabKeys = [], onTabDragStart, onTabDragEnd }: ExpandableNavProps) {
  return (
    <nav className="expandable-nav" role="navigation" aria-label="Main navigation">
      <div
        className={`expandable-nav-inner${dockDropActive ? " dock-drop-active" : ""}`}
        onDragOver={onDockDragOver}
        onDrop={onDockDrop}
      >
        {tabs.map((tab, index) => {
          const isSelected = activeKey === tab.key
          const Icon = tab.icon
          const isDraggable = draggableTabKeys.includes(tab.key)
          const badgeCount = typeof tab.badgeCount === "number" ? Math.max(0, Math.floor(tab.badgeCount)) : 0
          const showBadge = badgeCount > 0
          const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount)
          return (
            <div key={tab.key} className="expandable-nav-item-wrap">
              {dockPlaceholderIndex === index ? <span className="expandable-nav-drop-placeholder" aria-hidden="true" /> : null}
              <motion.button
                onClick={() => onSelect(tab.key)}
                draggable={isDraggable}
                onDragStart={isDraggable ? (event) => {
                  if ('dataTransfer' in event) onTabDragStart?.(tab.key, event as unknown as React.DragEvent<HTMLButtonElement>)
                } : undefined}
                onDragOver={isDraggable ? (event) => onTabDragOver?.(tab.key, event) : undefined}
                onDragEnd={isDraggable ? (event) => {
                  if ('dataTransfer' in event) onTabDragEnd?.(tab.key, event as unknown as React.DragEvent<HTMLButtonElement>)
                } : undefined}
                animate={{
                  gap: isSelected ? 6 : 0,
                  paddingLeft: isSelected ? 16 : 10,
                  paddingRight: isSelected ? (showBadge ? 22 : 16) : (showBadge ? 14 : 10),
                }}
                transition={transition}
                className={`expandable-nav-btn${isSelected ? " active" : ""}${showBadge ? " has-badge" : ""}${isDraggable ? " is-draggable" : ""}`}
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
            </div>
          )
        })}
        {dockPlaceholderIndex === tabs.length ? <span className="expandable-nav-drop-placeholder" aria-hidden="true" /> : null}
        {trailing ? <div className="expandable-nav-trailing">{trailing}</div> : null}
      </div>
    </nav>
  )
}
