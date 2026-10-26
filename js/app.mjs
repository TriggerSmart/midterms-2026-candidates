import { STATES, partyClass, calculateRisk, extractIssueMentions, normalizeParty } from './core.mjs';
import { loadElectionData, enrichCandidatesBatch, fetchCandidateWikiProfile, fetchFecProfile, fetchStateElectionOffice, sourceLinks, forecastSourceUrl } from './sources.mjs';

const PAGE_SIZE=36;
const state={data:null,office:'ALL',state:'ALL',party:'ALL',risk:'ALL',sort:'race',query:'',page:1,mapMode:'races',profile:null,loading:true};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtMoney=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:Math.abs(n)>=1e6?'compact':'standard',maximumFractionDigits:Math.abs(n)>=1e6?1:0}).format(n||0);
const officeName=o=>o==='H'?'U.S. House':o==='S'?'U.S. Senate':o==='G'?'Governor':'All races';
const stateName=s=>STATES[s]||s;
const riskStoreKey=c=>`midterms-risk-evidence:${c.id}`;
const notesStoreKey=c=>`midterms-research-notes:${c.id}`;

function getEvidence(c){try{return JSON.parse(localStorage.getItem(riskStoreKey(c))||'[]')}catch{return[]}}
function saveEvidence(c,v){localStorage.setItem(riskStoreKey(c),JSON.stringify(v));}
function getRisk(c){return calculateRisk(getEvidence(c));}
function riskClass(level='Unassessed'){return 'risk-'+level.toLowerCase().replace(/\s+/g,'-');}
function initials(name=''){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
function forecastFor(c){return state.data?.forecasts?.[c.raceId]||null;}
function raceLabel(c){
  if(c.office==='H') return `${stateName(c.state)} ${c.district==='AL'?'At-Large':`District ${Number(c.district)}`}`;
  return `${stateName(c.state)} · ${officeName(c.office)}`;
}
function candidateKey(c){return c.id;}

function updateCountdown(){
  const target=new Date('2026-11-03T00:00:00-06:00');
  const days=Math.ceil((target-Date.now())/86400000);
  $('#countdown').textContent=days>1?`${days} days to Election Day`:days===1?'Election Day tomorrow':days===0?'Election Day':'Election Day';
}

function populateStateFilter(){
  const sel=$('#stateFilter'); const current=sel.value;
  const activeStates=new Set((state.data?.candidates||[]).map(c=>c.state));
  const options=Object.entries(STATES).filter(([abbr])=>activeStates.has(abbr)).sort((a,b)=>a[1].localeCompare(b[1]));
  sel.innerHTML='<option value="ALL">All states</option>'+options.map(([a,n])=>`<option value="${a}">${esc(n)}</option>`).join('');
  sel.value=options.some(([a])=>a===current)?current:'ALL';
}

function filteredCandidates(){
  if(!state.data) return [];
  const q=state.query.toLowerCase().trim();
  let rows=state.data.candidates.filter(c=>
    (state.office==='ALL'||c.office===state.office) &&
    (state.state==='ALL'||c.state===state.state) &&
    (state.party==='ALL'||c.partyCode===state.party) &&
    (state.risk==='ALL'||getRisk(c).level===state.risk) &&
    (!q||[c.name,c.party,c.raceLabel,stateName(c.state),raceLabel(c)].join(' ').toLowerCase().includes(q))
  );
  if(state.sort==='name') rows.sort((a,b)=>a.name.localeCompare(b.name));
  else if(state.sort==='forecast') rows.sort((a,b)=>(forecastFor(a)?.consensus?.strength??-1)-(forecastFor(b)?.consensus?.strength??-1));
  else if(state.sort==='risk') rows.sort((a,b)=>(getRisk(b).score??-1)-(getRisk(a).score??-1));
  else rows.sort((a,b)=>`${a.state}${a.office}${a.district}${a.name}`.localeCompare(`${b.state}${b.office}${b.district}${b.name}`));
  return rows;
}

function distinctRaceCount(candidates){return new Set(candidates.map(c=>c.raceId)).size;}

function renderStats(){
  const all=state.data?.candidates||[]; const filtered=filteredCandidates();
  $('#candidateCount').textContent=all.length.toLocaleString();
  $('#candidateCountSub').textContent=state.data?.fallback?'FEC fallback roster':'current structured race + ballot source set';
  $('#raceCount').textContent=distinctRaceCount(all).toLocaleString();
  $('#forecastCount').textContent=Object.keys(state.data?.forecasts||{}).length.toLocaleString();
  $('#selectedStateStat').textContent=state.state==='ALL'?'National':stateName(state.state);
  $('#selectedStateSub').textContent=state.state==='ALL'?'click the map to focus':`${distinctRaceCount(filtered)} visible races`;
}

function renderHealth(){
  const d=state.data; if(!d) return;
  const stats=d.sourceStats||{};
  const items=[
    {ok:!d.fallback,name:'Candidate / race roster',detail:d.fallback?'Structured roster unavailable; FEC federal fallback in use':`ElectIndex structured roster · ${stats.raceRows||distinctRaceCount(d.candidates)} races · ${d.candidates.length} candidate entries`},
    {ok:(stats.thirdPartyRows||0)>0||d.fallback,name:'Minor-party / independent layer',detail:d.fallback?'Contained in FEC fallback where available':`${stats.thirdPartyRows||0} additional ballot/FEC-listed rows merged and deduplicated`},
    {ok:Object.keys(d.forecasts||{}).length>0,name:'Projection layer',detail:`${stats.modelForecasts||Object.keys(d.forecasts||{}).length} model race projections · ${stats.publishedForecasts||0} races also matched to published rating aggregates`},
    {ok:true,name:'FEC / OpenFEC',detail:'Federal finance/profile lookup is on-demand; DEMO_KEY works without setup'},
    {ok:true,name:'Wikimedia profiles',detail:'Candidate metadata provides many photos; full biographies load lazily and are cached in your browser'}
  ];
  $('#sourceHealth').innerHTML=items.map(i=>`<div class="health-item"><span class="dot ${i.ok?'':'error'}"></span><div><strong>${esc(i.name)}</strong><span>${esc(i.detail)}</span></div></div>`).join('');
}

function setSourceStatus(){
  const d=state.data; if(!d)return;
  const dot=$('#sourceDot'); dot.classList.toggle('error',!!d.error&&!d.fromCache); dot.classList.toggle('amber',!!d.stale||!!d.fallback);
  $('#sourceStatus').textContent=d.stale?'Cached / source issue':d.fallback?'Fallback data':'Sources online';
  $('#lastSync').textContent=`Synced ${new Date(d.updatedAt).toLocaleString()}`;
}

function mapDataCandidates(){
  const office=state.office;
  return (state.data?.candidates||[]).filter(c=>office==='ALL'||c.office===office);
}
function mapForecastForState(st){
  const forecasts=Object.values(state.data?.forecasts||{}).filter(f=>f.state===st);
  let use=forecasts;
  if(state.office!=='ALL') use=forecasts.filter(f=>f.office===state.office);
  else {
    const senate=forecasts.filter(f=>f.office==='S'); const gov=forecasts.filter(f=>f.office==='G'); const house=forecasts.filter(f=>f.office==='H');
    use=senate.length?senate:gov.length?gov:house;
  }
  if(!use.length) return null;
  const score=use.reduce((s,f)=>s+(f.consensus?.score||0),0)/use.length;
  return {score,label:use.length===1?use[0].consensus.label:`${score<-.55?'D advantage':score>.55?'R advantage':'Tossup-ish'} · ${use.length} rated races`,count:use.length};
}

function renderMap(){
  const map=$('#map'), fallback=$('#mapFallback');
  if(!window.Plotly){map.classList.add('hidden');fallback.classList.remove('hidden');return;}
  map.classList.remove('hidden');fallback.classList.add('hidden');
  const locations=Object.keys(STATES).filter(s=>s!=='DC');
  let z,texts,colorscale,zmin,zmax,colorbar;
  if(state.mapMode==='forecast'){
    const vals=locations.map(s=>mapForecastForState(s));
    z=vals.map(v=>v?.score??null); texts=vals.map((v,i)=>`${STATES[locations[i]]}<br>${v?v.label:'No published aggregate rating parsed'}`);
    colorscale=[[0,'#1f57d2'],[.32,'#4a72c9'],[.5,'#394351'],[.68,'#c65a5a'],[1,'#b92828']]; zmin=-4;zmax=4;colorbar={title:'D ← rating → R',thickness:8,len:.55};
    $('#mapNote').textContent=state.office==='H'?'House state color averages race-level categorical projections; it is not a statewide House vote forecast. Published rating consensus replaces the model category where matched.':'Colors summarize race-level projections; where published rating aggregates are matched they take precedence over the model category.';
    $('#mapLegend').innerHTML='<span class="legend-item"><i class="legend-swatch" style="background:#2d63db"></i>Democratic advantage</span><span class="legend-item"><i class="legend-swatch" style="background:#394351"></i>Tossup</span><span class="legend-item"><i class="legend-swatch" style="background:#c43d3d"></i>Republican advantage</span>';
  }else{
    const base=mapDataCandidates(); const counts=Object.fromEntries(locations.map(s=>[s,new Set(base.filter(c=>c.state===s).map(c=>c.raceId)).size]));
    z=locations.map(s=>counts[s]||0); const max=Math.max(1,...z); texts=locations.map((s,i)=>`${STATES[s]}<br>${z[i]} ${z[i]===1?'race':'races'} in current office filter`);
    colorscale=[[0,'#111923'],[.25,'#283545'],[.55,'#7f4c24'],[1,'#ff6a00']]; zmin=0;zmax=max;colorbar={title:'Race count',thickness:8,len:.55};
    $('#mapNote').textContent='Click a state to filter the candidate index. This is a geographic state map; House district boundaries are not drawn.';
    $('#mapLegend').innerHTML='<span class="legend-item"><i class="legend-swatch" style="background:#17202b"></i>Few / no races</span><span class="legend-item"><i class="legend-swatch" style="background:#ff6a00"></i>More races</span>';
  }
  const trace={type:'choropleth',locationmode:'USA-states',locations,z,text:texts,hovertemplate:'%{text}<extra></extra>',colorscale,zmin,zmax,colorbar,marker:{line:{color:'#546273',width:.7}},showscale:true};
  const layout={geo:{scope:'usa',projection:{type:'albers usa'},showlakes:false,bgcolor:'#080d14',landcolor:'#111923'},paper_bgcolor:'#080d14',plot_bgcolor:'#080d14',margin:{l:0,r:0,t:0,b:0},font:{color:'#a9b7c7',size:10},dragmode:false};
  Plotly.react(map,[trace],layout,{displayModeBar:false,responsive:true,scrollZoom:false}).then(()=>{
    map.removeAllListeners?.('plotly_click');
    map.on?.('plotly_click',ev=>{const st=ev.points?.[0]?.location;if(st)selectState(st);});
  }).catch(()=>{map.classList.add('hidden');fallback.classList.remove('hidden');});
}

function renderRaceIntel(){
  if(!state.data)return;
  const all=state.data.candidates;
  const scoped=state.state==='ALL'?all:all.filter(c=>c.state===state.state);
  const officeScoped=state.office==='ALL'?scoped:scoped.filter(c=>c.office===state.office);
  $('#intelTitle').textContent=state.state==='ALL'?'National overview':`${stateName(state.state)} race intelligence`;
  $('#clearStateBtn').classList.toggle('hidden',state.state==='ALL');
  const counts={H:distinctRaceCount(officeScoped.filter(c=>c.office==='H')),S:distinctRaceCount(officeScoped.filter(c=>c.office==='S')),G:distinctRaceCount(officeScoped.filter(c=>c.office==='G'))};
  const races=[...new Map(officeScoped.map(c=>[c.raceId,c])).values()].map(sample=>{
    const cs=officeScoped.filter(c=>c.raceId===sample.raceId); const f=forecastFor(sample);
    return {sample,candidates:cs,forecast:f};
  });
  const competitive=races.filter(r=>r.forecast).sort((a,b)=>(a.forecast.consensus.strength??9)-(b.forecast.consensus.strength??9));
  const show=(state.state==='ALL'?competitive.slice(0,12):races.slice(0,30));
  $('#raceIntel').innerHTML=`<div class="intel-summary"><div class="mini-stat"><span>House races</span><strong>${counts.H}</strong></div><div class="mini-stat"><span>Senate races</span><strong>${counts.S}</strong></div><div class="mini-stat"><span>Governor races</span><strong>${counts.G}</strong></div></div><div class="race-list">${show.length?show.map(r=>`<div class="race-row" data-race="${esc(r.sample.raceId)}"><div><div class="race-name">${esc(raceLabel(r.sample))}</div><div class="race-sub">${r.candidates.map(c=>`${esc(c.name)} (${esc(c.partyCode)})${c.raceStatus&&c.raceStatus!=='listed'?` · ${esc(c.raceStatus)}`:''}`).join(' · ')}</div></div><span class="badge ${r.forecast?`forecast-${r.forecast.consensus.party.toLowerCase()}`:''}">${esc(r.forecast?.consensus?.label||'No aggregate rating')}</span></div>`).join(''):'<div class="empty-state">No races match the current office filter.</div>'}</div>`;
  $$('#raceIntel .race-row').forEach(el=>el.addEventListener('click',()=>{const c=officeScoped.find(x=>x.raceId===el.dataset.race);if(c)openProfile(c);}));
}

function candidateCard(c){
  const risk=getRisk(c), f=forecastFor(c), enrich=c._enrich;
  const photo=enrich?.thumbnail||c.thumbnail; const excerpt=enrich?.extract||c.description||'Public biography and source details load when this candidate is opened.';
  return `<article class="candidate-card" data-candidate="${esc(candidateKey(c))}">
    <div class="photo-wrap">${photo?`<img class="candidate-photo" src="${esc(photo)}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="initials">${esc(initials(c.name))}</div>`}</div>
    <div class="candidate-body">
      <div class="candidate-topline"><div class="candidate-name" title="${esc(c.name)}">${esc(c.name)}</div><span class="badge party-badge ${partyClass(c.party)}">${esc(c.partyCode)}</span></div>
      <div class="candidate-race">${esc(raceLabel(c))} · ${esc(c.party)}${c.raceStatus&&c.raceStatus!=='listed'?` · ${esc(c.raceStatus)}`:''}</div>
      <div class="candidate-excerpt">${esc(excerpt)}</div>
      <div class="badge-row"><span class="badge ${f?`forecast-${f.consensus.party.toLowerCase()}`:''}">${esc(f?.consensus?.label||'No projection')}</span><span class="badge ${riskClass(risk.level)}">Risk: ${esc(risk.level)}${risk.score!==null?` ${risk.score}`:''}</span></div>
    </div></article>`;
}

async function enrichVisible(visible){
  const toLoad=visible.filter(c=>!c._enrich&&c.wikiTitle); if(!toLoad.length)return;
  const batch=await enrichCandidatesBatch(toLoad);
  let changed=false;
  for(const c of toLoad){if(batch[c.wikiTitle]){c._enrich=batch[c.wikiTitle];changed=true;}}
  if(changed) renderCandidates(false);
}

function renderPagination(total){
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)); if(state.page>pages)state.page=pages;
  const items=[];
  items.push(`<button class="page-btn" data-page="${state.page-1}" ${state.page===1?'disabled':''}>←</button>`);
  const start=Math.max(1,state.page-2),end=Math.min(pages,start+4);
  for(let p=start;p<=end;p++)items.push(`<button class="page-btn ${p===state.page?'active':''}" data-page="${p}">${p}</button>`);
  items.push(`<button class="page-btn" data-page="${state.page+1}" ${state.page===pages?'disabled':''}>→</button>`);
  $('#pagination').innerHTML=pages>1?items.join(''):'';
  $$('#pagination .page-btn').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled){state.page=+b.dataset.page;renderCandidates();$('.candidate-panel').scrollIntoView({behavior:'smooth',block:'start'});}}));
}

function renderCandidates(doEnrich=true){
  const rows=filteredCandidates(); $('#filteredCount').textContent=rows.length.toLocaleString();
  $('#candidateHeading').textContent=`${state.state==='ALL'?'All states':stateName(state.state)} · ${officeName(state.office)}`;
  const start=(state.page-1)*PAGE_SIZE, visible=rows.slice(start,start+PAGE_SIZE);
  $('#candidateGrid').innerHTML=visible.length?visible.map(candidateCard).join(''):'<div class="empty-state">No candidates match these filters. Clear a filter or refresh the source data.</div>';
  $$('#candidateGrid .candidate-card').forEach(el=>el.addEventListener('click',()=>{const c=state.data.candidates.find(x=>candidateKey(x)===el.dataset.candidate);if(c)openProfile(c);}));
  renderPagination(rows.length); renderStats();
  if(doEnrich)enrichVisible(visible);
}

function renderAll(){populateStateFilter();renderStats();renderMap();renderRaceIntel();renderHealth();renderCandidates();setSourceStatus();}

function selectState(st){state.state=st;state.page=1;$('#stateFilter').value=st;renderMap();renderRaceIntel();renderCandidates();}


function issueResearchLinks(c){
  const topics=['abortion','immigration border','guns Second Amendment','taxes economy','healthcare','energy climate','education','foreign policy national security','election voting'];
  return topics.map(topic=>{const q=encodeURIComponent(`"${c.name}" ${topic} policy position`);return `<a class="source-link" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}">${esc(topic)} ↗</a>`;}).join('');
}

