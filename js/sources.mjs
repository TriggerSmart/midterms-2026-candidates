import { stateFromRaceLabel, districtFromRaceLabel, parseCandidateLine, dedupeCandidates, consensusForecast, normalizeParty, parseCsv, candidateRecordsFromElectIndex, forecastRecordsFromElectIndex } from './core.mjs';

const WIKI_API='https://en.wikipedia.org/w/api.php';
const FEC_API='https://api.open.fec.gov/v1';
const CACHE_PREFIX='midterms-osint-v5:';
const ELECTINDEX_BASE='https://raw.githubusercontent.com/ElectIndex/26_us_forecast_data/main';
const ELECTINDEX_REPO='https://github.com/ElectIndex/26_us_forecast_data';
const FIFTEEN_MIN=15*60*1000;
const SIX_HOURS=6*60*60*1000;

const PAGES={
  house:'2026 United States House of Representatives elections',
  houseRatings:'2026 United States House of Representatives election ratings',
  senate:'2026 United States Senate elections',
  governor:'2026 United States gubernatorial elections'
};

function cacheGet(key, maxAge=FIFTEEN_MIN, allowStale=false){
  try{
    const raw=localStorage.getItem(CACHE_PREFIX+key); if(!raw) return null;
    const parsed=JSON.parse(raw);
    if(!allowStale && Date.now()-parsed.savedAt>maxAge) return null;
    return parsed.value;
  }catch{return null;}
}
function cacheSet(key,value){
  try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({savedAt:Date.now(),value}));}catch{}
}
function timeoutSignal(ms=20000){
  const c=new AbortController(); setTimeout(()=>c.abort(),ms); return c.signal;
}
async function fetchJson(url, opts={}){
  const res=await fetch(url,{...opts,signal:opts.signal||timeoutSignal()});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function fetchText(url, opts={}){
  const res=await fetch(url,{...opts,signal:opts.signal||timeoutSignal()});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}
function wikiUrl(params){
  const u=new URL(WIKI_API); Object.entries({...params,format:'json',origin:'*'}).forEach(([k,v])=>u.searchParams.set(k,v)); return u;
}
function fecKey(){ return localStorage.getItem('midterms-fec-api-key')||'DEMO_KEY'; }
function fecUrl(path,params={}){
  const u=new URL(FEC_API+path); Object.entries({...params,api_key:fecKey()}).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&v!=='') u.searchParams.set(k,v); }); return u;
}

export async function fetchWikiPageHtml(page){
  const data=await fetchJson(wikiUrl({action:'parse',page,prop:'text'}));
  if(!data?.parse?.text?.['*']) throw new Error(`Wikipedia parse response missing page HTML for ${page}`);
  return data.parse.text['*'];
}

