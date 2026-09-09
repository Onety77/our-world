import { useData } from '@/data/provider'
import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Object3D } from 'three'
import { groundHeight } from '@/systems/terrain'
import { useSceneEnv } from '@/world/SceneEnv'
import { Grass } from '@/world/Grass'
import { Trees } from '@/world/Trees'
import { companionStage } from '@/learning/model'
import { useLearning, greetCompanion } from '@/learning/store'
import { CompanionDog } from './CompanionDog'

export default function Clearing() {
  const { palette, grassCount } = useSceneEnv(),
    data = useData()
  const garden = useLearning((s) => s.garden),
    coat = useLearning((s) => s.coat)
  const view = useLearning((s) => s.view),
    size = useThree((s) => s.size)
  const narrow = size.width < 540
  const friend = garden.companions[data.me],
    stage = companionStage(friend)
  const aspect = size.width / size.height
  const dogX = narrow
    ? 240
    : 240 + 2.5 * aspect * Math.min(1.5, 1 + Math.max(0, 1.6 / aspect - 1) * 0.18)
  const target = useMemo(() => {
    const object = new Object3D()
    object.position.set(240, groundHeight(240, 0), 0)
    return object
  }, [])
  const last = garden.practices[0]?.at ?? friend?.adoptedAt ?? Date.now()
  return (
    <>
      <ambientLight color="#e7dfca" intensity={1.4} />
      <primitive object={target} />
      <directionalLight
        position={[244, groundHeight(240, 0) + 9, 6]}
        target={target}
        color="#fff0d2"
        intensity={2.5}
      />
      <pointLight
        position={[dogX, groundHeight(dogX, 1) + 4, 4]}
        color="#ffe4b8"
        intensity={24}
        distance={12}
        decay={2}
      />
      <Grass palette={palette} count={Math.min(grassCount, 18000)} />
      <Trees
        palette={palette}
        seed="clearing-birches"
        centre={[240, 0]}
        count={45}
        innerRadius={15}
        outerRadius={43}
        openings={[Math.PI / 2]}
        gapWidth={1.6}
        heights={[5, 11]}
      />
      <group
        position={[dogX, groundHeight(dogX, 1), 1]}
        rotation={[0, -0.23, 0]}
        scale={1.75}
        visible={!narrow || view === 'home'}
        onClick={(e) => {
          e.stopPropagation()
          greetCompanion()
        }}
      >
        <CompanionDog
          coat={view === 'adopt' ? coat : (friend?.coat ?? coat)}
          level={stage.level}
          sleepy={Date.now() - last > 4 * 86400000}
        />
        <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.15, 0.85, 1]}>
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color="#273629" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <mesh position={[-0.85, 0.12, 0.5]}>
          <sphereGeometry args={[0.12, 12, 10]} />
          <meshStandardMaterial color="#bc735b" roughness={1} />
        </mesh>
      </group>
      <group position={[242.4, groundHeight(242.4, -2), -2]} rotation={[0, -0.12, 0]}>
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[2.9, 0.16, 0.7]} />
          <meshStandardMaterial color="#83745c" roughness={1} />
        </mesh>
        {[-1, 1].map((x) => (
          <mesh key={x} position={[x, 0.29, 0]} rotation={[0, 0, x * 0.08]}>
            <boxGeometry args={[0.2, 0.6, 0.5]} />
            <meshStandardMaterial color="#70624f" />
          </mesh>
        ))}
        <group position={[-0.4, 0.75, 0.05]} rotation={[0, 0.25, 0]}>
          {[-1, 1].map((x) => (
            <mesh key={x} position={[x * 0.21, 0, 0]} rotation={[0, 0, x * 0.1]}>
              <boxGeometry args={[0.42, 0.025, 0.52]} />
              <meshStandardMaterial color="#e7dac1" />
            </mesh>
          ))}
        </group>
      </group>
      {Array.from({ length: 9 }, (_, i) => {
        const x = 238.5 + Math.sin(i * 0.75) * 0.45,
          z = 2.5 - i * 0.8
        return (
          <mesh
            key={i}
            position={[x, groundHeight(x, z) + 0.02, z]}
            scale={[0.42, 0.075, 0.28]}
            rotation={[0, i, 0]}
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color={i % 2 ? '#8e927a' : '#a2a18b'} roughness={1} />
          </mesh>
        )
      })}
    </>
  )
}
