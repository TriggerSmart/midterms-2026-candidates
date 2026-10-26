# 2026 Midterms OSINT Dashboard

A static, no-login election-research dashboard for the **2026 U.S. House, U.S. Senate, and gubernatorial general elections**. It is designed to deploy directly to GitHub Pages and work without a backend.

## What is included

- Interactive clickable U.S. state map with race-density and forecast modes.
- Nationwide House, Senate, and governor race index.
- Democratic, Republican, independent, Libertarian, Green, Constitution, and other/minor-party candidates when present in the source roster.
- Candidate photographs and short descriptions where public metadata is available.
- On-demand Wikipedia biography/career history.
- On-demand FEC candidate record, campaign-finance totals, and filing/election history for federal candidates.
- Candidate/race status labels such as `confirmed`, `presumptive`, and `projected` when the roster source provides them.
- Third-party race-model probabilities and margins, plus public categorical rating aggregates where they can be matched.
- Issue-topic source snippets extracted from public biography text without inferring an unstated position.
- One-click OSINT source deck: Wikipedia, FEC, Ballotpedia search, Vote Smart search, OpenSecrets search, news search, official `.gov` search, and state-election-office references.
- Local analyst notes stored only in the browser.
- Transparent public-record risk evidence index stored only in the browser.
- Automatic source refresh every 15 minutes; manual refresh button is also available.

## No data hookup required

The site calls public sources directly from the browser:

1. **ElectIndex 2026 public data repository**
   - `races.csv` — 506 House/Senate/governor contests.
   - `candidates.csv` — candidate identity records and FEC IDs where available.
   - `third_parties.csv` — additional third-party/independent ballot/FEC-listed candidates.
   - `candidate_meta.csv` — candidate photo/description/Wikipedia metadata.
   - `output/races_summary.csv` — race-level model ratings/probabilities/margins.
2. **Wikipedia / Wikimedia API** — public biography text and image enrichment; also used to read public forecast-rating tables.
3. **OpenFEC API** — federal candidate identity, campaign-finance totals, and candidate history. The dashboard uses `DEMO_KEY` by default. A personal FEC API key is optional and only increases rate limits.
4. **State election offices** — linked as the final authority for ballot status and state-level records.
5. **Plotly CDN** — renders the interactive U.S. choropleth map.

The dashboard caches source responses in `localStorage` to reduce network calls and can fall back to the latest cached dataset if a live source temporarily fails. If the structured race roster cannot be loaded and there is no cache, a federal FEC roster is used as a last-resort fallback; governors may then be absent until the main source is reachable again.

## Important data semantics

### Candidate completeness

“Candidates loaded” means candidates present in the current structured source set after de-duplication. State election authorities remain the final authority on who is officially printed on a ballot, including late changes, litigation, write-ins, withdrawals, and replacements. The dashboard exposes source health instead of treating a failed feed as “zero candidates.”

### Forecasts

Forecasts are **third-party analysis, not official results**. ElectIndex model probabilities provide a nationwide projection layer. Where public aggregate rating tables can be parsed, their categorical consensus (Tossup / Tilt / Lean / Likely / Safe) takes precedence in the displayed categorical label. The model probability remains visible in the candidate profile.

### Issue positions

The dashboard does not assign ideological scores. It displays sentences in retrieved public biography text that mention an issue category. If the source does not actually state a position, the dashboard says the position is not established and provides research links rather than inferring one.

### Public-record risk

The risk indicator is intentionally **not an automated reputation score**. Automatically labeling hundreds of living people “high risk” from search snippets, partisan claims, or incomplete records would be unreliable.

Every candidate starts as **Unassessed**. A score appears only after an operator adds a source URL and explicitly verifies one of these public-record categories:

| Verified evidence category | Points |
| --- | ---: |
| Criminal conviction involving public office/fraud | 35 |
| Official ethics finding / censure / sanction | 25 |
| Final civil or regulatory finding | 20 |
| Active official criminal charge | 20 |
| FEC enforcement finding | 15 |
| Active official investigation | 10 |
| Substantiated conflict/disclosure finding | 10 |
| Repeated filing noncompliance | 5 |

Bands: **Low 0–14**, **Guarded 15–29**, **Elevated 30–49**, **High 50–69**, **Severe 70–100**. No verified evidence means **Unassessed**, not Low. Charges and investigations are not findings of guilt.

The score excludes party, ideology, speech/rhetoric alone, protected traits, family, health, rumor, and ordinary political controversy.

## Deploy to GitHub Pages

### Easiest deployment

1. Create a GitHub repository.
2. Upload the contents of this folder to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the branch containing these files (normally `main`) and `/ (root)`.
6. Save. GitHub will publish `index.html` as the site.

There is no build command and no server-side component.

## Optional FEC API key

The dashboard works with the public `DEMO_KEY`. For heavier research, get a free OpenFEC key and enter it under the dashboard's gear/settings button. The key is stored only in that browser's local storage.

## Local test

From this directory:

```bash
npm test
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## File structure

```text
index.html                 Main dashboard
styles.css                 Responsive dark OSINT UI
js/core.mjs                Parsers, normalization, risk math, source transforms
js/sources.mjs             Live public-source loaders and caching
js/app.mjs                 Map, filters, candidate cards, profile drawer, UI logic
tests/core.test.mjs        Node behavioral tests
.nojekyll                  Keeps GitHub Pages from applying Jekyll processing
```

## Source attribution / verification

- Election/model roster: ElectIndex `26_us_forecast_data` public repository.
- Federal campaign-finance records: U.S. Federal Election Commission / OpenFEC.
- Biography/photo enrichment: Wikipedia/Wikimedia.
- Published rating aggregate tables: Wikipedia pages that compile named forecasters; open the underlying forecaster when a consequential claim depends on a rating.

Public datasets and upstream methodologies can change. Before publishing a consequential allegation or declaring ballot status, verify the linked primary record and the relevant state election authority.
