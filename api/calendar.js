// api/calendar.js - Vercel Serverless Function to proxy & cache ForexFactory XML calendar
let cache = { data: null, timestamp: 0 }
const CACHE_TTL = 15 * 60 * 1000 // 15 min cache in serverless memory

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const now = Date.now()
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return res.status(200).send(cache.data)
  }

  try {
    const ffRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.xml', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml,text/xml,*/*'
      }
    })

    if (!ffRes.ok) {
      throw new Error(`ForexFactory returned HTTP ${ffRes.status}`)
    }

    const xml = await ffRes.text()

    if (xml.includes('<weeklyevents') || xml.includes('<?xml')) {
      cache = { data: xml, timestamp: now }
      return res.status(200).send(xml)
    } else {
      // If rate limited by Cloudflare HTML, serve stale cache or 503
      if (cache.data) {
        return res.status(200).send(cache.data)
      }
      return res.status(503).send('<weeklyevents></weeklyevents>')
    }
  } catch (error) {
    if (cache.data) {
      return res.status(200).send(cache.data)
    }
    return res.status(500).send('<weeklyevents></weeklyevents>')
  }
}
