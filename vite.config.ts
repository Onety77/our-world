import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/*
  Files that ship from `public/` and belong in the first-open cache.

  Named one at a time rather than swept from the folder, and that is
  deliberate. `public/` is not a folder of project files: every byte in it is
  copied into `dist/` and deployed. It used to hold four and a third megabytes
  of artwork that nothing referenced — the icon master and three logo plates,
  now in `design/`, which is not part of the build. It still holds the push
  worker, which must never be cached by the other worker.

  A glob would quietly ship, and precache, whatever somebody drops in there
  next. A list cannot.

  `icon-512.png` is left out for the same reason: four hundred kilobytes that
  only an install prompt ever asks for, at a moment when there is a network.
*/
const SHELL_FROM_PUBLIC = [
  '/site.webmanifest',
  '/icons/favicon-32.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
]

/**
 * Writes `dist/sw.js` from `src/sw/worker.js`, with the shell filled in.
 *
 * ---------------------------------------------------------------------------
 * **The shell is every piece of code in the build, and that is a correction
 * that cost the garden a day of not opening at all.**
 *
 * It used to be the *static* import graph of the entry and nothing else — the
 * argument being that the places, the games and the Firebase SDK are
 * deliberately lazy, so precaching them would put every one of those kilobytes
 * back in front of the first frame. The argument was about the wrong thing.
 * Precaching happens after `load`, in the background; it was never in front of
 * anything. And leaving the lazy chunks out had a consequence nobody looked
 * for:
 *
 * 1. A device caches the shell from one deploy.
 * 2. The next deploy renames every chunk whose contents changed, and **the old
 *    names stop being served** — a deployment is a whole new build, not a
 *    patch on the last one.
 * 3. That device opens the world. The worker hands it the cached shell, which
 *    is perfectly intact, and the shell asks for a chunk that no longer
 *    exists anywhere.
 * 4. `import()` rejects. The garden stops at *opening…* and stays there.
 *
 * A shell and the chunks it names are **one thing**. Splitting them across a
 * cache boundary meant a deploy could tear them apart, and the tear was
 * invisible until somebody in another country could not open the door.
 *
 * Media is still excluded — see rule 2 in the worker — and so is anything from
 * `public/` that is not in `SHELL_FROM_PUBLIC`.
 * ---------------------------------------------------------------------------
 */
function gardenWorker(): Plugin {
  const source = fileURLToPath(new URL('./src/sw/worker.js', import.meta.url))

  return {
    name: 'garden-worker',
    apply: 'build',
    // After everything else, so `viteMetadata.importedCss` is populated.
    enforce: 'post',

    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (item) => item.type === 'chunk' && item.isEntry,
      )
      if (!entry || entry.type !== 'chunk') {
        this.error('garden-worker: no entry chunk, so there is no shell to cache.')
        return
      }

      /*
        Every chunk, static or dynamic, plus the stylesheets — and the *only*
        exclusion is media.

        The list is taken from the whole bundle rather than walked from the
        entry, because walking is what let a chunk be left out: any module the
        entry does not statically reach is a module a cached shell could name
        and not have. There is no walk to get wrong now.

        `.woff2` and not `.woff`: `@fontsource` emits both, only one is ever
        fetched, and caching the pair would double the typefaces for nothing.
      */
      const code = Object.keys(bundle).filter(
        (name) =>
          name.endsWith('.js') ||
          name.endsWith('.css') ||
          name.endsWith('.woff2'),
      )

      const shell = ['/index.html', ...code.sort().map((name) => `/${name}`), ...SHELL_FROM_PUBLIC]

      /*
        The version is the shell.

        Not the date, not the git hash, not a number somebody remembers to
        raise — any of those change the worker's bytes when nothing it serves
        has changed, which spends a renewal prompt on a person for no reason.
        This changes when, and only when, the thing being cached is different.
      */
      const version = createHash('sha256').update(shell.join('\n')).digest('hex').slice(0, 12)

      const worker = readFileSync(source, 'utf8')
        .replace('__VERSION__', version)
        .replace('__SHELL__', JSON.stringify(shell, null, 2))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker })

      const weight = shell
        .map((path) => bundle[path.slice(1)])
        .reduce((total, item) => {
          if (!item) return total
          const body = item.type === 'chunk' ? item.code : item.source
          return total + (typeof body === 'string' ? Buffer.byteLength(body) : (body?.length ?? 0))
        }, 0)

      this.info(
        `sw.js · ${version} · ${shell.length} files in the shell · ` +
          `${(weight / 1024).toFixed(0)} KB of build output`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), gardenWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true, // so you can open it on your phone over the LAN
  },
})
