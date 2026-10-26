export const STATES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming', DC:'District of Columbia'
};
export const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([abbr,name])=>[name,abbr]));

export function parseCandidateLine(input='') {
  const clean = input.replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
  const m = clean.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return m ? {name:m[1].trim(), party:m[2].trim()} : {name:clean, party:'Unknown'};
}

export function normalizeParty(party='') {
  const p = String(party).toLowerCase().trim();
  if (p === 'd' || p === 'dem' || p === 'dfl' || p.includes('democratic') || p.includes('democrat')) return 'D';
  if (p === 'r' || p === 'rep' || p.includes('republican') || p.includes('gop')) return 'R';
  if (p === 'l' || p === 'lib' || p.includes('libertarian')) return 'L';
  if (p === 'g' || p === 'grn' || p.includes('green')) return 'G';
  if (p === 'i' || p === 'ind' || p.includes('independent') || p.includes('nonpartisan')) return 'I';
  return 'O';
}

export function normalizeForecast(raw='') {
  const source = raw.replace(/\s+/g,' ').trim();
  const flip = /\bflip\b/i.test(source);
  if (!source || /toss\s*up/i.test(source)) return {party:'T', strength:0, label:'Tossup', flip};
  const party = /\bD\b|Dem/i.test(source) ? 'D' : (/\bR\b|Rep/i.test(source) ? 'R' : 'T');
  const strength = /safe|solid/i.test(source) ? 4 : /likely/i.test(source) ? 3 : /lean/i.test(source) ? 2 : /tilt/i.test(source) ? 1 : 0;
  const word = strength===4 ? (/solid/i.test(source)?'Solid':'Safe') : strength===3?'Likely':strength===2?'Lean':strength===1?'Tilt':'Tossup';
  return {party: strength ? party : 'T', strength, label: strength ? `${word} ${party}` : 'Tossup', flip};
}

export function consensusForecast(ratings=[]) {
  const normalized = ratings.map(normalizeForecast).filter(Boolean);
  if (!normalized.length) return {party:'T', strength:0, label:'No rating', count:0, score:0};
  const score = normalized.reduce((sum,r)=>sum + (r.party==='D' ? -r.strength : r.party==='R' ? r.strength : 0),0) / normalized.length;
  const abs = Math.abs(score);
  const strength = abs < .65 ? 0 : abs < 1.5 ? 1 : abs < 2.5 ? 2 : abs < 3.5 ? 3 : 4;
  const party = strength===0 ? 'T' : score < 0 ? 'D' : 'R';
  const word = strength===0?'Tossup':strength===1?'Tilt':strength===2?'Lean':strength===3?'Likely':'Safe';
  return {party, strength, label: strength===0?'Tossup':`${word} ${party}`, count:normalized.length, score:Number(score.toFixed(2))};
}

const RISK_WEIGHTS = {
  criminal_conviction_public_office: 35,
  official_ethics_finding: 25,
  final_civil_regulatory_finding: 20,
  active_criminal_charge: 20,
  fec_enforcement_finding: 15,
  active_official_investigation: 10,
  substantiated_conflict_disclosure: 10,
  repeated_filing_noncompliance: 5
};

export function calculateRisk(evidence=[]) {
  const verified = evidence.filter(e=>e && e.verified && RISK_WEIGHTS[e.type]);
  if (!verified.length) return {score:null, level:'Unassessed'};
  const score = Math.min(100, verified.reduce((s,e)=>s+RISK_WEIGHTS[e.type],0));
  const level = score >= 70 ? 'Severe' : score >= 50 ? 'High' : score >= 30 ? 'Elevated' : score >= 15 ? 'Guarded' : 'Low';
  return {score, level};
}

export function stateFromRaceLabel(label='') {
  const clean = label.replace(/\(.*?\)/g,'').replace(/\s+/g,' ').trim();
  const ordered = Object.entries(STATE_BY_NAME).sort((a,b)=>b[0].length-a[0].length);
  const found = ordered.find(([name])=>clean===name || clean.startsWith(name+' ') || clean.startsWith(name+' at-large'));
  return found ? found[1] : null;
}

export function districtFromRaceLabel(label='') {
  if (/at-large/i.test(label)) return 'AL';
  const m = label.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  return m ? m[1].padStart(2,'0') : '00';
}

export function partyClass(party='') {
  const n=normalizeParty(party);
  return ({D:'dem',R:'rep',I:'ind',L:'lib',G:'green',O:'other'})[n] || 'other';
}

export function extractIssueMentions(text='') {
  const categories = {
    'Abortion & reproductive policy': /\babortion\b|reproductive rights|reproductive health|pro-life|pro choice|pro-choice/i,
    'Immigration & border': /\bimmigration\b|border security|asylum|deportation|migrant/i,
    'Guns & firearms': /\bgun(s)?\b|firearm|second amendment|2nd amendment/i,
    'Economy & taxes': /\btax(es|ation)?\b|inflation|minimum wage|economic policy|tariff/i,
    'Healthcare': /health care|healthcare|medicare|medicaid|affordable care act/i,
    'Energy & climate': /climate|energy policy|oil and gas|renewable|fossil fuel/i,
    'Education': /education|school choice|student loan|public school|college tuition/i,
    'Foreign policy & national security': /ukraine|israel|china|nato|foreign policy|national security|defense spending/i,
    'Elections & democracy': /election integrity|voting rights|voter id|electoral college|january 6|democracy/i,
    'LGBTQ+ policy': /lgbtq|transgender|same-sex|gay marriage|gender identity/i
  };
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s=>s.trim()).filter(Boolean) || [];
  const out={};
  for (const [label,re] of Object.entries(categories)) {
    const hits=sentences.filter(s=>re.test(s)).slice(0,3);
    if (hits.length) out[label]=hits;
  }
  return out;
}

