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

/*
  A document, in a dozen lines, because `cueNodes` is the one function here
  that touches somebody else's file and turns it into things on a screen. It
  builds nodes rather than assigning markup, and that is exactly the property
  worth a check — so the two constructors it uses are provided and it runs.
*/
class Bit {
  tagName: string | undefined
  textContent = ''
  constructor(tag?: string) { this.tagName = tag }
}
;(globalThis as unknown as { document: Document }).document = {
  createElement: (tag: string) => new Bit(tag.toUpperCase()),
  createTextNode: (t: string) => Object.assign(new Bit(), { textContent: t }),
} as unknown as Document

const {
  cueAt,
  cueNodes,
  endsIn,
  filmId,
  parseCues,
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


console.log('\nreading somebody else’s subtitle file\n')

{
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:04,500',
    'Hello there.',
    '',
    '2',
    '00:00:05,000 --> 00:00:07,000',
    'Two lines,',
    'like this.',
    '',
  ].join('\n')
  const cues = parseCues(srt)
  ok('a plain SubRip file reads', cues.length === 2, String(cues.length))
  ok('with the times in seconds', cues[0].from === 1 && cues[0].to === 4.5,
    JSON.stringify(cues[0]))
  ok('and a two-line cue stays two lines',
    cues[1].text === 'Two lines,\nlike this.', JSON.stringify(cues[1].text))

  /*
    WebVTT is the same file with full stops instead of commas and a header. It
    is accepted as-is rather than converted, because nothing is ever handed
    back to the browser as a file — the cues are drawn by this app.
  */
  const vtt = ['WEBVTT', '', '00:00:02.000 --> 00:00:03.000', 'From a vtt.', ''].join('\n')
  const fromVtt = parseCues(vtt)
  ok('a WebVTT file reads too', fromVtt.length === 1, String(fromVtt.length))
  ok('and its header is not a cue', fromVtt[0].text === 'From a vtt.', JSON.stringify(fromVtt))

  /* Windows line endings and a byte-order mark are the normal state of these. */
  const dos = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nCRLF.\r\n\r\n'
  const fromDos = parseCues(dos)
  ok('carriage returns do not become part of the words',
    fromDos.length === 1 && fromDos[0].text === 'CRLF.', JSON.stringify(fromDos))

  /* Cue numbers are optional, and files in the wild are inconsistent about them. */
  const unnumbered = '00:00:01,000 --> 00:00:02,000\nNo number.\n'
  ok('a cue with no number still reads',
    parseCues(unnumbered).length === 1, JSON.stringify(parseCues(unnumbered)))

  const oneDigitHour = '1\n0:00:09,500 --> 0:00:11,000\nShort hour.\n'
  ok('and an hour written with one digit', parseCues(oneDigitHour).length === 1)

  /* Nothing usable must come back as nothing, never as a broken cue. */
  ok('an empty file has no cues', parseCues('').length === 0)
  ok('and a file of prose has none either',
    parseCues('this is just some text\nwith no times in it').length === 0)
  ok('a cue that ends before it starts is dropped',
    parseCues('1\n00:00:05,000 --> 00:00:02,000\nBackwards.\n').length === 0)
  ok('and one with no words is dropped',
    parseCues('1\n00:00:01,000 --> 00:00:02,000\n\n').length === 0)

  /* Out of order in the file, in order in memory — the reader walks forward. */
  const jumbled = [
    '00:00:09,000 --> 00:00:10,000', 'Second.', '',
    '00:00:01,000 --> 00:00:02,000', 'First.', '',
  ].join('\n')
  const sorted = parseCues(jumbled)
  ok('cues out of order are put in order',
    sorted[0].text === 'First.' && sorted[1].text === 'Second.', JSON.stringify(sorted))
}

console.log('\nfinding the line for this moment\n')

{
  const cues = parseCues([
    '00:00:01,000 --> 00:00:02,000', 'one', '',
    '00:00:04,000 --> 00:00:06,000', 'two', '',
    '00:00:08,000 --> 00:00:09,000', 'three', '',
  ].join('\n'))

  ok('nothing before the first line', cueAt(cues, 0) === -1, String(cueAt(cues, 0)))
  ok('the first line while it is on', cueAt(cues, 1.5) === 0, String(cueAt(cues, 1.5)))
  ok('nothing in the gap after it', cueAt(cues, 3) === -1, String(cueAt(cues, 3)))
  ok('the second line while it is on', cueAt(cues, 5) === 1, String(cueAt(cues, 5)))
  ok('and nothing after the last', cueAt(cues, 20) === -1, String(cueAt(cues, 20)))

  /*
    The hint is where it was last frame, which is what makes this two
    comparisons rather than a search — and it has to survive being wrong,
    because a scrub can move the film anywhere between one frame and the next.
  */
  ok('a stale hint from ahead still finds the line', cueAt(cues, 1.5, 2) === 0,
    String(cueAt(cues, 1.5, 2)))
  ok('a stale hint from behind does too', cueAt(cues, 8.5, 0) === 2,
    String(cueAt(cues, 8.5, 0)))
  ok('a hint past the end does not throw', cueAt(cues, 5, 99) === 1,
    String(cueAt(cues, 5, 99)))
  ok('and no cues at all is simply nothing', cueAt([], 5) === -1)
}

console.log('\nand it is drawn, never interpreted\n')

{
  /*
    A subtitle file is somebody else's file, and the one thing this must never
    do is treat what is in it as markup. Every piece becomes a text node or an
    `<em>` — so the check is that a tag in the file arrives as *nothing*, and
    that the words around it survive.
  */
  const text = (nodes: ReturnType<typeof cueNodes>) =>
    nodes.map((n) => n.textContent ?? '').join('')

  ok('plain words come through', text(cueNodes('Hello there.')) === 'Hello there.')

  const italic = cueNodes('He said <i>quietly</i> now')
  ok('italics survive as an element',
    italic.some((n) => (n as Element).tagName === 'EM'),
    italic.map((n) => (n as Element).tagName ?? '#text').join(','))
  ok('and their words are not lost',
    text(italic) === 'He said quietly now', text(italic))

  const font = cueNodes('<font color="#ff0000">Red</font> and plain')
  ok('a font tag is dropped, not shown', text(font) === 'Red and plain', text(font))
  ok('and leaves no element behind',
    font.every((n) => (n as Element).tagName === undefined || (n as Element).tagName === 'EM'),
    font.map((n) => (n as Element).tagName ?? '#text').join(','))

  const nasty = cueNodes('before <script>alert(1)</script> after')
  ok('a script tag is a tag like any other, and is dropped',
    !text(nasty).includes('<script'), text(nasty))
  ok('and nothing in the file becomes an element of its own',
    nasty.every((n) => (n as Element).tagName === undefined),
    nasty.map((n) => (n as Element).tagName ?? '#text').join(','))

  ok('positioning braces are dropped',
    text(cueNodes('{\\an8}Up top')) === 'Up top', text(cueNodes('{\\an8}Up top')))
  ok('and a line break is left alone',
    text(cueNodes('one\ntwo')) === 'one\ntwo', JSON.stringify(text(cueNodes('one\ntwo'))))
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} wrong\n`)
process.exit(failed === 0 ? 0 : 1)
