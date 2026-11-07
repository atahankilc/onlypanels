# Project state

Living document. Update it whenever the phase, blockers or next steps change.

**Last updated:** 2026-11-07, evening
**Phase:** Step 1 of the product: find and select a home in Munich (D45). The map is limited to the region, with a yellow line around it. Later steps were removed and return one by one. They are in git at tag `before-munich-focus`.
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

## Not done

- Pitch deck, demo recording, final test-set run: not started
- Team decisions in `docs/decisions.md` marked Proposed are not yet agreed

## Next steps

1. Confirm step 1 works well in the browser
2. Agree the next step with the user, then bring it back from the tag
3. Decide where expert comparison and results go
4. Pitch deck and demo recording

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
