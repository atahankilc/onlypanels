# Project state

Living document. Update it whenever the phase, blockers or next steps change.

**Last updated:** 2026-11-07, evening
**Phase:** Homeowner flow and planner desk work end to end in Munich. The homeowner answers one topic per page and gets a rough draft (D62). The planner opens that request, with every fact marked by source, and decides. Uncommitted until the user asks.
**Deadline:** Sunday 8 November 2026, 15:00

## Done

- Brief fully extracted: `docs/brief/challenge.md`
- Data profiled and reproducible: `docs/data/`, `scripts/profile_data.py`
- Repo structure, data protection (`.gitignore`), Python environment (`uv`)
- Proposed architecture, evaluation plan, tool plan, demo script
- `engine/`: dataset, fixed customer-grouped split, predictors, scoring, tests. Scores in `docs/data/findings.md`
- 3D site step (D33 to D36): address search, click the house, roof slope and ridge, sun per surface from PVGIS, ranked surfaces, "not here", garden drawing, garage by click, panels on the roof, aerial photo in Bavaria. Shown to homeowner and planner
- App restyled after Steward (D37)
- Single buildings on the map, measured Bavarian roofs, address suggestions while typing (D39 to D41)
- Map stays smooth on fast moves: buildings load off the page, per square, and unloaded places blink blue (D48)
- Map starts at the browser location. A typed address selects its building by itself. Clicking works without a search. Hover shows what a click picks

- Homes: touching parts with the same house number, or without an address, count as one home (`lod2.group`)
- `/api/draft` for the homeowner, `/api/design` for the planner, both with skipped answers allowed. PVGIS answers retry and stay on disk
- Planner desk: request list, Design, Roof with fitted modules, Facts, Energy, Checks (`web/src/Planner.tsx`)

## Not done

- Pitch deck, demo recording, final test-set run: not started
- Team decisions in `docs/decisions.md` marked Proposed are not yet agreed

## Next steps

1. User tries the full flow in the browser
2. Check the engine fixes in `reports/`: 2 m² per panel, price in sizing, roof area as limit. They change scored numbers
3. Check the own-electricity share and saving before showing them to homeowners
4. Decide where expert comparison and results go
5. Pitch deck and demo recording, with `docs/demo-script.md` rewritten for this flow

## Parked

Data needs research is in `docs/data-needs.md`, split by planner and homeowner. Nothing in it is decided. Settle it with the user when working on each view.

## Proposed timeline

| By | Milestone |
|---|---|
| Sat 15:00 | Questions answered, decisions and roles agreed |
| Sat 18:00 | Clean dataset, fixed split, baseline scores |
| Sat 23:00 | Engine v1 with coupling, API returning designs. **Minimum result reachable from code** |
| Sun 09:00 | UI end to end: describe, propose, refine, compare |
| Sun 12:00 | **Feature freeze.** Stretch goals stop here |
| Sun 13:00 | Demo recording and pitch deck done |
| Sun 14:00 | Submit, keeping one hour of buffer |

## Focus

Core first (D18): accurate decisions on unseen projects, shown in the app. Everything else waits in `docs/roadmap.md`.

## Risks

| Risk | Mitigation |
|---|---|
| Inputs explain little, so accuracy looks weak | Score against the noise floor, add planner-supplied roof limit, lead with honest measurement |
| Raw data leaks through a public repo or third-party tool | `.gitignore` in place, Q2 asked before any upload, demo fixtures reviewed |
| Too many sponsor tools dilute the core | Tools only after the minimum works (`docs/sponsor-tools.md`) |
| Map, address or sun services are down during the demo | Recorded fallback. Sun falls back to the typical yield. Answers are cached while the API runs |
| Live demo fails | Recorded fallback, seeded example homes, works without LLM or voice |