function careerSentences(text=''){
  const ss=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
  const re=/\b(served|elected|appointed|representative|senator|governor|mayor|attorney general|secretary of state|legislature|state senate|state house|city council|political career|member of congress)\b/i;
  return [...new Set(ss.map(s=>s.trim()).filter(s=>re.test(s)&&s.length<460))].slice(0,10);
}
function introText(text=''){
  const paras=text.split(/\n+/).map(s=>s.trim()).filter(Boolean); return paras.slice(0,3).join('\n\n').slice(0,3200);
}
function formatHistoryRow(h){
  const years=h.election_years?.join(', ')||h.two_year_period||h.cycle||'—'; const office=h.office_full||officeName(h.office); const st=h.state||''; const d=h.district_number||h.district||'';
  return `${office||'Federal candidate'} · ${st}${d&&d!=='00'?`-${d}`:''} · ${years}`;
}
function evidenceTypeLabel(t){return ({criminal_conviction_public_office:'Criminal conviction involving public office/fraud',official_ethics_finding:'Official ethics finding / censure / sanction',final_civil_regulatory_finding:'Final civil or regulatory finding',active_criminal_charge:'Active official criminal charge',fec_enforcement_finding:'FEC enforcement finding',active_official_investigation:'Active official investigation',substantiated_conflict_disclosure:'Substantiated conflict/disclosure finding',repeated_filing_noncompliance:'Repeated filing noncompliance'})[t]||t;}

