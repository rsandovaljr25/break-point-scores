// api/scores.js
// Vercel serverless proxy for Sportradar Tennis v3
// Trial API: /schedules/live/summaries returns ALL matches (live + today's results + upcoming)
// Date-based endpoints return empty on trial tier — use live summaries only

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
      res.setHeader('Cache-Control', 's-maxage=10')
      return res.status(200).json({ summaries: [] })
    }

    if (!response.ok) {
      return res.status(200).json({ summaries: [] })
    }

    const data = await response.json()
    // Cache live endpoint 20s, date endpoints 60s
    const maxAge = endpoint.includes('live') ? 20 : 60
    res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=10`)
    return res.status(200).json(data)

  } catch (err) {
    return res.status(200).json({ summaries: [] })
  }
}
