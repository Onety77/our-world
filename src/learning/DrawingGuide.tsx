export function DrawingGuide({ lesson }: { lesson: string }) {
  const number = Number(lesson.split('-')[1])
  return (
    <figure className="clearing-drawing-guide">
      <svg
        viewBox="0 0 500 130"
        role="img"
        aria-label={`A worked shape guide for drawing study ${number}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {number === 1 ? (
          <>
            <path d="M45 92L155 30" strokeDasharray="4 7" opacity=".4" />
            <path d="M290 93L413 30" />
            <circle cx="45" cy="92" r="3" fill="currentColor" />
            <circle cx="155" cy="30" r="3" fill="currentColor" />
            <circle cx="290" cy="93" r="3" fill="currentColor" />
            <circle cx="413" cy="30" r="3" fill="currentColor" />
            <path d="M210 64h30m-8-7 8 7-8 7" opacity=".4" />
          </>
        ) : number === 2 ? (
          <>
            <ellipse cx="95" cy="63" rx="52" ry="30" />
            <ellipse cx="96" cy="65" rx="50" ry="32" opacity=".35" />
            <ellipse cx="250" cy="65" rx="32" ry="45" />
            <ellipse cx="251" cy="64" rx="34" ry="44" opacity=".35" />
            <ellipse cx="400" cy="65" rx="50" ry="16" />
            <path d="M43 63h104m71 2h64m68 0h100" opacity=".25" strokeDasharray="4 7" />
          </>
        ) : number === 3 ? (
          <>
            <path d="M80 110Q112 64 165 20M85 102Q67 25 165 20Q184 88 85 102Z" />
            <path d="m103 79-9-32m24 10 23 0m-5-13 3-16" opacity=".6" />
            <path d="M308 111Q354 76 410 27M320 103Q307 29 410 27Q416 99 320 103Z" />
            <path d="m343 84-10-32m31 14 27 8" opacity=".6" />
          </>
        ) : number === 4 ? (
          <>
            <ellipse cx="112" cy="32" rx="43" ry="13" />
            <path d="M69 32v61q43 24 86 0V32m0 12c54-6 53 53 0 40" />
            <ellipse cx="337" cy="32" rx="43" ry="13" />
            <path d="M294 32v61q43 24 86 0V32m0 12c54-6 53 53 0 40M302 44v39m6-38v43m6-40v44" />
            <path d="M260 115h167" opacity=".25" />
          </>
        ) : number === 5 ? (
          <>
            <circle cx="104" cy="67" r="40" />
            <path d="m48 14 16 16m-27-3 22 10m-9-34 14 19" opacity=".5" />
            <ellipse cx="352" cy="108" rx="62" ry="10" opacity=".4" />
            <circle cx="337" cy="64" r="40" />
            <path
              d="M351 26q42 37-9 77m-1-79q42 36-9 79m-1-79q42 36-9 76m-1-72q35 31-11 64"
              opacity=".45"
            />
          </>
        ) : (
          <>
            <ellipse cx="113" cy="85" rx="31" ry="30" opacity=".5" />
            <circle cx="113" cy="40" r="25" opacity=".5" />
            <path d="m87 27-12 36 19-10m43-27 13 36-20-10M95 82l-1 30m36-30 1 30m13-25q26-28 13-34" />
            <ellipse cx="352" cy="82" rx="32" ry="30" />
            <path d="M326 53q-12-41 23-39t30 42m-53-34-16 35 19-4m44-28 13 34-17-6m-35 30-2 31m35-30 2 31m15-25q26-28 13-34" />
            <ellipse cx="351" cy="48" rx="15" ry="10" />
            <circle cx="340" cy="35" r="2" fill="currentColor" />
            <circle cx="362" cy="35" r="2" fill="currentColor" />
            <path d="m348 44 4 3 4-3" />
          </>
        )}
      </svg>
      <figcaption>
        {number === 1
          ? 'Rehearse the direction → make one stroke.'
          : number === 2
            ? 'Change the shape. Keep the movement flowing.'
            : number === 3
              ? 'A centre line gives the leaf its direction.'
              : number === 4
                ? 'The curved rim makes a flat outline feel round.'
                : number === 5
                  ? 'Keep the light side open. Build the shadow gradually.'
                  : 'Simple shapes first. A little personality after.'}
      </figcaption>
    </figure>
  )
}