async function openProfile(c){
  state.profile=c; $('#drawerBackdrop').classList.remove('hidden'); $('#profileDrawer').classList.add('open'); $('#profileDrawer').setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  $('#profileContent').innerHTML=`<div class="profile-hero"><div class="initials-large">${esc(initials(c.name))}</div><div><div class="eyebrow">LOADING PUBLIC RECORD</div><h2>${esc(c.name)}</h2><div class="race-line">${esc(raceLabel(c))}</div><div class="profile-badges"><span class="badge party-badge ${partyClass(c.party)}">${esc(c.party)}</span></div></div></div><div class="profile-section"><div class="skeleton block"></div></div>`;
  const [wiki,fec,stateOffice]=await Promise.all([fetchCandidateWikiProfile(c),fetchFecProfile(c),fetchStateElectionOffice(c.state)]);
  if(state.profile?.id!==c.id)return;
  if(wiki){c._enrich={...(c._enrich||{}),...wiki}; if(!c.wikiUrl)c.wikiUrl=wiki.url;}
  renderProfile(c,wiki,fec,stateOffice);
}

function renderProfile(c,wiki,fec,stateOffice){
  const profileText=wiki?.extract||c._enrich?.extract||c.description||'';
  const risk=getRisk(c), evidence=getEvidence(c), f=forecastFor(c), issues=extractIssueMentions(profileText), careers=careerSentences(profileText);
  const photo=wiki?.thumbnail||c._enrich?.thumbnail||c.thumbnail; const links=sourceLinks(c,fec);
  const finance=fec?.total; const history=(fec?.history||[]).slice(0,12);
  const officeUrl=stateOffice && Object.values(stateOffice).find(v=>typeof v==='string'&&/^https?:\/\//.test(v));
  $('#profileContent').innerHTML=`
    <div class="profile-hero">
      ${photo?`<img src="${esc(photo)}" alt="${esc(c.name)}" referrerpolicy="no-referrer">`:`<div class="initials-large">${esc(initials(c.name))}</div>`}
      <div><div class="eyebrow">CANDIDATE PROFILE · ${esc(c.source||'PUBLIC SOURCE')}</div><h2>${esc(c.name)}</h2><div class="race-line">${esc(raceLabel(c))} · ${esc(c.party)}</div><div class="profile-badges"><span class="badge party-badge ${partyClass(c.party)}">${esc(c.partyCode)}</span><span class="badge ${f?`forecast-${f.consensus.party.toLowerCase()}`:''}">${esc(f?.consensus?.label||'No aggregate rating')}</span><span class="badge ${riskClass(risk.level)}">Public-record risk: ${esc(risk.level)}${risk.score!==null?` ${risk.score}/100`:''}</span></div></div>
    </div>
    <section class="profile-section"><h3>Biography & political career</h3>${profileText?`<p>${esc(introText(profileText)).replace(/\n\n/g,'</p><p>')}</p><div class="career-list">${careers.map(x=>`<div class="career-item">${esc(x)}</div>`).join('')}</div><div class="source-note">Biography/career text is sourced from candidate metadata and/or Wikipedia; open the linked source for citations and context.</div>`:`<p>No biography was matched automatically. Use the source searches below rather than assuming missing background.</p>`}</section>
    <section class="profile-section"><h3>Issue-position source mentions</h3>${Object.keys(issues).length?`<div class="issue-grid">${Object.entries(issues).map(([topic,sents])=>`<div class="issue-block"><strong>${esc(topic)}</strong><ul>${sents.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`).join('')}</div><div class="source-note">These are source sentences containing issue terms. They are evidence snippets, not inferred ideological ratings.</div>`:`<p>No issue-specific source sentences were found in the current biography text. Missing text is not treated as a policy position.</p>`}<div class="source-note" style="margin-top:12px">Targeted public-web issue research</div><div class="source-links">${issueResearchLinks(c)}</div></section>
    <section class="profile-section"><h3>Public forecast / projection</h3>${f?`<div class="risk-scoreline"><strong class="forecast-${f.consensus.party.toLowerCase()}">${esc(f.consensus.label)}</strong><span class="muted">${f.ratings?.length>1?`Published-rating consensus · score ${esc(f.consensus.score)}`:'Race projection'}</span></div>${f.model?`<div class="metric-grid"><div class="metric"><span>Model D win</span><strong>${f.model.demProb===null?'—':`${esc(f.model.demProb)}%`}</strong></div><div class="metric"><span>Model R win</span><strong>${f.model.repProb===null?'—':`${esc(f.model.repProb)}%`}</strong></div><div class="metric"><span>Projected D−R margin</span><strong>${f.model.margin===null?'—':`${f.model.margin>0?'+':''}${esc(f.model.margin)} pts`}</strong></div><div class="metric"><span>Polls in model</span><strong>${f.model.pollCount??'—'}</strong></div></div>`:''}<div class="forecast-list">${(f.ratings||[]).map(r=>`<div class="forecast-item"><span>${esc(r.source)}</span><strong>${esc(r.raw)}</strong></div>`).join('')}</div><p class="source-note">Projection values are third-party analysis, not official results. Display source: <a target="_blank" rel="noopener" href="${esc(forecastSourceUrl(f.sourcePage))}">${esc(f.sourcePage)}</a>${f.model&&f.sourcePage!=='ElectIndex 2026 forecast data'?` · Model source: <a target="_blank" rel="noopener" href="${esc(forecastSourceUrl('ElectIndex 2026 forecast data'))}">ElectIndex</a>`:''}.</p>`:`<p>No projection was matched to this race. That does not imply the race is safe.</p>`}</section>
    <section class="profile-section"><h3>Federal campaign finance & filing history</h3>${c.office==='G'?`<p>FEC campaign-finance jurisdiction does not cover state gubernatorial campaign committees. Use the state election authority and state campaign-finance agency.</p>`:fec?.error?`<p>FEC lookup failed: ${esc(fec.error)}. The rest of the profile remains available.</p>`:fec?`${finance?`<div class="metric-grid"><div class="metric"><span>Receipts</span><strong>${fmtMoney(finance.receipts)}</strong></div><div class="metric"><span>Disbursements</span><strong>${fmtMoney(finance.disbursements)}</strong></div><div class="metric"><span>Cash on hand</span><strong>${fmtMoney(finance.cashOnHand)}</strong></div><div class="metric"><span>Committee debt</span><strong>${fmtMoney(finance.debts)}</strong></div></div>`:''}<div class="history-list">${history.map(h=>`<div class="history-item">${esc(formatHistoryRow(h))}</div>`).join('')}</div><p class="source-note">Federal records from OpenFEC. Totals are reported campaign-finance data and should be checked against the linked FEC page before publication.</p>`:`<p>No confident FEC candidate match was found automatically.</p>`}</section>
    <section class="profile-section"><h3>Public-record risk review</h3>${riskPanelHtml(c,risk,evidence)}</section>
    <section class="profile-section"><h3>OSINT source deck</h3><div class="source-links">${links.map(l=>`<a class="source-link" target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label)} ↗</a>`).join('')}${officeUrl?`<a class="source-link" target="_blank" rel="noopener" href="${esc(officeUrl)}">State election office ↗</a>`:''}<a class="source-link" target="_blank" rel="noopener" href="https://www.fec.gov/introduction-campaign-finance/how-to-research-public-records/state-election-offices/">FEC state office directory ↗</a></div></section>
    <section class="profile-section"><h3>Research notes</h3><textarea id="researchNotes" class="notes-area" style="width:100%;min-height:120px;border:1px solid var(--line);background:#080e15;color:var(--text);border-radius:9px;padding:10px" placeholder="Local notes for this candidate…">${esc(localStorage.getItem(notesStoreKey(c))||'')}</textarea><p class="source-note">Notes stay in this browser only; they are not uploaded anywhere.</p></section>`;
  wireProfileControls(c,wiki,fec,stateOffice);
}

