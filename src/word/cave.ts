/**
 * The Hollow's cave, behind the shared-word page.
 *
 * ---------------------------------------------------------------------------
 * **The same room, not a picture of it.** `world/cave/Cave.tsx` in the garden
 * is a three.js scene, and three.js is most of a megabyte this page has no
 * business making a stranger download to play a word game. So this is that
 * room rebuilt on bare WebGL, from the same numbers:
 *
 *   - the kneaded icosahedron, same radius, same three octaves of hash, same
 *     pressed floor and the same flattening — so the same facets;
 *   - the five hearths against the walls, where the garden puts them, each on
 *     its own flicker, lighting the rock with the garden's own shader (less the
 *     ore, which is earned by the two of you and is nobody else's);
 *   - the stones round each hearth, the flames as the garden's tongues, and the
 *     embers climbing off the two biggest fires;
 *   - the camera's slow drift round the room, and ACES tone mapping with the
 *     garden's exposure so the colours come out the same.
 *
 * A few kilobytes. Drawn at a capped pixel ratio, paused with the tab, and a
 * single still frame for anyone who has asked for less motion. If WebGL is not
 * there at all the page's own dark gradient is what shows.
 * ---------------------------------------------------------------------------
 */

type V3 = [number, number, number]

const ROOM = 14

const HEARTHS: { at: V3; size: number }[] = [
  { at: [9.4, 0.15, 0.6], size: 1 },
  { at: [8.2, 0.15, 3.4], size: 0.68 },
  { at: [-0.9, 0.15, -9.2], size: 0.92 },
  { at: [-3.4, 0.15, -10.4], size: 0.6 },
  { at: [-8.0, 0.15, 5.5], size: 0.75 },
]

const HEAD = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
`

/** three.js's ACES filmic curve and sRGB output, so this matches the garden. */
const OUTPUT = `
  vec3 rrtOdt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 toScreen(vec3 color) {
    mat3 inMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    mat3 outMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= 0.98 / 0.6;
    color = clamp(outMat * rrtOdt(inMat * color), 0.0, 1.0);
    vec3 lo = color * 12.92;
    vec3 hi = pow(color, vec3(0.41666)) * 1.055 - 0.055;
    return mix(hi, lo, step(color, vec3(0.0031308)));
  }
`

const ROCK_VERT = `${HEAD}
  attribute vec3 aPos;
  attribute vec3 aNormal;
  uniform mat4 uViewProj;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vWorld = aPos;
    vNormal = aNormal;
    gl_Position = uViewProj * vec4(aPos, 1.0);
  }
`

const ROCK_FRAG = `${HEAD}
  uniform vec3 uFires[5];
  uniform float uFlickers[5];
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${OUTPUT}
  void main() {
    vec3 rock = vec3(0.23, 0.19, 0.16);
    vec3 fire = vec3(1.0, 0.62, 0.3);
    vec3 n = normalize(vNormal);
    float up = clamp(n.y * -0.5 + 0.5, 0.0, 1.0);
    vec3 col = rock * 0.09 + vec3(0.05, 0.06, 0.09) * up * 0.4;
    for (int i = 0; i < 5; i++) {
      vec3 toFire = uFires[i] - vWorld;
      float d = length(toFire);
      float lambert = clamp(dot(toFire / d, n), 0.0, 1.0);
      float fall = 1.0 / (1.0 + d * d * 0.28);
      col += rock * fire * lambert * fall * 4.6 * uFlickers[i];
    }
    vec3 cell = floor(vWorld * 7.0);
    float g = fract(sin(dot(cell.xy + cell.z, vec2(12.9898, 78.233))) * 43758.5453);
    col *= 0.92 + g * 0.16;
    gl_FragColor = vec4(toScreen(col), 1.0);
  }
