import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Coat } from '@/learning/model'
import { useLearning } from '@/learning/store'

const FUR = {
  honey: ['#bd8956', '#805438', '#eed8ad'],
  ink: ['#52535b', '#31343e', '#c8bdad'],
  cloud: ['#ded8ca', '#a59a8c', '#f0e8d7'],
}
function Pebble({
  at,
  scale,
  colour,
  rotation = [0, 0, 0],
}: {
  at: [number, number, number]
  scale: [number, number, number]
  colour: string
  rotation?: [number, number, number]
}) {
  return (
    <mesh position={at} scale={scale} rotation={rotation} castShadow>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={colour} roughness={0.96} />
    </mesh>
  )
}

/** Rounded, weight-bearing forms. The ears and tail pivot from their roots. */
export function CompanionDog({
  coat = 'honey',
  level = 0,
  sleepy = false,
}: {
  coat?: Coat
  level?: number
  sleepy?: boolean
}) {
  const body = useRef<Group>(null),
    head = useRef<Group>(null),
    tail = useRef<Group>(null),
    ears = useRef<Group>(null)
  const [fur, dark, cream] = FUR[coat]
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  useFrame(({ clock }) => {
    if (!head.current || !tail.current || !body.current || !ears.current) return
    const t = clock.elapsedTime,
      happy = Math.max(0, 1 - (performance.now() - useLearning.getState().greeting) / 4500)
    const motion = reduced ? 0 : 1
    head.current.rotation.z = (Math.sin(t * 0.65) * 0.055 + happy * -0.17) * motion
    head.current.rotation.x = sleepy && happy === 0 ? 0.16 : -0.04
    tail.current.rotation.z = Math.sin(t * (happy > 0 ? 17 : 3.2)) * (0.12 + happy * 0.5) * motion
    ears.current.rotation.x = Math.sin(t * 2.2) * 0.025 * motion
    body.current.position.y = Math.sin(t * 1.8) * 0.012 * motion
  })
  return (
    <group scale={0.78 + level * 0.075}>
      <group ref={body}>
        <Pebble at={[0, 0.76, -0.15]} scale={[0.44, 0.55, 0.64]} colour={fur} />
        <Pebble at={[0, 0.82, 0.38]} scale={[0.31, 0.41, 0.19]} colour={cream} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Pebble at={[side * 0.39, 0.35, -0.35]} scale={[0.27, 0.32, 0.35]} colour={fur} />
            <Pebble
              at={[side * 0.27, 0.39, 0.33]}
              scale={[0.13, 0.37, 0.16]}
              colour={fur}
              rotation={[0, 0, side * -0.06]}
            />
            <Pebble at={[side * 0.28, 0.095, 0.42]} scale={[0.19, 0.1, 0.25]} colour={cream} />
            <Pebble at={[side * 0.48, 0.1, -0.17]} scale={[0.21, 0.11, 0.27]} colour={fur} />
          </group>
        ))}
        <group ref={head} position={[0, 1.34, 0.35]}>
          <Pebble at={[0, 0, 0]} scale={[0.46, 0.43, 0.4]} colour={fur} />
          <Pebble at={[0, -0.18, 0.34]} scale={[0.3, 0.22, 0.27]} colour={cream} />
          <Pebble at={[0, -0.11, 0.565]} scale={[0.11, 0.072, 0.062]} colour="#302c2a" />
          <Pebble at={[0, -0.31, 0.42]} scale={[0.09, 0.035, 0.06]} colour={dark} />
          {[-1, 1].map((side) => (
            <group key={side}>
              <Pebble
                at={[side * 0.225, 0.03, 0.341]}
                scale={[0.063, sleepy ? 0.031 : 0.076, 0.039]}
                colour="#292927"
              />
              {!sleepy && (
                <Pebble
                  at={[side * 0.21, 0.055, 0.373]}
                  scale={[0.017, 0.019, 0.008]}
                  colour="#fff4dc"
                />
              )}
              <Pebble
                at={[side * 0.235, 0.17, 0.3]}
                scale={[0.105, 0.035, 0.035]}
                colour={cream}
                rotation={[0, 0, side * -0.16]}
              />
            </group>
          ))}
          <group ref={ears}>
            {[-1, 1].map((side) => (
              <Pebble
                key={side}
                at={[side * 0.43, -0.09, -0.045]}
                scale={[0.16, 0.39, 0.19]}
                rotation={[0.06, 0, side * 0.21]}
                colour={dark}
              />
            ))}
          </group>
        </group>
        <mesh position={[0, 1.02, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.29, 0.027, 6, 24]} />
          <meshStandardMaterial color="#879b86" />
        </mesh>
        <Pebble at={[0, 0.96, 0.48]} scale={[0.06, 0.07, 0.024]} colour="#d7b778" />
        {level > 0 && (
          <mesh position={[0, 0.92, 0.58]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.12, 0.23, 3, 1]} />
            <meshStandardMaterial
              color={level === 1 ? '#879c88' : level === 2 ? '#bfa36d' : '#95b5b0'}
              roughness={1}
            />
          </mesh>
        )}
        <group ref={tail} position={[0.3, 0.43, -0.65]} rotation={[0.4, 0, 0]}>
          <Pebble
            at={[0.18, 0.24, -0.05]}
            scale={[0.12, 0.38, 0.13]}
            colour={fur}
            rotation={[0, 0, -0.55]}
          />
          <Pebble at={[0.35, 0.48, -0.05]} scale={[0.13, 0.14, 0.13]} colour={cream} />
        </group>
      </group>
    </group>
  )
}
