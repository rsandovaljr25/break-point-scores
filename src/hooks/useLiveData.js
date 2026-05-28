// src/hooks/useLiveData.js
// Fetches live + today + past 7 days + next 3 days of matches

import { useState, useEffect, useCallback, useRef } from 'react'

const SCORES_INTERVAL = 30_000  // 30s live refresh
const ODDS_INTERVAL   = 60_000  // 60s odds refresh

// ─── Sportradar → our match format ───────────────────────────────────────────
const transformSRMatch = (summary) => {
  const se     = summary.sport_event
  const status = summary.sport_event_status
  const stats  = summary.statistics

  if (!se || !status) return null

  const competitors = se.competitors || []
  const home = competitors.find(c => c.qualifier === 'home') || competitors[0] || {}
  const away = competitors.find(c => c.qualifier === 'away') || competitors[1] || {}

  const srStatus     = status.status || status.match_status || 'not_started'
  const mappedStatus =
    srStatus === 'live'        ? 'live'      :
    srStatus === 'closed'      ? 'final'     :
    srStatus === 'ended'       ? 'final'     :
    srStatus === 'not_started' ? 'scheduled' : 'scheduled'

  const periods = status.period_scores || []
  const sets    = periods.map(p => ({ h: p.home_score || 0, a: p.away_score || 0 }))

  const gameState = isLiveState ? {
    homeScore: status.home_game_score  || 0,
    awayScore: status.away_game_score  || 0,
    serving:   status.serving_competitor === home.id ? 'home' : 'away',
    lastPoint: null,
  } : null

  const homeSets = sets.filter(s => s.h > s.a).length
  const awaySets = sets.filter(s => s.a > s.h).length

  const competition = se.sport_event_context?.competition || {}
  const level       = competition.level || ''
  const tourLevel   =
    level === 'grand_slam'       ? 'Grand Slam'   :
    level === 'atp_1000'         ? 'Masters 1000' :
    level === 'wta_1000'         ? 'WTA 1000'     :
    level === 'atp_500'          ? 'ATP 500'      :
    level === 'wta_500'          ? 'WTA 500'      :
    level === 'atp_250'          ? 'ATP 250'      :
    level === 'wta_250'          ? 'WTA 250'      :
    level.includes('challenger') ? 'Challenger'   : 'ATP 250'

  const compName = competition.name || 'Unknown Tournament'
  const tour     = competition.gender === 'women' ? 'WTA' : 'ATP'

  // Skip UTR events
  if (compName.toUpperCase().includes('UTR')) return null

  const venue   = se.venue || {}
  const surface =
    venue.reduced_name?.toLowerCase().includes('clay')  ? 'Clay'  :
    venue.reduced_name?.toLowerCase().includes('grass') ? 'Grass' :
    venue.reduced_name?.toLowerCase().includes('hard')  ? 'Hard'  : 'Hard'

  let matchStats = null
  if (stats && isLiveState) {
    const h = stats.totals?.competitors?.find(c => c.qualifier === 'home')?.statistics || {}
    const a = stats.totals?.competitors?.find(c => c.qualifier === 'away')?.statistics || {}
    matchStats = {
      home: { aces:h.aces||0, dfs:h.double_faults||0, winners:h.winners||0,
              ufErrors:h.unforced_errors||0, bpWon:`${h.break_points_won||0}/${h.break_points||0}`,
              pointsWon:h.points_won||0, last10:5 },
      away: { aces:a.aces||0, dfs:a.double_faults||0, winners:a.winners||0,
              ufErrors:a.unforced_errors||0, bpWon:`${a.break_points_won||0}/${a.break_points||0}`,
              pointsWon:a.points_won||0, last10:5 },
    }
  }

  const fmtName = (c) => {
    if (!c.name) return 'Unknown'
    const parts = c.name.split(' ')
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
  }

  // Local ISO date string (no UTC shift)
  const startDate = se.start_time ? se.start_time.slice(0, 10) : null

  return {
    id:          se.id,
    status:      mappedStatus,
    srStatus,    // raw Sportradar status for display
    tournament:  `${compName} ${tour === 'WTA' ? 'Women' : 'Men'} Singles`,
    tourLevel,
    venue:       venue.name || '',
    surface,
    startTime:   se.start_time,
    startDate,                      // YYYY-MM-DD for date filter
    local_start: se.start_time
      ? new Date(se.start_time).toLocaleTimeString('en-US',
          { hour:'numeric', minute:'2-digit', timeZoneName:'short' })
      : '',
    home: { name:fmtName(home), abbr:home.abbreviation||'HOM', country:home.country_code||'', seed:home.seed||null, id:home.id },
    away: { name:fmtName(away), abbr:away.abbreviation||'AWY', country:away.country_code||'', seed:away.seed||null, id:away.id },
    setsWon:     (isFinalState || isLiveState || mappedStatus === 'postponed') ? { home:homeSets, away:awaySets } : null,
    sets,
    gameState,
    stats:       matchStats,
    result:      isFinalState && homeSets !== awaySets ? { winner:homeSets>awaySets?'home':'away' } : null,
    matchStatus: status.set_scores
      ? `${status.set_scores.length+1}${['st','nd','rd'][status.set_scores.length]||'th'}_set`
      : null,
    oddsKey:     home.name || '',
    markets:     null,
  }
}

