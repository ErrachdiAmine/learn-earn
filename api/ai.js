// api/ai.js - Vercel Serverless Function for NVIDIA NIM Cloud API in production
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.VITE_NVIDIA_API_KEY || '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'
  const baseUrl = process.env.VITE_NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1'

  try {
    const { messages, model, temperature, max_tokens, stream } = req.body

    const nvidiaRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'meta/llama-3.2-11b-vision-instruct',
        messages,
        temperature: temperature || 0.6,
        max_tokens: max_tokens || 2048,
        stream: stream ?? true
      })
    })

    if (!nvidiaRes.ok) {
      const err = await nvidiaRes.json().catch(() => ({}))
      return res.status(nvidiaRes.status).json({ error: err.error?.message || nvidiaRes.statusText })
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')

      const reader = nvidiaRes.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(decoder.decode(value, { stream: true }))
        if (typeof res.flush === 'function') res.flush()
      }
      res.end()
      return
    }

    const data = await nvidiaRes.json()
    return res.status(200).json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
