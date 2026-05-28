// api/summary.js
// Proxies Sportradar sport event summary — match stats

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const SR_KEY  = process.env.VITE_SPORTRADAR_KEY
  const SR_BASE = 'https://api.sportradar.com/tennis/trial/v3/en'

  if (!SR_KEY) return res.status(500).json({ error: 'SPORTRADAR_KEY not configured' })

  const { id } = req.query
  if (!id || !id.startsWith('sr:sport_event:')) {
    return res.status(400).json({ error: 'Invalid match ID' })
  }

  try {
    const url = `${SR_BASE}/sport_events/${id}/summary.json`
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
    return res.status(500).json({ error: err.message })
  }
}