// ─── Local date helper (no UTC shift) ────────────────────────────────────────
const localDateISO = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useLiveData() {
  const [matches,     setMatches]     = useState([])
  const [oddsData,    setOddsData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchMatches = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    try {
      // Build date range: 7 days back + today + 3 days forward
      const datesToFetch = []
      for (let i = -7; i <= 3; i++) {
        datesToFetch.push(localDateISO(i))
      }

      // Always include live endpoint
      const endpoints = [
        '/api/scores?endpoint=schedules/live/summaries',
        ...datesToFetch.map(d => `/api/scores?endpoint=schedules/${d}/summaries`)
      ]

      // Fetch all in parallel
      const responses = await Promise.allSettled(
        endpoints.map(url => fetch(url, { signal }).then(r => r.ok ? r.json() : { summaries: [] }))
      )

      // Merge all summaries, dedupe by id
      const seen   = new Set()
      const unique = responses
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value?.summaries || [])
        .filter(s => {
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
          // Sort: live first, then by date desc (newest first), then by level
          const statusOrder = { live:0, scheduled:1, final:2 }
          const sd = (statusOrder[a.status]??9) - (statusOrder[b.status]??9)
          if (sd !== 0) return sd
          // For finals, most recent first
          if (a.status === 'final' && b.status === 'final') {
            return (b.startDate||'').localeCompare(a.startDate||'')
          }
          return (a.startDate||'').localeCompare(b.startDate||'')
        })

      setMatches(transformed)
      setLastUpdated(new Date())
      setError(null)

    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Scores fetch error:', e)
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOdds = useCallback(async () => {
    try {
      const sports = [
        'tennis_atp_french_open', 'tennis_wta_french_open',
        'tennis_atp_wimbledon',   'tennis_wta_wimbledon',
        'tennis_atp_us_open',     'tennis_wta_us_open',
        'tennis_atp_aus_open',    'tennis_wta_aus_open',
      ]
      const results = await Promise.allSettled(
        sports.map(sport =>
          fetch(`/api/odds?sport=${sport}`).then(r => r.ok ? r.json() : [])
        )
      )
      const combined = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => Array.isArray(r.value) ? r.value : [])
      if (combined.length > 0) setOddsData(combined)
    } catch (e) {
      console.error('Odds fetch error:', e)
    }
  }, [])

  useEffect(() => {
    fetchMatches()
    fetchOdds()
    const t1 = setInterval(fetchMatches, SCORES_INTERVAL)
    const t2 = setInterval(fetchOdds,   ODDS_INTERVAL)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
      abortRef.current?.abort()
    }
  }, [fetchMatches, fetchOdds])

  return { matches, oddsData, loading, error, lastUpdated, refresh: fetchMatches }
}

export const keysConfigured = { sportradar: true, odds: true }