`

/* The garden's flame tongues and embers, as camera-facing quads. */
const SPRITE_VERT = `${HEAD}
  attribute vec2 aCorner;
  attribute vec3 aAt;
  /** x phase, y scale, z kind (0 tongue, 1 ember), w the hearth's size or the ember's drift. */
  attribute vec4 aInfo;
  attribute float aClock;
  uniform mat4 uViewProj;
  uniform vec3 uRight;
  uniform vec3 uUp;
  uniform float uTime;
  varying vec2 vUv;
  varying float vLife;
  varying float vKind;
  varying float vLit;
  void main() {
    vUv = aCorner + 0.5;
    vKind = aInfo.z;
    vec3 world;
    if (aInfo.z < 0.5) {
      float time = uTime + aClock;
      float t = fract(time * 0.55 + aInfo.x);
      vLife = sin(t * 3.14159);
      vLit = 1.0;
      float height = 0.85 * aInfo.w;
      float width = 0.5 * aInfo.w;
      float px = aCorner.x * (1.0 - t * 0.55) * aInfo.y * width;
      float py = (aCorner.y + 0.5) * aInfo.y * (height * (0.55 + t));
      px += sin(time * 2.1 + aInfo.x * 9.0) * t * 0.42;
      world = aAt + uRight * px + uUp * py;
    } else if (aInfo.z > 1.5) {
      // A mote in the room's air: rises slowly, turns a little, fades in and out.
      float phase = aInfo.x;
      float t = fract(uTime * 0.03 + phase);
      vLife = t;
      vLit = 1.0;
      vec3 at = vec3(
        sin(uTime * 0.35 + phase * 21.0) * 0.7 + aInfo.w * t * 1.2,
        t * 3.2,
        cos(uTime * 0.29 + phase * 17.0) * 0.7
      );
      float size = 0.07 * aInfo.y;
      world = aAt + at + uRight * aCorner.x * size + uUp * aCorner.y * size;
    } else {
      float phase = aInfo.x;
      vLit = smoothstep(phase - 0.06, phase, 0.72);
      float t = fract(uTime * 0.09 + phase);
      vLife = t;
      float wobble = sin(uTime * 1.7 + phase * 40.0) * (0.2 + t * 0.5);
      vec3 at = vec3(wobble + aInfo.w * t * 2.6, 0.3 + t * 6.5, cos(uTime * 1.3 + phase * 31.0) * (0.15 + t * 0.4));
      float size = 0.05 * (1.0 - t * 0.6);
      world = aAt + at + uRight * aCorner.x * size + uUp * aCorner.y * size;
    }
    gl_Position = uViewProj * vec4(world, 1.0);
  }
