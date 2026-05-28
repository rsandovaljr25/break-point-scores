// api/timeline.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const SR_KEY  = process.env.VITE_SPORTRADAR_KEY
  const SR_BASE = 'https://api.sportradar.com/tennis/trial/v3/en'

  if (!SR_KEY) return res.status(500).json({ error: 'SPORTRADAR_KEY not configured' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing match id' })

  try {
    // Sportradar timeline endpoint
    const url = `${SR_BASE}/sport_events/${id}/timeline.json`
    const response = await fetch(url, {
      headers: { 'x-api-key': SR_KEY, 'accept': 'application/json' }
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`Timeline ${response.status} for ${id}:`, text.slice(0,200))
      return res.status(response.status).json({
        error: `Sportradar error ${response.status}`,
        detail: text.slice(0, 200)
      })
    }

    const data = await response.json()

    // Log structure to help debug
    const timeline = data?.timeline ||
                     data?.sport_event_timeline?.timeline ||
                     data?.sport_event_timeline ||
                     []
    const eventTypes = [...new Set(
      (Array.isArray(timeline) ? timeline : []).slice(0,20).map(e => e.type)
    )]
    console.log(`Timeline ${id}: ${Array.isArray(timeline)?timeline.length:0} events, types: ${eventTypes.join(',')}`)
    console.log('Top-level keys:', Object.keys(data).join(', '))

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=10')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Timeline proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
