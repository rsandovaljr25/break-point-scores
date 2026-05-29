// src/hooks/useLiveData.js
// Sportradar Trial: uses /schedules/live/summaries for all match data

import { useState, useEffect, useCallback, useRef } from 'react'

const LIVE_INTERVAL = 30_000
const ODDS_INTERVAL = 120_000

const transformSRMatch = (summary) => {
  const se     = summary.sport_event
  const status = summary.sport_event_status
  const stats  = summary.statistics
  if (!se || !status) return null

  // ── Competitors ────────────────────────────────────────────────────────────
  const competitors = se.competitors || []
  if (competitors.length < 2) return null

  const home = competitors.find(c => c.qualifier === 'home') || competitors[0]
  const away = competitors.find(c => c.qualifier === 'away') || competitors[1]
  if (!home || !away) return null

  // ── Filter doubles: player names containing "/" or abbreviations like "J/V" ─
  const isDoubles = (name) => name && (name.includes('/') || name.includes(' / '))
  if (isDoubles(home.name) || isDoubles(away.name)) return null
  if (isDoubles(home.abbreviation) || isDoubles(away.abbreviation)) return null

  // ── Status mapping ─────────────────────────────────────────────────────────
  const srStatus = status.status || status.match_status || 'not_started'
  const mappedStatus =
    srStatus === 'live'          ? 'live'      :
    srStatus === 'closed'        ? 'final'     :
    srStatus === 'ended'         ? 'final'     :
    srStatus === 'complete'      ? 'final'     :
    srStatus === 'walkover'      ? 'walkover'  :
    srStatus === 'retired'       ? 'retired'   :
    srStatus === 'abandoned'     ? 'cancelled' :
    srStatus === 'cancelled'     ? 'cancelled' :
    srStatus === 'postponed'     ? 'postponed' :
    srStatus === 'interrupted'   ? 'live'      :
    srStatus === 'suspended'     ? 'suspended' :
    srStatus === 'delayed'       ? 'delayed'   :
    srStatus === 'start_delayed' ? 'delayed'   :
    srStatus === 'not_started'   ? 'scheduled' : 'scheduled'

  const isFinalState = ['final','walkover','retired','cancelled','suspended'].includes(mappedStatus)
  const isLiveState  = mappedStatus === 'live'

  // ── Sets & game state ──────────────────────────────────────────────────────
  const periods  = status.period_scores || []
  const sets     = periods.map(p => ({ h: p.home_score || 0, a: p.away_score || 0 }))
  const homeSets = sets.filter(s => s.h > s.a).length
  const awaySets = sets.filter(s => s.a > s.h).length

  const gameState = isLiveState ? {
    homeScore: status.home_game_score || 0,
    awayScore: status.away_game_score || 0,
    serving:   status.serving_competitor === home.id ? 'home' : 'away',
    lastPoint: null,
  } : null

  // ── Tournament info ────────────────────────────────────────────────────────
  // Try multiple paths to get competition data
  const ctx         = se.sport_event_context || {}
  const competition = ctx.competition || {}
  const category    = ctx.category || {}

  // Tournament name — try competition.name first, then category
  const compName = competition.name
    || category.name
    || se.tournament?.name
    || 'Unknown Tournament'

  // Filter UTR
  if (compName.toUpperCase().includes('UTR')) return null
  if (compName.toUpperCase().includes('SAN LUIS')) return null // UTR variant

  // Filter doubles from tournament name
  if (compName.toLowerCase().includes('double')) return null
  if (compName.toLowerCase().includes('mixed')) return null

  // Determine tour from competition gender or tournament name
  const isFemale = competition.gender === 'women'
    || compName.toLowerCase().includes('women')
    || compName.toLowerCase().includes('wta')
    || category.gender === 'women'
  const tour = isFemale ? 'WTA' : 'ATP'

  // Tournament level
  const level = competition.level || competition.category_level || ''
  const tourLevel =
    level === 'grand_slam'       ? 'Grand Slam'   :
    level === 'atp_1000'         ? 'Masters 1000' :
    level === 'wta_1000'         ? 'WTA 1000'     :
    level === 'atp_500'          ? 'ATP 500'      :
    level === 'wta_500'          ? 'WTA 500'      :
    level === 'atp_250'          ? 'ATP 250'      :
    level === 'wta_250'          ? 'WTA 250'      :
    level.includes('challenger') ? 'Challenger'   :
    compName.toLowerCase().includes('grand slam') ||
    ['french open','wimbledon','us open','australian open']
      .some(gs => compName.toLowerCase().includes(gs)) ? 'Grand Slam' :
    compName.toLowerCase().includes('challenger') ? 'Challenger' : 'ATP 250'

  // Surface
  const venue   = se.venue || {}
  const venueName = (venue.reduced_name || venue.name || '').toLowerCase()
  const surface =
    venueName.includes('clay')  ? 'Clay'  :
    venueName.includes('grass') ? 'Grass' :
    venueName.includes('hard')  ? 'Hard'  : 'Clay' // Roland Garros default

  // ── Player name formatting ─────────────────────────────────────────────────
  const fmtName = (c) => {
    if (!c.name) return 'Unknown'
    // Already "Lastname, Firstname" format?
    if (c.name.includes(',')) return c.name
    // Convert "Firstname Lastname" → "Lastname, Firstname"
    const parts = c.name.trim().split(' ')
    if (parts.length === 1) return parts[0]
    const last  = parts[parts.length - 1]
    const first = parts.slice(0, -1).join(' ')
    return `${last}, ${first}`
  }

  // ── Match stats (live only) ────────────────────────────────────────────────
  let matchStats = null
  if (stats && isLiveState) {
    const hc = stats.totals?.competitors?.find(c => c.qualifier === 'home')?.statistics || {}
    const ac = stats.totals?.competitors?.find(c => c.qualifier === 'away')?.statistics || {}
    matchStats = {
      home: { aces:hc.aces||0, dfs:hc.double_faults||0, winners:hc.winners||0,
              ufErrors:hc.unforced_errors||0,
              bpWon:`${hc.breakpoints_won||0}/${hc.total_breakpoints||0}`,
              pointsWon:hc.points_won||0, last10:hc.points_won_from_last_10||0 },
      away: { aces:ac.aces||0, dfs:ac.double_faults||0, winners:ac.winners||0,
              ufErrors:ac.unforced_errors||0,
              bpWon:`${ac.breakpoints_won||0}/${ac.total_breakpoints||0}`,
              pointsWon:ac.points_won||0, last10:ac.points_won_from_last_10||0 },
    }
  }

  // ── Start date (UTC) ───────────────────────────────────────────────────────
  const startDate = se.start_time ? se.start_time.slice(0, 10) : null

  return {
    id:          se.id,
    status:      mappedStatus,
    srStatus,
    tournament:  `${compName} ${tour === 'WTA' ? 'Women' : 'Men'} Singles`,
    tourLevel,
    venue:       venue.name || '',
    surface,
    startTime:   se.start_time,
    startDate,
    local_start: se.start_time
      ? new Date(se.start_time).toLocaleTimeString('en-US',
          { hour:'numeric', minute:'2-digit', timeZoneName:'short' })
      : '',
    home: { name:fmtName(home), abbr:home.abbreviation||'HOM',
            country:home.country_code||'', seed:home.seed||null, id:home.id },
    away: { name:fmtName(away), abbr:away.abbreviation||'AWY',
            country:away.country_code||'', seed:away.seed||null, id:away.id },
    setsWon:  (isFinalState||isLiveState) ? { home:homeSets, away:awaySets } : null,
    sets,
    gameState,
    stats:    matchStats,
    result:   isFinalState && homeSets !== awaySets
              ? { winner: homeSets > awaySets ? 'home' : 'away' } : null,
    oddsKey:  home.name || '',
    markets:  null,
  }
}

