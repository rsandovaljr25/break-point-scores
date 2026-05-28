// api/scores.js
// Vercel serverless function — proxies Sportradar requests server-side

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const SR_KEY  = process.env.VITE_SPORTRADAR_KEY
  const SR_BASE = 'https://api.sportradar.com/tennis/trial/v3/en'

  if (!SR_KEY) {
    return res.status(500).json({ error: 'SPORTRADAR_KEY not configured' })
  }

  const { endpoint } = req.query
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint param' })
  }

  const allowed = ['schedules/live/summaries', 'schedules/']
  const isAllowed = allowed.some(a => endpoint.startsWith(a))
  if (!isAllowed) {
    return res.status(403).json({ error: 'Endpoint not allowed' })
  }

  try {
    const url = `${SR_BASE}/${endpoint}.json`
    const response = await fetch(url, {
      headers: {
        'x-api-key': SR_KEY,
        'accept':    'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({
        error: `Sportradar error ${response.status}`,
        detail: text.slice(0, 200),
      })
    }

    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=10')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Sportradar proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
