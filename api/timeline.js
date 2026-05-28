// api/timeline.js
// Proxies Sportradar sport event timeline — point-by-point history

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const SR_KEY  = process.env.VITE_SPORTRADAR_KEY
  const SR_BASE = 'https://api.sportradar.com/tennis/trial/v3/en'

  if (!SR_KEY) return res.status(500).json({ error: 'SPORTRADAR_KEY not configured' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing match id' })

  // Only allow sr: sport event IDs
  if (!id.startsWith('sr:sport_event:')) {
    return res.status(403).json({ error: 'Invalid match ID format' })
  }

  try {
    const url = `${SR_BASE}/sport_events/${id}/timeline.json`
    const response = await fetch(url, {
      headers: { 'x-api-key': SR_KEY, 'accept': 'application/json' }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: `Sportradar error ${response.status}` })
    }

    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Timeline proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