export function useLiveData() {
  const [matches,     setMatches]     = useState([])
  const [oddsData,    setOddsData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const abortRef  = useRef(null)
  const isMounted = useRef(true)

  const fetchMatches = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    try {
      const res  = await fetch('/api/scores?endpoint=schedules/live/summaries', { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const summaries = data.summaries || []

      const LEVEL_ORDER = {
        'Grand Slam':0,'Masters 1000':1,'WTA 1000':1,
        'ATP 500':2,'WTA 500':2,'ATP 250':3,'WTA 250':3,'Challenger':4
      }
      const STATUS_ORDER = {
        live:0,delayed:1,suspended:1,
        scheduled:2,postponed:2,
        final:3,walkover:3,retired:3,cancelled:3
      }

      const transformed = summaries
        .map(transformSRMatch)
        .filter(Boolean)
        .sort((a,b) => {
          const sd = (STATUS_ORDER[a.status]??9)-(STATUS_ORDER[b.status]??9)
          if (sd !== 0) return sd
          const ld = (LEVEL_ORDER[a.tourLevel]??9)-(LEVEL_ORDER[b.tourLevel]??9)
          if (ld !== 0) return ld
          return (a.startTime||'').localeCompare(b.startTime||'')
        })

      if (isMounted.current) {
        setMatches(transformed)
        setLastUpdated(new Date())
        setError(null)
      }
    } catch(e) {
      if (e.name !== 'AbortError' && isMounted.current) {
        console.error('Fetch error:', e)
        setError(e.message)
      }
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [])

  const fetchOdds = useCallback(async () => {
    const sports = [
      'tennis_atp_french_open','tennis_wta_french_open',
      'tennis_atp_wimbledon','tennis_wta_wimbledon',
      'tennis_atp_us_open','tennis_wta_us_open',
    ]
    try {
      const results = await Promise.all(
        sports.map(s => fetch(`/api/odds?sport=${s}`)
          .then(r => r.ok ? r.json() : []).catch(() => []))
      )
      const combined = results.flat().filter(Boolean)
      if (combined.length > 0 && isMounted.current) setOddsData(combined)
    } catch(e) {}
  }, [])

  useEffect(() => {
    isMounted.current = true
    fetchMatches()
    fetchOdds()
    const t1 = setInterval(fetchMatches, LIVE_INTERVAL)
    const t2 = setInterval(fetchOdds,   ODDS_INTERVAL)
    return () => {
      isMounted.current = false
      clearInterval(t1); clearInterval(t2)
      abortRef.current?.abort()
    }
  }, [fetchMatches, fetchOdds])

  return { matches, oddsData, loading, error, lastUpdated, refresh: fetchMatches }
}

export const keysConfigured = { sportradar: true, odds: true }
