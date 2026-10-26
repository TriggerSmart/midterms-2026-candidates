# 2026 Midterms OSINT Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable static OSINT dashboard for the 2026 U.S. midterms with an interactive map, candidates, source-grounded profiles, forecasts, finance and transparent public-record risk review.

**Architecture:** A GitHub Pages-ready static site using browser fetches to ElectIndex public CSV data, MediaWiki and OpenFEC, with Plotly for the U.S. map and localStorage for caching/settings/evidence. Parsing and scoring rules live in pure modules that are unit-tested with Node's built-in test runner.

**Tech Stack:** HTML5, CSS, ES modules, Plotly.js CDN, ElectIndex public CSV data, MediaWiki API, OpenFEC API, Node test runner.

**Spec:** `docs/design.md`

## Global Constraints
- No backend or login.
- GitHub Pages compatible.
- Political ideology is never part of risk scoring.
- Public-record evidence must remain source-linked and distinguish allegations/charges from findings/convictions.
- Missing enrichment must render as unknown/unassessed, never guessed.

## Review Focus
- Structured roster failure or upstream schema changes should fail visibly and fall back to cache/FEC rather than silently show an empty election.
- FEC rate limiting or API failure should not break the rest of the profile.
- House state aggregation must not imply district-level geography is being shown.
- Risk score must exclude unverified evidence and unrecognized categories.
- Duplicate candidates/races from multiple election tables must be deduplicated.

---

### Task 1: Core normalization and risk rules
**Files:** Create `js/core.mjs`; Test `tests/core.test.mjs`.
**Interfaces:** Produces candidate parsing, party normalization, forecast normalization/consensus, state/district parsing and risk scoring.
- [x] Write failing tests.
- [x] Run and verify failure.
- [x] Implement pure helpers.
- [x] Run and verify pass.

### Task 2: Public data adapters
**Files:** Create `js/sources.mjs`; Test parser helpers via core tests and static syntax checks.
**Interfaces:** Produces election rosters, forecast rows, candidate enrichment and FEC finance lookup.
- [x] Implement MediaWiki page fetch/cache and election-table parsers.
- [x] Implement batched Wikipedia profile enrichment.
- [x] Implement FEC candidate search, totals and history with graceful failure.
- [x] Implement source health reporting.

### Task 3: Dashboard UI and interactive map
**Files:** Create `index.html`, `styles.css`, `js/app.mjs`.
**Interfaces:** Consumes Task 1/2 APIs; renders map, filters, candidate grid, race summaries and profile drawer.
- [x] Build responsive shell and filter bar.
- [x] Render Plotly state map and click selection.
- [x] Render candidate cards with lazy photo enrichment.
- [x] Render forecast/race panels and data-health status.

### Task 4: Candidate OSINT profile and risk evidence workflow
**Files:** Modify `js/app.mjs`, `styles.css`.
- [x] Add biography/career/issue-source panel.
- [x] Add FEC finance/history panel for federal candidates.
- [x] Add source-search links.
- [x] Add verified public-record evidence editor and score display.

### Task 5: Deployment, documentation and verification
**Files:** Create `README.md`, `.nojekyll`; verify all JS and tests; create ZIP.
- [x] Document GitHub Pages deployment and data-source caveats.
- [x] Run unit tests and `node --check` across modules.
- [x] Serve locally and verify static files return 200.
- [x] Zip final directory.
