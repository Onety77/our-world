import { CompanionDog } from '@/sections/clearing/CompanionDog'
import { useData } from '@/data/provider'
import { useLearning } from '@/learning/store'
import { companionStage } from '@/learning/model'

export function ClearingLandmark() {
  const me=useData().me
  const friend=useLearning(s=>s.garden.companions[me])
  return (
    <group>
      <group position={[0.7, 0.04, 1]} scale={2.2}>
        <CompanionDog coat={friend?.coat} level={companionStage(friend).level} />
      </group>
      <mesh position={[-1.8, 0.9, -0.7]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.3, 0.4, 1.8, 7]} />
        <meshStandardMaterial color="#88745b" />
      </mesh>
      <mesh position={[-1.8, 1.9, -0.7]} rotation={[0, 0.2, 0.05]}>
        <cylinderGeometry args={[1.5, 1.7, 0.25, 12]} />
        <meshStandardMaterial color="#9b8568" />
      </mesh>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[-1.8 + x * 0.38, 2.07, -0.7]} rotation={[0, 0.2, x * 0.12]}>
          <boxGeometry args={[0.75, 0.05, 0.95]} />
          <meshStandardMaterial color="#ecdfc5" />
        </mesh>
      ))}
      {[
        [-3, -1],
        [2, -2],
        [-2, 2],
        [3, 1],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.08, z]} scale={[0.7, 0.17, 0.5]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#93957c" />
        </mesh>
      ))}
    </group>
  )
}
