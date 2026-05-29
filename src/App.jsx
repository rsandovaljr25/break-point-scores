import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveData } from "./hooks/useLiveData.js";

// ─── MATCH DATA ───────────────────────────────────────────────────────────────
const TODAY = "2026-05-25";

// ── Market resolution helpers ─────────────────────────────────────────────────
// Given completed sets, compute: totalGames per side, totalSets, totalGamesInMatch
const matchTotals = (sets) => {
  if(!sets?.length) return null;
  const hGames = sets.reduce((s,x)=>s+x.h,0);
  const aGames = sets.reduce((s,x)=>s+x.a,0);
  const hSets  = sets.filter(x=>x.h>x.a).length;
  const aSets  = sets.filter(x=>x.a>x.h).length;
  return { hGames, aGames, hSets, aSets, totalGames: hGames+aGames, totalSets: hSets+aSets };
};

// Resolve a single pick against match result
const resolvePickResult = (match, pick) => {
  if(!match.result || match.status !== "final") return null;
  const t = matchTotals(match.sets);
  if(!t) return null;
  const { type, side, line } = pick;

  if(type === "ml") {
    return match.result.winner === side ? "win" : "loss";
  }
  if(type === "spread") {
    // Game spread: e.g. home -3.5 means home must win by 4+ games total
    const diff = t.hGames - t.aGames; // positive = home ahead
    if(side === "home") return diff > line ? "win" : diff < line ? "loss" : "push";
    else                return (-diff) > line ? "win" : (-diff) < line ? "loss" : "push";
  }
  if(type === "sets_spread") {
    // Sets spread: e.g. home -1.5 means home must win by 2+ sets
    const diff = t.hSets - t.aSets;
    if(side === "home") return diff > line ? "win" : diff < line ? "loss" : "push";
    else                return (-diff) > line ? "win" : (-diff) < line ? "loss" : "push";
  }
  if(type === "total") {
    // Over/Under total games: e.g. over 21.5
    if(side === "over") return t.totalGames > line ? "win" : "loss";
    else                return t.totalGames < line ? "win" : "loss";
  }
  return null;
};

const calcUnits = (result, decimalOdds) => {
  if(result === "win")  return +(decimalOdds - 1).toFixed(4);
  if(result === "loss") return -1;
  if(result === "push") return 0;
  return 0;
};

// ── All matches with full market data ────────────────────────────────────────
const ALL_MATCHES = [];

// ── Seed picks with all 3 market types ───────────────────────────────────────
const SEED_PICKS = [
  // AceHunter — savvy ML + good spread picker
  {username:"AceHunter",matchId:"sr:71642234",pick:"away",type:"ml",   side:"away",line:null,  dec:1.24,ts:"2026-05-25T08:00Z"},
  {username:"AceHunter",matchId:"sr:71642196",pick:"home",type:"ml",   side:"home",line:null,  dec:1.63,ts:"2026-05-25T08:05Z"},
  {username:"AceHunter",matchId:"sr:71642178",pick:"away",type:"ml",   side:"away",line:null,  dec:1.28,ts:"2026-05-25T08:10Z"},
  {username:"AceHunter",matchId:"sr:71664960",pick:"away",type:"ml",   side:"away",line:null,  dec:2.10,ts:"2026-05-25T09:00Z"},
  {username:"AceHunter",matchId:"sr:71642240",pick:"home",type:"spread",side:"home",line:-4.5, dec:1.87,ts:"2026-05-25T09:05Z"},
  {username:"AceHunter",matchId:"sr:71642240",pick:"under",type:"total",side:"under",line:17.5,dec:1.91,ts:"2026-05-25T09:06Z"},
  // TopspiNation — perfect ML day + a total
  {username:"TopspiNation",matchId:"sr:71642234",pick:"away",type:"ml",   side:"away",line:null,  dec:1.24,ts:"2026-05-25T08:00Z"},
  {username:"TopspiNation",matchId:"sr:71642196",pick:"home",type:"ml",   side:"home",line:null,  dec:1.63,ts:"2026-05-25T08:05Z"},
  {username:"TopspiNation",matchId:"sr:71642178",pick:"away",type:"ml",   side:"away",line:null,  dec:1.28,ts:"2026-05-25T08:10Z"},
  {username:"TopspiNation",matchId:"sr:71664960",pick:"away",type:"ml",   side:"away",line:null,  dec:2.10,ts:"2026-05-25T09:00Z"},
  {username:"TopspiNation",matchId:"sr:71642240",pick:"home",type:"ml",   side:"home",line:null,  dec:1.36,ts:"2026-05-25T09:05Z"},
  {username:"TopspiNation",matchId:"sr:71642196",pick:"over", type:"total",side:"over",line:19.5,dec:1.91,ts:"2026-05-25T08:06Z"},
  // ClayKing — mixed results, some spread bets
  {username:"ClayKing",matchId:"sr:71642234",pick:"away",type:"ml",   side:"away",line:null,  dec:1.24,ts:"2026-05-25T08:00Z"},
  {username:"ClayKing",matchId:"sr:71642196",pick:"home",type:"ml",   side:"home",line:null,  dec:1.63,ts:"2026-05-25T08:05Z"},
  {username:"ClayKing",matchId:"sr:71642178",pick:"home",type:"ml",   side:"home",line:null,  dec:3.80,ts:"2026-05-25T08:10Z"},
  {username:"ClayKing",matchId:"sr:71664960",pick:"home",type:"sets_spread",side:"home",line:-1.5,dec:2.20,ts:"2026-05-25T09:00Z"},
  {username:"ClayKing",matchId:"sr:71642240",pick:"home",type:"spread",side:"home",line:-4.5,dec:1.87,ts:"2026-05-25T09:05Z"},
  // RolandWatcher — likes totals
  {username:"RolandWatcher",matchId:"sr:71642234",pick:"over", type:"total",side:"over",line:20.5,dec:1.87,ts:"2026-05-25T08:00Z"},
  {username:"RolandWatcher",matchId:"sr:71642196",pick:"over", type:"total",side:"over",line:19.5,dec:1.91,ts:"2026-05-25T08:05Z"},
  {username:"RolandWatcher",matchId:"sr:71642178",pick:"over", type:"total",side:"over",line:18.5,dec:1.87,ts:"2026-05-25T08:10Z"},
  {username:"RolandWatcher",matchId:"sr:71664960",pick:"over", type:"total",side:"over",line:22.5,dec:1.91,ts:"2026-05-25T09:00Z"},
  {username:"RolandWatcher",matchId:"sr:71642240",pick:"under",type:"total",side:"under",line:17.5,dec:1.91,ts:"2026-05-25T09:05Z"},
  // BaselineGuru — mostly wrong today
  {username:"BaselineGuru",matchId:"sr:71642234",pick:"home",type:"ml",   side:"home",line:null,  dec:4.20,ts:"2026-05-25T08:00Z"},
  {username:"BaselineGuru",matchId:"sr:71642196",pick:"away",type:"ml",   side:"away",line:null,  dec:2.40,ts:"2026-05-25T08:05Z"},
  {username:"BaselineGuru",matchId:"sr:71642178",pick:"home",type:"sets_spread",side:"home",line:+1.5,dec:1.50,ts:"2026-05-25T08:10Z"},
  {username:"BaselineGuru",matchId:"sr:71664960",pick:"away",type:"spread",side:"away",line:+1.5,dec:1.77,ts:"2026-05-25T09:00Z"},
  {username:"BaselineGuru",matchId:"sr:71642240",pick:"over", type:"total",side:"over",line:17.5,dec:1.91,ts:"2026-05-25T09:05Z"},
  // NetRusher — spread specialist
  {username:"NetRusher",matchId:"sr:71642234",pick:"away",type:"spread",side:"away",line:-4.5,dec:1.91,ts:"2026-05-25T08:00Z"},
  {username:"NetRusher",matchId:"sr:71642196",pick:"home",type:"spread",side:"home",line:-2.5,dec:1.91,ts:"2026-05-25T08:05Z"},
  {username:"NetRusher",matchId:"sr:71642178",pick:"away",type:"spread",side:"away",line:-4.5,dec:1.91,ts:"2026-05-25T08:10Z"},
  {username:"NetRusher",matchId:"sr:71664960",pick:"away",type:"sets_spread",side:"away",line:+1.5,dec:1.67,ts:"2026-05-25T09:00Z"},
  {username:"NetRusher",matchId:"sr:71642240",pick:"home",type:"spread",side:"home",line:-4.5,dec:1.87,ts:"2026-05-25T09:05Z"},
];

