// Public surface for the Lanyard ID-card.
//
// NOTE: `Lanyard` (the heavy R3F + Rapier scene) is intentionally NOT re-
// exported from this barrel — a static re-export here would defeat the
// `React.lazy(() => import('./Lanyard/Lanyard'))` code-splitting set up in
// App.tsx, because Vite would then bundle the entire three/rapier dependency
// graph into the main app chunk. Import it directly from `./Lanyard/Lanyard`
// only at lazy call-sites.
export { default as LanyardErrorBoundary } from './LanyardErrorBoundary'
export { default as StaticCardFallback } from './StaticCardFallback'
export type { CardData, CardState, CardTheme } from './cardTextureDrawer'
export { DEFAULT_THEME } from './cardTextureDrawer'
