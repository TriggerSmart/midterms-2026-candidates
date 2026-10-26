# 2026 Midterms OSINT Dashboard — Design

## Intent
A no-login, GitHub Pages-compatible research dashboard for U.S. 2026 midterm candidates. It must let a user click a real U.S. map, inspect House/Senate/Governor races, review candidate biographies/photos/issues/career context, compare public forecasts, inspect federal campaign-finance records, and attach verified public-record risk evidence.

## Goals
- Real interactive U.S. map with state click-through.
- Comprehensive 2026 federal House/Senate roster and gubernatorial roster using structured public race data, with a separate minor-party/independent layer and FEC lookup for federal records.
- Candidate cards with party, office, state/district, photo, biography, career/source links, issue-source mentions, forecasts and finance data.
- Transparent projection layer: source-labeled public race-model outputs with visible probabilities/margins, plus published forecaster-rating consensus where matched.
- Transparent public-record risk index based only on verified legal/ethics/compliance evidence; political ideology is never scored.
- Automatic refresh and local browser caching.
- No server, account, login, database or build pipeline required.

## Non-goals
- Voting advice or endorsements.
- Scoring candidates for ideology, religion, race, sex, family, health or other private/sensitive traits.
- Claiming absence of adverse records is proof of a clean record.
- Scraping paywalled or login-only services.

## Architecture
Static HTML/CSS/ES modules. Plotly renders the geographic U.S. state map. ElectIndex public CSV files provide the 506-race House/Senate/governor structure, candidate database, minor-party/independent additions, candidate metadata and model output. Wikipedia/MediaWiki provides biography enrichment and published forecast-rating tables. FEC OpenFEC supplies federal registration/campaign-finance facts through `DEMO_KEY` by default, with an optional user API key stored locally. Risk evidence is operator-reviewed and stored in localStorage, with citations/URLs attached to each item.

## Data-source hierarchy
1. Official state election authorities as the final ballot authority.
2. Federal Election Commission for federal candidate filing and finance data.
3. ElectIndex public structured 2026 race/candidate/model data for nationwide roster and projection coverage.
4. Wikipedia aggregate rating tables for published-forecaster cross-checks.
5. Candidate Wikipedia pages/Wikimedia for biography and image enrichment.
6. User-entered public-record evidence for risk scoring, requiring a source URL and explicit verification checkbox.

## Risk methodology
Only verified evidence categories carry points: criminal conviction involving public office/fraud 35; official ethics finding 25; final civil/regulatory finding 20; active criminal charge 20; FEC enforcement finding 15; active official investigation 10; substantiated conflict/disclosure finding 10; repeated filing noncompliance 5. Unverified evidence scores zero. No evidence reviewed = Unassessed, not Low.

## Failure behavior
If a network source fails, the dashboard retains cached data where available, displays the failed source in Data Health, and keeps filters/map shell available. Candidate profiles can fall back to source-search links and initials rather than inventing facts.
