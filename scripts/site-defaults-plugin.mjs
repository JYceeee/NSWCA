// `npm run dev` only: Page Config › Save as site defaults posts the current settings here, and they are
// written into the project: src/data/siteDefaults.json and the uploaded images in public/defaults/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

export function siteDefaults() {
  return {
    name: 'site-defaults',
    apply: 'serve',
    // The open tab already has these settings: hot-reloading the store under it would break the page.
    handleHotUpdate({ file }) {
      if (file.endsWith('src/data/siteDefaults.json')) return []
    },
    configureServer(server) {
      server.middlewares.use('/__site-defaults', (req, res) => {
        if (req.method !== 'POST') return (res.statusCode = 405), res.end()
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            const { state, assets } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const dir = resolve(server.config.root, 'public/defaults')
            rmSync(dir, { recursive: true, force: true })
            mkdirSync(dir, { recursive: true })
            const files = {}
            for (const a of assets) {
              if (!/^[\w-]{1,64}$/.test(a.id)) throw new Error('Bad file id')
              const ext = extname(a.name).replace(/[^.A-Za-z0-9]/g, '').toLowerCase()
              writeFileSync(resolve(dir, a.id + ext), Buffer.from(a.data, 'base64'))
              files[a.id] = `defaults/${a.id}${ext}`
            }
            writeFileSync(resolve(server.config.root, 'src/data/siteDefaults.json'), JSON.stringify({ ...state, assets: files }, null, 2) + '\n')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, files: assets.length }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      })
    },
  }
}
