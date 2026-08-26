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
          // If rate limited, use stale cache if available
          const stale = getCachedXml()
          if (stale) resolve(stale)
          else reject(new Error('Rate limited and no cache available'))
        }
      })
    })
    req.on('error', reject)
  })
}

function calendarMiddleware() {
  return {
    name: 'calendar-middleware',
    configureServer(server) {
      server.middlewares.use('/api/calendar', async (req, res) => {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        
        // 1. Try fresh cache
        const cached = getCachedXml()
        if (cached) {
          return res.end(cached)
        }
        
        // 2. Fetch upstream
        try {
          const xml = await fetchXmlFromUpstream()
          res.end(xml)
        } catch (err) {
          // 3. Fallback to stale cache or empty XML
          const stale = getCachedXml()
          if (stale) res.end(stale)
          else {
            res.statusCode = 503
            res.end('<weeklyevents></weeklyevents>')
          }
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), calendarMiddleware()],
  root: '.',
  publicDir: 'public',
  build: { outDir: 'dist' },
  server: {
    port: 5180,
    strictPort: true
  }
})