function riskPanelHtml(c,risk,evidence){
  return `<div class="risk-card"><div class="risk-scoreline"><div><div class="eyebrow">TRANSPARENT EVIDENCE INDEX</div><strong class="${riskClass(risk.level)}">${esc(risk.level)}${risk.score!==null?` · ${risk.score}/100`:''}</strong></div><button class="secondary-btn" id="openMethodFromRisk">Scoring rules</button></div><div class="risk-explainer">Only verified public legal, ethics, regulatory, disclosure or compliance records are scored. Party, ideology, rhetoric, protected traits, family and ordinary controversy are excluded. “Unassessed” means the evidence review has not established a scored record.</div><div class="evidence-list">${evidence.length?evidence.map((e,i)=>`<div class="evidence-item"><div class="evidence-item-head"><strong>${esc(evidenceTypeLabel(e.type))}${e.verified?' · VERIFIED':''}</strong><button class="delete-evidence" data-index="${i}">remove</button></div><p>${esc(e.title||e.note||'Evidence item')}</p>${e.url?`<a target="_blank" rel="noopener" href="${esc(e.url)}">Open source ↗</a>`:''}${e.note?`<p class="muted">${esc(e.note)}</p>`:''}</div>`).join(''):'<div class="muted" style="font-size:10px">No scored evidence has been added for this candidate.</div>'}</div>
  <form id="evidenceForm" class="evidence-form"><select name="type" required><option value="">Evidence category…</option><option value="criminal_conviction_public_office">Criminal conviction involving public office/fraud</option><option value="official_ethics_finding">Official ethics finding / censure / sanction</option><option value="final_civil_regulatory_finding">Final civil or regulatory finding</option><option value="active_criminal_charge">Active official criminal charge</option><option value="fec_enforcement_finding">FEC enforcement finding</option><option value="active_official_investigation">Active official investigation</option><option value="substantiated_conflict_disclosure">Substantiated conflict/disclosure finding</option><option value="repeated_filing_noncompliance">Repeated filing noncompliance</option></select><input name="title" required placeholder="Short factual description"><input name="url" type="url" required placeholder="Primary/public source URL"><textarea name="note" placeholder="Context: date, agency, disposition, what the source actually says"></textarea><label class="verify-row"><input name="verified" type="checkbox" required><span>I reviewed the linked public record and confirm this category accurately describes it. Charges/investigations are not findings of guilt.</span></label><button class="primary-btn" type="submit">Add verified evidence</button></form></div>`;
}

