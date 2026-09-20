import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  drawCardTexture,
  drawCardBackTexture,
  type CardData,
  type CardState,
  type CardTheme,
  DEFAULT_THEME,
} from './cardTextureDrawer'
import archLogoUrl from '../../assets/final-arch-logo.svg'
// Builds and updates a THREE.CanvasTexture from card data. The same texture
// instance is reused across renders so we can bind it once into the GLB and
// flip its needsUpdate flag when content changes.
//
// When state === 'filling', we run a short typewriter-style RAF loop that
// re-draws every frame with a growing reveal fraction so the data appears to
// "develop" on the card surface.
export function useCardTexture(state: CardState, data: CardData, theme: CardTheme = DEFAULT_THEME) {
  // Pre-load the Arch logo image once so the card texture can draw it.
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const img = new Image()
    img.src = archLogoUrl as string
    img.onload = () => setLogoImg(img)
  }, [])

  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null
    return document.createElement('canvas')
  }, [])

  const texture = useMemo(() => {
    if (!canvas) return null
    const t = new THREE.CanvasTexture(canvas)
    t.anisotropy = 16
    t.colorSpace = THREE.SRGBColorSpace
    // GLTF UVs assume flipY=false. CanvasTexture defaults to flipY=true (the
    // 2D canvas convention). Match the GLB to render right-side up on the card.
    t.flipY = false
    return t
  }, [canvas])

  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (!canvas || !texture) return
    const cancelExisting = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    cancelExisting()

    if (state === 'filling') {
      startRef.current = performance.now()
      const FILL_MS = 1100
      const tick = () => {
        const elapsed = performance.now() - startRef.current
        const p = Math.min(1, elapsed / FILL_MS)
        drawCardTexture(canvas, 'filling', data, theme, p, logoImg)
        texture.needsUpdate = true
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          // Settle on the static 'ready' render.
          drawCardTexture(canvas, 'ready', data, theme, 1, logoImg)
          texture.needsUpdate = true
          rafRef.current = null
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      drawCardTexture(canvas, state, data, theme, 1, logoImg)
      // THREE.Texture requires `.needsUpdate = true` to flush canvas-2D writes
      // into the GPU; this is the documented r3f/three pattern.
      // eslint-disable-next-line react-hooks/immutability
      texture.needsUpdate = true
    }

    return cancelExisting
  }, [canvas, texture, state, data, theme, logoImg])

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  return texture
}

// Returns a back-face texture: the actual photo loaded via TextureLoader
// (bypassing canvas), with a canvas-drawn fallback shown while it loads.
export function useCardBackTexture(): THREE.Texture | null {
  const [photoTex, setPhotoTex] = useState<THREE.Texture | null>(null)

  // Canvas fallback — drawn immediately, visible until photo loads.
  const fallbackTex = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    const t = new THREE.CanvasTexture(canvas)
    t.anisotropy = 16
    t.colorSpace = THREE.SRGBColorSpace
    t.flipY = false
    drawCardBackTexture(canvas, null)
    t.needsUpdate = true
    return t
  }, [])

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    // Cache-bust so a previously cached 404 doesn't block loading.
    loader.load(
      `/card-back-note.png?v=${Date.now()}`,
      (t) => {
        t.flipY = false
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 16
        t.needsUpdate = true
        setPhotoTex(t)
      },
      undefined,
      () => { /* silently keep fallback on error */ },
    )
  }, [])

  // Dispose textures when they are replaced or on unmount.
  useEffect(() => () => { photoTex?.dispose() }, [photoTex])
  useEffect(() => () => { fallbackTex?.dispose() }, [fallbackTex])

  return photoTex ?? fallbackTex
}
