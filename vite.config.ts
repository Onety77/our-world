import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/*
  Files that ship from `public/` and belong in the first-open cache.

  Named one at a time rather than swept from the folder, and that is
  deliberate: `public/` also holds `icons/garden-icon-master.png` at a megabyte
  and a half, three logo plates at about a megabyte each, and the push worker,
  which must never be cached by the other worker. A glob would quietly put four
  megabytes of artwork in front of the first frame the day somebody adds a
  picture to that folder. Everything not listed here is still cached — just on
  the first day it is actually wanted.

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
 * **The shell is exactly the static import graph of the entry, and nothing
 * else.** Vite already splits the places, the games, the admin page and the
 * Firebase SDK behind dynamic imports so they are not in front of the first
 * frame; walking `imports` and never `dynamicImports` is what keeps that true
 * on this side too. If somebody makes a section eager, this list grows by
 * itself and the precache grows with it — which is the correct failure, and
 * visible in the line the build prints.
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

      const scripts = new Set<string>()
      const styles = new Set<string>()

      const walk = (fileName: string) => {
        if (scripts.has(fileName)) return
        const chunk = bundle[fileName]
        if (!chunk || chunk.type !== 'chunk') return
        scripts.add(fileName)
        for (const css of chunk.viteMetadata?.importedCss ?? []) styles.add(css)
        // `imports` only. A dynamic import is a thing the garden fetches when
        // somebody walks into it, and it is cached then.
        for (const next of chunk.imports) walk(next)
      }
      walk(entry.fileName)

      /*
        The two typefaces, in the one format worth shipping twice.

        `@fontsource` emits `.woff` beside every `.woff2` for browsers that
        have not needed it in years. Both are in the bundle and only one is
        ever fetched, so caching both would double this for nothing.
      */
      const fonts = Object.keys(bundle).filter((name) => name.endsWith('.woff2'))

      const shell = [
        '/index.html',
        ...[...scripts].sort().map((name) => `/${name}`),
        ...[...styles].sort().map((name) => `/${name}`),
        ...fonts.sort().map((name) => `/${name}`),
        ...SHELL_FROM_PUBLIC,
      ]

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
