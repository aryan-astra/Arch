// Type augmentations for the workspace.
//
// This file imports from `@react-three/fiber` so it is treated as a *module*
// file by TypeScript — that is what allows `declare module '@react-three/fiber'`
// to act as an *augmentation* of the package's types rather than replacing them.
// `.glb` ambient declarations live in `vite-env.d.ts` (a script file) because
// asset module wildcards must be declared in an ambient script context.
import type {} from '@react-three/fiber'

// `meshline` ships its own typings but does not declare JSX intrinsics. We
// augment @react-three/fiber's `ThreeElements` interface so the elements
// registered via `extend({ MeshLineGeometry, MeshLineMaterial })` are
// recognized inside JSX.
declare module 'meshline' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const MeshLineGeometry: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const MeshLineMaterial: any
}

declare module '@react-three/fiber' {
  interface ThreeElements {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meshLineGeometry: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meshLineMaterial: any
  }
}
