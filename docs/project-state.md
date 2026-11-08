# Project state

Living document. Update it whenever the phase, blockers or next steps change.

**Last updated:** 2026-11-07, evening
**Phase:** Homeowner flow and planner desk work end to end in Munich. The homeowner only gives information, one topic per page, and sends it to an installer (D62). The planner opens that request, with every fact marked by source, and decides.
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

- `/api/design` for the planner, with skipped homeowner answers allowed. PVGIS answers retry and stay on disk
- Planner desk: request list, Design, Roof with fitted modules, Facts, Energy, Checks (`web/src/Planner.tsx`)
- Planner sees the engine's decision trace, reviewer notes against similar homes, and a change card with undo after every edit (D67)
- Proof page in the planner: past projects predicted by an engine trained without them, next to the expert design, and results per installer against simple methods and the expert's own spread (D68). Prepare with `uv run python scripts/build_proof.py`
- Planner tabs Home, Design, Checks, Offer (D70). Assumed facts must be confirmed before sending. The Offer tab is a printable one-page offer: system, yearly estimates with their assumptions, facts with sources, open site checks as conditions, what the homeowner may change, and changes from the AI draft
- Design offers up to two engine variants next to the current design, picked in one click with a change card (D76)
- Energy estimate uses real weather years (PVGIS hourly, Munich, 2018 to 2020) per roof direction, battery losses and a factor calibrated to HTW Berlin values (`scripts/check_energy.py`). Before, it put own power about 20 points too high without a battery and could not tell battery sizes apart
- Design shows what each catalog battery size does in this home (own-power share and saving); a click sets it
- Price no longer moves the system size (D82); feed-in at the 2026 rate of 7.7 ct
- Heat pump size from 2,250 kWh of heat per kW, a car sizes solar at 75% of its use, cars compared with past wallbox homes (D84). Homeowner to planner tested end to end in the browser: request arrives with sources, assumed facts block sending until confirmed, sent offers show in the list
- Map picking step: blocks appear first, then each 2 km square's real LoD2 roofs replace them in the background (a web worker shapes them, nearest square first, two at a time). The blocks stay invisible underneath for clicks. The API now gzips its answers. Checked in the browser

## Not done

- Pitch deck, demo recording, final test-set run: not started
- Team decisions in `docs/decisions.md` marked Proposed are not yet agreed
- Every assumed value and default, with its source, is in `docs/assumptions.md`. Keep it current when a constant changes

## Next steps

1. User tries the full flow in the browser
2. Check the engine fixes in `reports/`: 2 m² per panel, price in sizing, roof area as limit. They change scored numbers
3. Check the own-electricity share and saving before a planner quotes them
4. Decide where expert comparison and results go
5. Planner view plan proposed in `reports/Planner planı.md`, awaiting the user's answers to its five questions
6. Pitch deck and demo recording, with `docs/demo-script.md` rewritten for this flow

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