export function dedupeCandidates(candidates=[]) {
  const seen=new Set();
  return candidates.filter(c=>{
    const key=[c.office,c.state,c.district||'00',String(c.name||'').toLowerCase().replace(/\s+/g,' ').trim(),normalizeParty(c.party||'')].join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function parseCsv(input='') {
  const rows=[]; let row=[], field='', quoted=false;
  const s=String(input).replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(quoted){
      if(ch==='"' && s[i+1]==='"'){field+='"';i++;}
      else if(ch==='"') quoted=false;
      else field+=ch;
    }else if(ch==='"' && field==='') quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(ch!=='\r') field+=ch;
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

export function partyLabel(party='', fallback='') {
  const p=String(party).trim().toUpperCase();
  const labels={DEM:'Democratic',D:'Democratic',REP:'Republican',R:'Republican',IND:'Independent',I:'Independent',LIB:'Libertarian',L:'Libertarian',GRN:'Green',G:'Green',CON:'Constitution',FWD:'Forward',OTH:'Other'};
  return fallback || labels[p] || party || 'Unknown';
}

function electIndexOffice(raceType=''){
  const t=String(raceType).toLowerCase(); return t==='house'?'H':t==='senate'?'S':t==='governor'?'G':null;
}
function electIndexRaceId(row){
  const office=electIndexOffice(row.race_type); if(!office)return null;
  const district=office==='H'?String(row.district||row.race_code?.split('-')[1]||'00').padStart(2,'0'):'00';
  return `${office}-${row.state}-${district}`;
}
function cleanCandidateName(name=''){
  const n=String(name).replace(/\s+/g,' ').trim();
  return !n || /^\(no\s+/i.test(n) ? '' : n;
}
function candidateMetaKey(raceCode,name){
  return `${String(raceCode).toUpperCase()}|${String(name).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}`;
}

export function candidateRecordsFromElectIndex(raceRows=[], thirdPartyRows=[], metaRows=[], candidateDbRows=[]) {
  const meta=new Map(metaRows.map(m=>[candidateMetaKey(m.race_code,m.name),m]));
  const db=new Map(candidateDbRows.map(c=>[c.cand_id,c]));
  const out=[];
  const add=(race, name, party, status='', internalId='', fecId='', label='')=>{
    name=cleanCandidateName(name); if(!name)return;
    const office=electIndexOffice(race.race_type); const rid=electIndexRaceId(race); if(!office||!rid||!race.state)return;
    const district=office==='H'?String(race.district||race.race_code?.split('-')[1]||'00').padStart(2,'0'):'00';
    const m=meta.get(candidateMetaKey(race.race_code,name));
    const partyName=partyLabel(party,label);
    const dbRow=internalId?db.get(internalId):null;
    out.push({
      id:`${rid}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,
      raceId:rid, raceCode:race.race_code, office, state:race.state, district,
      raceLabel:office==='H'?`${race.state}-${district}`:`${race.state} ${office==='S'?'Senate':'Governor'}`,
      name, party:partyName, partyCode:normalizeParty(party||partyName), raceStatus:status||'listed',
      fecCandidateId:fecId||dbRow?.fec_id||null, source:'ElectIndex 2026 race roster',
      wikiTitle:m?.wiki_title||null, wikiUrl:m?.page_url||null, thumbnail:m?.image_url||null,
      description:m?.description||'',
      _enrich:m?{title:m.wiki_title||name,extract:m.description||'',url:m.page_url||null,thumbnail:m.image_url||null}:undefined
    });
  };
  const raceByCode=new Map(raceRows.map(r=>[r.race_code,r]));
  for(const r of raceRows){
    add(r,r.dem_name,r.dem_party||'DEM',r.dem_status,r.dem_id);
    add(r,r.rep_name,r.rep_party||'REP',r.rep_status,r.rep_id);
    add(r,r.ind_name,r.ind_party||'IND',r.ind_status,r.ind_id,'',r.ind_party_label||'');
    if(cleanCandidateName(r.cand2_name)){
      const same=String(r.same_party||'').toUpperCase();
      const internal=same==='REP'?r.rep2_id:r.dem2_id;
      add(r,r.cand2_name,same||'OTH','confirmed',internal);
    }
  }
  for(const t of thirdPartyRows){
    const r=raceByCode.get(t.race_code); if(!r)continue;
    add(r,t.name,t.party||'OTH','confirmed','',t.fec_id||'',t.label||'');
  }
  return dedupeCandidates(out);
}

export function forecastRecordsFromElectIndex(summaryRows=[]) {
  const out={};
  for(const r of summaryRows){
    const office=electIndexOffice(r.race_type); const rid=electIndexRaceId(r); if(!office||!rid)continue;
    const rating=String(r.rating||'').trim()||'No rating';
    const consensus=rating==='No rating'?{party:'T',strength:0,label:'No rating',count:0,score:0}:consensusForecast([rating]);
    const num=v=>v===''||v===undefined||v===null?null:Number(v);
    out[rid]={
      raceId:rid,office,state:r.state,district:office==='H'?String(r.district||'00').padStart(2,'0'):'00',raceLabel:r.race_code,
      ratings:rating==='No rating'?[]:[{source:'ElectIndex model',raw:rating}], consensus,
      model:{source:'ElectIndex model',rating,demProb:num(r.dem_prob),repProb:num(r.rep_prob),indProb:num(r.ind_prob),margin:num(r.margin),pollCount:num(r.poll_count),pollingAvg:num(r.polling_avg)},
      sourcePage:'ElectIndex 2026 forecast data'
    };
  }
  return out;
}
