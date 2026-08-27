import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import fs from 'fs'
import path from 'path'

const CACHE_FILE = path.join(process.cwd(), 'node_modules/.cache/ff_calendar.xml')
const CACHE_TTL = 30 * 60 * 1000 // 30 min

function getCachedXml() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE)
      if (Date.now() - stats.mtimeMs < CACHE_TTL) {
        return fs.readFileSync(CACHE_FILE, 'utf-8')
      }
    }
  } catch {}
  return null
}

function saveCachedXml(xml) {
  try {
    const dir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_FILE, xml, 'utf-8')
  } catch {}
}

function fetchXmlFromUpstream() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://nfs.faireconomy.media/ff_calendar_thisweek.xml', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (data.includes('<weeklyevents') || data.includes('<?xml')) {
          saveCachedXml(data)
          resolve(data)
        } else {
          const stale = getCachedXml()
          if (stale) resolve(stale)
          else reject(new Error('Rate limited and no cache available'))
        }
      })
    })
    req.on('error', reject)
  })
}

function devMiddlewares() {
  return {
    name: 'dev-middlewares',
    configureServer(server) {
      // Calendar endpoint proxy
      server.middlewares.use('/api/calendar', async (req, res) => {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        
        const cached = getCachedXml()
        if (cached) return res.end(cached)
        
        try {
          const xml = await fetchXmlFromUpstream()
          res.end(xml)
        } catch {
          const stale = getCachedXml()
          if (stale) res.end(stale)
          else {
            res.statusCode = 503
            res.end('<weeklyevents></weeklyevents>')
          }
        }
      })

      // AI endpoint proxy (for testing production mode locally)
      server.middlewares.use('/api/ai', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('Method Not Allowed')
        }

        let bodyStr = ''
        req.on('data', chunk => bodyStr += chunk)
        req.on('end', () => {
          try {
            const body = JSON.parse(bodyStr || '{}')
            const apiKey = process.env.VITE_NVIDIA_API_KEY || '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'
            const payload = JSON.stringify({
              model: body.model || 'meta/llama-3.2-11b-vision-instruct',
              messages: body.messages,
              max_tokens: body.max_tokens || 2048,
              temperature: body.temperature || 0.6,
              stream: true
            })

            const proxyReq = https.request('https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(payload)
              }
            }, (proxyRes) => {
              res.statusCode = proxyRes.statusCode
              res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
              res.setHeader('Cache-Control', 'no-cache, no-transform')
              res.setHeader('Connection', 'keep-alive')
              res.setHeader('X-Accel-Buffering', 'no')
              proxyRes.pipe(res)
            })

            proxyReq.on('error', (err) => {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            })

            proxyReq.write(payload)
            proxyReq.end()
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), devMiddlewares()],
  root: '.',
  publicDir: 'public',
  build: { outDir: 'dist' },
  server: {
    port: 5180,
    strictPort: true
  }
})
