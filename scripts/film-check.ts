/**
 * Telling one film file from another, without reading either of them.
 *
 * ---------------------------------------------------------------------------
 * The whole of "our own film" rests on one question — *are these two files the
 * same file?* — and on getting it wrong in only one direction. A false **no**
 * is a nuisance: it offers a nudge nobody needed. A false **yes** is the bug
 * this feature exists to avoid, because it means two people are told they are
 * watching the same thing while one of them is four minutes ahead, and nothing
 * on either screen ever says why.
 *
 * It is asked of three megabytes out of four gigabytes, so the interesting
 * case is not "two different films" — those differ in every byte and in their
 * size. It is **two rips of the same film**, which can share a great deal:
 * the same container defaults, the same leading black, the same trailing
 * padding. That is what the middle slice is for, and there is a check below
 * that fails if it is ever removed.
 *
 *   npm run film
 * ---------------------------------------------------------------------------
 */

/*
  A browser's storage, in eight lines, because `savedOffset` reaches for it at
  module scope-adjacent depth and Node has none. Nothing here is testing
  localStorage; it is testing what is put in it.
*/
const kept = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => void kept.set(k, String(v)),
  removeItem: (k: string) => void kept.delete(k),
  clear: () => kept.clear(),
  key: () => null,
  get length() { return kept.size },
} as Storage

const {
  endsIn,
  filmId,
  fingerprint,
  isFilm,
  offsetWords,
  printIn,
  putOffset,
  savedOffset,
  sizeIn,
  titleFromName,
  whyItWontOpen,
} = await import('../src/systems/film')

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const MB = 1024 * 1024

/** Bytes that look like a file rather than a run of zeroes. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  let h = seed >>> 0
  for (let i = 0; i < length; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    out[i] = h >>> 24
  }
  return out
}

const film = (parts: Uint8Array[], name = 'film.mp4') =>
  new File(parts as unknown as BlobPart[], name, { type: 'video/mp4' })

console.log('\nwhich film, as a string the anchor can carry\n')

{
  const id = filmId('abc-123')
  ok('a film id says it is one', isFilm(id), id)
  ok('and gives its fingerprint back', printIn(id) === 'abc-123', String(printIn(id)))
  /*
    The one collision that would matter. A YouTube id is eleven characters of
    `[\w-]` and can never contain a colon, so the two namespaces cannot meet —
    but this is the assertion that keeps that true if the mark ever changes.
  */
  ok('an eleven-character video id is not a film', !isFilm('dQw4w9WgXcQ'))
  ok('and neither is nothing', !isFilm(null) && printIn(null) === null)
  ok('nor a plain word', !isFilm('film') && printIn('film') === null)
}

console.log('\nare these two files the same file\n')

{
  const head = noise(2 * MB, 1)
  const middle = noise(2 * MB, 2)
  const tail = noise(2 * MB, 3)

  const one = await fingerprint(film([head, middle, tail]))
  const same = await fingerprint(film([head, middle, tail], 'renamed.mp4'))
  ok('the same bytes are the same film', one === same, `${one}\n          ${same}`)
  ok('a different name is not a different film', one === same)

  /*
    **The middle slice earns its place here.**

    These two share their first two megabytes and their last two, and are the
    same size to the byte — the shape two encodes of one film really do take
    when they share a container's defaults and its padding. Read only the ends
    and they are indistinguishable.
  */
  const otherCut = await fingerprint(film([head, noise(2 * MB, 99), tail]))
  ok('two files that differ only in the middle are different films',
    one !== otherCut, `${one}\n          ${otherCut}`)

  const shorter = await fingerprint(film([head, middle, tail.slice(0, MB)]))
  ok('a different length is a different film', one !== shorter)

  const size = 6 * MB
  ok('the fingerprint carries the exact byte count', sizeIn(one) === size,
    `${sizeIn(one)} of ${size}`)
  ok('and a fingerprint from nowhere carries nothing', sizeIn('nonsense') === 0)

  /* Small files are hashed whole; the slice arithmetic must not fall over. */
  const tiny = await fingerprint(film([noise(64, 7)]))
  const tinyToo = await fingerprint(film([noise(64, 7)]))
  const tinyOther = await fingerprint(film([noise(64, 8)]))
  ok('a file smaller than the slices still fingerprints', tiny === tinyToo, tiny)
  ok('and still tells itself from another', tiny !== tinyOther)
  ok('an empty file does not throw', (await fingerprint(film([]))).length > 0)
}

