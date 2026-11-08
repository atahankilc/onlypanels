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
- The map's ground is the Bavarian aerial photo (DOP20) in both steps, at full brightness. Ground and roofs share one set of 512 px photo tiles kept in the page, so roofs show what the ground already loaded at once instead of waiting for a separate image. Roofs take their photo from three rings around the view: one tile level sharper than the ground in the middle, coarser outside, the widest (about 5 km) past every drawn square. On the chosen home's step the street block's neighbours get photo roofs too. The "Photo only" switch is gone
- Homeowner questions cover district and electric heating, solar for hot water, who owns the home, backup power (D94) and whether someone is home in the day, which shapes the hourly energy check (D95), and how rooms are heated, for the planner's flow temperature check (D96), and the boiler's age, for the grants check (D97). Gas can be given in euros a year (D98). An optional meter cabinet photo reaches the planner's checks and stays in the browser (D99). The planner's monument check reads the Bavarian monument map (D100), and a heat plan check reads Munich's heat plan (D103). The last three reach the planner as checks. Research behind it: `reports/Ev sahibi bilgisi: yeterli mi.md`
- A chosen home stays in the browser until the homeowner sends (D102): addresses, census area, monument status, parts, surfaces, shade and yearly sun are worked out in the page; the server only serves whole 2 km squares. Yearly sun comes from `web/public/sun-table.json`, built by `scripts/build_sun_table.py`; the census file by `scripts/build_zensus.py`
- Planner advisor (D106): "Ask the advisor" on the Design tab picks among the engine's options for this customer, explains, and lists questions; numbers it did not get from the engine are dropped. The sentence box now uses Claude (the API reads `.env`). Check: `uv run python scripts/check_refine.py --claude`
- The light theme is removed: the app is dark only, map labels are white on a dark halo

## Not done

- Pitch deck, demo recording, final test-set run: not started
- Finer sun table (5° tilt, 10° azimuth) is being built by `scripts/build_sun_table.py` (resumable). The committed table has 10° and 20° steps: within 1 to 3% of exact PVGIS on roofs, up to 5% on some walls. When it is done, measure again against PVGIS and commit `web/public/sun-table.json`
- Questions-only path (D104) still shows an empty map frame and asks no address or roof by hand
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
