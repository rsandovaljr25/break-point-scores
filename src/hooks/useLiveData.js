// src/hooks/useLiveData.js
import { useState, useEffect, useCallback, useRef } from 'react'

const LIVE_INTERVAL = 30_000
const ODDS_INTERVAL = 120_000

// Convert "Firstname Lastname" → "Lastname, Firstname"
const fmtName = (name) => {
  if (!name) return 'Unknown'
  if (name.includes(',')) return name
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0]
  return `${parts[parts.length-1]}, ${parts.slice(0,-1).join(' ')}`
}

const transformSRMatch = (summary) => {
  const se     = summary.sport_event
  const status = summary.sport_event_status
  if (!se || !status) return null

  const competitors = se.competitors || []
  if (competitors.length < 2) return null

  const home = competitors.find(c => c.qualifier === 'home') || competitors[0]
  const away = competitors.find(c => c.qualifier === 'away') || competitors[1]
  if (!home || !away) return null

  // Skip doubles - names with slash
  if ((home.name||'').includes('/') || (away.name||'').includes('/')) return null
  if ((home.abbreviation||'').includes('/') || (away.abbreviation||'').includes('/')) return null

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
  const sets     = periods.map(p => ({ h: p.home_score||0, a: p.away_score||0 }))
  const homeSets = sets.filter(s => s.h > s.a).length
  const awaySets = sets.filter(s => s.a > s.h).length

  const gameState = isLiveState ? {
    homeScore: status.home_game_score || 0,
    awayScore: status.away_game_score || 0,
    serving:   status.serving_competitor === home.id ? 'home' : 'away',
    lastPoint: null,
  } : null

  // Tournament info
  const ctx      = se.sport_event_context || {}
  const comp     = ctx.competition || {}
  const compName = comp.name || ctx.category?.name || 'Tennis'

  // Skip UTR
  if (compName.toUpperCase().includes('UTR')) return null
  if (compName.toUpperCase().includes('SAN LUIS')) return null
  if (compName.toUpperCase().includes('GOLD COAST')) return null
  if (compName.toLowerCase().includes('double')) return null
  if (compName.toLowerCase().includes('mixed')) return null

  const isFemale = comp.gender === 'women'
    || compName.toLowerCase().includes('women')
    || compName.toLowerCase().includes('wta')
  const tour = isFemale ? 'WTA' : 'ATP'

  const level = comp.level || ''
  const tourLevel =
    level === 'grand_slam'       ? 'Grand Slam'   :
    level === 'atp_1000'         ? 'Masters 1000' :
    level === 'wta_1000'         ? 'WTA 1000'     :
    level === 'atp_500'          ? 'ATP 500'      :
    level === 'wta_500'          ? 'WTA 500'      :
    level === 'atp_250'          ? 'ATP 250'      :
    level === 'wta_250'          ? 'WTA 250'      :
    level.includes('challenger') ? 'Challenger'   :
    ['french open','wimbledon','us open','australian open']
      .some(g => compName.toLowerCase().includes(g)) ? 'Grand Slam' :
    compName.toLowerCase().includes('challenger') ? 'Challenger' : 'ATP 250'

  const venue   = se.venue || {}
  const vn      = (venue.reduced_name || venue.name || '').toLowerCase()
  const surface = vn.includes('clay') ? 'Clay' : vn.includes('grass') ? 'Grass' : vn.includes('hard') ? 'Hard' : 'Hard'

  // Stats for live matches
  const stats = summary.statistics
  let matchStats = null
  if (stats && isLiveState) {
    const h = stats.totals?.competitors?.find(c=>c.qualifier==='home')?.statistics||{}
    const a = stats.totals?.competitors?.find(c=>c.qualifier==='away')?.statistics||{}
    matchStats = {
      home:{aces:h.aces||0,dfs:h.double_faults||0,winners:h.winners||0,ufErrors:h.unforced_errors||0,bpWon:`${h.breakpoints_won||0}/${h.total_breakpoints||0}`,pointsWon:h.points_won||0,last10:5},
      away:{aces:a.aces||0,dfs:a.double_faults||0,winners:a.winners||0,ufErrors:a.unforced_errors||0,bpWon:`${a.breakpoints_won||0}/${a.total_breakpoints||0}`,pointsWon:a.points_won||0,last10:5},
    }
  }

  return {
    id:          se.id,
    status:      mappedStatus,
    srStatus,
    tournament:  `${compName} ${tour==='WTA'?'Women':'Men'} Singles`,
    tourLevel,
    venue:       venue.name || '',
    surface,
    startTime:   se.start_time,
    startDate:   se.start_time ? se.start_time.slice(0,10) : null,
    local_start: se.start_time
      ? new Date(se.start_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'})
      : '',
    home:{name:fmtName(home.name),abbr:home.abbreviation||'HOM',country:home.country_code||'',seed:home.seed||null,id:home.id},
    away:{name:fmtName(away.name),abbr:away.abbreviation||'AWY',country:away.country_code||'',seed:away.seed||null,id:away.id},
    setsWon:  (isFinalState||isLiveState) ? {home:homeSets,away:awaySets} : null,
    sets,
    gameState,
    stats:    matchStats,
    result:   isFinalState && homeSets!==awaySets ? {winner:homeSets>awaySets?'home':'away'} : null,
    oddsKey:  home.name||'',
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
    const {signal} = abortRef.current
    try {
      const res  = await fetch('/api/scores?endpoint=schedules/live/summaries', {signal})
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const summaries = data.summaries || []

      const STATUS_ORDER = {live:0,delayed:1,suspended:1,scheduled:2,postponed:2,final:3,walkover:3,retired:3,cancelled:3}
      const LEVEL_ORDER  = {'Grand Slam':0,'Masters 1000':1,'WTA 1000':1,'ATP 500':2,'WTA 500':2,'ATP 250':3,'WTA 250':3,'Challenger':4}

      const transformed = summaries
        .map(transformSRMatch)
        .filter(Boolean)
        .sort((a,b) => {
          const sd = (STATUS_ORDER[a.status]??9)-(STATUS_ORDER[b.status]??9)
          if (sd!==0) return sd
          const ld = (LEVEL_ORDER[a.tourLevel]??9)-(LEVEL_ORDER[b.tourLevel]??9)
          if (ld!==0) return ld
          return (a.startTime||'').localeCompare(b.startTime||'')
        })

      if (isMounted.current) {
        setMatches(transformed)
        setLastUpdated(new Date())
        setError(null)
      }
    } catch(e) {
      if (e.name !== 'AbortError' && isMounted.current) setError(e.message)
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [])

  const fetchOdds = useCallback(async () => {
    try {
      const sports = ['tennis_atp_french_open','tennis_wta_french_open','tennis_atp_wimbledon','tennis_wta_wimbledon','tennis_atp_us_open','tennis_wta_us_open']
      const results = await Promise.all(sports.map(s=>fetch(`/api/odds?sport=${s}`).then(r=>r.ok?r.json():[]).catch(()=>[])))
      const combined = results.flat().filter(Boolean)
      if (combined.length>0 && isMounted.current) setOddsData(combined)
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

  return {matches, oddsData, loading, error, lastUpdated, refresh: fetchMatches}
}

export const keysConfigured = {sportradar:true, odds:true}
