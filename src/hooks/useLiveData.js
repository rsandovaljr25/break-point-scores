// src/hooks/useLiveData.js
// Sportradar Trial: /schedules/live/summaries returns all current matches
// including live, today completed, today upcoming, and recent past

import { useState, useEffect, useCallback, useRef } from 'react'

const LIVE_INTERVAL = 30_000    // 30s
const ODDS_INTERVAL = 120_000   // 2min

const transformSRMatch = (summary) => {
  const se     = summary.sport_event
  const status = summary.sport_event_status
  const stats  = summary.statistics
  if (!se || !status) return null

  const competitors = se.competitors || []
  const home = competitors.find(c => c.qualifier === 'home') || competitors[0] || {}
  const away = competitors.find(c => c.qualifier === 'away') || competitors[1] || {}

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

  const compName = competition.name || se.sport_event_context?.category?.name || 'Unknown Tournament'
  const tour     = competition.gender === 'women' ? 'WTA' : 'ATP'

  // Filter: no UTR, no doubles
  if (compName.toUpperCase().includes('UTR')) return null
  if (compName.toLowerCase().includes('double')) return null
  if (competitors.some(c => c.name?.includes('/'))) return null  // doubles partners

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
              ufErrors:h.unforced_errors||0,
              bpWon:`${h.breakpoints_won||0}/${h.total_breakpoints||0}`,
              pointsWon:h.points_won||0, last10:h.points_won_from_last_10||0 },
      away: { aces:a.aces||0, dfs:a.double_faults||0, winners:a.winners||0,
              ufErrors:a.unforced_errors||0,
              bpWon:`${a.breakpoints_won||0}/${a.total_breakpoints||0}`,
              pointsWon:a.points_won||0, last10:a.points_won_from_last_10||0 },
    }
  }

  const fmtName = (c) => {
    if (!c.name) return 'Unknown'
    const parts = c.name.split(' ')
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length-1]}, ${parts.slice(0,-1).join(' ')}`
  }

  // startDate from UTC start_time (matches Sportradar's own date format)
  const startDate = se.start_time ? se.start_time.slice(0,10) : null

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
      const data = res.ok ? await res.json() : { summaries: [] }
      const summaries = data.summaries || []

      const LEVEL_ORDER = {
        'Grand Slam':0,'Masters 1000':1,'WTA 1000':1,
        'ATP 500':2,'WTA 500':2,'ATP 250':3,'WTA 250':3,'Challenger':4
      }
      const STATUS_ORDER = {
        live:0, delayed:1, suspended:1,
        scheduled:2, postponed:2,
        final:3, walkover:3, retired:3, cancelled:3
      }

      const transformed = summaries
        .map(transformSRMatch)
        .filter(Boolean)
        .sort((a, b) => {
          const sd = (STATUS_ORDER[a.status]??9) - (STATUS_ORDER[b.status]??9)
          if (sd !== 0) return sd
          const ld = (LEVEL_ORDER[a.tourLevel]??9) - (LEVEL_ORDER[b.tourLevel]??9)
          if (ld !== 0) return ld
          return (a.startTime||'').localeCompare(b.startTime||'')
        })

      if (isMounted.current) {
        setMatches(transformed)
        setLastUpdated(new Date())
        setError(null)
      }
    } catch (e) {
      if (e.name !== 'AbortError' && isMounted.current) setError(e.message)
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
