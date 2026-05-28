// api/scores.js
// Vercel serverless proxy for Sportradar
// Edge cache means parallel requests from client hit cache not the API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const SR_KEY  = process.env.VITE_SPORTRADAR_KEY
  const SR_BASE = 'https://api.sportradar.com/tennis/trial/v3/en'

  if (!SR_KEY) return res.status(500).json({ error: 'SPORTRADAR_KEY not configured' })

  const { endpoint } = req.query
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint param' })

  const allowed = ['schedules/live/summaries', 'schedules/20']
  if (!allowed.some(a => endpoint.startsWith(a))) {
    return res.status(403).json({ error: 'Endpoint not allowed' })
  }

  try {
    const url      = `${SR_BASE}/${endpoint}.json`
    const response = await fetch(url, {
      headers: { 'x-api-key': SR_KEY, 'accept': 'application/json' }
    })

    if (response.status === 429) {
      // Rate limited — return empty but don't error
      res.setHeader('Cache-Control', 's-maxage=10')
      return res.status(200).json({ summaries: [] })
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: `SR error ${response.status}` })
    }

    const data = await response.json()

    // Cache live endpoint for 20s, schedule endpoints for 60s
    const isLive   = endpoint.includes('live')
    const maxAge   = isLive ? 20 : 60
    res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=10`)
    return res.status(200).json(data)

  } catch (err) {
    console.error('Scores proxy error:', err)
    return res.status(200).json({ summaries: [] }) // fail gracefully
  }
}