function docFromHtml(html){ return new DOMParser().parseFromString(html,'text/html'); }
function text(el){ return (el?.textContent||'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim(); }
function candidateWikiTitle(li){
  const a=[...li.querySelectorAll('a[href^="/wiki/"]')].find(a=>!a.closest('sup')&&!/Republican|Democratic|Libertarian|Green|Independent|Constitution|Party/i.test(text(a)));
  if(!a) return null;
  return decodeURIComponent(a.getAttribute('href').replace('/wiki/','')).replaceAll('_',' ');
}
function raceId(office,state,district,label){
  if(office==='S' && /(class\s*3|special)/i.test(label)) return `${office}-${state}-SPECIAL`;
  return `${office}-${state}-${district||'00'}`;
}

export function parseCandidateTablesFromDocument(doc,office){
  const records=[];
  for(const table of doc.querySelectorAll('table.wikitable')){
    const header=text(table.querySelector('tr'));
    if(!/Candidates/i.test(header)) continue;
    if(office==='H' && !/District|Constituency/i.test(header)) continue;
    if((office==='S'||office==='G') && !/State|Constituency/i.test(header)) continue;
    for(const row of table.querySelectorAll('tr')){
      const lis=[...row.querySelectorAll('li')].filter(li=>/\([^()]+\)/.test(text(li)));
      if(!lis.length) continue;
      const firstCell=row.querySelector('th,td'); const label=text(firstCell);
      const state=stateFromRaceLabel(label); if(!state) continue;
      const district=office==='H'?districtFromRaceLabel(label):'00';
      const rid=raceId(office,state,district,label);
      const rowText=text(row);
      for(const li of lis){
        const parsed=parseCandidateLine(text(li).replace(/^▌\s*/,''));
        if(!parsed.name || parsed.name.length<2) continue;
        records.push({
          id:`${rid}-${parsed.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,
          raceId:rid, office, state, district, raceLabel:label,
          name:parsed.name, party:parsed.party, partyCode:normalizeParty(parsed.party),
          wikiTitle:candidateWikiTitle(li), wikiUrl:candidateWikiTitle(li)?`https://en.wikipedia.org/wiki/${encodeURIComponent(candidateWikiTitle(li).replaceAll(' ','_'))}`:null,
          raceStatus:rowText, source:'Wikipedia election summary'
        });
      }
    }
  }
  return dedupeCandidates(records);
}

export function parseForecastTablesFromDocument(doc,office){
  const out={};
  for(const table of doc.querySelectorAll('table.wikitable')){
    const allText=text(table);
    if(!/Cook/i.test(allText) || !/(Sabato|DDHQ|Decision Desk|Inside Elections|Silver)/i.test(allText)) continue;
    const forecasters=[];
    for(const h of table.querySelectorAll('th')){
      const v=text(h);
      if(/Cook|DDHQ|Decision Desk|Economist|Econ\.?|FiftyPlusOne|FPO|Fox|Inside Elections|^IE\b|NBC|RealClearPolitics|RCP|Sabato|Silver|Split Ticket|^ST\b/i.test(v) && !forecasters.includes(v)) forecasters.push(v);
    }
    for(const row of table.querySelectorAll('tr')){
      const cells=[...row.querySelectorAll(':scope > th,:scope > td')]; if(cells.length<4) continue;
      const label=text(cells[0]); const state=stateFromRaceLabel(label); if(!state) continue;
      const district=office==='H'?districtFromRaceLabel(label):'00';
      const ratingTexts=cells.map(text).filter(v=>/^(?:Toss\s*up|Tilt|Lean|Likely|Safe|Solid)\b/i.test(v));
      if(!ratingTexts.length) continue;
      const rid=raceId(office,state,district,label);
      const consensus=consensusForecast(ratingTexts);
      const ratings=ratingTexts.map((raw,i)=>({source:forecasters[i]||`Rating ${i+1}`,raw}));
      out[rid]={raceId:rid,office,state,district,raceLabel:label,ratings,consensus,sourcePage:office==='H'?PAGES.houseRatings:office==='S'?PAGES.senate:PAGES.governor};
    }
  }
  return out;
}

async function loadFreshElectionData(){
  const [racesCsv,candidatesCsv,thirdCsv,metaCsv,summaryCsv]=await Promise.all([
    fetchText(`${ELECTINDEX_BASE}/races.csv`),
    fetchText(`${ELECTINDEX_BASE}/candidates.csv`),
    fetchText(`${ELECTINDEX_BASE}/third_parties.csv`),
    fetchText(`${ELECTINDEX_BASE}/candidate_meta.csv`),
    fetchText(`${ELECTINDEX_BASE}/output/races_summary.csv`)
  ]);
  const raceRows=parseCsv(racesCsv), candidateDb=parseCsv(candidatesCsv), thirdRows=parseCsv(thirdCsv), metaRows=parseCsv(metaCsv), summaryRows=parseCsv(summaryCsv);
  const candidates=candidateRecordsFromElectIndex(raceRows,thirdRows,metaRows,candidateDb);
  const modelForecasts=forecastRecordsFromElectIndex(summaryRows);

  const wikiRequests=await Promise.allSettled([
    fetchWikiPageHtml(PAGES.houseRatings),fetchWikiPageHtml(PAGES.senate),fetchWikiPageHtml(PAGES.governor)
  ]);
  const published={};
  for(const [i,res] of wikiRequests.entries()){
    if(res.status!=='fulfilled')continue;
    const office=i===0?'H':i===1?'S':'G';
    Object.assign(published,parseForecastTablesFromDocument(docFromHtml(res.value),office));
  }
  const forecasts={...modelForecasts};
  for(const [rid,p] of Object.entries(published)){
    forecasts[rid]={...forecasts[rid],...p,model:forecasts[rid]?.model||null};
  }
  const value={
    candidates,forecasts,updatedAt:new Date().toISOString(),
    sources:{...PAGES,electIndex:ELECTINDEX_REPO},
    sourceStats:{raceRows:raceRows.length,thirdPartyRows:thirdRows.length,metaRows:metaRows.length,publishedForecasts:Object.keys(published).length,modelForecasts:Object.keys(modelForecasts).length}
  };
  cacheSet('election-data',value); return {...value,fromCache:false};
}

export async function loadElectionData({force=false}={}){
  const cached=!force&&cacheGet('election-data',FIFTEEN_MIN);
  if(cached) return {...cached,fromCache:true};
  try{return await loadFreshElectionData();}
  catch(error){
    const stale=cacheGet('election-data',Number.MAX_SAFE_INTEGER,true);
    if(stale) return {...stale,fromCache:true,stale:true,error:String(error)};
    const fecFallback=await loadFecRosterFallback().catch(()=>[]);
    return {candidates:fecFallback,forecasts:{},updatedAt:new Date().toISOString(),fallback:true,error:String(error),sources:PAGES};
  }
}

async function loadFecRosterFallback(){
  const key='fec-roster-fallback'; const cached=cacheGet(key,SIX_HOURS); if(cached) return cached;
  const all=[];
  for(const office of ['H','S']){
    let page=1,pages=1;
    do{
      const data=await fetchJson(fecUrl('/candidates/',{election_year:2026,candidate_status:'C',is_active_candidate:true,office,per_page:100,page,sort:'name'}));
      for(const c of data.results||[]){
        all.push({id:`FEC-${c.candidate_id}`,raceId:`${office}-${c.state}-${office==='H'?(c.district_number||c.district||'00'):'00'}`,office,state:c.state,district:office==='H'?(c.district_number||c.district||'00'):'00',raceLabel:office==='H'?`${c.state}-${c.district_number||c.district}`:c.state,name:formatFecName(c.name),party:c.party_full||c.party||'Unknown',partyCode:normalizeParty(c.party_full||c.party||''),fecCandidateId:c.candidate_id,incumbentChallenge:c.incumbent_challenge_full||c.incumbent_challenge,source:'FEC fallback roster'});
      }
      pages=data.pagination?.pages||1; page++;
    }while(page<=pages&&page<=25);
  }
  const v=dedupeCandidates(all); cacheSet(key,v); return v;
}

function formatFecName(name=''){
  if(!name.includes(',')) return titleCase(name);
  const [last,...rest]=name.split(','); return titleCase(`${rest.join(' ')} ${last}`.replace(/\s+/g,' ').trim());
}
function titleCase(s=''){return s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()).replace(/\b(Ii|Iii|Iv|Jr|Sr)\b/g,m=>m.toUpperCase());}
function normalizeName(s=''){ return s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
function nameSimilarity(a,b){
  const A=new Set(normalizeName(a).split(' ').filter(x=>x.length>1)), B=new Set(normalizeName(b).split(' ').filter(x=>x.length>1));
  if(!A.size||!B.size) return 0; const inter=[...A].filter(x=>B.has(x)).length; return inter/Math.max(A.size,B.size);
}

export async function enrichCandidatesBatch(candidates){
  const result={}; const titled=candidates.filter(c=>c.wikiTitle).slice(0,50);
  if(!titled.length) return result;
  const titles=[...new Set(titled.map(c=>c.wikiTitle))];
  const cacheKey='wiki-batch:'+titles.sort().join('|'); const cached=cacheGet(cacheKey,SIX_HOURS); if(cached) return cached;
  try{
    const data=await fetchJson(wikiUrl({action:'query',titles:titles.join('|'),prop:'pageimages|extracts|info',inprop:'url',piprop:'thumbnail',pithumbsize:420,exintro:1,explaintext:1}));
    for(const p of Object.values(data.query?.pages||{})){
      result[p.title]={title:p.title,extract:p.extract||'',url:p.fullurl||`https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(' ','_'))}`,thumbnail:p.thumbnail?.source||null};
    }
    cacheSet(cacheKey,result); return result;
  }catch{return result;}
}

export async function fetchCandidateWikiProfile(candidate){
  const key='wiki-profile:'+(candidate.wikiTitle||candidate.name); const cached=cacheGet(key,SIX_HOURS); if(cached) return cached;
  let title=candidate.wikiTitle;
  try{
    if(!title){
      const q=await fetchJson(wikiUrl({action:'query',generator:'search',gsrsearch:`${candidate.name} ${candidate.state} politician`,gsrlimit:1,prop:'info',inprop:'url'}));
      title=Object.values(q.query?.pages||{})[0]?.title;
    }
    if(!title) return null;
    const data=await fetchJson(wikiUrl({action:'query',titles:title,prop:'pageimages|extracts|info',inprop:'url',piprop:'thumbnail',pithumbsize:800,explaintext:1}));
    const p=Object.values(data.query?.pages||{})[0]; if(!p||p.missing!==undefined) return null;
    const profile={title:p.title,extract:p.extract||'',url:p.fullurl||`https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(' ','_'))}`,thumbnail:p.thumbnail?.source||null};
    cacheSet(key,profile); return profile;
  }catch{return null;}
}

export async function fetchFecProfile(candidate){
  if(candidate.office==='G') return {notApplicable:true};
  const key='fec-profile:'+candidate.office+':'+candidate.state+':'+candidate.name; const cached=cacheGet(key,SIX_HOURS); if(cached) return cached;
  try{
    let candidateId=candidate.fecCandidateId;
    let selected=null;
    if(!candidateId){
      const search=await fetchJson(fecUrl('/candidates/search/',{q:candidate.name,state:candidate.state,office:candidate.office,election_year:2026,per_page:20}));
      selected=(search.results||[]).sort((a,b)=>nameSimilarity(candidate.name,b.name)-nameSimilarity(candidate.name,a.name))[0];
      if(selected && nameSimilarity(candidate.name,selected.name)<0.45) selected=null;
      candidateId=selected?.candidate_id;
    }
    if(!candidateId) return null;
    const [totals,history]=await Promise.all([
      fetchJson(fecUrl('/candidates/totals/',{candidate_id:candidateId,cycle:2026,election_full:true,per_page:100})).catch(()=>({results:[]})),
      fetchJson(fecUrl(`/candidate/${candidateId}/history/`,{election_full:true,per_page:100})).catch(()=>({results:[]}))
    ]);
    const rows=totals.results||[];
    const total={
      receipts:rows.reduce((s,r)=>s+(+r.receipts||0),0),
      disbursements:rows.reduce((s,r)=>s+(+r.disbursements||0),0),
      cashOnHand:Math.max(0,...rows.map(r=>+r.cash_on_hand_end_period||0)),
      debts:rows.reduce((s,r)=>s+(+r.debts_owed_by_committee||0),0)
    };
    const profile={candidateId,record:selected,total,history:history.results||[],url:`https://www.fec.gov/data/candidate/${candidateId}/?cycle=2026&election_full=true`};
    cacheSet(key,profile); return profile;
  }catch(error){return {error:String(error)};}
}

export async function fetchStateElectionOffice(state){
  const key='state-office:'+state; const cached=cacheGet(key,SIX_HOURS); if(cached) return cached;
  try{
    const data=await fetchJson(fecUrl('/state-election-office/',{state})); const office=data.results?.[0]||null; if(office) cacheSet(key,office); return office;
  }catch{return null;}
}

export function sourceLinks(candidate,fecProfile){
  const q=encodeURIComponent(`"${candidate.name}" ${candidate.state}`);
  return [
    candidate.wikiUrl?{label:'Wikipedia',url:candidate.wikiUrl}:null,
    {label:'ElectIndex race/model data',url:ELECTINDEX_REPO},
    fecProfile?.url?{label:'FEC record',url:fecProfile.url}:null,
    {label:'Ballotpedia search',url:`https://www.google.com/search?q=site%3Aballotpedia.org+${q}`},
    {label:'Vote Smart search',url:`https://www.google.com/search?q=site%3Avotesmart.org+${q}`},
    {label:'OpenSecrets search',url:`https://www.google.com/search?q=site%3Aopensecrets.org+${q}`},
    {label:'News search',url:`https://www.google.com/search?tbm=nws&q=${q}`},
    {label:'Official/state records',url:`https://www.google.com/search?q=${q}+site%3A.gov`}
  ].filter(Boolean);
}

export function wikiSourceUrl(page){ return `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replaceAll(' ','_'))}`; }
export function forecastSourceUrl(sourcePage){ return sourcePage==='ElectIndex 2026 forecast data'?ELECTINDEX_REPO:wikiSourceUrl(sourcePage); }
export {PAGES,ELECTINDEX_REPO};
