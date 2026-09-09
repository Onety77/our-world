import { useId } from 'react'
import type { StageId } from '@/world/games/ember-rally/model'
import { ROAD_INFO } from '@/world/games/ember-rally/courseInfo'

/** Small vector landscapes stay crisp at every size and load with the menu. */
export function TrackArtwork({ stage }: { stage: StageId }) {
  const id = useId().replaceAll(':', '')
  const warm = stage === 'rootway' || stage === 'harmattan'
  const sky =
    stage === 'harmattan'
      ? '#b97c53'
      : stage === 'moonbreak'
        ? '#344e63'
        : stage === 'stormcrown'
          ? '#494861'
          : '#3b302a'
  const accent = ROAD_INFO[stage].accent
  return (
    <svg
      className={`track-artwork ${stage}`}
      viewBox="0 0 1200 660"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor={sky} />
          <stop offset="1" stopColor={warm ? '#352a23' : '#15222d'} />
        </linearGradient>
        <linearGradient id={`${id}-road`} x2="0" y2="1">
          <stop stopColor={warm ? '#ad8669' : '#a5afbb'} />
          <stop offset="1" stopColor={warm ? '#453c36' : '#323f4b'} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor={accent} stopOpacity=".5" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-shade`} x2="0" y2="1">
          <stop stopColor="#090e14" stopOpacity="0" />
          <stop offset="1" stopColor="#090e14" stopOpacity=".8" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h1200v660H0z" />
      <ellipse cx="730" cy="280" rx="450" ry="330" fill={`url(#${id}-glow)`} />
      {stage === 'rootway' ? (
        <>
          <path d="M0 660V0h1200v660h-190V270L850 110H350L190 270v390Z" fill="#171b1b" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d="M175 680V260L355 95h490l180 165v420"
              transform={`translate(${i * 96} ${i * 71}) scale(${1 - i * 0.16})`}
              fill="none"
              stroke={i % 2 ? '#554238' : '#79604a'}
              strokeWidth="26"
            />
          ))}
          <path d="m0 480 310-95 100 275H0m1200-200-325-70-80 270h405" fill="#232727" />
        </>
      ) : stage === 'moonbreak' ? (
        <>
          <circle cx="870" cy="135" r="58" fill="#dce5db" />
          <circle cx="893" cy="116" r="57" fill={sky} />
          <path
            d="M0 380 140 322 240 349 372 276 480 363 713 326 870 363 1055 291 1200 350V660H0Z"
            fill="#263c48"
          />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M${(i % 2) * 60} ${420 + i * 18}h1200`}
              stroke="#b8d9db"
              opacity={0.05 + i * 0.004}
            />
          ))}
          <path
            d="M360 430V264q0-104 85-104t85 104v148m-155 0V266q0-85 70-85t70 85v147"
            fill="none"
            stroke="#83949c"
            strokeWidth="10"
          />
        </>
      ) : stage === 'stormcrown' ? (
        <>
          <path d="M0 460 196 210 312 338 516 80 753 400 940 149 1200 430v230H0" fill="#73717e" />
          <path d="m516 80-90 142 82-34 70 65 45 3Zm424 69-74 114 76-37 48 58" fill="#bbb7c6" />
          <path d="M0 437q210-94 380-27t380-28 440-6v284H0" fill="#303944" />
          <path d="m929 0-61 115 58-20-54 139 105-160-56 14 51-88" fill="#dfd9fa" opacity=".8" />
          {Array.from({ length: 20 }, (_, i) => (
            <path key={i} d={`m${i * 69} ${(i % 4) * 50} -90 280`} stroke="#d4cce4" opacity=".09" />
          ))}
        </>
      ) : (
        <>
          <circle cx="890" cy="155" r="70" fill="#f0c491" opacity=".7" />
          <path d="M0 366q186-138 410 0t400-10 390-21v325H0" fill="#af714d" />
          <path d="M0 470q205-150 474-10t726-50v250H0" fill="#76553d" />
          <path
            d="M276 444 264 247h36l-10 197m-10-188-67-90m63 78 60-91m-56 78-3-107"
            fill="none"
            stroke="#393b2b"
            strokeWidth="20"
          />
          <path d="M158 180q4-64 77-51 42-75 91-10 72-6 79 55-153-20-247 6" fill="#45422d" />
        </>
      )}
      <path
        d="M550 365C760 386 845 416 731 456S496 530 706 660H172C152 531 468 481 595 452S629 403 533 365Z"
        fill={`url(#${id}-road)`}
      />
      <path
        d="M542 367C711 396 766 417 650 457S319 540 436 660"
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeDasharray="22 24"
        opacity=".7"
      />
      {[0, 1, 2, 3].map((i) => (
        <g
          key={i}
          transform={`translate(${stage === 'rootway' ? 290 + i * 78 : 430 + i * 65} ${560 - i * 52}) scale(${1 - i * 0.18})`}
        >
          <path d="M0 0v-68" stroke="#242c2d" strokeWidth="5" />
          <circle cy="-73" r="24" fill={`url(#${id}-glow)`} />
          <path d="M-4-80H4v12H-4z" fill={accent} />
        </g>
      ))}
      <g transform="translate(410 553)">
        <ellipse cy="41" rx="66" ry="13" fill="#11191b" opacity=".7" />
        <path d="m-58 12 13-43h87l17 44v27H-58Z" fill="#252f36" stroke="#909a96" strokeWidth="2" />
        <path d="m-36-22-8 29h90l-11-29Z" fill="#647779" />
        <path d="M-56 20h28m53 0h31" stroke="#ed745b" strokeWidth="6" />
        <path d="M-42 34h84" stroke="#131c22" strokeWidth="7" />
      </g>
      <path fill={`url(#${id}-shade)`} d="M0 0h1200v660H0z" />
    </svg>
  )
}
