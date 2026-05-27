// src/hooks/useLiveData.js
// ─── Live data layer for Break Point Scores ───────────────────────────────────
// Sportradar Tennis v3 API  →  live scores, match summaries, timelines
// The Odds API              →  live + pre-match odds
//
// Usage:
//   const { matches, oddsData, loading, error, lastUpdated } = useLiveData()
//
// Set your keys in Vercel Environment Variables:
//   VITE_SPORTRADAR_KEY   = your Sportradar Tennis v3 API key
//   VITE_ODDS_API_KEY     = your The Odds API key

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Config ──────────────────────────────────────────────────────────────────
const SR_KEY        = import.meta.env.VITE_SPORTRADAR_KEY   || ''
const ODDS_KEY      = import.meta.env.VITE_ODDS_API_KEY     || ''
const SR_BASE       = 'https://api.sportradar.com/tennis/trial/v3/en'
const ODDS_BASE     = 'https://api.the-odds-api.com/v4/sports'

// How often to poll (ms)
const SCORES_INTERVAL = 30_000   // 30s  — live scores
const ODDS_INTERVAL   = 60_000   // 60s  — odds
const SCHED_INTERVAL  = 300_000  // 5min — scheduled/upcoming

// ─── Sportradar response → our match format ───────────────────────────────────
const transformSRMatch = (summary) => {
  const se     = summary.sport_event
  const status = summary.sport_event_status
  const stats  = summary.statistics

  if (!se || !status) return null

  const competitors = se.competitors || []
  const home        = competitors.find(c => c.qualifier === 'home') || competitors[0] || {}
  const away        = competitors.find(c => c.qualifier === 'away') || competitors[1] || {}

  // Map SR status to our status
  const srStatus = status.status || status.match_status || 'not_started'
  const mappedStatus =
    srStatus === 'live'        ? 'live'      :
    srStatus === 'closed'      ? 'final'     :
    srStatus === 'ended'       ? 'final'     :
    srStatus === 'not_started' ? 'scheduled' : 'scheduled'

  // Build sets array from period scores
  const periods = status.period_scores || []
  const sets = periods.map(p => ({
    h: p.home_score || 0,
    a: p.away_score || 0,
  }))

  // Current game state
  const gameState = mappedStatus === 'live' ? {
    homeScore: status.home_game_score  || 0,
    awayScore: status.away_game_score  || 0,
    serving:   status.serving_competitor === home.id ? 'home' : 'away',
    lastPoint: null,
  } : null

  // Sets won
  const homeSets = sets.filter(s => s.h > s.a).length
  const awaySets = sets.filter(s => s.a > s.h).length

  // Tournament level detection
  const competition = se.sport_event_context?.competition || {}
  const level       = competition.level || ''
  const tourLevel   =
    level === 'grand_slam'      ? 'Grand Slam'   :
    level === 'atp_1000'        ? 'Masters 1000' :
    level === 'wta_1000'        ? 'WTA 1000'     :
    level === 'atp_500'         ? 'ATP 500'      :
    level === 'wta_500'         ? 'WTA 500'      :
    level === 'atp_250'         ? 'ATP 250'      :
    level === 'wta_250'         ? 'WTA 250'      :
    level.includes('challenger')? 'Challenger'   : 'ATP 250'

  const compName = competition.name || 'Unknown Tournament'
  const tour     = competition.gender === 'women' ? 'WTA' : 'ATP'

  // Surface
  const venue   = se.venue || {}
  const surface =
    venue.reduced_name?.toLowerCase().includes('clay')  ? 'Clay'  :
    venue.reduced_name?.toLowerCase().includes('grass') ? 'Grass' :
    venue.reduced_name?.toLowerCase().includes('hard')  ? 'Hard'  : 'Hard'

  // Stats
  let matchStats = null
  if (stats && mappedStatus === 'live') {
    const h = stats.totals?.competitors?.find(c => c.qualifier === 'home')?.statistics || {}
    const a = stats.totals?.competitors?.find(c => c.qualifier === 'away')?.statistics || {}
    matchStats = {
      home: {
        aces:        h.aces         || 0,
        dfs:         h.double_faults|| 0,
        winners:     h.winners      || 0,
        ufErrors:    h.unforced_errors || 0,
        bpWon:       `${h.break_points_won || 0}/${h.break_points || 0}`,
        pointsWon:   h.points_won   || 0,
        last10:      5,
      },
      away: {
        aces:        a.aces         || 0,
        dfs:         a.double_faults|| 0,
        winners:     a.winners      || 0,
        ufErrors:    a.unforced_errors || 0,
        bpWon:       `${a.break_points_won || 0}/${a.break_points || 0}`,
        pointsWon:   a.points_won   || 0,
        last10:      5,
      },
    }
  }

  // Format name: "Lastname, Firstname"
  const fmtName = (c) => {
    if (!c.name) return 'Unknown'
    const parts = c.name.split(' ')
    if (parts.length === 1) return parts[0]
    const last  = parts[parts.length - 1]
    const first = parts.slice(0, -1).join(' ')
    return `${last}, ${first}`
  }

  return {
    id:          se.id,
    status:      mappedStatus,
    tournament:  `${compName} ${tour === 'WTA' ? 'Women' : 'Men'} Singles`,
    tourLevel,
    venue:       venue.name || '',
    surface,
    startTime:   se.start_time,
    local_start: se.start_time
      ? new Date(se.start_time).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZoneName:'short' })
      : '',
    home: {
      name:    fmtName(home),
      abbr:    home.abbreviation || home.name?.slice(0,3).toUpperCase() || 'HOM',
      country: home.country_code || '',
      seed:    home.seed || null,
      id:      home.id,
    },
    away: {
      name:    fmtName(away),
      abbr:    away.abbreviation || away.name?.slice(0,3).toUpperCase() || 'AWY',
      country: away.country_code || '',
      seed:    away.seed || null,
      id:      away.id,
    },
    setsWon:   mappedStatus !== 'scheduled' ? { home: homeSets, away: awaySets } : null,
    sets,
    gameState,
    stats:     matchStats,
    result:    mappedStatus === 'final'
      ? { winner: homeSets > awaySets ? 'home' : 'away' }
      : null,
    matchStatus: status.set_scores
      ? `${status.set_scores.length + 1}${['st','nd','rd'][status.set_scores.length] || 'th'}_set`
      : null,
    oddsKey:   home.name || '',
    markets:   null, // populated by odds fetch
  }
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useLiveData() {
  const [matches,     setMatches]     = useState([])
  const [oddsData,    setOddsData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const abortRef = useRef(null)

  // ── Fetch live + today's matches from Sportradar ──────────────────────────
  const fetchMatches = useCallback(async () => {
    if (!SR_KEY) {
      setError('SPORTRADAR_KEY not set')
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    try {
      // 1. Live summaries — all currently live matches
      const liveRes = await fetch(
        `${SR_BASE}/schedules/live/summaries.json?api_key=${SR_KEY}`,
        { signal }
      )

      // 2. Today's schedule for upcoming matches
      const today   = new Date().toISOString().slice(0, 10)
      const schedRes = await fetch(
        `${SR_BASE}/schedules/${today}/summaries.json?api_key=${SR_KEY}`,
        { signal }
      )

      const liveJson  = liveRes.ok  ? await liveRes.json()  : { summaries: [] }
      const schedJson = schedRes.ok ? await schedRes.json() : { summaries: [] }

      // Merge — live takes priority, dedupe by id
      const allSummaries = [
        ...(liveJson.summaries  || []),
        ...(schedJson.summaries || []),
      ]
      const seen = new Set()
      const unique = allSummaries.filter(s => {
        const id = s.sport_event?.id
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })

      const transformed = unique
        .map(transformSRMatch)
        .filter(Boolean)
        .filter(m => m.tournament.toLowerCase().includes('singles'))
        .sort((a, b) => {
          const order = { live: 0, scheduled: 1, final: 2 }
          return (order[a.status] ?? 9) - (order[b.status] ?? 9)
        })

      setMatches(transformed)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Sportradar fetch error:', e)
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch odds ────────────────────────────────────────────────────────────
  const fetchOdds = useCallback(async () => {
    if (!ODDS_KEY) return

    try {
      const sports = [
        'tennis_atp_french_open',
        'tennis_wta_french_open',
        'tennis_atp_wimbledon',
        'tennis_wta_wimbledon',
        'tennis_atp_us_open',
        'tennis_wta_us_open',
        'tennis_atp_aus_open',
        'tennis_wta_aus_open',
      ]

      const results = await Promise.allSettled(
        sports.map(sport =>
          fetch(`${ODDS_BASE}/${sport}/odds/?apiKey=${ODDS_KEY}&regions=us,uk&markets=h2h&oddsFormat=decimal`)
            .then(r => r.ok ? r.json() : [])
        )
      )

      const combined = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => Array.isArray(r.value) ? r.value : [])

      setOddsData(combined)
    } catch (e) {
      console.error('Odds fetch error:', e)
    }
  }, [])

  // ── Initial load + polling intervals ─────────────────────────────────────
  useEffect(() => {
    fetchMatches()
    fetchOdds()

    const scoresTimer = setInterval(fetchMatches, SCORES_INTERVAL)
    const oddsTimer   = setInterval(fetchOdds,   ODDS_INTERVAL)

    return () => {
      clearInterval(scoresTimer)
      clearInterval(oddsTimer)
      abortRef.current?.abort()
    }
  }, [fetchMatches, fetchOdds])

  return {
    matches,
    oddsData,
    loading,
    error,
    lastUpdated,
    refresh: fetchMatches,
  }
}

// ─── Odds API key check hook ──────────────────────────────────────────────────
export function useOddsKey() {
  return ODDS_KEY || ''
}

// ─── Keys configured check ────────────────────────────────────────────────────
export const keysConfigured = {
  sportradar: !!SR_KEY,
  odds:       !!ODDS_KEY,
}
