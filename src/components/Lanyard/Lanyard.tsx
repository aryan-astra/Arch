/* eslint-disable @typescript-eslint/no-explicit-any */
// TypeScript port of the React Bits Lanyard component.
// Source: https://reactbits.dev (vendored verbatim for the JSX + CSS variant,
// then adapted to bind a dynamic CanvasTexture instead of the static GLB map
// so the Arch ID card renders per-student data.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, extend, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from '@react-three/rapier'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import * as THREE from 'three'

import cardGLB from '../../assets/lanyard/card.glb'
import lanyardTexture from '../../assets/lanyard/lanyard.png'
import { useCardTexture } from './useCardTexture'
import type { CardData, CardState, CardTheme } from './cardTextureDrawer'
import './Lanyard.css'

extend({ MeshLineGeometry, MeshLineMaterial })

export type LanyardProps = {
  position?: [number, number, number]
  gravity?: [number, number, number]
  fov?: number
  transparent?: boolean
  state?: CardState
  data?: CardData
  theme?: CardTheme
}

export default function Lanyard({
  position = [0, 0, 30],
  gravity = [0, -40, 0],
  fov = 20,
  transparent = true,
  state = 'blank',
  data = {},
  theme,
}: LanyardProps) {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const cardTexture = useCardTexture(state, data, theme)

  return (
    <div className="lanyard-wrapper">
      <Canvas
        camera={{ position, fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
      >
        <ambientLight intensity={Math.PI} />
        <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          <Band isMobile={isMobile} cardTexture={cardTexture} />
        </Physics>
        <Environment blur={0.75}>
          <Lightformer
            intensity={2}
            color="white"
            position={[0, -1, 5]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={10}
            color="white"
            position={[-10, 0, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 10, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  )
}



type BandProps = {
  maxSpeed?: number
  minSpeed?: number
  isMobile?: boolean
  cardTexture?: THREE.Texture | null
}

function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false, cardTexture }: BandProps) {
  const band = useRef<any>(null)
  const fixed = useRef<RapierRigidBody | null>(null)
  const j1 = useRef<RapierRigidBody | null>(null)
  const j2 = useRef<RapierRigidBody | null>(null)
  const j3 = useRef<RapierRigidBody | null>(null)
  const card = useRef<RapierRigidBody | null>(null)

  const vec = useMemo(() => new THREE.Vector3(), [])
  const ang = useMemo(() => new THREE.Vector3(), [])
  const rot = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  const segmentProps = {
    type: 'dynamic' as const,
    canSleep: true,
    colliders: false as const,
    angularDamping: 4,
    linearDamping: 4,
  }

  const { nodes, materials } = useGLTF(cardGLB) as any
  const bandTexture = useTexture(lanyardTexture)
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
  )
  const [dragged, drag] = useState<false | THREE.Vector3>(false)
  const [hovered, hover] = useState(false)

  useRopeJoint(fixed as any, j1 as any, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1 as any, j2 as any, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2 as any, j3 as any, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3 as any, card as any, [
    [0, 0, 0],
    [0, 1.5, 0],
  ])

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab'
      return () => {
        document.body.style.cursor = 'auto'
      }
    }
  }, [hovered, dragged])

  useFrame((state, delta) => {
    if (dragged && card.current) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
      ;[card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp())
      card.current.setNextKinematicTranslation({
        x: vec.x - (dragged as THREE.Vector3).x,
        y: vec.y - (dragged as THREE.Vector3).y,
        z: vec.z - (dragged as THREE.Vector3).z,
      })
    }
    if (fixed.current && j1.current && j2.current && j3.current && card.current && band.current) {
      ;[j1, j2].forEach(ref => {
        const current = ref.current as any
        if (!current.lerped) current.lerped = new THREE.Vector3().copy(current.translation())
        const clampedDistance = Math.max(
          0.1,
          Math.min(1, current.lerped.distanceTo(current.translation())),
        )
        current.lerped.lerp(
          current.translation(),
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)),
        )
      })
      curve.points[0].copy(j3.current.translation() as any)
      curve.points[1].copy((j2.current as any).lerped)
      curve.points[2].copy((j1.current as any).lerped)
      curve.points[3].copy(fixed.current.translation() as any)
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32))
      ang.copy(card.current.angvel() as any)
      rot.copy(card.current.rotation() as any)
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, true)
    }
  })

  // Three.js requires us to flip a few flags on mutable refs returned from
  // hooks. We do it inside an effect so the eslint react-compiler immutability
  // rule does not flag it as a render-time write.
  useEffect(() => {
    /* eslint-disable react-hooks/immutability -- three.js objects are owned by
       this component and must be mutated to apply curve/wrap config. */
    curve.curveType = 'chordal'
    bandTexture.wrapS = THREE.RepeatWrapping
    bandTexture.wrapT = THREE.RepeatWrapping
    /* eslint-enable react-hooks/immutability */
  }, [curve, bandTexture])

  // Use the custom canvas card texture so each student sees their own ID card.
  // Falls back to the original card.glb baked texture if the canvas texture
  // hasn't been generated yet (e.g. on first render before the hook fires).
  const baseMap = materials?.base?.map

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={3.0}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e: ThreeEvent<PointerEvent>) => {
              ;(e.target as Element).releasePointerCapture(e.pointerId)
              drag(false)
            }}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              ;(e.target as Element).setPointerCapture(e.pointerId)
              if (card.current) {
                drag(
                  new THREE.Vector3()
                    .copy(e.point)
                    .sub(vec.copy(card.current.translation() as any)),
                )
              }
            }}
          >
            {/* Front face */}
            <mesh geometry={nodes.card.geometry}>
              <meshPhysicalMaterial
                map={cardTexture ?? baseMap}
                map-anisotropy={16}
                clearcoat={isMobile ? 0 : 0.4}
                clearcoatRoughness={0.3}
                roughness={0.55}
                metalness={0.1}
                side={THREE.FrontSide}
              />
            </mesh>
            {/* Back face — plain dark card */}
            <mesh geometry={nodes.card.geometry} position={[0, 0, -0.001]}>
              <meshStandardMaterial
                color="#0a0a12"
                roughness={0.6}
                metalness={0.08}
                side={THREE.BackSide}
              />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap
          map={bandTexture}
          repeat={[-4, 1]}
          lineWidth={1}
        />
      </mesh>
    </>
  )
}
