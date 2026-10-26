import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidateLine, normalizeForecast, calculateRisk, stateFromRaceLabel, consensusForecast, extractIssueMentions, dedupeCandidates, normalizeParty, parseCsv, candidateRecordsFromElectIndex, forecastRecordsFromElectIndex } from '../js/core.mjs';

test('parseCandidateLine extracts name and party from a ballot line', () => {
  assert.deepEqual(parseCandidateLine('Pete Ricketts (Republican)'), {name:'Pete Ricketts', party:'Republican'});
  assert.deepEqual(parseCandidateLine('Dan Osborn (Independent)'), {name:'Dan Osborn', party:'Independent'});
});

test('normalizeForecast converts common forecaster language to party and strength', () => {
  assert.deepEqual(normalizeForecast('Lean R (flip)'), {party:'R', strength:2, label:'Lean R', flip:true});
  assert.deepEqual(normalizeForecast('Tossup'), {party:'T', strength:0, label:'Tossup', flip:false});
  assert.deepEqual(normalizeForecast('Safe D'), {party:'D', strength:4, label:'Safe D', flip:false});
});

test('consensusForecast averages ratings without treating tossups as partisan', () => {
  const c = consensusForecast(['Lean R','Likely R','Tossup','Lean R']);
  assert.equal(c.party, 'R');
  assert.equal(c.label, 'Lean R');
  assert.equal(c.count, 4);
});

test('calculateRisk scores only verified public-record evidence and requires review', () => {
  assert.deepEqual(calculateRisk([]), {score:null, level:'Unassessed'});
  const result = calculateRisk([
    {type:'official_ethics_finding', verified:true},
    {type:'active_official_investigation', verified:true},
    {type:'news_controversy', verified:true}
  ]);
  assert.equal(result.score, 35);
  assert.equal(result.level, 'Elevated');
});

test('stateFromRaceLabel resolves at-large and numbered districts', () => {
  assert.equal(stateFromRaceLabel('Alaska at-large'), 'AK');
  assert.equal(stateFromRaceLabel('Nebraska 2'), 'NE');
  assert.equal(stateFromRaceLabel('New Hampshire'), 'NH');
});


test('extractIssueMentions returns source sentences without inferring a stance', () => {
  const text = 'Jane Doe supports expanded access to abortion. She later discussed border security and immigration reform. She served as mayor.';
  const issues = extractIssueMentions(text);
  assert.equal(issues['Abortion & reproductive policy'][0], 'Jane Doe supports expanded access to abortion.');
  assert.match(issues['Immigration & border'][0], /border security/);
});

test('dedupeCandidates removes duplicate race/name/party records', () => {
  const input=[
    {name:'Jane Doe',party:'Democratic',office:'H',state:'NE',district:'02'},
    {name:'Jane Doe',party:'Democratic',office:'H',state:'NE',district:'02'},
    {name:'John Roe',party:'Republican',office:'H',state:'NE',district:'02'}
  ];
  assert.equal(dedupeCandidates(input).length,2);
});

test('normalizeParty handles common election-data party codes', () => {
  assert.equal(normalizeParty('DEM'), 'D');
  assert.equal(normalizeParty('REP'), 'R');
  assert.equal(normalizeParty('IND'), 'I');
  assert.equal(normalizeParty('LIB'), 'L');
  assert.equal(normalizeParty('GRN'), 'G');
});

test('parseCsv handles quoted commas and escaped quotes', () => {
  const rows = parseCsv('race_code,name,party\nIL-SEN,"Whitfield Harrington, Jr.",OTH\nCO-07,"Dan ""Kilo"" Sallis",LIB\n');
  assert.deepEqual(rows, [
    {race_code:'IL-SEN', name:'Whitfield Harrington, Jr.', party:'OTH'},
    {race_code:'CO-07', name:'Dan "Kilo" Sallis', party:'LIB'}
  ]);
});

test('candidateRecordsFromElectIndex expands major, independent, same-party and third-party candidates', () => {
  const races=[
    {race_code:'NE-02',race_type:'house',state:'NE',district:'02',dem_id:'C-1',dem_name:'Jane Doe',dem_party:'DEM',rep_id:'C-2',rep_name:'John Roe',rep_party:'REP',ind_id:'',ind_name:'',ind_party:'',same_party:'',cand2_name:'',dem_status:'confirmed',rep_status:'confirmed',ind_status:''},
    {race_code:'CA-12',race_type:'house',state:'CA',district:'12',dem_id:'C-3',dem_name:'A One',dem_party:'DEM',rep_id:'',rep_name:'(No Republican)',rep_party:'REP',same_party:'DEM',cand2_name:'B Two',dem2_id:'C-4',dem_status:'confirmed',rep_status:''}
  ];
  const third=[{race_code:'NE-02',party:'LIB',label:'Libertarian',name:'Alex Third',fec_id:'H6NE00001'}];
  const meta=[{race_code:'NE-02',slot:'dem',name:'Jane Doe',wiki_title:'Jane Doe',description:'American politician',image_url:'https://example.test/jane.jpg',page_url:'https://en.wikipedia.org/wiki/Jane_Doe'}];
  const candidateDb=[{cand_id:'C-1',fec_id:'H6NE02001'},{cand_id:'C-2',fec_id:'H6NE02002'},{cand_id:'C-3',fec_id:'H6CA12003'},{cand_id:'C-4',fec_id:'H6CA12004'}];
  const rows=candidateRecordsFromElectIndex(races,third,meta,candidateDb);
  assert.equal(rows.length,5);
  const jane=rows.find(c=>c.name==='Jane Doe');
  assert.equal(jane.partyCode,'D');
  assert.equal(jane.raceId,'H-NE-02');
  assert.equal(jane.thumbnail,'https://example.test/jane.jpg');
  assert.equal(jane.fecCandidateId,'H6NE02001');
  const thirdParty=rows.find(c=>c.name==='Alex Third');
  assert.equal(thirdParty.party,'Libertarian');
  assert.equal(thirdParty.partyCode,'L');
  assert.equal(thirdParty.fecCandidateId,'H6NE00001');
  assert.ok(rows.some(c=>c.name==='B Two'&&c.partyCode==='D'));
  assert.ok(!rows.some(c=>/^\(No /.test(c.name)));
});

test('forecastRecordsFromElectIndex exposes model probabilities and categorical rating', () => {
  const out=forecastRecordsFromElectIndex([{race_code:'NE-02',race_type:'house',state:'NE',district:'02',rating:'Lean R',dem_prob:'35.4',rep_prob:'64.6',margin:'-4.7',poll_count:'8',polling_avg:'-2.1'}]);
  assert.equal(out['H-NE-02'].consensus.label,'Lean R');
  assert.equal(out['H-NE-02'].model.demProb,35.4);
  assert.equal(out['H-NE-02'].model.repProb,64.6);
  assert.equal(out['H-NE-02'].model.margin,-4.7);
});
