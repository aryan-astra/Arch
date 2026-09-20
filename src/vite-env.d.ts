/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// .glb assets are not declared by vite/client; declare them here so they can be
// imported as URLs (Vite's `assetsInclude` makes them emitted as static files).
declare module '*.glb' {
  const src: string
  export default src
}
