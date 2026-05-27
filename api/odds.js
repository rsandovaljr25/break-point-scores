// api/odds.js
// Vercel serverless function — proxies The Odds API requests server-side

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const ODDS_KEY  = process.env.VITE_ODDS_API_KEY
  const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports'

  if (!ODDS_KEY) {
    return res.status(500).json({ error: 'ODDS_API_KEY not configured' })
  }

  const { sport } = req.query
  if (!sport) {
    return res.status(400).json({ error: 'Missing sport param' })
  }

  // Only allow tennis sports
  if (!sport.startsWith('tennis_')) {
    return res.status(403).json({ error: 'Only tennis sports allowed' })
  }

  try {
    const url = `${ODDS_BASE}/${sport}/odds/?apiKey=${ODDS_KEY}&regions=us,uk&markets=h2h&oddsFormat=decimal`
    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({ error: `Odds API error ${response.status}` })
    }

    const data = await response.json()

    // Cache for 50 seconds
    res.setHeader('Cache-Control', 's-maxage=50, stale-while-revalidate=10')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Odds proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