`

const SPRITE_FRAG = `${HEAD}
  varying vec2 vUv;
  varying float vLife;
  varying float vKind;
  varying float vLit;
  ${OUTPUT}
  void main() {
    vec3 col;
    float a;
    if (vKind < 0.5) {
      col = mix(vec3(1.0, 0.93, 0.72), vec3(1.0, 0.55, 0.16), clamp(vUv.y * 1.4, 0.0, 1.0));
      float body = 1.0 - smoothstep(0.1, 0.95, abs(vUv.x - 0.5) * 2.0);
      float top = 1.0 - smoothstep(0.35, 1.0, vUv.y);
      a = body * top * vLife * 0.27;
    } else if (vKind > 1.5) {
      float soft = 1.0 - smoothstep(0.1, 0.5, length(vUv - 0.5));
      a = sin(vLife * 3.14159) * soft * 0.55;
      col = vec3(1.0, 0.68, 0.34);
    } else {
      a = (1.0 - vLife) * (1.0 - vLife) * 0.85 * vLit;
      col = mix(vec3(1.0, 0.75, 0.35), vec3(0.8, 0.25, 0.08), vLife);
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(toScreen(col), a);
  }
`

// --- the room's shape ---------------------------------------------------------

/** three.js's icosahedron, subdivided the way `PolyhedronGeometry` does it, on a sphere of `radius`. */
function icosahedron(radius: number, detail: number): V3[] {
  const t = (1 + Math.sqrt(5)) / 2
  const v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1]
  const f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]
  const at = (i: number): V3 => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]
  const lerp = (a: V3, b: V3, s: number): V3 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]
  const out: V3[] = []
  const cols = detail + 1
  for (let k = 0; k < f.length; k += 3) {
    const a = at(f[k])
    const b = at(f[k + 1])
    const c = at(f[k + 2])
    const grid: V3[][] = []
    for (let i = 0; i <= cols; i++) {
      grid[i] = []
      const aj = lerp(a, c, i / cols)
      const bj = lerp(b, c, i / cols)
      const rows = cols - i
      for (let j = 0; j <= rows; j++) grid[i][j] = j === 0 && i === cols ? aj : lerp(aj, bj, j / rows)
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 2 * (cols - i) - 1; j++) {
        const m = Math.floor(j / 2)
        if (j % 2 === 0) out.push(grid[i][m + 1], grid[i + 1][m], grid[i][m])
        else out.push(grid[i][m + 1], grid[i + 1][m + 1], grid[i + 1][m])
      }
    }
  }
  return out.map((p) => {
    const l = Math.hypot(p[0], p[1], p[2])
    return [(p[0] / l) * radius, (p[1] / l) * radius, (p[2] / l) * radius] as V3
  })
}

function bump(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/** Positions and flat normals, pushed into `pos`/`nor`, after `place` has moved each vertex. */
function flat(tris: V3[], place: (p: V3) => V3, normal: (n: V3) => V3, pos: number[], nor: number[]) {
  for (let i = 0; i < tris.length; i += 3) {
    const a = place(tris[i])
    const b = place(tris[i + 1])
    const c = place(tris[i + 2])
    const cb: V3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
    const ab: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    const n = normal([cb[1] * ab[2] - cb[2] * ab[1], cb[2] * ab[0] - cb[0] * ab[2], cb[0] * ab[1] - cb[1] * ab[0]])
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2])
      nor.push(n[0], n[1], n[2])
    }
  }
}

const unit = (n: V3): V3 => {
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / l, n[1] / l, n[2] / l]
}

function buildRoom() {
  const pos: number[] = []
  const nor: number[] = []
  // Kneaded in the garden's own space, then scaled by the mesh's [1, 0.62, 1] —
  // and the normal through the same scale, as `mat3(modelMatrix) * normal` does there.
  flat(
    icosahedron(ROOM, 4),
    ([x0, y0, z0]) => {
      const n = bump(x0 * 0.11, y0 * 0.11, z0 * 0.11) * 2.2 + bump(x0 * 0.31, y0 * 0.31, z0 * 0.31) + bump(x0 * 0.83, y0 * 0.83, z0 * 0.83) * 0.45
      const r = Math.hypot(x0, y0, z0) || 1
      const k = 1 + (n - 1.8) * 0.14
      const x = (x0 / r) * ROOM * k
      let y = (y0 / r) * ROOM * k
      const z = (z0 / r) * ROOM * k
      if (y < 0.4) {
        const under = Math.min(1, (0.4 - y) / (ROOM * 0.6))
        y = y * (1 - under) + (n - 1.8) * 0.22 * under
      }
      return [x, y * 0.62, z]
    },
    /*
      Flipped to face into the room. The garden takes the normal from the
      *unscaled* triangle and then multiplies it by the scale; this one is
      taken from the scaled triangle, whose normal is the unscaled one pushed
      through the inverse scale. So: undo that (×0.62 on y), then do what the
      garden does (×0.62 on y again).
    */
    (n) => {
      const original = unit([n[0], n[1] * 0.62, n[2]])
      return unit([-original[0], -original[1] * 0.62, -original[2]])
    },
    pos,
    nor,
  )
  return { pos, nor }
}

function buildStones() {
  const pos: number[] = []
  const nor: number[] = []
  const shape = icosahedron(1, 1)
  HEARTHS.forEach((hearth, h) => {
    const many = 3 + (h % 2)
    for (let i = 0; i < many; i++) {
      const golden = (h * 5 + i) * 2.399963
      const r = 1.1 + ((i * 37) % 26) / 30
      const s = (0.34 + ((i * 61) % 30) / 60) * hearth.size
      const at: V3 = [hearth.at[0] + Math.cos(golden) * r, s * 0.45, hearth.at[2] + Math.sin(golden) * r]
      const sc: V3 = [s * 1.25, s * (1.0 + ((i * 13) % 10) / 10), s]
      const rot = golden * 2
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      // three: scale, then rotate about y, then translate. Normal: mat3(model) * n.
      const turn = ([x, y, z]: V3): V3 => [x * cos + z * sin, y, -x * sin + z * cos]
      flat(
        shape,
        (p) => {
          const q = turn([p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]])
          return [q[0] + at[0], q[1] + at[1], q[2] + at[2]]
        },
        // The normal from the transformed triangle is already the true face normal.
        unit,
        pos,
        nor,
      )
    }
  })
  return { pos, nor }
}

function buildSprites() {
  const corner: number[] = []
  const at: number[] = []
  const info: number[] = []
  const clock: number[] = []
  const index: number[] = []
  let quads = 0
  const quad = (p: V3, i4: [number, number, number, number], c: number) => {
    const base = quads * 4
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      corner.push(cx, cy)
      at.push(p[0], p[1], p[2])
      info.push(...i4)
      clock.push(c)
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
    quads++
  }
  HEARTHS.forEach((hearth, h) => {
    const own = h * 3.7 + 5
    for (let i = 0; i < 11; i++) quad(hearth.at, [i / 11, 0.5 + ((i * 37) % 11) / 20, 0, hearth.size], own)
  })
  for (const h of [0, 2]) {
    for (let i = 0; i < 54; i++) {
      quad(HEARTHS[h].at, [(i * 0.618034) % 1, 1, 1, ((i * 2654435761) % 200) / 100 - 1], 0)
    }
  }
  /*
    Motes in the air of the room — this page's one addition to the Hollow.

    The garden keeps drifting things out of the middle of the screen because a
    board is drawn there over a live world you are walking round. Here the room
    is only a backdrop, and on a phone held upright the hearths are out of
    shot, so without these the cave's only movement was light. Few, dim, slow,
    and spread through the room rather than streaming off a fire.
  */
  for (let i = 0; i < 44; i++) {
    const angle = i * 2.399963
    const r = 2.2 + ((i * 53) % 60) / 10
    const base: V3 = [Math.cos(angle) * r, 0.1 + ((i * 29) % 30) / 10, Math.sin(angle) * r]
    quad(base, [(i * 0.618034) % 1, 0.6 + ((i * 17) % 9) / 10, 2, ((i * 31) % 20) / 10 - 1], 0)
  }
  return { corner, at, info, clock, index }
}

// --- matrices -------------------------------------------------------------------

function viewProj(eye: V3, target: V3, aspect: number): { m: Float32Array; right: V3; up: V3 } {
  // The garden's 55°, opened out on a phone held upright, where 55° tall is a keyhole across.
  const fov = aspect < 1 ? 55 + (1 - aspect) * 30 : 55
  const f = 1 / Math.tan((fov * Math.PI) / 360)
  const near = 0.1
  const far = 100
  const zAxis = unit([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]])
  const xAxis = unit([zAxis[2], 0, -zAxis[0]])
  const yAxis: V3 = [
    zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1],
    zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2],
    zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0],
  ]
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  // view (column-major)
  const v = [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
  ]
  const p = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]
  const m = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += p[k * 4 + r] * v[c * 4 + k]
      m[c * 4 + r] = s
    }
  }
  return { m, right: xAxis, up: yAxis }
}

// --- drawing ----------------------------------------------------------------------

function program(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram | null {
  const make = (type: number, source: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('cave shader:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const vs = make(gl.VERTEX_SHADER, vert)
  const fs = make(gl.FRAGMENT_SHADER, frag)
  if (!vs || !fs) return null
  const p = gl.createProgram()!
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('cave program:', gl.getProgramInfoLog(p))
    return null
  }
  return p
}

function buffer(gl: WebGLRenderingContext, data: number[], target: number = gl.ARRAY_BUFFER, kind: 'f' | 'i' = 'f') {
  const b = gl.createBuffer()!
  gl.bindBuffer(target, b)
  gl.bufferData(target, kind === 'f' ? new Float32Array(data) : new Uint16Array(data), gl.STATIC_DRAW)
  return b
}

/** Start the cave in `canvas`. Returns a stop function; does nothing without WebGL. */
export function startCave(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power' })
  if (!gl) return () => {}

  const rockProgram = program(gl, ROCK_VERT, ROCK_FRAG)
  const spriteProgram = program(gl, SPRITE_VERT, SPRITE_FRAG)
  if (!rockProgram || !spriteProgram) return () => {}

  const room = buildRoom()
  const stones = buildStones()
  const sprites = buildSprites()

  const rock = {
    aPos: gl.getAttribLocation(rockProgram, 'aPos'),
    aNormal: gl.getAttribLocation(rockProgram, 'aNormal'),
    uViewProj: gl.getUniformLocation(rockProgram, 'uViewProj'),
    uFires: gl.getUniformLocation(rockProgram, 'uFires'),
    uFlickers: gl.getUniformLocation(rockProgram, 'uFlickers'),
  }
  const roomPos = buffer(gl, room.pos)
  const roomNor = buffer(gl, room.nor)
  const stonePos = buffer(gl, stones.pos)
  const stoneNor = buffer(gl, stones.nor)

  const sprite = {
    aCorner: gl.getAttribLocation(spriteProgram, 'aCorner'),
    aAt: gl.getAttribLocation(spriteProgram, 'aAt'),
    aInfo: gl.getAttribLocation(spriteProgram, 'aInfo'),
    aClock: gl.getAttribLocation(spriteProgram, 'aClock'),
    uViewProj: gl.getUniformLocation(spriteProgram, 'uViewProj'),
    uRight: gl.getUniformLocation(spriteProgram, 'uRight'),
    uUp: gl.getUniformLocation(spriteProgram, 'uUp'),
    uTime: gl.getUniformLocation(spriteProgram, 'uTime'),
  }
  const sCorner = buffer(gl, sprites.corner)
  const sAt = buffer(gl, sprites.at)
  const sInfo = buffer(gl, sprites.info)
  const sClock = buffer(gl, sprites.clock)
  const sIndex = buffer(gl, sprites.index, gl.ELEMENT_ARRAY_BUFFER, 'i')

  gl.useProgram(rockProgram)
  gl.uniform3fv(rock.uFires, new Float32Array(HEARTHS.flatMap((h) => h.at)))

  const attrib = (location: number, b: WebGLBuffer, size: number) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
  }

  const flickers = new Float32Array(HEARTHS.length)
  let width = 0
  let height = 0
  const fit = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio))
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio))
    if (w !== width || h !== height) {
      width = canvas.width = w
      height = canvas.height = h
    }
  }

  const draw = (seconds: number) => {
    fit()
    gl.viewport(0, 0, width, height)
    gl.clearColor(10 / 255, 7 / 255, 5 / 255, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // The garden's camera, a touch quicker: the room is all there is to look at here.
    const t = seconds
    const angle = Math.sin(t * 0.07) * 0.35 + Math.PI * 0.75
    const eye: V3 = [Math.cos(angle) * 7.2, 2.4 + Math.sin(t * 0.11) * 0.15, Math.sin(angle) * 7.2]
    const { m, right, up } = viewProj(eye, [0, 1.1, 0], width / height)

    for (let i = 0; i < HEARTHS.length; i++) {
      const own = (t + 3) * (1 + i * 0.17) + i * 2.1
      flickers[i] = (0.82 + Math.sin(own * 7.3) * 0.09 + Math.sin(own * 13.7 + i) * 0.07) * HEARTHS[i].size
    }

    // Rock: the room from inside, then the stones from outside.
    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.enable(gl.CULL_FACE)
    gl.useProgram(rockProgram)
    gl.uniformMatrix4fv(rock.uViewProj, false, m)
    gl.uniform1fv(rock.uFlickers, flickers)
    gl.disableVertexAttribArray(sprite.aInfo)
    gl.disableVertexAttribArray(sprite.aClock)
    attrib(rock.aPos, roomPos, 3)
    attrib(rock.aNormal, roomNor, 3)
    gl.cullFace(gl.FRONT)
    gl.drawArrays(gl.TRIANGLES, 0, room.pos.length / 3)
    attrib(rock.aPos, stonePos, 3)
    attrib(rock.aNormal, stoneNor, 3)
    gl.cullFace(gl.BACK)
    gl.drawArrays(gl.TRIANGLES, 0, stones.pos.length / 3)

    // Flames and embers, added on top of the light that is already there.
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.depthMask(false)
    gl.useProgram(spriteProgram)
    gl.uniformMatrix4fv(sprite.uViewProj, false, m)
    gl.uniform3fv(sprite.uRight, right)
    gl.uniform3fv(sprite.uUp, up)
    gl.uniform1f(sprite.uTime, t)
    attrib(sprite.aCorner, sCorner, 2)
    attrib(sprite.aAt, sAt, 3)
    attrib(sprite.aInfo, sInfo, 4)
    attrib(sprite.aClock, sClock, 1)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sIndex)
    gl.drawElements(gl.TRIANGLES, sprites.index.length, gl.UNSIGNED_SHORT, 0)
    gl.disableVertexAttribArray(sprite.aCorner)
    gl.disableVertexAttribArray(sprite.aAt)
  }

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const start = performance.now() - Math.random() * 20000
  let frame = 0
  let stopped = false
  const tick = (now: number) => {
    if (stopped) return
    draw((now - start) / 1000)
    frame = requestAnimationFrame(tick)
  }
  if (still) {
    draw(12)
    const redraw = () => draw(12)
    window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
  }
  frame = requestAnimationFrame(tick)
  canvas.classList.add('is-lit')
  return () => {
    stopped = true
    cancelAnimationFrame(frame)
  }
}