function wireProfileControls(c,wiki,fec,stateOffice){
  $('#openMethodFromRisk')?.addEventListener('click',()=>$('#methodDialog').showModal());
  $$('.delete-evidence').forEach(b=>b.addEventListener('click',()=>{const ev=getEvidence(c);ev.splice(+b.dataset.index,1);saveEvidence(c,ev);renderProfile(c,wiki,fec,stateOffice);renderCandidates(false);}));
  $('#evidenceForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const item={type:fd.get('type'),title:fd.get('title'),url:fd.get('url'),note:fd.get('note'),verified:fd.get('verified')==='on',addedAt:new Date().toISOString()};const ev=getEvidence(c);ev.push(item);saveEvidence(c,ev);renderProfile(c,wiki,fec,stateOffice);renderCandidates(false);});
  let noteTimer; $('#researchNotes')?.addEventListener('input',e=>{clearTimeout(noteTimer);noteTimer=setTimeout(()=>localStorage.setItem(notesStoreKey(c),e.target.value),250);});
}

function closeProfile(){state.profile=null;$('#drawerBackdrop').classList.add('hidden');$('#profileDrawer').classList.remove('open');$('#profileDrawer').setAttribute('aria-hidden','true');document.body.style.overflow='';}

async function refreshData(force=true){
  $('#sourceStatus').textContent='Refreshing sources'; $('#sourceDot').classList.remove('error');
  try{state.data=await loadElectionData({force});state.loading=false;renderAll();}
  catch(err){$('#sourceStatus').textContent='Source error';$('#sourceDot').classList.add('error');$('#lastSync').textContent=String(err);}
}

function bindControls(){
  $$('.tab').forEach(b=>b.addEventListener('click',()=>{state.office=b.dataset.office;state.page=1;$$('.tab').forEach(x=>x.classList.toggle('active',x===b));renderMap();renderRaceIntel();renderCandidates();}));
  $('#stateFilter').addEventListener('change',e=>{state.state=e.target.value;state.page=1;renderMap();renderRaceIntel();renderCandidates();});
  $('#partyFilter').addEventListener('change',e=>{state.party=e.target.value;state.page=1;renderCandidates();});
  $('#riskFilter').addEventListener('change',e=>{state.risk=e.target.value;state.page=1;renderCandidates();});
  $('#sortFilter').addEventListener('change',e=>{state.sort=e.target.value;state.page=1;renderCandidates();});
  $('#searchInput').addEventListener('input',e=>{state.query=e.target.value;state.page=1;renderCandidates();});
  $('#clearFilters').addEventListener('click',()=>{state.office='ALL';state.state='ALL';state.party='ALL';state.risk='ALL';state.sort='race';state.query='';state.page=1;$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.office==='ALL'));$('#stateFilter').value='ALL';$('#partyFilter').value='ALL';$('#riskFilter').value='ALL';$('#sortFilter').value='race';$('#searchInput').value='';renderAll();});
  $('#clearStateBtn').addEventListener('click',()=>selectState('ALL'));
  $$('#mapModeControl button').forEach(b=>b.addEventListener('click',()=>{state.mapMode=b.dataset.mapmode;$$('#mapModeControl button').forEach(x=>x.classList.toggle('active',x===b));renderMap();}));
  $('#refreshBtn').addEventListener('click',()=>refreshData(true));
  $('#closeDrawer').addEventListener('click',closeProfile);$('#drawerBackdrop').addEventListener('click',closeProfile);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.profile)closeProfile();});
  $('#settingsBtn').addEventListener('click',()=>{$('#fecKeyInput').value=localStorage.getItem('midterms-fec-api-key')||'';$('#settingsDialog').showModal();});
  $('#saveSettings').addEventListener('click',()=>{const v=$('#fecKeyInput').value.trim();if(v)localStorage.setItem('midterms-fec-api-key',v);else localStorage.removeItem('midterms-fec-api-key');});
  $('#resetFecKey').addEventListener('click',()=>{$('#fecKeyInput').value='';localStorage.removeItem('midterms-fec-api-key');});
  $('#aboutDataBtn').addEventListener('click',()=>$('#methodDialog').showModal());
}

async function init(){
  updateCountdown();setInterval(updateCountdown,60000);bindControls();
  await refreshData(false);
  setInterval(()=>refreshData(true),15*60*1000);
}

window.addEventListener('DOMContentLoaded',init);