// Pre-resolve all seed picks
const RESOLVED_SEED_PICKS = SEED_PICKS.map(p => {
  const match = ALL_MATCHES.find(m => m.id === p.matchId);
  if(!match) return { ...p, result:null, unitsWon:0 };
  const result = resolvePickResult(match, p);
  return { ...p, result, unitsWon: calcUnits(result, p.dec) };
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const splitName = n => { const p=n.split(", "); return p.length===2?{last:p[0],first:p[1]}:{last:n,first:""}; };
const getTourInfo = t => {
  if(t.includes("French Open Men"))   return {label:"Roland Garros",tour:"ATP",surface:"Clay"};
  if(t.includes("French Open Women")) return {label:"Roland Garros",tour:"WTA",surface:"Clay"};
  if(t.includes("Little Rock"))       return {label:"Little Rock",tour:"CH",surface:"Hard"};
  if(t.includes("UTR"))               return {label:"UTR Gold Coast",tour:"UTR",surface:"Hard"};
  return {label:t,tour:"ATP",surface:"Hard"};
};
const POINT_LABELS={0:"0",15:"15",30:"30",40:"40"};
const fmtPt=v=>POINT_LABELS[v]!==undefined?POINT_LABELS[v]:String(v);
const TOUR_ACCENT={ATP:"#3a9ef0",WTA:"#cc55ff",CH:"#44dd88",UTR:"#ffaa22"};

// ─── COUNTRY FLAG EMOJIS (ISO3 → Unicode flag) ──────────────────────────────
const FLAG_EMOJI = {
  AUS:"🇦🇺", CAN:"🇨🇦", CHN:"🇨🇳", COL:"🇨🇴", CZE:"🇨🇿", FRA:"🇫🇷",
  GBR:"🇬🇧", JPN:"🇯🇵", MEX:"🇲🇽", ROU:"🇷🇴", RUS:"🇷🇺", USA:"🇺🇸",
  ARG:"🇦🇷", ESP:"🇪🇸", ITA:"🇮🇹", GER:"🇩🇪", BEL:"🇧🇪", LAT:"🇱🇻",
  NOR:"🇳🇴", NLD:"🇳🇱", UZB:"🇺🇿", MAD:"🇲🇬", NEU:"🌐", UTR:"🌐",
};
const flagEmoji = code => FLAG_EMOJI[code] || null;
const STATUS_ORDER={live:0,scheduled:1,final:2};
const fmtML=ml=>ml>0?`+${ml}`:`${ml}`;
const fmtDec=d=>d?.toFixed(2);
const fmtUnits=u=>(u>=0?"+":"")+u.toFixed(2)+"u";
const isPickLocked=m=>m.status==="live"||m.status==="final";

// Market display config
const MARKET_TYPES = [
  { key:"ml",          label:"Moneyline",   short:"ML",   desc:"Pick the match winner" },
  { key:"spread",      label:"Game Spread", short:"SPRD", desc:"Handicap on total games won" },
  { key:"sets_spread", label:"Set Spread",  short:"SETS", desc:"Handicap on sets won" },
  { key:"total",       label:"Total Games", short:"O/U",  desc:"Over/under on total games played" },
];

// ─── PICKS ENGINE ─────────────────────────────────────────────────────────────
function usePicks(username) {
  const [myPicks,  setMyPicks]  = useState({});  // { `${matchId}:${type}` : pick }
  const [allPicks, setAllPicks] = useState(RESOLVED_SEED_PICKS);

  useEffect(() => {
    (async () => {
      if(username) {
        try { const r=await window.storage.get(`picks:user:${username}`); if(r?.value) setMyPicks(JSON.parse(r.value)); } catch(e) {}
      }
      try {
        const r=await window.storage.get("picks:all",true);
        if(r?.value) {
          const stored=JSON.parse(r.value);
          if(stored.length>0) setAllPicks([...RESOLVED_SEED_PICKS,...stored]);
        }
      } catch(e) {}
    })();
  }, [username]);

  const submitPick = useCallback(async (matchId, type, side, line, dec) => {
    if(!username) return;
    const match = ALL_MATCHES.find(m=>m.id===matchId);
    if(!match||isPickLocked(match)) return;
    const result = resolvePickResult(match, {type,side,line});
    const newPick = { username, matchId, pick:`${side}`, type, side, line, dec, ts:new Date().toISOString(), result, unitsWon:calcUnits(result,dec) };
    const key = `${matchId}:${type}`;
    const updatedMy = { ...myPicks, [key]: newPick };
    setMyPicks(updatedMy);
    try { await window.storage.set(`picks:user:${username}`,JSON.stringify(updatedMy)); } catch(e){}
    const filtered = allPicks.filter(p=>!(p.username===username&&p.matchId===matchId&&p.type===type));
    const updatedAll = [...filtered, newPick];
    setAllPicks(updatedAll);
    const userSubmitted = updatedAll.filter(p=>!RESOLVED_SEED_PICKS.find(s=>s.username===p.username&&s.matchId===p.matchId&&s.type===p.type));
    try { await window.storage.set("picks:all",JSON.stringify(userSubmitted),true); } catch(e){}
  }, [username, myPicks, allPicks]);

  const removePick = useCallback(async (matchId, type) => {
    if(!username) return;
    const key=`${matchId}:${type}`;
    const updatedMy={...myPicks}; delete updatedMy[key];
    setMyPicks(updatedMy);
    try { await window.storage.set(`picks:user:${username}`,JSON.stringify(updatedMy)); } catch(e){}
    setAllPicks(prev=>prev.filter(p=>!(p.username===username&&p.matchId===matchId&&p.type===type)));
  }, [username, myPicks, allPicks]);

  return { myPicks, allPicks, submitPick, removePick };
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
const computeBoard = (picks) => {
  const users = {};
  picks.forEach(p => {
    if(!users[p.username]) users[p.username]={username:p.username,picks:[],wins:0,losses:0,pushes:0,pending:0,units:0,byMarket:{ml:{w:0,l:0,u:0},spread:{w:0,l:0,u:0},sets_spread:{w:0,l:0,u:0},total:{w:0,l:0,u:0}}};
    const u=users[p.username]; u.picks.push(p);
    if(p.result==="win")  { u.wins++;   u.units+=p.unitsWon; if(u.byMarket[p.type]) { u.byMarket[p.type].w++; u.byMarket[p.type].u+=p.unitsWon; } }
    else if(p.result==="loss") { u.losses++; u.units+=p.unitsWon; if(u.byMarket[p.type]) { u.byMarket[p.type].l++; u.byMarket[p.type].u+=p.unitsWon; } }
    else if(p.result==="push") { u.pushes++; }
    else { u.pending++; }
  });
  return Object.values(users).sort((a,b)=>b.units-a.units);
};

function LeaderboardView({ allPicks, username, myPicks }) {
  const [period,    setPeriod]    = useState("today");
  const [market,    setMarket]    = useState("all");
  const [showMine,  setShowMine]  = useState(false);
  const [expand,    setExpand]    = useState(null);

  const PERIODS={today:"TODAY",weekly:"WEEK",monthly:"MONTH",all_time:"ALL TIME"};
  const filterPicks = picks => {
    const now=new Date();
    return picks
      .filter(p=>{ const d=new Date(p.ts); return period==="today"?p.ts.slice(0,10)===TODAY:period==="weekly"?(now-d)<7*86400000:period==="monthly"?(now-d)<30*86400000:true; })
      .filter(p=>market==="all"||p.type===market);
  };

  const filtered = filterPicks(allPicks);
  const board = computeBoard(filtered);
  const myEntry = board.find(u=>u.username===username);
  const myRank  = board.findIndex(u=>u.username===username)+1;
  const medals  = ["🥇","🥈","🥉"];
  const rankColor = i => i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":"#2a5a7a";

  const myFilteredPicks = filterPicks(Object.values(myPicks));

  return (
    <div>
      {/* Period tabs */}
      <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
        {Object.entries(PERIODS).map(([k,label])=>(
          <button key={k} onClick={()=>setPeriod(k)} style={{background:period===k?"#a8d828":"transparent",border:`1px solid ${period===k?"#4a7a10":"#1a3a2a"}`,color:period===k?"#1a1a1a":"#5a7a5a",borderRadius:4,padding:"3px 10px",fontSize:9,fontFamily:"monospace",cursor:"pointer",letterSpacing:"0.08em"}}>{label}</button>
        ))}
      </div>

      {/* Market tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
        {[{key:"all",label:"ALL"},...MARKET_TYPES].map(({key,label,short})=>(
          <button key={key} onClick={()=>setMarket(key)} style={{background:market===key?"#0d2a18":"transparent",border:`1px solid ${market===key?"#1a5a2a":"#1a3a2a"}`,color:market===key?"#44cc88":"#2a5a3a",borderRadius:4,padding:"3px 10px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>{short||label}</button>
        ))}
      </div>

      {/* My rank card */}
      {username && myEntry && (
        <div style={{background:"linear-gradient(135deg,#eef6e0,#e4f0d4)",border:"2px solid #a8d828",borderRadius:10,padding:"10px 13px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:20,fontWeight:"bold",fontFamily:"monospace",color:"#3a9ef0",minWidth:32}}>#{myRank}</div>
              <div>
                <div style={{fontSize:13,color:"#1a1a1a",fontWeight:"bold"}}>You · {username}</div>
                <div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginTop:2}}>
                  {myEntry.wins}W · {myEntry.losses}L{myEntry.pushes>0?` · ${myEntry.pushes}P`:""} · {myEntry.pending} pending
                </div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:"bold",fontFamily:"monospace",color:myEntry.units>=0?"#44dd55":"#dd4444"}}>{fmtUnits(myEntry.units)}</div>
              <div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace"}}>{myEntry.picks.length} picks</div>
            </div>
          </div>
          {/* Per-market breakdown */}
          {market==="all"&&(
            <div style={{display:"flex",gap:6,marginTop:8,paddingTop:8,borderTop:"1px solid #e0e4d8",flexWrap:"wrap"}}>
              {MARKET_TYPES.map(({key,short})=>{
                const bm=myEntry.byMarket[key]; if(!bm||(bm.w+bm.l)===0) return null;
                return(
                  <div key={key} style={{background:"#ffffff",border:"1px solid #c8d8a0",borderRadius:5,padding:"4px 8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:"#5a7a5a",fontFamily:"monospace",marginBottom:2}}>{short}</div>
                    <div style={{fontSize:10,fontFamily:"monospace",color:bm.u>=0?"#44cc55":"#dd4444",fontWeight:"bold"}}>{fmtUnits(bm.u)}</div>
                    <div style={{fontSize:8,color:"#6a9a6a",fontFamily:"monospace"}}>{bm.w}W-{bm.l}L</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Board header */}
      <div style={{display:"grid",gridTemplateColumns:"28px 1fr 36px 36px 36px 60px",gap:4,padding:"3px 8px",marginBottom:4}}>
        {["#","PLAYER","W","L","PICKS","UNITS"].map((h,i)=>(
          <div key={h} style={{fontSize:8,color:"#6a9a6a",fontFamily:"monospace",letterSpacing:"0.08em",textAlign:i===1?"left":"center"}}>{h}</div>
        ))}
      </div>

      {board.length===0&&<div style={{textAlign:"center",color:"#8a9a8a",fontFamily:"monospace",fontSize:11,padding:28}}>No picks for this period/market</div>}

      {board.map((user,i)=>{
        const isMe=user.username===username;
        const expanded=expand===user.username;
        const streak=user.picks.slice(-5);
        return(
          <div key={user.username} style={{marginBottom:6}}>
            <div onClick={()=>setExpand(expanded?null:user.username)}
              style={{display:"grid",gridTemplateColumns:"28px 1fr 36px 36px 36px 60px",gap:4,padding:"9px 8px",alignItems:"center",background:isMe?"#eef6e0":"#ffffff",border:`1px solid ${isMe?"#2a5a8a":i<3?"#1a3a2a":"#0d1c2c"}`,borderRadius:8,cursor:"pointer",transition:"background 0.15s"}}>
              <div style={{fontSize:i<3?16:12,textAlign:"center",color:rankColor(i),fontFamily:"monospace",fontWeight:"bold"}}>{i<3?medals[i]:`${i+1}`}</div>
              <div>
                <div style={{fontSize:13,color:isMe?"#7ab8f5":"#8aaaca",fontWeight:isMe?"bold":"normal"}}>{user.username}{isMe?" (you)":""}</div>
                <div style={{display:"flex",gap:2,marginTop:3}}>
                  {streak.map((p,si)=>(
                    <div key={si} style={{width:7,height:7,borderRadius:"50%",background:p.result==="win"?"#22dd66":p.result==="loss"?"#dd4444":p.result==="push"?"#ffaa22":"#333",border:`1px solid ${p.result==="win"?"#1a6a2a":p.result==="loss"?"#6a1a1a":"#333"}`}}/>
                  ))}
                </div>
              </div>
              <div style={{textAlign:"center",fontSize:13,color:"#2a8a2a",fontFamily:"monospace",fontWeight:"bold"}}>{user.wins}</div>
              <div style={{textAlign:"center",fontSize:13,color:"#cc4444",fontFamily:"monospace",fontWeight:"bold"}}>{user.losses}</div>
              <div style={{textAlign:"center",fontSize:11,color:"#5a7a5a",fontFamily:"monospace"}}>{user.picks.length}</div>
              <div style={{textAlign:"center",fontSize:14,fontWeight:"bold",fontFamily:"monospace",color:user.units>=0?"#44dd55":"#dd4444"}}>{fmtUnits(user.units)}</div>
            </div>

            {/* Expanded per-market breakdown */}
            {expanded&&(
              <div style={{background:"#fafaf8",border:"1px solid #e0e4d8",borderTop:"none",borderRadius:"0 0 8px 8px",padding:"10px 12px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                  {MARKET_TYPES.map(({key,short,label})=>{
                    const bm=user.byMarket[key];
                    return(
                      <div key={key} style={{background:"#fafaf8",border:"1px solid #d0d8c0",borderRadius:6,padding:"7px",textAlign:"center"}}>
                        <div style={{fontSize:8,color:"#5a7a5a",fontFamily:"monospace",marginBottom:3}}>{short}</div>
                        <div style={{fontSize:14,fontWeight:"bold",fontFamily:"monospace",color:bm.u>=0?"#44cc55":"#dd4444"}}>{fmtUnits(bm.u)}</div>
                        <div style={{fontSize:9,color:"#6a9a6a",fontFamily:"monospace",marginTop:2}}>{bm.w}W-{bm.l}L</div>
                      </div>
                    );
                  })}
                </div>
                {/* Recent picks */}
                <div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginBottom:5,letterSpacing:"0.08em"}}>RECENT PICKS</div>
                {user.picks.slice(-4).reverse().map((p,pi)=>{
                  const m=ALL_MATCHES.find(x=>x.id===p.matchId);
                  if(!m) return null;
                  const rc=p.result==="win"?"#44dd55":p.result==="loss"?"#dd4444":p.result==="push"?"#ffaa22":"#ffaa22";
                  const mt=MARKET_TYPES.find(x=>x.key===p.type);
                  const playerOrSide = p.type==="total"?(p.side==="over"?"OVER":"UNDER"):(splitName(p.side==="home"?m.home.name:m.away.name).last);
                  return(
                    <div key={pi} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #e0e8d0"}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:8,color:"#5a7a5a",fontFamily:"monospace",background:"#fafaf8",borderRadius:3,padding:"1px 5px"}}>{mt?.short}</span>
                        <span style={{fontSize:11,color:"#7aaaca"}}>{playerOrSide}{p.line!==null?` ${p.line>0?"+":""}${p.line}`:""}</span>
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:10,color:"#5a7a5a",fontFamily:"monospace"}}>{fmtDec(p.dec)}</span>
                        <span style={{fontSize:10,fontWeight:"bold",fontFamily:"monospace",color:rc}}>{p.result?fmtUnits(p.unitsWon):"⏳"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* My picks detail */}
      {username&&(
        <div style={{marginTop:14}}>
          <button onClick={()=>setShowMine(s=>!s)} style={{background:"transparent",border:"1px solid #1a3a5a",color:"#5a7a5a",borderRadius:6,padding:"5px 14px",fontSize:9,fontFamily:"monospace",cursor:"pointer",width:"100%",letterSpacing:"0.1em"}}>
            {showMine?"▲ HIDE":"▼ SHOW"} MY PICKS ({Object.keys(myPicks).length})
          </button>
          {showMine&&(
            <div style={{marginTop:8}}>
              {Object.values(myPicks).length===0&&<div style={{textAlign:"center",color:"#8a9a8a",fontFamily:"monospace",fontSize:11,padding:16}}>No picks yet</div>}
              {Object.values(myPicks).map((p,pi)=>{
                const m=ALL_MATCHES.find(x=>x.id===p.matchId); if(!m) return null;
                const mt=MARKET_TYPES.find(x=>x.key===p.type);
                const playerOrSide=p.type==="total"?(p.side==="over"?"Over":"Under"):(p.side==="home"?splitName(m.home.name).last:splitName(m.away.name).last);
                const rc=p.result==="win"?"#44dd55":p.result==="loss"?"#dd4444":p.result==="push"?"#ffaa22":"#ffaa22";
                return(
                  <div key={pi} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#ffffff",border:"1px solid #e0e4d8",borderRadius:6,padding:"7px 10px",marginBottom:5}}>
                    <div>
                      <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:2}}>
                        <span style={{fontSize:8,color:"#5a7a5a",fontFamily:"monospace",background:"#fafaf8",borderRadius:3,padding:"1px 5px"}}>{mt?.short}</span>
                        <span style={{fontSize:10,color:"#5a7a5a",fontFamily:"monospace"}}>{m.local_start}</span>
                      </div>
                      <div style={{fontSize:12,color:"#4a6a9a"}}>{playerOrSide}{p.line!==null?` (${p.line>0?"+":""}${p.line} games)`:""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10,color:"#5a7a5a",fontFamily:"monospace"}}>{fmtDec(p.dec)}</div>
                      <div style={{fontSize:11,fontWeight:"bold",fontFamily:"monospace",color:rc}}>{p.result?fmtUnits(p.unitsWon):"⏳ PENDING"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PICKS PANEL ─────────────────────────────────────────────────────────────
function PicksPanel({ match, username, myPicks, onSubmit, onRemove }) {
  const [activeMarket, setActiveMarket] = useState("ml");
  const locked = isPickLocked(match);

  const curPick = myPicks[`${match.id}:${activeMarket}`];
  const mt = MARKET_TYPES.find(x=>x.key===activeMarket);
  const mkData = match.markets?.[activeMarket];

  const resColor = r => r==="win"?"#44dd55":r==="loss"?"#dd4444":r==="push"?"#ffaa22":"#ffaa22";

  const renderOptions = () => {
    if(!mkData) return <div style={{fontSize:10,color:"#6a8a5a",fontFamily:"monospace"}}>Market not available</div>;
    if(activeMarket==="ml") {
      return(
        <div style={{display:"flex",gap:8}}>
          {[["home",match.home,mkData.home],["away",match.away,mkData.away]].map(([side,player,odds])=>{
            const sel=curPick?.side===side;
            return(
              <button key={side} onClick={()=>!locked&&onSubmit(match.id,activeMarket,side,null,odds.dec)}
                style={{flex:1,background:sel?"#0a2a48":"#091828",border:`2px solid ${sel?"#3a9ef0":"#1a3a5a"}`,borderRadius:8,padding:"8px 5px",cursor:locked?"default":"pointer",textAlign:"center",boxShadow:sel?"0 0 10px #3a9ef022":"none",transition:"all 0.15s"}}>
                <div style={{fontSize:10,color:sel?"#7ab8f5":"#3a5a7a",fontFamily:"monospace",marginBottom:3}}>{splitName(player.name).last.toUpperCase()}</div>
                <div style={{fontSize:18,fontWeight:"bold",fontFamily:"monospace",color:sel?"#3a9ef0":"#2a5a7a"}}>{fmtML(odds.ml)}</div>
                <div style={{fontSize:9,color:"#8a9a8a",fontFamily:"monospace",marginTop:1}}>{fmtDec(odds.dec)}</div>
                {sel&&<div style={{fontSize:8,color:"#3a9ef0",fontFamily:"monospace",marginTop:2}}>✓ SELECTED</div>}
              </button>
            );
          })}
        </div>
      );
    }
    if(activeMarket==="total") {
      return(
        <div>
          <div style={{textAlign:"center",fontSize:10,color:"#5a7a5a",fontFamily:"monospace",marginBottom:6}}>TOTAL GAMES LINE: <strong style={{color:"#4a6a9a"}}>{mkData.over.line}</strong></div>
          <div style={{display:"flex",gap:8}}>
            {[["over","OVER",mkData.over],["under","UNDER",mkData.under]].map(([side,label,odds])=>{
              const sel=curPick?.side===side;
              return(
                <button key={side} onClick={()=>!locked&&onSubmit(match.id,activeMarket,side,odds.line,odds.dec)}
                  style={{flex:1,background:sel?"#0a2a0a":"#091828",border:`2px solid ${sel?"#22cc55":"#1a3a5a"}`,borderRadius:8,padding:"8px 5px",cursor:locked?"default":"pointer",textAlign:"center",boxShadow:sel?"0 0 10px #22cc5522":"none",transition:"all 0.15s"}}>
                  <div style={{fontSize:10,color:sel?"#44dd88":"#2a5a3a",fontFamily:"monospace",marginBottom:3}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:"bold",fontFamily:"monospace",color:sel?"#22cc55":"#2a6a3a"}}>{fmtML(odds.ml)}</div>
                  <div style={{fontSize:9,color:"#8a9a8a",fontFamily:"monospace",marginTop:1}}>{fmtDec(odds.dec)}</div>
                  {sel&&<div style={{fontSize:8,color:"#22cc55",fontFamily:"monospace",marginTop:2}}>✓ SELECTED</div>}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    if(activeMarket==="spread"||activeMarket==="sets_spread") {
      const unit = activeMarket==="sets_spread"?"sets":"games";
      return(
        <div>
          <div style={{textAlign:"center",fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginBottom:6}}>HANDICAP · {unit}</div>
          <div style={{display:"flex",gap:8}}>
            {[["home",match.home,mkData.home],["away",match.away,mkData.away]].map(([side,player,odds])=>{
              const sel=curPick?.side===side;
              const lineLabel=odds.line>0?`+${odds.line}`:odds.line;
              return(
                <button key={side} onClick={()=>!locked&&onSubmit(match.id,activeMarket,side,odds.line,odds.dec)}
                  style={{flex:1,background:sel?"#1a0a28":"#091828",border:`2px solid ${sel?"#cc55ff":"#1a3a5a"}`,borderRadius:8,padding:"8px 5px",cursor:locked?"default":"pointer",textAlign:"center",boxShadow:sel?"0 0 10px #cc55ff22":"none",transition:"all 0.15s"}}>
                  <div style={{fontSize:10,color:sel?"#cc88ff":"#3a3a6a",fontFamily:"monospace",marginBottom:1}}>{splitName(player.name).last.toUpperCase()}</div>
                  <div style={{fontSize:16,fontWeight:"bold",fontFamily:"monospace",color:sel?"#cc55ff":"#3a3a7a"}}>{lineLabel}</div>
                  <div style={{fontSize:12,color:sel?"#aa44dd":"#2a2a5a",fontFamily:"monospace"}}>{fmtML(odds.ml)}</div>
                  <div style={{fontSize:9,color:"#8a9a8a",fontFamily:"monospace"}}>{fmtDec(odds.dec)}</div>
                  {sel&&<div style={{fontSize:8,color:"#cc55ff",fontFamily:"monospace",marginTop:2}}>✓ SELECTED</div>}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
  };

  return(
    <div style={{borderTop:"1px solid #e0e4d8",background:"#fafaf8",padding:"10px 12px"}}>
      {/* Market tabs */}
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {MARKET_TYPES.map(({key,short,desc})=>{
          const hasPick=!!myPicks[`${match.id}:${key}`];
          const pickRes=myPicks[`${match.id}:${key}`]?.result;
          const badgeColor=pickRes==="win"?"#44dd55":pickRes==="loss"?"#dd4444":hasPick?"#ffaa22":null;
          return(
            <button key={key} onClick={()=>setActiveMarket(key)} style={{
              background:activeMarket===key?"#0a1828":"transparent",
              border:`1px solid ${activeMarket===key?"#2a5a8a":badgeColor||"#1a3a5a"}`,
              color:activeMarket===key?"#7ab8f5":badgeColor||"#2a5a7a",
              borderRadius:4,padding:"3px 8px",fontSize:9,fontFamily:"monospace",cursor:"pointer",
              position:"relative",letterSpacing:"0.06em"}}>
              {short}
              {hasPick&&<span style={{position:"absolute",top:-3,right:-3,width:6,height:6,borderRadius:"50%",background:badgeColor||"#ffaa22"}}/>}
            </button>
          );
        })}
      </div>

      {/* Market description */}
      <div style={{fontSize:9,color:"#2a4a5a",fontFamily:"monospace",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>🎯 {mt?.label?.toUpperCase()} · {mt?.desc}</span>
        {curPick&&<span style={{color:resColor(curPick.result),fontWeight:"bold"}}>{curPick.result?`${curPick.result==="win"?"✓":"✗"} ${fmtUnits(curPick.unitsWon)}`:"⏳ PENDING"}</span>}
      </div>

      {!username ? (
        <div style={{fontSize:10,color:"#6a8a5a",fontFamily:"monospace"}}>Set a username via ⚙ to submit picks</div>
      ) : locked ? (
        <div style={{fontSize:10,color:"#2a4a4a",fontFamily:"monospace"}}>
          {curPick?<span>Locked: <strong style={{color:"#1a5a9a"}}>{curPick.side==="over"?"Over":curPick.side==="under"?"Under":splitName(curPick.side==="home"?match.home.name:match.away.name).last}</strong> {curPick.line!==null?`${curPick.line>0?"+":""}${curPick.line}`:""} · {fmtDec(curPick.dec)}</span>:"Pick window closed"}
        </div>
      ) : (
        <>
          {renderOptions()}
          {curPick&&(
            <button onClick={()=>onRemove(match.id,activeMarket)} style={{background:"transparent",border:"1px solid #3a2a2a",color:"#aa5a5a",borderRadius:4,padding:"2px 8px",fontSize:8,fontFamily:"monospace",cursor:"pointer",marginTop:7}}>CLEAR {mt?.short} PICK</button>
          )}
        </>
      )}
    </div>
  );
}

// ─── STAT BAR ─────────────────────────────────────────────────────────────────
function StatBar({label,hv,av,hn,an}){
  const t=hn+an; const pct=t>0?(hn/t)*100:50;
  return(
    <div style={{marginBottom:7}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:11,color:"#3a9ef0",fontFamily:"monospace",fontWeight:"bold"}}>{hv}</span>
        <span style={{fontSize:9,color:"#5a6a5a",fontFamily:"monospace",letterSpacing:"0.06em"}}>{label}</span>
        <span style={{fontSize:11,color:"#cc88ff",fontFamily:"monospace",fontWeight:"bold"}}>{av}</span>
      </div>
      <div style={{height:3,background:"#e8e8e4",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#3a9ef0,#2266cc)",borderRadius:2}}/>
      </div>
    </div>
  );
}

// ─── MATCH CHAT ───────────────────────────────────────────────────────────────
const SEED_CHATS={"sr:71642328":[{id:1,user:"ClayKing",msg:"Gaston is playing like a man possessed 🎾",time:"12:15",isOwn:false},{id:2,user:"AceHunter",msg:"I had Gaston ML AND the spread, feeling good",time:"12:17",isOwn:false},{id:3,user:"TopspiNation",msg:"Monfils needs to stop going for trick shots",time:"12:19",isOwn:false}]};
function MatchChat({matchId,username}){
  const [messages,setMessages]=useState(SEED_CHATS[matchId]||[]);
  const [input,setInput]=useState("");
  const scrollRef=useRef(null);
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[messages]);
  const send=async()=>{
    const text=input.trim(); if(!text||!username) return;
    const now=new Date(); const t=now.getHours().toString().padStart(2,"0")+":"+now.getMinutes().toString().padStart(2,"0");
    const m={id:Date.now(),user:username,msg:text,time:t,isOwn:true};
    const updated=[...messages,m]; setMessages(updated); setInput("");
    try{ await window.storage.set(`chat:${matchId}`,JSON.stringify(updated),true); }catch(e){}
  };
  return(
    <div style={{borderTop:"1px solid #e0e4d8",background:"#fafaf8"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 12px 4px",borderBottom:"1px solid #e0e8d0"}}>
        <span style={{fontSize:9,color:"#2a6a4a",fontFamily:"monospace",letterSpacing:"0.1em"}}>💬 MATCH CHAT</span>
        <span style={{fontSize:8,color:"#7a9a6a",fontFamily:"monospace"}}>{messages.length} msgs</span>
      </div>
      <div ref={scrollRef} style={{height:140,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:5}}>
        {messages.map(m=>(
          <div key={m.id} style={{display:"flex",flexDirection:m.isOwn?"row-reverse":"row",gap:5}}>
            <div style={{background:m.isOwn?"#0a2a48":"#0d1c2c",border:`1px solid ${m.isOwn?"#1a4a7a":"#1a2a3a"}`,borderRadius:m.isOwn?"8px 2px 8px 8px":"2px 8px 8px 8px",padding:"5px 8px",maxWidth:"75%"}}>
              {!m.isOwn&&<div style={{fontSize:8,color:"#3a7aaa",fontFamily:"monospace",marginBottom:2}}>{m.user}</div>}
              <div style={{fontSize:12,color:m.isOwn?"#8acfff":"#8aaaca"}}>{m.msg}</div>
              <div style={{fontSize:8,color:"#8a9a8a",fontFamily:"monospace",marginTop:2,textAlign:m.isOwn?"left":"right"}}>{m.time}</div>
            </div>
          </div>
        ))}
        {messages.length===0&&<div style={{textAlign:"center",color:"#8a9a8a",fontSize:11,fontFamily:"monospace",margin:"auto"}}>No messages yet</div>}
      </div>
      <div style={{display:"flex",gap:6,padding:"5px 10px 7px",borderTop:"1px solid #e0e8d0"}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={username?`Chat as ${username}…`:"Set username to chat"} disabled={!username}
          style={{flex:1,background:"#fafaf8",border:"1px solid #c8d8c0",borderRadius:6,padding:"4px 8px",color:"#1a4a6a",fontSize:11,fontFamily:"monospace",outline:"none",opacity:username?1:0.5}}/>
        <button onClick={send} disabled={!username||!input.trim()} style={{background:"#e8f0ff",border:"1px solid #1a5a8a",color:"#3a9ef0",borderRadius:6,padding:"4px 11px",fontSize:11,fontFamily:"monospace",cursor:"pointer",opacity:username&&input.trim()?1:0.4}}>SEND</button>
      </div>
    </div>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────
function MatchCard({match,pulse,isFav,onToggleFav,username,myPicks,onSubmitPick,onRemovePick,onOpenDetail,setPlayerProfile}){
  const [statsOpen,setStatsOpen]=useState(false);
  const [chatOpen,setChatOpen]=useState(false);
  const [picksOpen,setPicksOpen]=useState(false);
  const isLive=match.status==="live"; const isFinal=match.status==="final";
  const gs=match.gameState;
  const hn=splitName(match.home.name); const an=splitName(match.away.name);
  const homeWon=isFinal&&match.setsWon?.home>match.setsWon?.away;
  const awayWon=isFinal&&match.setsWon?.away>match.setsWon?.home;
  const {tour}=getTourInfo(match.tournament);
  const accent=TOUR_ACCENT[tour]||"#3a9ef0";

  // Check if any pick exists for this match
  const myMatchPicks=Object.values(myPicks).filter(p=>p.matchId===match.id);
  const hasAnyPick=myMatchPicks.length>0;
  const allResults=myMatchPicks.filter(p=>p.result);
  const anyWin=allResults.some(p=>p.result==="win");
  const anyLoss=allResults.some(p=>p.result==="loss");
  const pickBorderColor=hasAnyPick?(anyWin&&!anyLoss?"#44dd5555":anyLoss&&!anyWin?"#dd444455":"#ffaa2255"):"transparent";

  const renderPlayer=(isHome)=>{
    const nm=isHome?hn:an; const pl=isHome?match.home:match.away;
    const sw=match.setsWon?(isHome?match.setsWon.home:match.setsWon.away):0;
    const serving=gs?.serving===(isHome?"home":"away");
    const gS=gs?(isHome?gs.homeScore:gs.awayScore):0;
    const gO=gs?(isHome?gs.awayScore:gs.homeScore):0;
    const won=isHome?homeWon:awayWon;
    return(
      <div style={{display:"flex",alignItems:"center"}}>
        <div style={{width:14,display:"flex",justifyContent:"center"}}>
          {isLive&&serving&&<div style={{width:7,height:7,borderRadius:"50%",background:pulse?"#ffdd22":"#443300",boxShadow:pulse?"0 0 7px #ffdd22":"none",transition:"all 0.3s"}}/>}
        </div>
        <div style={{flex:1,minWidth:0,paddingRight:6}}>
          {/* Player first name + flag */}
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1}}>
            {nm.first&&<span style={{fontSize:10,color:"#4a6a4a",fontFamily:"monospace"}}>{nm.first}</span>}
            {pl.country&&flagEmoji(pl.country)&&(
              <span style={{fontSize:12,lineHeight:1,flexShrink:0}} title={pl.country}>
                {flagEmoji(pl.country)}
              </span>
            )}
          </div>
          <button onClick={(e)=>{e.stopPropagation();setPlayerProfile&&setPlayerProfile({name:pl.name,country:pl.country,tour:getTourInfo(match.tournament).tour==="WTA"?"WTA":"ATP",opponent:isHome?match.away.name:match.home.name});}} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:won||(isLive&&serving)?"bold":"normal",
              color:won?"#2a8a2a":isFinal&&!won?"#9aaa9a":isLive&&serving?"#1a2a3a":"#3a5060",
              textDecoration:"underline",textDecorationColor:"#d0e8b0",textUnderlineOffset:2}}>
              {nm.last}
            </div>
          </button>
        </div>
        {/* ML odds inline */}
        {match.markets?.ml&&<div style={{fontSize:9,color:"#4a7a4a",fontFamily:"monospace",marginRight:8,minWidth:32,textAlign:"right"}}>{fmtML(isHome?match.markets.ml.home.ml:match.markets.ml.away.ml)}</div>}
        <div style={{display:"flex",gap:4,marginRight:8}}>
          {match.sets.map((s,i)=>{
            const val=isHome?s.h:s.a; const opp=isHome?s.a:s.h;
            const wonSet=val>opp; const isCur=i===match.sets.length-1&&isLive;
            return(<div key={i} style={{minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:3,background:isCur?"#0a2a42":wonSet?"#082808":"transparent",border:`1px solid ${isCur?"#1e5a8a":wonSet?"#1a4a1a":"#101e2c"}`,fontSize:11,fontFamily:"monospace",color:wonSet?"#44cc44":isCur?"#4a9ef0":"#253545",fontWeight:wonSet?"bold":"normal"}}>{val}</div>);
          })}
        </div>
        <div style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,fontFamily:"monospace",fontWeight:"bold",fontSize:13,background:sw>0&&(isLive||isFinal)?(won?"#0a2a0a":"#0a1f35"):"transparent",border:`1px solid ${sw>0&&(isLive||isFinal)?(won?"#1a5a1a":"#1a3a5a"):"#0d1a26"}`,color:won?"#44dd55":isLive?"#3a9ef0":"#1a3a5a"}}>
          {(isLive||isFinal)?sw:"—"}
        </div>
        {isLive&&gs&&(<div style={{width:26,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,marginLeft:4,fontFamily:"monospace",fontWeight:"bold",fontSize:13,background:gS>gO?"#0e1e0a":"transparent",border:`1px solid ${gS>gO?"#2a5a1a":"#0d1a26"}`,color:gS>gO?"#88ee44":"#2a4a6a"}}>{fmtPt(gS)}</div>)}
      </div>
    );
  };

  return(
    <div style={{background:"#ffffff",border:`2px solid ${hasAnyPick?pickBorderColor:isLive?"#1a3a5a":"#0d1c2c"}`,borderRadius:10,marginBottom:8,overflow:"hidden",boxShadow:isLive?`0 3px 20px ${accent}50`:"0 1px 6px #00000012"}}>
      {isLive&&<div style={{height:2,background:`linear-gradient(90deg,transparent,${accent}88,${accent},${accent}88,transparent)`}}/>}
      <div style={{padding:"10px 11px 7px"}}>
        {isLive&&match.venue&&(
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
            <span style={{fontSize:9,color:"#5a6a5a",fontFamily:"monospace"}}>📍 {match.venue}</span>
            <span style={{fontSize:9,color:accent,background:`${accent}15`,border:`1px solid ${accent}33`,borderRadius:10,padding:"1px 6px",fontFamily:"monospace"}}>{match.matchStatus?.replace(/_/g," ").toUpperCase()}</span>
          </div>
        )}
        {renderPlayer(true)}
        <div style={{height:4}}/>
        {renderPlayer(false)}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:7,paddingTop:6,borderTop:"1px solid #e0e4d8"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{display:"flex",flexDirection:"column",gap:1}}>
              <span style={{fontSize:9,color:"#9aaa9a",fontFamily:"monospace",letterSpacing:"0.05em"}}>
                {new Date(match.startTime).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
              </span>
              <span style={{fontSize:10,color:"#5a7a5a",fontFamily:"monospace",fontWeight:"bold"}}>
                {match.local_start}
              </span>
            </div>
            {isLive&&<span style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#a8d828",fontFamily:"monospace"}}><span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",background:pulse?"#22dd66":"#0a3a1a",transition:"background 0.3s"}}/>LIVE</span>}
            {isFinal&&<span style={{fontSize:9,color:"#ffffff",fontFamily:"monospace",background:"#888",borderRadius:3,padding:"1px 6px",letterSpacing:"0.06em"}}>FINAL</span>}
            {match.status==="scheduled"&&<span style={{fontSize:10,color:"#6a8a6a",fontFamily:"monospace"}}>UPCOMING</span>}
          </div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <button onClick={onOpenDetail} style={{background:"transparent",border:"1px solid #c8d8a0",color:"#5a7a3a",borderRadius:4,padding:"2px 8px",fontSize:9,fontFamily:"monospace",cursor:"pointer",letterSpacing:"0.06em"}}>📋 DETAIL</button>
            <button onClick={()=>onToggleFav(match.id)} style={{background:isFav?"#1a1500":"transparent",border:`1px solid ${isFav?"#5a4a00":"#1a3a2a"}`,color:isFav?"#ffcc00":"#2a4a2a",borderRadius:4,padding:"2px 6px",fontSize:11,cursor:"pointer"}}>{isFav?"★":"☆"}</button>
            <button onClick={()=>setPicksOpen(o=>!o)} style={{background:picksOpen?"#0a1828":(hasAnyPick?pickBorderColor+"33":"transparent"),border:`2px solid ${picksOpen||hasAnyPick?pickBorderColor||"#3a6a8a":"#1a3a5a"}`,color:picksOpen||hasAnyPick?pickBorderColor||"#3a9ef0":"#2a5a7a",borderRadius:4,padding:"2px 8px",fontSize:9,fontFamily:"monospace",cursor:"pointer",fontWeight:"bold",letterSpacing:"0.06em"}}>
              🎯 {hasAnyPick?`${myMatchPicks.length} PICK${myMatchPicks.length>1?"S":""}`:""} {picksOpen?"▲":"▼"}
            </button>
            {match.stats&&<button onClick={()=>setStatsOpen(s=>!s)} style={{background:statsOpen?`${accent}22`:"transparent",border:`1px solid ${statsOpen?accent+"55":"#1a3a5a"}`,color:statsOpen?accent:"#2a5a7a",borderRadius:4,padding:"2px 7px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>STATS {statsOpen?"▲":"▼"}</button>}
            {isLive&&<button onClick={()=>setChatOpen(c=>!c)} style={{background:chatOpen?"#0a1f35":"transparent",border:`1px solid ${chatOpen?"#2a5a8a":"#1a3a5a"}`,color:chatOpen?"#4a9ef0":"#2a5a7a",borderRadius:4,padding:"2px 7px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>💬 {chatOpen?"▲":"▼"}</button>}
          </div>
        </div>
      </div>
      {picksOpen&&<PicksPanel match={match} username={username} myPicks={myPicks} onSubmit={onSubmitPick} onRemove={onRemovePick}/>}
      {statsOpen&&match.stats&&(
        <div style={{borderTop:"1px solid #e0e4d8",padding:"10px 11px",background:"#fafaf8"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:9,fontFamily:"monospace"}}>
            <span style={{color:TOUR_ACCENT.ATP}}>{match.home.abbr}</span><span style={{color:"#5a6a5a"}}>STATS</span><span style={{color:TOUR_ACCENT.WTA}}>{match.away.abbr}</span>
          </div>
          <StatBar label="Aces"         hv={match.stats.home.aces}     av={match.stats.away.aces}     hn={match.stats.home.aces}     an={match.stats.away.aces}/>
          <StatBar label="Double Faults" hv={match.stats.home.dfs}      av={match.stats.away.dfs}      hn={match.stats.home.dfs}      an={match.stats.away.dfs}/>
          <StatBar label="Winners"       hv={match.stats.home.winners}  av={match.stats.away.winners}  hn={match.stats.home.winners}  an={match.stats.away.winners}/>
          <StatBar label="Unforced Err"  hv={match.stats.home.ufErrors} av={match.stats.away.ufErrors} hn={match.stats.home.ufErrors} an={match.stats.away.ufErrors}/>
          <StatBar label="Break Pts"     hv={match.stats.home.bpWon}    av={match.stats.away.bpWon}    hn={parseInt(match.stats.home.bpWon)} an={parseInt(match.stats.away.bpWon)}/>
          <StatBar label="Points Won"    hv={match.stats.home.pointsWon}av={match.stats.away.pointsWon}hn={match.stats.home.pointsWon}an={match.stats.away.pointsWon}/>
        </div>
      )}
      {chatOpen&&isLive&&<MatchChat matchId={match.id} username={username}/>}
    </div>
  );
}



// ─── TOURNAMENT LEVEL LABELS ─────────────────────────────────────────────────
const TOUR_LEVEL = {
  "French Open":     "Grand Slam",
  "Wimbledon":       "Grand Slam",
  "US Open":         "Grand Slam",
  "Australian Open": "Grand Slam",
  "Indian Wells":    "Masters 1000",
  "Miami":           "Masters 1000",
  "Monte Carlo":     "Masters 1000",
  "Madrid":          "Masters 1000",
  "Rome":            "Masters 1000",
  "Canada":          "Masters 1000",
  "Cincinnati":      "Masters 1000",
  "Shanghai":        "Masters 1000",
  "Paris":           "Masters 1000",
  "Vienna":          "ATP 500",
  "Basel":           "ATP 500",
  "Beijing":         "ATP 500",
  "Dubai":           "ATP 500",
  "Acapulco":        "ATP 500",
  "Barcelona":       "ATP 500",
  "Hamburg":         "ATP 500",
  "Washington":      "ATP 500",
  "Tokyo":           "ATP 500",
  "Lyon":            "ATP 250",
  "Marseille":       "ATP 250",
  "Montpellier":     "ATP 250",
  "Metz":            "ATP 250",
  "Challenger":      "Challenger",
  "Little Rock":     "Challenger",
  "Vicenza":         "Challenger",
  "UTR":             "UTR",
};

const LEVEL_COLOR = {
  "Grand Slam":    "#1a3a6e",   // Navy Blue
  "Masters 1000":  "#b81c2e",   // Red
  "WTA 1000":      "#b81c2e",   // Red
  "ATP 500":       "#1a5c35",   // Dark Green
  "WTA 500":       "#1a5c35",   // Dark Green
  "ATP 250":       "#c4520a",   // Burnt Orange
  "WTA 250":       "#c4520a",   // Burnt Orange
  "Challenger":    "#7b5ea7",   // Light Purple
  "UTR":           "#6b6b6b",   // Gray
};

const LEVEL_BG = {
  "Grand Slam":    "#e8edf8",   // Light navy tint
  "Masters 1000":  "#fceaec",   // Light red tint
  "WTA 1000":      "#fceaec",
  "ATP 500":       "#e6f4ec",   // Light green tint
  "WTA 500":       "#e6f4ec",
  "ATP 250":       "#fdf0e8",   // Light orange tint
  "WTA 250":       "#fdf0e8",
  "Challenger":    "#f0ecf8",   // Light purple tint
  "UTR":           "#f2f2f2",
};

const LEVEL_BORDER = {
  "Grand Slam":    "#2a4f8a",
  "Masters 1000":  "#d42a3a",
  "WTA 1000":      "#d42a3a",
  "ATP 500":       "#237a46",
  "WTA 500":       "#237a46",
  "ATP 250":       "#d96415",
  "WTA 250":       "#d96415",
  "Challenger":    "#9272be",
  "UTR":           "#999999",
};

const LEVEL_ICON = {
  "Grand Slam":    "🎾",
  "Masters 1000":  "💎",
  "WTA 1000":      "💎",
  "ATP 500":       "⭐",
  "WTA 500":       "⭐",
  "ATP 250":       "🏅",
  "WTA 250":       "🏅",
  "Challenger":    "🔷",
  "UTR":           "🎯",
};

// ─── SURFACE COLORS ──────────────────────────────────────────────────────────
const SURFACE_COLOR = {
  clay:    { color:"#d94f2a", bg:"#fdf0eb", border:"#e8754a", icon:"🟠", label:"Clay"   },
  hard:    { color:"#2a7fc4", bg:"#eaf4fd", border:"#5aaae0", icon:"🔵", label:"Hard"   },
  grass:   { color:"#2a8a3a", bg:"#eaf7ec", border:"#4ab85a", icon:"🟢", label:"Grass"  },
  indoor:  { color:"#7b5ea7", bg:"#f3eefb", border:"#9b7ec7", icon:"🟣", label:"Indoor" },
};
const surfaceStyle = (surf) => SURFACE_COLOR[surf?.toLowerCase()] || SURFACE_COLOR.hard;

// ─── PLAYER DATABASE ─────────────────────────────────────────────────────────
const PLAYER_DB = {
  "Gaston, Hugo": {
    full:"Hugo Gaston", country:"FRA", dob:"1980-05-26", age:23,
    hand:"Right-handed", backhand:"Two-handed", height:"185cm / 6ft 1in",
    turned_pro:2019, coach:"Franck Pepe", residence:"Toulouse, France",
    ranking:{ current:62, career_high:66, ytd_change:-4 },
    tour:"ATP",
    titles:{
      total:2,
      breakdown:{ "Grand Slam":0, "Masters 1000":0, "ATP 500":0, "ATP 250":2, "Challenger":3 }
    },
    stats:{
      allTime:{ matches:148, wins:83, losses:65, pct:"56%",
        aces_pg:3.1, dfs_pg:2.8, first_serve_pct:"61%", first_serve_pts:"67%",
        second_serve_pts:"51%", bp_saved:"59%", bp_converted:"39%", return_pts:"42%" },
      ytd:{ matches:43, wins:28, losses:15, pct:"65%",
        aces_pg:3.4, dfs_pg:2.6, first_serve_pct:"63%", first_serve_pts:"69%",
        second_serve_pts:"54%", bp_saved:"62%", bp_converted:"42%", return_pts:"44%" },
    },
    surface:{
      clay:    { w:55, l:28, pct:"66%", titles:2, aces:"2.8", fs:"63%", bp_conv:"44%" },
      hard:    { w:20, l:26, pct:"43%", titles:0, aces:"3.4", fs:"59%", bp_conv:"33%" },
      grass:   { w:8,  l:11, pct:"42%", titles:0, aces:"4.1", fs:"62%", bp_conv:"30%" },
      indoor:  { w:12, l:8,  pct:"60%", titles:0, aces:"3.0", fs:"61%", bp_conv:"38%" },
    },
    last10:[
      {res:"W",opp:"Monfils, Gael",   event:"French Open",   score:"6-2 6-3 3-6 2-6 6-0", surface:"Clay", date:"2026-05-25", round:"R128"},
      {res:"W",opp:"Djordjevic, Luka",event:"French Open",   score:"6-3 6-2 6-1",          surface:"Clay", date:"2026-05-23", round:"R128"},
      {res:"L",opp:"Alcaraz, Carlos", event:"Madrid",        score:"3-6 2-6",              surface:"Clay", date:"2026-05-07", round:"QF"},
      {res:"W",opp:"Munar, Jaume",    event:"Madrid",        score:"6-4 6-2",              surface:"Clay", date:"2026-05-05", round:"R16"},
      {res:"W",opp:"Etcheverry, T.",  event:"Madrid",        score:"6-3 7-5",              surface:"Clay", date:"2026-05-04", round:"R32"},
      {res:"W",opp:"Fils, Arthur",    event:"Lyon",          score:"7-6 6-4",              surface:"Clay", date:"2026-04-27", round:"F"},
      {res:"W",opp:"Rinderknech, A.", event:"Lyon",          score:"6-3 6-2",              surface:"Clay", date:"2026-04-26", round:"SF"},
      {res:"L",opp:"Sinner, Jannik",  event:"Monte Carlo",   score:"1-6 3-6",              surface:"Clay", date:"2026-04-13", round:"QF"},
      {res:"W",opp:"Davidovich Fokina",event:"Monte Carlo",  score:"7-5 6-4",              surface:"Clay", date:"2026-04-12", round:"R16"},
      {res:"W",opp:"Hanfmann, Yannick",event:"Monte Carlo",  score:"6-3 6-1",              surface:"Clay", date:"2026-04-11", round:"R32"},
    ],
    h2h:{
      "Monfils, Gael": {
        home_wins:1, away_wins:2,
        matches:[
          {date:"2026-05-25", event:"French Open",  surface:"Clay", winner:"Gaston, Hugo",  score:"6-2 6-3 3-6 2-6 6-0"},
          {date:"2024-10-01", event:"Paris Indoors",surface:"Hard", winner:"Monfils, Gael", score:"6-2 6-4"},
          {date:"2023-05-29", event:"French Open",  surface:"Clay", winner:"Monfils, Gael", score:"4-6 5-7 4-6"},
        ]
      }
    }
  },

  "Monfils, Gael": {
    full:"Gaël Monfils", country:"FRA", dob:"1986-09-01", age:39,
    hand:"Right-handed", backhand:"Two-handed", height:"193cm / 6ft 4in",
    turned_pro:2004, coach:"Gilles Cervara", residence:"Geneva, Switzerland",
    ranking:{ current:105, career_high:6, ytd_change:-12 },
    tour:"ATP",
    titles:{
      total:12,
      breakdown:{ "Grand Slam":0, "Masters 1000":0, "ATP 500":1, "ATP 250":11, "Challenger":0 }
    },
    stats:{
      allTime:{ matches:812, wins:520, losses:292, pct:"64%",
        aces_pg:5.8, dfs_pg:3.1, first_serve_pct:"59%", first_serve_pts:"72%",
        second_serve_pts:"55%", bp_saved:"64%", bp_converted:"41%", return_pts:"45%" },
      ytd:{ matches:41, wins:19, losses:22, pct:"46%",
        aces_pg:6.2, dfs_pg:3.4, first_serve_pct:"57%", first_serve_pts:"70%",
        second_serve_pts:"52%", bp_saved:"58%", bp_converted:"36%", return_pts:"42%" },
    },
    surface:{
      clay:  { w:180, l:118, pct:"60%", titles:6,  aces:"5.1", fs:"60%", bp_conv:"42%" },
      hard:  { w:220, l:108, pct:"67%", titles:5,  aces:"6.4", fs:"58%", bp_conv:"41%" },
      grass: { w:50,  l:38,  pct:"57%", titles:1,  aces:"7.2", fs:"61%", bp_conv:"38%" },
      indoor:{ w:80,  l:40,  pct:"67%", titles:4,  aces:"6.0", fs:"58%", bp_conv:"40%" },
    },
    last10:[
      {res:"L",opp:"Gaston, Hugo",   event:"French Open",   score:"2-6 3-6 6-3 6-2 0-6", surface:"Clay", date:"2026-05-25", round:"R128"},
      {res:"W",opp:"Navarro, Pedro", event:"French Open",   score:"6-4 6-2 6-3",          surface:"Clay", date:"2026-05-23", round:"R128"},
      {res:"W",opp:"Tabilo, Alex",   event:"Rome",          score:"6-4 7-5",              surface:"Clay", date:"2026-05-11", round:"R32"},
      {res:"L",opp:"Ruud, Casper",   event:"Rome",          score:"4-6 3-6",              surface:"Clay", date:"2026-05-12", round:"R16"},
      {res:"W",opp:"Lajovic, Dusan", event:"Monte Carlo",   score:"7-5 6-3",              surface:"Clay", date:"2026-04-11", round:"R32"},
      {res:"L",opp:"Tsitsipas, S.",  event:"Monte Carlo",   score:"3-6 4-6",              surface:"Clay", date:"2026-04-12", round:"R16"},
      {res:"W",opp:"Halys, Quentin", event:"Marrakech",     score:"6-3 7-6",              surface:"Clay", date:"2026-04-05", round:"QF"},
      {res:"L",opp:"Mpetshi Perricard",event:"Marrakech",   score:"5-7 4-6",              surface:"Clay", date:"2026-04-06", round:"SF"},
      {res:"W",opp:"Munar, Jaume",   event:"Montpellier",   score:"6-4 6-2",              surface:"Hard", date:"2026-02-03", round:"R16"},
      {res:"L",opp:"Humbert, Ugo",   event:"Montpellier",   score:"6-7 3-6",              surface:"Hard", date:"2026-02-04", round:"QF"},
    ],
    h2h:{
      "Gaston, Hugo": {
        home_wins:2, away_wins:1,
        matches:[
          {date:"2026-05-25", event:"French Open",  surface:"Clay", winner:"Gaston, Hugo",  score:"6-2 6-3 3-6 2-6 6-0"},
          {date:"2024-10-01", event:"Paris Indoors",surface:"Hard", winner:"Monfils, Gael", score:"6-2 6-4"},
          {date:"2023-05-29", event:"French Open",  surface:"Clay", winner:"Monfils, Gael", score:"4-6 5-7 4-6"},
        ]
      }
    }
  },

  "Parks, Alycia": {
    full:"Alycia Parks", country:"USA", dob:"2001-06-12", age:24,
    hand:"Right-handed", backhand:"Two-handed", height:"178cm / 5ft 10in",
    turned_pro:2019, coach:"Sébastien Salas", residence:"Monaco",
    ranking:{ current:44, career_high:39, ytd_change:+5 },
    tour:"WTA",
    titles:{
      total:1,
      breakdown:{ "Grand Slam":0, "WTA 1000":0, "WTA 500":0, "WTA 250":1, "Challenger":2 }
    },
    stats:{
      allTime:{ matches:178, wins:103, losses:75, pct:"58%",
        aces_pg:4.2, dfs_pg:3.1, first_serve_pct:"58%", first_serve_pts:"68%",
        second_serve_pts:"50%", bp_saved:"60%", bp_converted:"38%", return_pts:"43%" },
      ytd:{ matches:40, wins:22, losses:18, pct:"55%",
        aces_pg:4.5, dfs_pg:2.9, first_serve_pct:"60%", first_serve_pts:"70%",
        second_serve_pts:"52%", bp_saved:"62%", bp_converted:"40%", return_pts:"44%" },
    },
    surface:{
      clay:  { w:40, l:28, pct:"59%", titles:1, aces:"3.8", fs:"60%", bp_conv:"39%" },
      hard:  { w:50, l:35, pct:"59%", titles:0, aces:"4.6", fs:"57%", bp_conv:"38%" },
      grass: { w:13, l:12, pct:"52%", titles:0, aces:"5.1", fs:"59%", bp_conv:"34%" },
      indoor:{ w:10, l:8,  pct:"56%", titles:0, aces:"4.0", fs:"58%", bp_conv:"37%" },
    },
    last10:[
      {res:"W",opp:"Fernandez, Leylah",event:"French Open",  score:"6-4 6-4",    surface:"Clay", date:"2026-05-25", round:"R128"},
      {res:"W",opp:"Bejlek, Sara",      event:"French Open",  score:"6-2 6-3",    surface:"Clay", date:"2026-05-23", round:"R128"},
      {res:"L",opp:"Svitolina, E.",     event:"Rome",         score:"4-6 3-6",    surface:"Clay", date:"2026-05-12", round:"R16"},
      {res:"W",opp:"Bouzkova, M.",      event:"Rome",         score:"7-5 6-4",    surface:"Clay", date:"2026-05-11", round:"R32"},
      {res:"W",opp:"Rybakina, Elena",   event:"Madrid",       score:"6-4 7-6",    surface:"Clay", date:"2026-05-05", round:"R16"},
      {res:"L",opp:"Swiatek, Iga",      event:"Madrid",       score:"2-6 1-6",    surface:"Clay", date:"2026-05-06", round:"QF"},
      {res:"W",opp:"Paolini, Jasmine",  event:"Stuttgart",    score:"6-3 6-4",    surface:"Grass",date:"2026-04-22", round:"QF"},
      {res:"L",opp:"Kerber, Angelique", event:"Stuttgart",    score:"6-7 4-6",    surface:"Grass",date:"2026-04-23", round:"SF"},
      {res:"W",opp:"Samsonova, L.",     event:"Charleston",   score:"6-2 6-3",    surface:"Clay", date:"2026-04-09", round:"R16"},
      {res:"W",opp:"Alexandrova, E.",   event:"Charleston",   score:"7-5 6-4",    surface:"Clay", date:"2026-04-10", round:"QF"},
    ],
    h2h:{
      "Fernandez, Leylah": {
        home_wins:3, away_wins:2,
        matches:[
          {date:"2026-05-25", event:"French Open",   surface:"Clay", winner:"Parks, Alycia",   score:"6-4 6-4"},
          {date:"2025-08-10", event:"Rogers Cup",    surface:"Hard", winner:"Fernandez, Leylah",score:"3-6 7-6 6-4"},
          {date:"2025-03-22", event:"Miami",         surface:"Hard", winner:"Parks, Alycia",   score:"6-4 7-5"},
          {date:"2024-07-30", event:"Washington",    surface:"Hard", winner:"Parks, Alycia",   score:"6-3 6-2"},
          {date:"2024-01-15", event:"Australian Open",surface:"Hard",winner:"Fernandez, Leylah",score:"4-6 7-5 7-5"},
        ]
      }
    }
  },

  "Fernandez, Leylah": {
    full:"Leylah Fernandez", country:"CAN", dob:"2002-09-06", age:23,
    hand:"Left-handed", backhand:"Two-handed", height:"170cm / 5ft 7in",
    turned_pro:2019, coach:"Sylvain Bruneau", residence:"Boynton Beach, FL",
    ranking:{ current:31, career_high:13, ytd_change:-8 },
    tour:"WTA",
    titles:{
      total:3,
      breakdown:{ "Grand Slam":0, "WTA 1000":0, "WTA 500":1, "WTA 250":2, "Challenger":1 }
    },
    stats:{
      allTime:{ matches:224, wins:138, losses:86, pct:"62%",
        aces_pg:2.8, dfs_pg:3.8, first_serve_pct:"56%", first_serve_pts:"64%",
        second_serve_pts:"52%", bp_saved:"57%", bp_converted:"45%", return_pts:"48%" },
      ytd:{ matches:42, wins:26, losses:16, pct:"62%",
        aces_pg:3.1, dfs_pg:3.5, first_serve_pct:"57%", first_serve_pts:"65%",
        second_serve_pts:"54%", bp_saved:"59%", bp_converted:"46%", return_pts:"49%" },
    },
    surface:{
      clay:  { w:55, l:32, pct:"63%", titles:1, aces:"2.2", fs:"57%", bp_conv:"46%" },
      hard:  { w:65, l:38, pct:"63%", titles:2, aces:"3.1", fs:"55%", bp_conv:"45%" },
      grass: { w:18, l:16, pct:"53%", titles:0, aces:"3.4", fs:"57%", bp_conv:"42%" },
      indoor:{ w:15, l:10, pct:"60%", titles:0, aces:"2.8", fs:"56%", bp_conv:"44%" },
    },
    last10:[
      {res:"L",opp:"Parks, Alycia",    event:"French Open",  score:"4-6 4-6",    surface:"Clay", date:"2026-05-25", round:"R128"},
      {res:"W",opp:"Hibino, Nao",      event:"French Open",  score:"6-3 6-2",    surface:"Clay", date:"2026-05-23", round:"R128"},
      {res:"W",opp:"Siegemund, L.",    event:"Rome",         score:"6-4 6-3",    surface:"Clay", date:"2026-05-11", round:"R32"},
      {res:"L",opp:"Gauff, Coco",      event:"Rome",         score:"3-6 2-6",    surface:"Clay", date:"2026-05-12", round:"R16"},
      {res:"W",opp:"Andreeva, M.",     event:"Madrid",       score:"7-5 6-4",    surface:"Clay", date:"2026-05-04", round:"R32"},
      {res:"L",opp:"Svitolina, E.",    event:"Madrid",       score:"5-7 3-6",    surface:"Clay", date:"2026-05-05", round:"R16"},
      {res:"W",opp:"Samsonova, L.",    event:"Charleston",   score:"6-4 7-5",    surface:"Clay", date:"2026-04-10", round:"QF"},
      {res:"L",opp:"Jabeur, Ons",      event:"Charleston",   score:"6-7 2-6",    surface:"Clay", date:"2026-04-11", round:"SF"},
      {res:"W",opp:"Sherif, Mayar",    event:"Bogota",       score:"6-3 6-2",    surface:"Clay", date:"2026-04-06", round:"F", title:true},
      {res:"W",opp:"Sorribes, Sara",   event:"Bogota",       score:"6-4 6-1",    surface:"Clay", date:"2026-04-05", round:"SF"},
    ],
    h2h:{
      "Parks, Alycia": {
        home_wins:2, away_wins:3,
        matches:[
          {date:"2026-05-25", event:"French Open",    surface:"Clay", winner:"Parks, Alycia",   score:"6-4 6-4"},
          {date:"2025-08-10", event:"Rogers Cup",     surface:"Hard", winner:"Fernandez, Leylah",score:"3-6 7-6 6-4"},
          {date:"2025-03-22", event:"Miami",          surface:"Hard", winner:"Parks, Alycia",   score:"6-4 7-5"},
          {date:"2024-07-30", event:"Washington",     surface:"Hard", winner:"Parks, Alycia",   score:"6-3 6-2"},
          {date:"2024-01-15", event:"Australian Open",surface:"Hard", winner:"Fernandez, Leylah",score:"4-6 7-5 7-5"},
        ]
      }
    }
  },

  "Shnaider, Diana": {
    full:"Diana Shnaider", country:"RUS", dob:"2005-09-26", age:20,
    hand:"Right-handed", backhand:"Two-handed", height:"180cm / 5ft 11in",
    turned_pro:2022, coach:"Andrei Chesnokov", residence:"Moscow, Russia",
    ranking:{ current:27, career_high:24, ytd_change:+3 },
    tour:"WTA",
    titles:{
      total:1,
      breakdown:{ "Grand Slam":0, "WTA 1000":0, "WTA 500":0, "WTA 250":1, "Challenger":4 }
    },
    stats:{
      allTime:{ matches:112, wins:75, losses:37, pct:"67%",
        aces_pg:5.1, dfs_pg:2.9, first_serve_pct:"63%", first_serve_pts:"72%",
        second_serve_pts:"54%", bp_saved:"63%", bp_converted:"43%", return_pts:"46%" },
      ytd:{ matches:41, wins:31, losses:10, pct:"76%",
        aces_pg:5.4, dfs_pg:2.7, first_serve_pct:"65%", first_serve_pts:"74%",
        second_serve_pts:"56%", bp_saved:"66%", bp_converted:"45%", return_pts:"48%" },
    },
    surface:{
      clay:  { w:30, l:8,  pct:"79%", titles:1, aces:"4.8", fs:"65%", bp_conv:"46%" },
      hard:  { w:35, l:22, pct:"61%", titles:0, aces:"5.5", fs:"62%", bp_conv:"41%" },
      grass: { w:5,  l:5,  pct:"50%", titles:0, aces:"6.1", fs:"64%", bp_conv:"38%" },
      indoor:{ w:10, l:4,  pct:"71%", titles:0, aces:"5.0", fs:"64%", bp_conv:"44%" },
    },
    last10:[
      {res:"W",opp:"Zarazua, Renata",  event:"French Open",  score:"6-4 6-1",    surface:"Clay", date:"2026-05-25", round:"R128"},
      {res:"W",opp:"Tomova, Viktoriya",event:"French Open",  score:"6-2 6-3",    surface:"Clay", date:"2026-05-23", round:"R128"},
      {res:"W",opp:"Siniakova, K.",    event:"Rome",         score:"7-5 6-4",    surface:"Clay", date:"2026-05-12", round:"R16"},
      {res:"L",opp:"Swiatek, Iga",     event:"Rome",         score:"1-6 2-6",    surface:"Clay", date:"2026-05-13", round:"QF"},
      {res:"W",opp:"Kvitova, Petra",   event:"Madrid",       score:"6-3 7-6",    surface:"Clay", date:"2026-05-06", round:"QF"},
      {res:"L",opp:"Sabalenka, A.",    event:"Madrid",       score:"4-6 3-6",    surface:"Clay", date:"2026-05-07", round:"SF"},
      {res:"W",opp:"Linette, Magda",   event:"Stuttgart",    score:"6-4 6-2",    surface:"Grass",date:"2026-04-23", round:"SF"},
      {res:"W",opp:"Paolini, Jasmine", event:"Stuttgart",    score:"7-6 6-4",    surface:"Grass",date:"2026-04-24", round:"F", title:true},
      {res:"W",opp:"Navarro, Emma",    event:"Charleston",   score:"6-3 6-1",    surface:"Clay", date:"2026-04-11", round:"SF"},
      {res:"L",opp:"Gauff, Coco",      event:"Charleston",   score:"4-6 5-7",    surface:"Clay", date:"2026-04-12", round:"F"},
    ],
    h2h:{}
  },

  "Muchova, Karolina": {
    full:"Karolína Muchová", country:"CZE", dob:"1996-08-21", age:29,
    hand:"Right-handed", backhand:"One-handed", height:"178cm / 5ft 10in",
    turned_pro:2014, coach:"David Kotyza", residence:"Olomouc, Czech Republic",
    ranking:{ current:8, career_high:8, ytd_change:+2 },
    tour:"WTA",
    titles:{
      total:3,
      breakdown:{ "Grand Slam":0, "WTA 1000":1, "WTA 500":1, "WTA 250":1, "Challenger":0 }
    },
    stats:{
      allTime:{ matches:312, wins:198, losses:114, pct:"63%",
        aces_pg:3.2, dfs_pg:3.4, first_serve_pct:"60%", first_serve_pts:"68%",
        second_serve_pts:"55%", bp_saved:"62%", bp_converted:"44%", return_pts:"47%" },
      ytd:{ matches:38, wins:28, losses:10, pct:"74%",
        aces_pg:3.5, dfs_pg:3.1, first_serve_pct:"62%", first_serve_pts:"70%",
        second_serve_pts:"57%", bp_saved:"65%", bp_converted:"47%", return_pts:"50%" },
    },
    surface:{
      clay:  { w:80, l:42,  pct:"66%", titles:1, aces:"2.8", fs:"62%", bp_conv:"45%" },
      hard:  { w:88, l:52,  pct:"63%", titles:2, aces:"3.5", fs:"59%", bp_conv:"43%" },
      grass: { w:22, l:14,  pct:"61%", titles:0, aces:"4.1", fs:"61%", bp_conv:"41%" },
      indoor:{ w:18, l:8,   pct:"69%", titles:1, aces:"3.2", fs:"61%", bp_conv:"46%" },
    },
    last10:[
      {res:"W",opp:"Zakharova, A.",    event:"French Open",  score:"7-5 6-2",    surface:"Clay", date:"2026-05-25", round:"R128"},
      {res:"W",opp:"Yastremska, D.",   event:"French Open",  score:"6-3 6-4",    surface:"Clay", date:"2026-05-23", round:"R128"},
      {res:"W",opp:"Samsonova, L.",    event:"Rome",         score:"6-4 7-5",    surface:"Clay", date:"2026-05-13", round:"QF"},
      {res:"W",opp:"Swiatek, Iga",     event:"Rome",         score:"7-6 6-4",    surface:"Clay", date:"2026-05-14", round:"SF", title:false},
      {res:"L",opp:"Sabalenka, A.",    event:"Rome",         score:"5-7 4-6",    surface:"Clay", date:"2026-05-15", round:"F"},
      {res:"W",opp:"Jabeur, Ons",      event:"Madrid",       score:"6-3 6-4",    surface:"Clay", date:"2026-05-07", round:"SF"},
      {res:"W",opp:"Rybakina, Elena",  event:"Madrid",       score:"7-5 6-4",    surface:"Clay", date:"2026-05-08", round:"F", title:true},
      {res:"W",opp:"Andreeva, M.",     event:"Stuttgart",    score:"6-2 6-3",    surface:"Grass",date:"2026-04-24", round:"QF"},
      {res:"L",opp:"Paolini, Jasmine", event:"Stuttgart",    score:"6-7 5-7",    surface:"Grass",date:"2026-04-25", round:"SF"},
      {res:"W",opp:"Ostapenko, J.",    event:"Charleston",   score:"6-4 6-2",    surface:"Clay", date:"2026-04-11", round:"QF"},
    ],
    h2h:{}
  },
};

// Add generic profile for players not in DB
const genericProfile = (name, country, tour) => ({
  full: name.split(", ").reverse().join(" "),
  country, tour,
  ranking:{ current:"N/A", career_high:"N/A", ytd_change:0 },
  titles:{ total:0, breakdown:{} },
  stats:{ allTime:null, ytd:null },
  surface:{ clay:null, hard:null, grass:null, indoor:null },
  last10:[], h2h:{},
});

const getPlayerProfile = (name, country, tour) =>
  PLAYER_DB[name] || genericProfile(name, country, tour);

// ─── TOURNAMENT LEVEL BADGE ───────────────────────────────────────────────────
function TourLevelBadge({ tournament, small=false }) {
  const level = Object.entries(TOUR_LEVEL).find(([k]) => tournament.includes(k))?.[1] || "ATP 250";
  const color  = LEVEL_COLOR[level]  || "#666";
  const bg     = LEVEL_BG[level]     || "#f5f5f5";
  const border = LEVEL_BORDER[level] || "#ccc";
  const icon   = LEVEL_ICON[level]   || "🏅";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: small ? 2 : 3,
      fontSize: small ? 8 : 9,
      fontFamily: "monospace",
      fontWeight: "bold",
      letterSpacing: "0.06em",
      color: color,
      background: bg,
      border: `1.5px solid ${border}`,
      borderRadius: small ? 3 : 4,
      padding: small ? "1px 5px" : "2px 7px",
      whiteSpace: "nowrap",
      boxShadow: small ? "none" : `0 1px 3px ${color}22`,
    }}>
      {!small && <span style={{fontSize:9}}>{icon}</span>}
      {level}
    </span>
  );
}

// ─── PLAYER PROFILE MODAL ─────────────────────────────────────────────────────
function PlayerProfileModal({ playerName, playerCountry, playerTour, opponentName, onClose }) {
  const [statsView, setStatsView] = useState("ytd"); // ytd | allTime
  const [activeTab, setActiveTab] = useState("overview"); // overview | surface | last10 | h2h | titles

  const profile = getPlayerProfile(playerName, playerCountry, playerTour || "ATP");
  const n = splitName(playerName);
  const oppProfile = opponentName ? getPlayerProfile(opponentName, "", playerTour || "ATP") : null;
  const h2hData = profile.h2h?.[opponentName];
  const stats = statsView === "ytd" ? profile.stats?.ytd : profile.stats?.allTime;

  const rankChange = profile.ranking?.ytd_change;
  const rankArrow = rankChange > 0 ? "▲" : rankChange < 0 ? "▼" : "─";
  const rankColor = rankChange > 0 ? "#cc3333" : rankChange < 0 ? "#2a8a2a" : "#888";
  // In tennis, lower rank = better, so falling rank# = improving

  const SURFACE_ICONS = { clay:"🟠", hard:"🔵", grass:"🟢", indoor:"🟣" };
  const SURFACE_LABELS = { clay:"Clay", hard:"Hard", grass:"Grass", indoor:"Indoor" };
  const TABS = [
    {key:"overview", label:"Overview"},
    {key:"surface",  label:"Surface"},
    {key:"last10",   label:"Last 10"},
    ...(h2hData ? [{key:"h2h", label:"H2H"}] : []),
    {key:"titles",   label:"Titles"},
  ];

  // StatRow helper
  const StatRow = ({label, val, sub}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"7px 0",borderBottom:"1px solid #f0f0ec"}}>
      <span style={{fontSize:11,color:"#5a7a5a"}}>{label}</span>
      <div style={{textAlign:"right"}}>
        <span style={{fontSize:13,fontWeight:"bold",color:"#1a1a1a",fontFamily:"monospace"}}>{val}</span>
        {sub && <span style={{fontSize:9,color:"#aab",fontFamily:"monospace",marginLeft:6}}>{sub}</span>}
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:300,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#ffffff",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:600,
        maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden",
        boxShadow:"0 -4px 32px #00000033"}} onClick={e=>e.stopPropagation()}>

        {/* ── HERO HEADER ── */}
        <div style={{background:"linear-gradient(135deg,#1a1a1a,#2a2a2a)",
          padding:"16px 16px 12px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28}}>{flagEmoji(profile.country)}</span>
              <div>
                <div style={{fontSize:8,color:"#a8d828",fontFamily:"monospace",letterSpacing:"0.15em",marginBottom:2}}>
                  {profile.tour === "WTA" ? "WTA" : "ATP"} · {profile.country}
                </div>
                <div style={{fontSize:22,fontWeight:"bold",color:"#ffffff",letterSpacing:"0.02em"}}>
                  {n.first} <span style={{color:"#a8d828"}}>{n.last}</span>
                </div>
                <div style={{fontSize:10,color:"#888",fontFamily:"monospace",marginTop:2}}>
                  {profile.hand} · {profile.height} · Pro since {profile.turned_pro}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"1px solid #444",
              color:"#aaa",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14,flexShrink:0}}>✕</button>
          </div>

          {/* Ranking + quick stats row */}
          <div style={{display:"flex",gap:8}}>
            {[
              {label:"RANKING",    val:`#${profile.ranking?.current}`,   sub:null,              accent:"#a8d828"},
              {label:"PEAK",       val:`#${profile.ranking?.career_high}`,sub:null,              accent:"#ffdd22"},
              {label:"TITLES",     val:profile.titles?.total,             sub:"career",          accent:"#3a9ef0"},
              {label:statsView==="ytd"?"2026 W-L":"ALL TIME",
               val:stats ? `${stats.wins}-${stats.losses}` : "N/A",
               sub:stats?.pct,       accent:"#44cc88"},
            ].map(({label,val,sub,accent})=>(
              <div key={label} style={{flex:1,background:"#2a2a2a",borderRadius:8,
                padding:"6px 8px",textAlign:"center",border:`1px solid #333`}}>
                <div style={{fontSize:8,color:"#888",fontFamily:"monospace",letterSpacing:"0.08em",marginBottom:2}}>{label}</div>
                <div style={{fontSize:16,fontWeight:"bold",color:accent,fontFamily:"monospace"}}>{val}</div>
                {sub&&<div style={{fontSize:9,color:"#666",fontFamily:"monospace"}}>{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{display:"flex",borderBottom:"2px solid #f0f0ec",background:"#fafaf8",
          overflowX:"auto",flexShrink:0}}>
          {TABS.map(({key,label})=>(
            <button key={key} onClick={()=>setActiveTab(key)} style={{
              background:"transparent",border:"none",
              borderBottom:`2px solid ${activeTab===key?"#a8d828":"transparent"}`,
              color:activeTab===key?"#1a1a1a":"#888",
              padding:"8px 14px",fontSize:10,fontFamily:"monospace",
              letterSpacing:"0.1em",cursor:"pointer",
              whiteSpace:"nowrap",marginBottom:-2}}>
              {label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div style={{overflowY:"auto",flex:1}}>

          {/* ── OVERVIEW ── */}
          {activeTab==="overview"&&(
            <div style={{padding:"14px 16px"}}>
              {/* Stats toggle */}
              <div style={{display:"flex",gap:5,marginBottom:14}}>
                {[["ytd","2026 Season"],["allTime","All Time"]].map(([k,label])=>(
                  <button key={k} onClick={()=>setStatsView(k)} style={{
                    background:statsView===k?"#a8d828":"transparent",
                    border:`1px solid ${statsView===k?"#a8d828":"#d0d0cc"}`,
                    color:statsView===k?"#1a1a1a":"#888",
                    borderRadius:6,padding:"4px 12px",fontSize:9,
                    fontFamily:"monospace",cursor:"pointer",letterSpacing:"0.08em",fontWeight:statsView===k?"bold":"normal"}}>
                    {label}
                  </button>
                ))}
              </div>

              {stats ? (<>
                {/* W-L record bar */}
                <div style={{background:"#f5f5f2",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:18,fontWeight:"bold",color:"#2a8a2a",fontFamily:"monospace"}}>{stats.wins}W</span>
                    <span style={{fontSize:12,color:"#888",alignSelf:"center",fontFamily:"monospace"}}>{stats.pct}</span>
                    <span style={{fontSize:18,fontWeight:"bold",color:"#cc3333",fontFamily:"monospace"}}>{stats.losses}L</span>
                  </div>
                  <div style={{height:6,background:"#e0e0dc",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${parseInt(stats.pct)}%`,
                      background:"linear-gradient(90deg,#a8d828,#7aaa10)",borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:9,color:"#aaa",fontFamily:"monospace",marginTop:4,textAlign:"center"}}>
                    {stats.matches} matches played
                  </div>
                </div>

                {/* Service stats */}
                <div style={{fontSize:10,color:"#888",fontFamily:"monospace",letterSpacing:"0.1em",
                  marginBottom:8,fontWeight:"bold"}}>SERVE</div>
                <StatRow label="Aces / Game"          val={stats.aces_pg}/>
                <StatRow label="Double Faults / Game" val={stats.dfs_pg}/>
                <StatRow label="1st Serve %"          val={stats.first_serve_pct}/>
                <StatRow label="1st Serve Pts Won"    val={stats.first_serve_pts}/>
                <StatRow label="2nd Serve Pts Won"    val={stats.second_serve_pts}/>
                <StatRow label="Break Pts Saved"      val={stats.bp_saved}/>

                <div style={{fontSize:10,color:"#888",fontFamily:"monospace",letterSpacing:"0.1em",
                  margin:"12px 0 8px",fontWeight:"bold"}}>RETURN</div>
                <StatRow label="Return Pts Won"       val={stats.return_pts}/>
                <StatRow label="Break Pts Converted"  val={stats.bp_converted}/>

                <div style={{fontSize:9,color:"#ccc",fontFamily:"monospace",marginTop:10,textAlign:"center"}}>
                  {profile.coach && `Coach: ${profile.coach}`}
                  {profile.residence && ` · ${profile.residence}`}
                </div>
              </>) : (
                <div style={{textAlign:"center",color:"#ccc",padding:32,fontFamily:"monospace",fontSize:12}}>
                  Stats not available
                </div>
              )}
            </div>
          )}

          {/* ── SURFACE ── */}
          {activeTab==="surface"&&(
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {Object.entries(profile.surface).map(([surf,data])=>{
                  if(!data) return null;
                  const pct = parseInt(data.pct);
                  const sc = surfaceStyle(surf);
                  return(
                    <div key={surf} style={{background:sc.bg,
                      border:`2px solid ${sc.border}`,
                      borderRadius:10,padding:"12px 10px",
                      boxShadow:`0 1px 6px ${sc.color}18`}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
                        <span style={{fontSize:16}}>{sc.icon}</span>
                        <span style={{fontSize:12,fontWeight:"bold",color:sc.color}}>{sc.label}</span>
                        {data.titles>0&&<span style={{fontSize:8,color:"#a8d828",fontFamily:"monospace",
                          background:"#eef6e0",borderRadius:3,padding:"1px 5px",marginLeft:"auto"}}>
                          🏆 {data.titles}
                        </span>}
                      </div>
                      <div style={{fontSize:22,fontWeight:"bold",color:"#1a1a1a",fontFamily:"monospace",marginBottom:4}}>
                        {data.w}-{data.l}
                      </div>
                      <div style={{height:5,background:"#e8e8e4",borderRadius:3,overflow:"hidden",marginBottom:5}}>
                        <div style={{height:"100%",width:`${pct}%`,borderRadius:3,background:sc.color}}/>
                      </div>
                      <div style={{fontSize:12,fontWeight:"bold",color:sc.color,
                        fontFamily:"monospace",marginBottom:6}}>{data.pct}</div>
                      <div style={{fontSize:9,color:"#888",fontFamily:"monospace",lineHeight:1.6}}>
                        <div>Aces/gm: {data.aces}</div>
                        <div>1st srv: {data.fs}</div>
                        <div>BP conv: {data.bp_conv}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── LAST 10 ── */}
          {activeTab==="last10"&&(
            <div style={{padding:"14px 16px"}}>
              {/* Form strip */}
              <div style={{display:"flex",gap:4,marginBottom:14}}>
                {profile.last10.map((m,i)=>(
                  <div key={i} style={{flex:1,height:28,display:"flex",alignItems:"center",
                    justifyContent:"center",borderRadius:4,
                    background:m.res==="W"?"#eef6e0":"#fdeaea",
                    border:`1px solid ${m.res==="W"?"#a8d828":"#f0a0a0"}`}}>
                    <span style={{fontSize:11,fontWeight:"bold",fontFamily:"monospace",
                      color:m.res==="W"?"#2a8a2a":"#cc3333"}}>{m.res}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {profile.last10.map((m,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                    padding:"8px 10px",borderRadius:8,
                    background:m.res==="W"?"#fafff8":"#fffafa",
                    border:`1px solid ${m.res==="W"?"#d0e8b0":"#f0c0c0"}`}}>
                    {/* Result */}
                    <div style={{width:22,height:22,borderRadius:"50%",
                      background:m.res==="W"?"#a8d828":"#f08080",
                      display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:10,fontWeight:"bold",color:"#fff",fontFamily:"monospace"}}>{m.res}</span>
                    </div>
                    {/* Match info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:"#1a1a1a",fontWeight:"bold",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {m.opp}
                        </span>
                        {m.title&&<span style={{fontSize:9,color:"#a8d828",fontFamily:"monospace"}}>🏆 TITLE</span>}
                      </div>
                      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                        <TourLevelBadge tournament={m.event} small={true}/>
                        <span style={{fontSize:9,color:"#888",fontFamily:"monospace"}}>{m.event}</span>
                        <span style={{fontSize:8,color:"#aaa",fontFamily:"monospace"}}>{m.round}</span>
                      </div>
                    </div>
                    {/* Score + surface */}
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:10,fontFamily:"monospace",color:"#3a5a3a",fontWeight:"bold"}}>{m.score}</div>
                      <div style={{fontSize:8,color:"#aaa",fontFamily:"monospace",marginTop:1}}>
                        {SURFACE_ICONS[m.surface?.toLowerCase()]}{m.surface} · {m.date?.slice(0,10)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── H2H ── */}
          {activeTab==="h2h"&&h2hData&&(
            <div style={{padding:"14px 16px"}}>
              {/* H2H header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,
                marginBottom:16,background:"#f5f5f2",borderRadius:10,padding:"12px"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:"#888",fontFamily:"monospace",marginBottom:2}}>{n.last.toUpperCase()}</div>
                  <div style={{fontSize:32,fontWeight:"bold",color:"#a8d828",fontFamily:"monospace"}}>{h2hData.home_wins}</div>
                </div>
                <div style={{fontSize:13,color:"#ccc",fontFamily:"monospace"}}>—</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:32,fontWeight:"bold",color:"#cc3333",fontFamily:"monospace"}}>{h2hData.away_wins}</div>
                  <div style={{fontSize:9,color:"#888",fontFamily:"monospace",marginTop:2}}>{splitName(opponentName).last.toUpperCase()}</div>
                </div>
              </div>

              {/* Match history */}
              <div style={{fontSize:10,color:"#888",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:8}}>MATCH HISTORY</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {h2hData.matches.map((m,i)=>{
                  const iWon = m.winner === playerName;
                  return(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                      padding:"8px 10px",borderRadius:8,
                      background:iWon?"#fafff8":"#fffafa",
                      border:`1px solid ${iWon?"#d0e8b0":"#f0c0c0"}`}}>
                      <div style={{width:22,height:22,borderRadius:"50%",
                        background:iWon?"#a8d828":"#f08080",
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:10,fontWeight:"bold",color:"#fff",fontFamily:"monospace"}}>{iWon?"W":"L"}</span>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:2}}>
                          <TourLevelBadge tournament={m.event} small={true}/>
                          <span style={{fontSize:11,color:"#1a1a1a",fontWeight:"bold"}}>{m.event}</span>
                        </div>
                        <div style={{fontSize:9,color:"#aaa",fontFamily:"monospace"}}>
                          {SURFACE_ICONS[m.surface?.toLowerCase()]} {m.surface} · {m.date}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:10,fontFamily:"monospace",color:"#3a5a3a",fontWeight:"bold"}}>{m.score}</div>
                        <div style={{fontSize:9,color:iWon?"#2a8a2a":"#cc3333",fontFamily:"monospace",marginTop:1}}>
                          {splitName(m.winner).last}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TITLES ── */}
          {activeTab==="titles"&&(
            <div style={{padding:"14px 16px"}}>
              {/* Title summary */}
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,
                marginBottom:16,background:"#f5f5f2",borderRadius:10,padding:"12px"}}>
                <span style={{fontSize:28}}>🏆</span>
                <div>
                  <div style={{fontSize:32,fontWeight:"bold",color:"#a8d828",fontFamily:"monospace"}}>
                    {profile.titles?.total}
                  </div>
                  <div style={{fontSize:9,color:"#888",fontFamily:"monospace",letterSpacing:"0.1em"}}>CAREER TITLES</div>
                </div>
              </div>

              {/* Breakdown by level */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {Object.entries(profile.titles?.breakdown||{}).map(([level,count])=>(
                  <div key={level} style={{display:"flex",alignItems:"center",gap:10,
                    padding:"10px 12px",borderRadius:8,
                    background:LEVEL_BG[level]||"#f8f8f8",
                    border:`2px solid ${LEVEL_BORDER[level]||"#ddd"}`,
                    boxShadow:`0 1px 4px ${LEVEL_COLOR[level]||"#888"}18`}}>
                    <span style={{fontSize:18,flexShrink:0}}>
                      {level.includes("Grand")?"🎾":level.includes("1000")?"💎":level.includes("500")?"⭐":"🏅"}
                    </span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:"bold",color:"#1a1a1a"}}>{level}</div>
                      <div style={{fontSize:9,color:"#888",fontFamily:"monospace"}}>
                        {level==="Grand Slam"?"Australian Open · French Open · Wimbledon · US Open":
                         level.includes("1000")?"Indian Wells · Miami · Monte Carlo · Madrid · Rome · Cincinnati":
                         level.includes("500")?"Vienna · Basel · Dubai · Dubai · Barcelona · Washington":
                         level.includes("250")?"Lyon · Montpellier · Marrakech · Metz · Eastbourne":""}
                      </div>
                    </div>
                    <div style={{textAlign:"center",minWidth:32}}>
                      <span style={{fontSize:22,fontWeight:"bold",fontFamily:"monospace",
                        color:count>0?LEVEL_COLOR[level]||"#888":"#ddd"}}>{count}</span>
                    </div>
                  </div>
                ))}
              </div>

              {profile.titles?.total === 0 && (
                <div style={{textAlign:"center",color:"#ccc",padding:24,fontFamily:"monospace",fontSize:12}}>
                  No titles yet — working their way up! 💪
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── MATCH DETAIL MODAL ───────────────────────────────────────────────────────
// Full intra-game point history, set-by-set breakdown, deep stats
const MATCH_DETAIL_DATA = {
  "sr:71642328": {
    status:"final", venue:"Court Philippe-Chatrier", surface:"Clay",
    duration:"3h 24m", temperature:"22°C", wind:"Light",
    home:{name:"Gaston, Hugo", country:"FRA", rank:62, seed:null, aces:1, dfs:7, firstServe:"81/130 (62%)", firstServePtsWon:"51/81 (63%)", secondServePtsWon:"30/49 (61%)", bpWon:"8/17", winners:55, ufErrors:35, totalPtsWon:147, maxStreak:7},
    away:{name:"Monfils, Gael", country:"FRA", rank:105, seed:null, aces:12, dfs:7, firstServe:"74/135 (55%)", firstServePtsWon:"51/74 (69%)", secondServePtsWon:"24/61 (39%)", bpWon:"5/17", winners:34, ufErrors:51, totalPtsWon:132, maxStreak:7},
    sets:[
      { n:1, h:6, a:2, games:[
        {g:1,server:"away",score:"1-0",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"15",a:"30"},{h:"15",a:"40"},{h:"15",a:"G"},],winner:"away",break:true},
        {g:2,server:"home",score:"1-1",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:3,server:"away",score:"2-1",pts:[{h:"0",a:"15"},{h:"15",a:"15"},{h:"30",a:"15"},{h:"40",a:"15"},{h:"G",a:"15"}],winner:"home",break:true},
        {g:4,server:"home",score:"3-1",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:5,server:"away",score:"4-1",pts:[{h:"0",a:"15"},{h:"15",a:"15"},{h:"30",a:"15"},{h:"40",a:"15"},{h:"G",a:"15"}],winner:"home",break:true},
        {g:6,server:"home",score:"5-1",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:7,server:"away",score:"5-2",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:8,server:"home",score:"6-2",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
      ]},
      { n:2, h:6, a:3, games:[
        {g:1,server:"home",score:"1-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:2,server:"away",score:"1-1",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:3,server:"home",score:"2-1",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:4,server:"away",score:"2-2",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:5,server:"home",score:"3-2",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:6,server:"away",score:"4-2",pts:[{h:"15",a:"0"},{h:"15",a:"15"},{h:"15",a:"30"},{h:"15",a:"40"},{h:"15",a:"G"}],winner:"away"},
        {g:7,server:"home",score:"5-2",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:8,server:"away",score:"5-3",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:9,server:"home",score:"6-3",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
      ]},
      { n:3, h:3, a:6, games:[
        {g:1,server:"away",score:"0-1",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:2,server:"home",score:"1-1",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:3,server:"away",score:"1-2",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:4,server:"home",score:"1-3",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"15",a:"30"},{h:"15",a:"40"},{h:"15",a:"G"}],winner:"away",break:true},
        {g:5,server:"away",score:"1-4",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:6,server:"home",score:"2-4",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:7,server:"away",score:"2-5",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:8,server:"home",score:"3-5",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:9,server:"away",score:"3-6",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
      ]},
      { n:4, h:2, a:6, games:[
        {g:1,server:"home",score:"0-1",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"15",a:"30"},{h:"15",a:"40"},{h:"15",a:"G"}],winner:"away",break:true},
        {g:2,server:"away",score:"0-2",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:3,server:"home",score:"1-2",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:4,server:"away",score:"1-3",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:5,server:"home",score:"1-4",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"15",a:"30"},{h:"15",a:"40"},{h:"15",a:"G"}],winner:"away",break:true},
        {g:6,server:"away",score:"1-5",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:7,server:"home",score:"2-5",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:8,server:"away",score:"2-6",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
      ]},
      { n:5, h:6, a:0, games:[
        {g:1,server:"home",score:"1-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:2,server:"away",score:"2-0",pts:[{h:"15",a:"0"},{h:"15",a:"15"},{h:"30",a:"15"},{h:"40",a:"15"},{h:"G",a:"15"}],winner:"home",break:true},
        {g:3,server:"home",score:"3-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:4,server:"away",score:"4-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home",break:true},
        {g:5,server:"home",score:"5-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:6,server:"away",score:"6-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home",break:true},
      ]},
    ]
  },
  "sr:71686650": {
    status:"live", venue:"Stadium, Little Rock AR", surface:"Hard",
    duration:"1h 42m", temperature:"28°C", wind:"Calm",
    home:{name:"Mmoh, Michael", country:"USA", rank:null, seed:5, aces:4, dfs:5, firstServe:"56/81 (69%)", firstServePtsWon:"31/56 (55%)", secondServePtsWon:"18/25 (72%)", bpWon:"4/6", winners:22, ufErrors:18, totalPtsWon:79, maxStreak:6},
    away:{name:"Matsuoka, Hayato", country:"JPN", rank:null, seed:null, aces:2, dfs:3, firstServe:"51/65 (78%)", firstServePtsWon:"32/51 (63%)", secondServePtsWon:"6/14 (43%)", bpWon:"4/9", winners:15, ufErrors:21, totalPtsWon:74, maxStreak:8},
    sets:[
      { n:1, h:5, a:7, games:[
        {g:1,server:"home",score:"0-1",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away",break:true},
        {g:2,server:"away",score:"0-2",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:3,server:"home",score:"1-2",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:4,server:"away",score:"1-3",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:5,server:"home",score:"2-3",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:6,server:"away",score:"2-4",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:7,server:"home",score:"3-4",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:8,server:"away",score:"3-5",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:9,server:"home",score:"4-5",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:10,server:"away",score:"4-6",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:11,server:"home",score:"5-6",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:12,server:"away",score:"5-7",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
      ]},
      { n:2, h:6, a:3, games:[
        {g:1,server:"away",score:"1-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home",break:true},
        {g:2,server:"home",score:"2-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:3,server:"away",score:"2-1",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:4,server:"home",score:"3-1",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:5,server:"away",score:"3-2",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:6,server:"home",score:"4-2",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:7,server:"away",score:"4-3",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:8,server:"home",score:"5-3",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:9,server:"home",score:"6-3",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
      ]},
      { n:3, h:3, a:1, games:[
        {g:1,server:"away",score:"1-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home",break:true},
        {g:2,server:"home",score:"2-0",pts:[{h:"15",a:"0"},{h:"30",a:"0"},{h:"40",a:"0"},{h:"G",a:"0"}],winner:"home"},
        {g:3,server:"away",score:"2-1",pts:[{h:"0",a:"15"},{h:"0",a:"30"},{h:"0",a:"40"},{h:"0",a:"G"}],winner:"away"},
        {g:4,server:"home",score:"3-1",pts:[{h:"0",a:"0"}],winner:null,live:true},
      ]},
    ]
  },
};

function MatchDetailModal({ matchId, match, onClose }) {
  const [activeSet, setActiveSet] = useState(null);
  const [activeTab, setActiveTab] = useState("points"); // points | stats
  const detail = MATCH_DETAIL_DATA[matchId];
  const isLive = match.status === "live";

  const hn = splitName(match.home.name);
  const an = splitName(match.away.name);

  // Set selector — default to last set
  useEffect(() => {
    if (detail?.sets?.length) setActiveSet(detail.sets.length - 1);
  }, [matchId]);

  if (!detail) return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#f0f0ec",border:"1px solid #c8d8a0",borderRadius:12,padding:32,textAlign:"center",color:"#4a6a4a",fontFamily:"monospace",fontSize:13}}>
        Detailed point history not yet available for this match
        <br/><button onClick={onClose} style={{marginTop:16,background:"#ddeeb0",border:"1px solid #4a7a10",color:"#a8d828",borderRadius:6,padding:"6px 18px",fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>CLOSE</button>
      </div>
    </div>
  );

  const set = activeSet !== null ? detail.sets[activeSet] : null;
  const homeWon = !isLive && match.setsWon?.home > match.setsWon?.away;
  const awayWon = !isLive && match.setsWon?.away > match.setsWon?.home;

  // Build serve % visual bar
  const ServePct = ({ label, pct, color }) => {
    const num = parseInt(pct);
    return (
      <div style={{marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
          <span style={{fontSize:9,color:"#4a6a4a",fontFamily:"monospace"}}>{label}</span>
          <span style={{fontSize:9,color:color||"#8aaaca",fontFamily:"monospace",fontWeight:"bold"}}>{pct}</span>
        </div>
        <div style={{height:3,background:"#ddeeb0",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${num}%`,background:color||"#a8d828",borderRadius:2,transition:"width 0.4s"}}/>
        </div>
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:200,display:"flex",alignItems:"stretch",flexDirection:"column"}} onClick={onClose}>
      <div style={{flex:1,overflowY:"auto",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12px 8px"}} onClick={onClose}>
        <div style={{background:"#f5f5f2",border:"1px solid #c8d8a0",borderRadius:14,width:"100%",maxWidth:560,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>

          {/* ── HEADER ── */}
          <div style={{background:"linear-gradient(135deg,#1a1a1a,#111111)",borderBottom:"1px solid #c8d8a0",padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:9,color:"#4a6a4a",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:3}}>
                  {getTourInfo(match.tournament).label} · {detail.surface} · {detail.venue}
                </div>
                <div style={{fontSize:9,color:"#6a8a6a",fontFamily:"monospace"}}>
                  ⏱ {detail.duration} · 🌡 {detail.temperature} · 💨 {detail.wind}
                </div>
              </div>
              <button onClick={onClose} style={{background:"transparent",border:"1px solid #c8d8a0",color:"#4a6a4a",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14,flexShrink:0}}>✕</button>
            </div>

            {/* Players + set scores */}
            {[{player:match.home, name:hn, detail:detail.home, won:homeWon, sw:match.setsWon?.home??0},
              {player:match.away, name:an, detail:detail.away, won:awayWon, sw:match.setsWon?.away??0}].map(({player,name,detail:pd,won,sw},pi)=>(
              <div key={pi} style={{display:"flex",alignItems:"center",gap:8,marginBottom:pi===0?6:0}}>
                {/* Serve indicator */}
                <div style={{width:8}}>
                  {isLive && match.gameState?.serving===(pi===0?"home":"away") && (
                    <div style={{width:6,height:6,borderRadius:"50%",background:"#ffdd22"}}/>
                  )}
                </div>
                <span style={{fontSize:11,lineHeight:1}}>{flagEmoji(player.country)}</span>
                <div style={{flex:1}}>
                  <span style={{fontSize:15,fontWeight:"bold",color:won?"#a8d828":isLive?"#e0eaf4":"#6a8a6a"}}>{name.last}</span>
                  <span style={{fontSize:10,color:"#5a7a5a",marginLeft:6}}>{name.first}</span>
                  {pd.seed&&<span style={{fontSize:9,color:"#5a7a3a",fontFamily:"monospace",marginLeft:4}}>[{pd.seed}]</span>}
                </div>
                {/* Per-set scores */}
                <div style={{display:"flex",gap:4}}>
                  {(match.sets||[]).map((s,si)=>{
                    const val=pi===0?s.h:s.a; const opp=pi===0?s.a:s.h;
                    const wonSet=val>opp;
                    const isCurSet=si===match.sets.length-1&&isLive;
                    const isActive=si===activeSet;
                    return(
                      <div key={si} onClick={()=>setActiveSet(si)} style={{
                        width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
                        borderRadius:4,cursor:"pointer",
                        background:isActive?"#2a3a05":wonSet?"#1a2a05":"transparent",
                        border:`1px solid ${isActive?"#a8d828":wonSet?"#4a7a10":isCurSet?"#3a5a1a":"#1a2a05"}`,
                        fontSize:13,fontFamily:"monospace",fontWeight:wonSet?"bold":"normal",
                        color:isActive?"#a8d828":wonSet?"#88cc44":isCurSet?"#5a8a3a":"#2a4a2a",
                        transition:"all 0.15s"}}>
                        {val}
                      </div>
                    );
                  })}
                </div>
                {/* Sets won */}
                <div style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",
                  borderRadius:4,background:won?"#1a2a05":"transparent",
                  border:`1px solid ${won?"#4a7a10":"#1a2a05"}`,
                  fontSize:14,fontWeight:"bold",fontFamily:"monospace",color:won?"#a8d828":"#2a4a2a"}}>
                  {sw}
                </div>
              </div>
            ))}
          </div>

          {/* ── TABS ── */}
          <div style={{display:"flex",borderBottom:"1px solid #d4e0a8"}}>
            {[["points","POINT HISTORY"],["stats","MATCH STATS"]].map(([k,label])=>(
              <button key={k} onClick={()=>setActiveTab(k)} style={{
                flex:1,background:"transparent",border:"none",
                borderBottom:`2px solid ${activeTab===k?"#a8d828":"transparent"}`,
                color:activeTab===k?"#a8d828":"#3a5a3a",
                padding:"9px",fontSize:10,fontFamily:"monospace",letterSpacing:"0.1em",cursor:"pointer"}}>
                {label}
              </button>
            ))}
          </div>

          {/* ── POINT HISTORY TAB ── */}
          {activeTab==="points"&&set&&(
            <div style={{padding:"10px 12px"}}>
              {/* Set selector */}
              <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
                {detail.sets.map((s,si)=>(
                  <button key={si} onClick={()=>setActiveSet(si)} style={{
                    background:activeSet===si?"#1a2a05":"transparent",
                    border:`1px solid ${activeSet===si?"#a8d828":"#1a2a05"}`,
                    color:activeSet===si?"#a8d828":"#3a5a3a",
                    borderRadius:4,padding:"2px 8px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>
                    S{s.n} {s.live?"🔴":""}({s.h}-{s.a})
                  </button>
                ))}
              </div>

              {/* Player name key */}
              <div style={{display:"flex",gap:8,marginBottom:8,fontSize:9,fontFamily:"monospace"}}>
                <span style={{color:"#a8d828"}}>● {hn.last}</span>
                <span style={{color:"#6a8a6a"}}>/</span>
                <span style={{color:"#44cc88"}}>● {an.last}</span>
                <span style={{color:"#6a8a6a",marginLeft:"auto"}}>● = server &nbsp; ⚡ = break</span>
              </div>

              {/* Games — compact horizontal text rows */}
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {set.games.map((game,gi)=>{
                  const isHomeServer=game.server==="home";
                  const isLiveGame=game.live;
                  // Build compact point sequence string e.g. "0-0 · 15-0 · 15-15 · 30-15 · 40-15 · G-15"
                  const ptStr=game.pts.map(p=>`${p.h}-${p.a}`).join(" · ");
                  const winnerName=game.winner==="home"?hn.last:game.winner==="away"?an.last:null;
                  const winnerColor=game.winner==="home"?"#a8d828":"#44cc88";
                  return(
                    <div key={gi} style={{
                      background:"#f0f0ec",
                      border:`1px solid ${game.break?"#3a5a10":isLiveGame?"#2a5a1a":"#1a2a05"}`,
                      borderRadius:6,padding:"5px 8px"}}>
                      {/* Single compact header line */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",minWidth:32}}>G{game.g}</span>
                        <span style={{fontSize:8,color:"#ffdd22",fontFamily:"monospace"}}>
                          {isHomeServer?`${hn.last} ●`:`● ${an.last}`} srv
                        </span>
                        <span style={{fontSize:8,color:"#6a8a6a",fontFamily:"monospace"}}>{game.score}</span>
                        {game.break&&<span style={{fontSize:8,color:"#a8d828",fontFamily:"monospace"}}>⚡BRK</span>}
                        {isLiveGame&&<span style={{fontSize:8,color:"#ff4444",fontFamily:"monospace"}}>🔴</span>}
                        {winnerName&&<span style={{fontSize:8,fontFamily:"monospace",color:winnerColor,marginLeft:"auto"}}>
                          {winnerName} wins{game.break?" (break)":""}
                        </span>}
                      </div>
                      {/* Compact horizontal point sequence */}
                      <div style={{fontSize:10,fontFamily:"monospace",color:"#3a6a3a",lineHeight:1.5,wordBreak:"break-word"}}>
                        {game.pts.map((pt,pi2)=>{
                          const isFinal=pi2===game.pts.length-1;
                          const hWon=pt.h==="G"||(pi2>0&&pt.h!==game.pts[pi2-1].h);
                          const aWon=pt.a==="G"||(pi2>0&&pt.a!==game.pts[pi2-1].a);
                          const hColor=pt.h==="G"?"#a8d828":hWon?"#6a9a30":"#3a5a3a";
                          const aColor=pt.a==="G"?"#44cc88":aWon?"#2a7a4a":"#2a4a3a";
                          return(
                            <span key={pi2}>
                              <span style={{color:hColor,fontWeight:isFinal?"bold":"normal"}}>{pt.h}</span>
                              <span style={{color:"#9aaa9a"}}>-</span>
                              <span style={{color:aColor,fontWeight:isFinal?"bold":"normal"}}>{pt.a}</span>
                              {pi2<game.pts.length-1&&<span style={{color:"#aabba0"}}> · </span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STATS TAB ── */}
          {activeTab==="stats"&&(
            <div style={{padding:"12px 14px"}}>
              {/* Player headers */}
              <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,marginBottom:14,textAlign:"center"}}>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:9,color:"#4a7a10",fontFamily:"monospace",marginBottom:1}}>{flagEmoji(match.home.country)} {match.home.country}</div>
                  <div style={{fontSize:13,color:"#a8d828",fontWeight:"bold"}}>{hn.last}</div>
                </div>
                <div style={{fontSize:9,color:"#6a8a6a",fontFamily:"monospace",alignSelf:"center"}}>VS</div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"#2a6a4a",fontFamily:"monospace",marginBottom:1}}>{match.away.country} {flagEmoji(match.away.country)}</div>
                  <div style={{fontSize:13,color:"#44cc88",fontWeight:"bold"}}>{an.last}</div>
                </div>
              </div>

              {/* Serve stats */}
              <div style={{fontSize:9,color:"#6a8a6a",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:8}}>SERVE</div>
              {[
                ["Aces",       detail.home.aces,            detail.away.aces],
                ["Double Faults", detail.home.dfs,          detail.away.dfs],
                ["1st Serve %",   detail.home.firstServe,   detail.away.firstServe],
                ["1st Srv Pts Won",detail.home.firstServePtsWon, detail.away.firstServePtsWon],
                ["2nd Srv Pts Won",detail.home.secondServePtsWon,detail.away.secondServePtsWon],
              ].map(([label,hv,av])=>{
                const hn2=parseInt(String(hv)); const an2=parseInt(String(av));
                const tot=hn2+an2; const hpct=tot>0?Math.round((hn2/tot)*100):50;
                return(
                  <div key={label} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:11,color:"#a8d828",fontFamily:"monospace",fontWeight:"bold"}}>{hv}</span>
                      <span style={{fontSize:9,color:"#6a8a6a",fontFamily:"monospace"}}>{label}</span>
                      <span style={{fontSize:11,color:"#44cc88",fontFamily:"monospace",fontWeight:"bold"}}>{av}</span>
                    </div>
                    <div style={{height:3,background:"#f0f0ec",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${hpct}%`,background:"linear-gradient(90deg,#a8d828,#6a9a10)",borderRadius:2}}/>
                    </div>
                  </div>
                );
              })}

              <div style={{fontSize:9,color:"#6a8a6a",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:8,marginTop:12}}>RALLY</div>
              {[
                ["Winners",       detail.home.winners,     detail.away.winners],
                ["Unforced Errors",detail.home.ufErrors,   detail.away.ufErrors],
                ["Break Pts Won", detail.home.bpWon,       detail.away.bpWon],
                ["Total Points",  detail.home.totalPtsWon, detail.away.totalPtsWon],
                ["Max Streak",    detail.home.maxStreak,   detail.away.maxStreak],
              ].map(([label,hv,av])=>{
                const hn2=parseInt(String(hv)); const an2=parseInt(String(av));
                const tot=hn2+an2; const hpct=tot>0?Math.round((hn2/tot)*100):50;
                return(
                  <div key={label} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:11,color:"#a8d828",fontFamily:"monospace",fontWeight:"bold"}}>{hv}</span>
                      <span style={{fontSize:9,color:"#6a8a6a",fontFamily:"monospace"}}>{label}</span>
                      <span style={{fontSize:11,color:"#44cc88",fontFamily:"monospace",fontWeight:"bold"}}>{av}</span>
                    </div>
                    <div style={{height:3,background:"#f0f0ec",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${hpct}%`,background:"linear-gradient(90deg,#a8d828,#6a9a10)",borderRadius:2}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── FEEDBACK MODAL ───────────────────────────────────────────────────────────
function FeedbackModal({onClose}){
  const [category,setCategory]=useState("general"); const [rating,setRating]=useState(0);
  const [message,setMessage]=useState(""); const [email,setEmail]=useState(""); const [status,setStatus]=useState("idle");
  const CATS=["general","bug","feature","odds","scores","ui"];
  const submit=async()=>{
    if(!message.trim()||rating===0) return; setStatus("saving");
    try{
      const entry={id:Date.now(),category,rating,message:message.trim(),email:email.trim(),ts:new Date().toISOString()};
      let existing=[]; try{const r=await window.storage.get("feedback:all",true);if(r?.value)existing=JSON.parse(r.value);}catch(e){}
      existing.push(entry); await window.storage.set("feedback:all",JSON.stringify(existing),true);
      setStatus("done");
    }catch(e){setStatus("error");}
  };
  return(
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#ffffff",border:"1px solid #1a3a5a",borderRadius:12,width:"100%",maxWidth:400,padding:20}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:"bold",color:"#1a1a1a"}}>SITE FEEDBACK</div>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #1a3a5a",color:"#4a6a9a",borderRadius:4,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        {status==="done"?(<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:32,marginBottom:12}}>✅</div><div style={{fontSize:14,color:"#2a8a2a",fontFamily:"monospace"}}>FEEDBACK RECEIVED</div><button onClick={onClose} style={{marginTop:16,background:"#e8f8e8",border:"1px solid #1a5a2a",color:"#22cc55",borderRadius:6,padding:"6px 20px",fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>CLOSE</button></div>):(
          <>
            <div style={{marginBottom:10}}><div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginBottom:4}}>CATEGORY</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{CATS.map(c=><button key={c} onClick={()=>setCategory(c)} style={{background:category===c?"#0d2a48":"transparent",border:`1px solid ${category===c?"#2a6aaa":"#1a3a5a"}`,color:category===c?"#6aaee8":"#2a5a7a",borderRadius:4,padding:"2px 8px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>{c.toUpperCase()}</button>)}</div></div>
            <div style={{marginBottom:10}}><div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginBottom:4}}>RATING</div><div style={{display:"flex",gap:4}}>{[1,2,3,4,5].map(s=><button key={s} onClick={()=>setRating(s)} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",opacity:s<=rating?1:0.25}}>⭐</button>)}</div></div>
            <div style={{marginBottom:8}}><div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginBottom:4}}>MESSAGE *</div><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Tell us what you think..." style={{width:"100%",background:"#fafaf8",border:"1px solid #1a3a5a",borderRadius:6,padding:"6px 8px",color:"#1a5a9a",fontSize:12,fontFamily:"monospace",outline:"none",resize:"vertical",minHeight:68,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:12}}><div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace",marginBottom:4}}>EMAIL <span style={{color:"#8a9a8a"}}>(optional)</span></div><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" style={{width:"100%",background:"#fafaf8",border:"1px solid #1a3a5a",borderRadius:6,padding:"5px 8px",color:"#1a5a9a",fontSize:12,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/></div>
            <button onClick={submit} disabled={!message.trim()||rating===0} style={{width:"100%",background:message.trim()&&rating>0?"#0a2a48":"#0a1520",border:`1px solid ${message.trim()&&rating>0?"#2a6aaa":"#1a3a5a"}`,color:message.trim()&&rating>0?"#6aaee8":"#2a4a6a",borderRadius:6,padding:"8px",fontSize:11,fontFamily:"monospace",letterSpacing:"0.1em",cursor:"pointer"}}>{status==="saving"?"SUBMITTING…":"SUBMIT FEEDBACK"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── VISITOR TRACKER ─────────────────────────────────────────────────────────

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
  const { matches: liveMatches, oddsData: liveOdds,
          loading: dataLoading, error: dataError,
          lastUpdated, refresh } = useLiveData();
  const MATCHES = liveMatches.length > 0 ? liveMatches : ALL_MATCHES;

  const [mainTab,      setMainTab]      = useState("SCORES");
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tourFilter,   setTourFilter]   = useState("ALL");
  const [favorites,    setFavorites]    = useState(new Set());
  const [favPlayers,   setFavPlayers]   = useState(new Set());
  const [pulse,        setPulse]        = useState(true);
  const [username,     setUsername]     = useState("");
  const [usernameInput,setUsernameInput]= useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [matchDetail, setMatchDetail] = useState(null);
  const [playerProfile, setPlayerProfile] = useState(null); // {name, country, tour, opponent}

  const { myPicks, allPicks, submitPick, removePick } = usePicks(username);

  useEffect(()=>{ const t=setInterval(()=>setPulse(p=>!p),900); return()=>clearInterval(t); },[]);

  const toggleFav=id=>setFavorites(f=>{const n=new Set(f);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleFavPlayer=name=>setFavPlayers(f=>{const n=new Set(f);n.has(name)?n.delete(name):n.add(name);return n;});
  const handleSaveUsername=()=>{ const u=usernameInput.trim(); if(!u)return; setUsername(u); setShowSettings(false); };

  const shown=(()=>{
    let list=
      mainTab==="FAVORITES" ? MATCHES.filter(m=>favorites.has(m.id)||favPlayers.some(p=>m.home.name===p||m.away.name===p)) :
      mainTab==="PICKS"     ? MATCHES.filter(m=>Object.values(myPicks).some(p=>p.matchId===m.id)||m.status!=="final") :
      showLiveOnly          ? MATCHES.filter(m=>m.status==="live") :
      selectedDate          ? MATCHES.filter(m=>(m.startDate||m.startTime?.slice(0,10))===selectedDate) :
      MATCHES;
    if(tourFilter!=="ALL") list=list.filter(m=>getTourInfo(m.tournament).tour===tourFilter);
    // Filter UTR
    list = list.filter(m=>!m.tournament.includes("UTR")&&getTourInfo(m.tournament).tour!=="UTR");
    if(tourFilter!=="ALL") list=list.filter(m=>getTourInfo(m.tournament).tour===tourFilter);
    const LEVEL_PRI={"Grand Slam":0,"Masters 1000":1,"WTA 1000":1,"ATP 500":2,"WTA 500":2,"ATP 250":3,"WTA 250":3,"Challenger":4};
    return list.sort((a,b)=>{
      const sd=(STATUS_ORDER[a.status]??9)-(STATUS_ORDER[b.status]??9);
      if(sd!==0) return sd;
      const la=LEVEL_PRI[a.tourLevel||getTourLevel(a.tournament)]??9;
      const lb=LEVEL_PRI[b.tourLevel||getTourLevel(b.tournament)]??9;
      if(la!==lb) return la-lb;
      return (a.startTime||"").localeCompare(b.startTime||"");
    });
  })();
  const groups={};
  if(mainTab!=="LEADERBOARD"){ shown.forEach(m=>{const k=m.tournament;if(!groups[k])groups[k]=[];groups[k].push(m);}); }

  const liveCount=MATCHES.filter(m=>m.status==="live").length;
  const pickCount=Object.keys(myPicks).length;
  const favCount=favorites.size;

  const MAIN_TABS=[["SCORES","🎾"],["PICKS",`🎯 ${pickCount}`],["LEADERBOARD","🏆"],["FAVORITES",`⭐ ${favCount}`]];

  return(
    <div style={{minHeight:"100vh",background:"#f5f5f2",color:"#2a2a2a",fontFamily:"Georgia,serif",display:"flex",flexDirection:"column"}}>
      {/* HEADER */}
      <div style={{background:"linear-gradient(180deg,#1c1c1c,#111111)",borderBottom:"2px solid #a8d828",padding:"13px 13px 0",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src="/logo.png" onError={e=>{e.target.onerror=null;e.target.src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%231a1a1a' stroke='%23a8d828' stroke-width='3'/%3E%3Ctext x='50' y='58' text-anchor='middle' font-family='Arial Black' font-size='18' fill='%23a8d828'%3EBP%3C/text%3E%3C/svg%3E";}} alt="Break Point Scores" style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:"2px solid #a8d828",flexShrink:0}}/>
            <div>
              <div style={{fontSize:17,fontWeight:"bold",letterSpacing:"0.05em",color:"#1a1a1a"}}><span style={{color:"#ffffff"}}>BREAK</span> <span style={{color:"#a8d828"}}>POINT</span></div><div style={{fontSize:10,color:"#a8d828",letterSpacing:"0.2em",fontFamily:"monospace",fontWeight:"bold"}}>SCORES</div>
              <div style={{fontSize:8,color:"#6a8a3a",letterSpacing:"0.12em",fontFamily:"monospace"}}>{new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}).toUpperCase()}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={()=>setShowSettings(s=>!s)} style={{
              background:username?"#1a1a1a":"#a8d828",
              border:`2px solid ${username?"#a8d828":"#7aaa10"}`,
              color:username?"#a8d828":"#1a1a1a",
              borderRadius:6,padding:"4px 11px",fontSize:9,
              fontFamily:"monospace",cursor:"pointer",fontWeight:"bold",
              letterSpacing:"0.05em",boxShadow:username?"none":"0 2px 8px #a8d82844"}}>
              {username ? `👤 ${username}` : "CREATE ACCOUNT / LOG IN"}
            </button>
            <button onClick={()=>setShowFeedback(true)} style={{background:"transparent",border:"1px solid #1a3a5a",color:"#3a7aaa",borderRadius:4,padding:"3px 8px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>✉ FEEDBACK</button>
            <div style={{display:"flex",alignItems:"center",gap:5,background:"#ddeeb0",border:"1px solid #4a7a10",borderRadius:20,padding:"3px 9px"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:pulse?"#a8d828":"#2a3a05",boxShadow:pulse?"0 0 8px #a8d828":"none",transition:"all 0.3s"}}/>
              <span style={{fontSize:9,color:"#a8d828",fontFamily:"monospace"}}>{liveCount} LIVE</span>
            </div>
          </div>
        </div>
        {showSettings&&(
          <div style={{marginBottom:8,background:"#ffffff",border:"2px solid #a8d828",
            borderRadius:10,padding:"12px 14px",boxShadow:"0 4px 20px #00000018"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,
              paddingBottom:10,borderBottom:"1px solid #f0f0ec"}}>
              <span style={{fontSize:20}}>🎾</span>
              <div>
                <div style={{fontSize:12,fontWeight:"bold",color:"#1a1a1a"}}>Break Point Scores</div>
                <div style={{fontSize:9,color:"#888",fontFamily:"monospace"}}>
                  {username?"You are signed in":"Sign in to submit picks, chat & compete on the leaderboard"}
                </div>
              </div>
              <button onClick={()=>setShowSettings(false)} style={{marginLeft:"auto",
                background:"transparent",border:"none",color:"#ccc",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            {username?(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,
                  background:"#f5f5f2",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"#a8d828",
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:16,fontWeight:"bold",color:"#1a1a1a"}}>
                      {username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div style={{fontSize:13,fontWeight:"bold",color:"#1a1a1a"}}>{username}</div>
                    <div style={{fontSize:9,color:"#888",fontFamily:"monospace"}}>Display name · picks + chat</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)}
                    placeholder="Change display name…"
                    style={{flex:1,background:"#f5f5f2",border:"1px solid #e0e0dc",borderRadius:6,
                      padding:"6px 10px",color:"#1a1a1a",fontSize:11,fontFamily:"monospace",outline:"none"}}/>
                  <button onClick={handleSaveUsername} style={{background:"#a8d828",border:"none",
                    color:"#1a1a1a",borderRadius:6,padding:"6px 12px",fontSize:9,
                    fontFamily:"monospace",cursor:"pointer",fontWeight:"bold"}}>UPDATE</button>
                </div>
                <button onClick={()=>{setUsername("");setUsernameInput("");setShowSettings(false);}}
                  style={{width:"100%",background:"transparent",border:"1px solid #f0c0c0",
                    color:"#cc6666",borderRadius:6,padding:"5px",fontSize:9,
                    fontFamily:"monospace",cursor:"pointer"}}>Sign Out</button>
              </div>
            ):(
              <div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:9,color:"#888",fontFamily:"monospace",marginBottom:5,
                    letterSpacing:"0.06em"}}>CHOOSE A USERNAME</div>
                  <input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&handleSaveUsername()}
                    placeholder="e.g. AceHunter, ClayKing…"
                    style={{width:"100%",background:"#f5f5f2",border:"1.5px solid #d0d0cc",
                      borderRadius:6,padding:"8px 10px",color:"#1a1a1a",fontSize:12,
                      fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
                </div>
                <button onClick={handleSaveUsername} style={{width:"100%",background:"#a8d828",
                  border:"none",color:"#1a1a1a",borderRadius:7,padding:"9px",fontSize:11,
                  fontFamily:"monospace",fontWeight:"bold",cursor:"pointer",letterSpacing:"0.06em",
                  boxShadow:"0 2px 8px #a8d82844",marginBottom:6}}>
                  CREATE ACCOUNT
                </button>
                <div style={{textAlign:"center",margin:"4px 0 6px",fontSize:9,color:"#ccc",
                  fontFamily:"monospace"}}>— already have one? —</div>
                <button onClick={handleSaveUsername} style={{width:"100%",background:"transparent",
                  border:"1.5px solid #1a1a1a",color:"#1a1a1a",borderRadius:7,padding:"8px",
                  fontSize:11,fontFamily:"monospace",fontWeight:"bold",cursor:"pointer",
                  letterSpacing:"0.06em"}}>LOG IN</button>
                <div style={{marginTop:8,fontSize:8,color:"#bbb",fontFamily:"monospace",
                  textAlign:"center",lineHeight:1.6}}>
                  Your picks · chat · leaderboard rank saved to your account. No email required.
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{display:"flex",overflowX:"auto"}}>
          {MAIN_TABS.map(([t,icon])=>(
            <button key={t} onClick={()=>setMainTab(t)} style={{background:"transparent",border:"none",borderBottom:`2px solid ${mainTab===t?"#a8d828":"transparent"}`,color:mainTab===t?"#ffffff":"#aaaaaa",padding:"6px 11px",fontSize:10,fontFamily:"monospace",letterSpacing:"0.1em",cursor:"pointer",marginBottom:-1,whiteSpace:"nowrap"}}>
              {icon} {t}
            </button>
          ))}
        </div>
        {mainTab!=="LEADERBOARD"&&(
          <div style={{paddingTop:6,paddingBottom:4}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              {["ALL","ATP","WTA","CH"].map(f=>(
                <button key={f} onClick={()=>setTourFilter(f)} style={{background:tourFilter===f?"#a8d828":"transparent",border:`1px solid ${tourFilter===f?"#a8d828":"#d0d0cc"}`,color:tourFilter===f?"#1a1a1a":"#888",borderRadius:4,padding:"2px 9px",fontSize:9,fontFamily:"monospace",cursor:"pointer",fontWeight:tourFilter===f?"bold":"normal"}}>{f}</button>
              ))}
              {mainTab==="SCORES"&&(
                <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                  <button onClick={()=>{setShowLiveOnly(l=>!l);setSelectedDate(null);}} style={{display:"flex",alignItems:"center",gap:4,background:showLiveOnly?"#1a1a1a":"transparent",border:`2px solid ${showLiveOnly?"#a8d828":"#d0d0cc"}`,color:showLiveOnly?"#a8d828":"#888",borderRadius:6,padding:"3px 10px",fontSize:9,fontFamily:"monospace",cursor:"pointer",fontWeight:"bold"}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:showLiveOnly?"#a8d828":"#ccc",display:"inline-block",flexShrink:0}}/> LIVE
                  </button>
                  <button onClick={()=>setShowDatePicker(d=>!d)} style={{display:"flex",alignItems:"center",gap:4,background:selectedDate?"#1a2a05":"transparent",border:`1px solid ${selectedDate?"#a8d828":"#d0d0cc"}`,color:selectedDate?"#a8d828":"#888",borderRadius:6,padding:"3px 10px",fontSize:9,fontFamily:"monospace",cursor:"pointer"}}>
                    📅 {selectedDate?new Date(selectedDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"DATE"}
                    {selectedDate&&<span onClick={(e)=>{e.stopPropagation();setSelectedDate(null);setShowDatePicker(false);}} style={{marginLeft:4,color:"#cc3333",fontWeight:"bold"}}>✕</span>}
                  </button>
                </div>
              )}
            </div>
            {showDatePicker&&mainTab==="SCORES"&&(
              <div style={{marginTop:6,background:"#ffffff",border:"2px solid #a8d828",borderRadius:10,padding:10,boxShadow:"0 4px 16px #00000018"}}>
                <div style={{fontSize:9,color:"#888",fontFamily:"monospace",marginBottom:6}}>SELECT DATE</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                  {(()=>{const dates=[];for(let i=-7;i<=7;i++){const d=new Date();d.setDate(d.getDate()+i);const iso=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())).toISOString().slice(0,10);const label=i===-1?"Yesterday":i===0?"Today":i===1?"Tomorrow":d.toLocaleDateString("en-US",{month:"short",day:"numeric"});dates.push({iso,label,isPast:i<0,isToday:i===0});}return dates.map(({iso,label,isToday,isPast})=>(<button key={iso} onClick={()=>{setSelectedDate(iso);setShowDatePicker(false);setShowLiveOnly(false);}} style={{background:selectedDate===iso?"#a8d828":isToday?"#f0f8e8":"#f5f5f2",border:`1px solid ${selectedDate===iso?"#a8d828":isToday?"#c8e070":"#e0e0dc"}`,color:selectedDate===iso?"#1a1a1a":isToday?"#2a6a2a":isPast?"#666":"#1a1a1a",borderRadius:6,padding:"4px 10px",fontSize:10,fontFamily:"monospace",cursor:"pointer",fontWeight:isToday||selectedDate===iso?"bold":"normal"}}>{label}</button>));})()}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:9,color:"#888",fontFamily:"monospace"}}>Or pick:</span>
                  <input type="date" value={selectedDate||""} onChange={e=>{setSelectedDate(e.target.value);setShowDatePicker(false);setShowLiveOnly(false);}} style={{flex:1,background:"#f5f5f2",border:"1px solid #d0d0cc",borderRadius:6,padding:"4px 8px",fontSize:11,fontFamily:"monospace",outline:"none",color:"#1a1a1a"}}/>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div style={{flex:1,padding:"11px 13px"}}>
        {mainTab==="LEADERBOARD"&&<LeaderboardView allPicks={allPicks} username={username} myPicks={myPicks}/>}
        {mainTab!=="LEADERBOARD"&&(
          <>
            {mainTab==="PICKS"&&!username&&(
              <div style={{background:"#e8f0d8",border:"1px solid #1a3a5a",borderRadius:8,padding:"11px 13px",marginBottom:10,textAlign:"center"}}>
                <div style={{fontSize:13,color:"#6aaee8",marginBottom:3}}>Set a username to submit picks</div>
                <div style={{fontSize:9,color:"#5a7a5a",fontFamily:"monospace"}}>Click ⚙ SET NAME in the header above</div>
              </div>
            )}
            {{shown.length===0&&(
              <div style={{textAlign:"center",padding:40}}>
                {dataLoading&&liveMatches.length===0
                  ? <span style={{color:"#a8d828",fontFamily:"monospace",fontSize:11,letterSpacing:"0.08em"}}>⚡ LOADING LIVE DATA…</span>
                  : <span style={{color:"#aaa",fontFamily:"monospace",fontSize:11}}>
                      {mainTab==="FAVORITES"?"No favorites yet — tap ☆":mainTab==="PICKS"?"No picks yet":selectedDate?"No matches found for this date":"No matches available"}
                    </span>
                }
              </div>
            )}}
            {Object.entries(groups).map(([tourney,matches])=>{
              const{label,tour,surface}=getTourInfo(tourney);
              const accent=TOUR_ACCENT[tour]||"#3a9ef0";
              return(
                <div key={tourney} style={{marginBottom:16}}>
                  {(()=>{ const sc=surfaceStyle(surface); return(
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,
                    padding:"9px 12px",borderRadius:8,
                    background:`linear-gradient(135deg,${sc.bg},#ffffff)`,
                    border:`2px solid ${sc.border}`,
                    boxShadow:`0 2px 8px ${sc.color}20`}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:3,
                      fontSize:9,fontFamily:"monospace",fontWeight:"bold",letterSpacing:"0.08em",
                      color:"#ffffff",background:sc.color,borderRadius:4,
                      padding:"3px 8px",whiteSpace:"nowrap",
                      boxShadow:`0 1px 4px ${sc.color}55`}}>
                      {sc.icon} {surface.toUpperCase()}
                    </span>
                    <span style={{fontSize:14,color:"#1a1a1a",fontWeight:"bold",flex:1}}>
                      {label}
                    </span>
                    <TourLevelBadge tournament={tourney}/>
                    <span style={{fontSize:8,fontFamily:"monospace",fontWeight:"bold",
                      color:accent,background:`${accent}15`,border:`1px solid ${accent}44`,
                      borderRadius:3,padding:"2px 6px",letterSpacing:"0.1em"}}>{tour}</span>
                  </div>
                  );})()}
                  {matches.map(m=>(
                    <MatchCard key={m.id} match={m} pulse={pulse} isFav={favorites.has(m.id)} onToggleFav={toggleFav}
                      username={username} myPicks={myPicks} onSubmitPick={submitPick} onRemovePick={removePick} onOpenDetail={()=>setMatchDetail({matchId:m.id,match:m})} setPlayerProfile={setPlayerProfile}/>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* VISITOR BAR */}

      {dataLoading&&liveMatches.length===0&&<div style={{background:"#eef6e0",borderTop:"1px solid #c8e070",padding:"4px 14px"}}><span style={{fontSize:9,color:"#5a8a2a",fontFamily:"monospace"}}>⚡ LOADING LIVE DATA…</span></div>}
      {dataError&&<div style={{background:"#fceaec",padding:"4px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:9,color:"#cc3333",fontFamily:"monospace"}}>⚠ Using cached data</span><button onClick={refresh} style={{fontSize:9,color:"#cc3333",background:"transparent",border:"1px solid #f0a0a0",borderRadius:4,padding:"1px 8px",cursor:"pointer",fontFamily:"monospace"}}>RETRY</button></div>}
      {/* FOOTER */}
      <div style={{textAlign:"center",padding:"5px 13px",color:"#9aaa9a",fontSize:8,fontFamily:"monospace",borderTop:"1px solid #d0d8c0"}}>
        © 2026 BREAK POINT SCORES · SCORES: SPORTRADAR · ODDS: THE-ODDS-API.COM · FOR ENTERTAINMENT ONLY
      </div>

      {showFeedback&&<FeedbackModal onClose={()=>setShowFeedback(false)}/>}
      {playerProfile&&<PlayerProfileModal playerName={playerProfile.name} playerCountry={playerProfile.country} playerTour={playerProfile.tour} opponentName={playerProfile.opponent} onClose={()=>setPlayerProfile(null)}/>}
      {matchDetail&&<MatchDetailModal matchId={matchDetail.matchId} match={matchDetail.match} onClose={()=>setMatchDetail(null)}/>}
    </div>
  );
}