console.log('\nwill it open at all\n')

{
  const wont = (name: string) => whyItWontOpen(new File([], name))
  ok('an .mkv is refused before it is put on', wont('The.Client.mkv') !== null)
  ok('and says what to do about it', /\.mp4/.test(wont('a.mkv') ?? ''), String(wont('a.mkv')))
  ok('an .avi too', wont('old.avi') !== null)
  ok('and a .wmv', wont('old.wmv') !== null)
  ok('an .mp4 is let through', wont('film.mp4') === null)
  ok('so is an .m4v', wont('film.m4v') === null)
  ok('so is a .webm', wont('film.webm') === null)
  /* QuickTime with H.264 inside plays perfectly well; refusing it would be wrong. */
  ok('and a .mov, which usually plays', wont('film.mov') === null)
  ok('the extension is read case-blind', wont('FILM.MKV') !== null)
  ok('a name with no extension is not refused on a guess', wont('film') === null)

  ok('the extension is the last one', endsIn('a.b.mp4') === 'mp4', endsIn('a.b.mp4'))
  ok('and a dotfile has none', endsIn('.hidden') === '', endsIn('.hidden'))
}

console.log('\nwhat to call it\n')

{
  ok('a release name becomes something readable',
    titleFromName('The.Client.1996.720p.BluRay.x264-GROUP.mp4')
      === 'The Client 1996 720p BluRay x264-GROUP',
    titleFromName('The.Client.1996.720p.BluRay.x264-GROUP.mp4'))
  ok('underscores go too', titleFromName('Blue_Ruin_1080p.mp4') === 'Blue Ruin 1080p')
  ok('a name that is already a name is left alone',
    titleFromName('Public Enemies.mp4') === 'Public Enemies')
  /*
    A degenerate name has no good answer, only a bad one to avoid: empty. What
    it returns for `.mp4` is "mp4", which is not a title and is at least a
    label — an empty string would leave the queue with a row you cannot read.
  */
  ok('and a file called nothing much still gets a name',
    titleFromName('.mp4').trim() !== '', titleFromName('.mp4'))
  ok('nor does a name of only separators come back blank',
    titleFromName('..__..mp4').trim() !== '', titleFromName('..__..mp4'))
}

console.log('\nlining two copies up\n')

{
  ok('no offset says so in words', offsetWords(0) === 'lined up', offsetWords(0))
  ok('seconds read as seconds', offsetWords(4) === '+4s', offsetWords(4))
  ok('and behind reads as behind', offsetWords(-4) === '−4s', offsetWords(-4))
  ok('past a minute it says minutes', offsetWords(83) === '+1m 23s', offsetWords(83))
  ok('either way', offsetWords(-83) === '−1m 23s', offsetWords(-83))

  const print = 'abc-123'
  ok('nothing is remembered to begin with', savedOffset(print) === 0)
  putOffset(print, 4.5)
  ok('a nudge is kept', savedOffset(print) === 4.5, String(savedOffset(print)))
  ok('and it is kept per film', savedOffset('other') === 0)
  /*
    Zero is removed rather than stored. A map that fills up with zeroes for
    every film either of you ever matched perfectly is a map that grows for
    ever and says nothing.
  */
  putOffset(print, 0)
  ok('and putting it back forgets it', savedOffset(print) === 0)
  ok('rather than storing a zero', !(kept.get('garden:film-offset:v1') ?? '').includes(print),
    kept.get('garden:film-offset:v1') ?? '(nothing)')
  ok('a film nobody has nudged reads as lined up', savedOffset(null) === 0)
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} wrong\n`)
process.exit(failed === 0 ? 0 : 1)
