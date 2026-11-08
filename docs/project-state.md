# Project state

Living document. Update it whenever the phase, blockers or next steps change.

**Last updated:** 2026-11-08, 05:45
**Phase:** Feature work is wrapping up for the 15:00 deadline. Homeowner flow and planner desk work end to end in Munich, with or without the map. The homeowner only gives information and chooses what is sent (D62, D110). The planner opens the request, with every fact marked by source, checks it, can ask the advisor, and decides. Every decision in `docs/decisions.md` is agreed: none is left Proposed.
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
- Map starts at the browser location. A typed address only flies the map there; the homeowner then clicks the building. Clicking works without a search. Hover shows what a click picks

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
- Homeowner questions cover district and electric heating, solar for hot water, who owns the home, backup power (D94) and whether someone is home in the day, which shapes the hourly energy check (D95), and how rooms are heated, for the planner's flow temperature check (D96), and the boiler's age, for the grants check (D97). Gas can be given in euros a year (D98). An optional meter cabinet photo reaches the planner's checks and stays in the browser (D99). The planner's monument check reads the Bavarian monument map (D100), and a heat plan check reads Munich's heat plan (D103). Trees from Bavaria's single trees, by 2 km square, now lower the roof's sun in the planner's yield, design and energy estimate, and the check says how much each roof side loses (D107, D108). The last three reach the planner as checks. The homeowner sees no sunlight while answering; it shows with the offer, trees included, when the home was shared (D116). Research behind it: `reports/Ev sahibi bilgisi: yeterli mi.md`
- A chosen home stays in the browser until the homeowner sends (D102): addresses, census area, monument status, parts, surfaces, shade and yearly sun are worked out in the page; the server only serves whole 2 km squares. Yearly sun comes from `web/public/sun-table.json`, built by `scripts/build_sun_table.py`; the census file by `scripts/build_zensus.py`
- Planning agent (D115, replaces the D106 button): when a request opens, Claude runs the engine on the variants that matter for this customer, shows each run as it happens, proposes a change usable in one click, and answers the planner's questions by running the engine again. Numbers it did not get from the engine are dropped. The sentence box also uses Claude (the API reads `.env`). Check: `uv run python scripts/check_refine.py --claude`
- Requests without a home reach the planner: listed by reference, no map, the design from the answers with the shared roof area as its limit, and checks that ask for the roof and the address. The API now takes `area_m2` and `mount`, so "only 18 panels fit" from the sentence box limits a design without measured surfaces
- The planner can have roof obstacles found on the aerial photo by a vision model and confirm each one; kept ones block cells (D109)
- Design validation (brief use case 2): the planner enters their own system and sees it against similar homes, the roof and the engine (D111)
- The homeowner chooses what goes to the installer before sending, shown as a list and as the object (D110). Without the map they give the address and the roof in words (D104)
- A homeowner who tried a variant can ask the installer about it; the planner sees the question and can try it (D113)
- The roof's sun moves the module count: more modules on a weaker roof, fewer on a stronger one, a smaller system and a warning on a poor one (D112). Past-project scores do not change
- Requests without a home: a roof shared or described as direction and slope takes its PVGIS yield from the sun table; an unknown direction keeps the typical 950 kWh per kWp. A shared address is found with Photon on the planner's page and the monument and heat plan checks run there (D114)
- The light theme is removed: the app is dark only, map labels are white on a dark halo
- The homeowner's start choice (map or questions) is kept in the browser; a browser that chose no map opens straight on its requests or questions. Switching with the With/Without switch opens the map as a circle out of the switch and closes it back in (view transitions; plays with reduced motion too, a plain change where the browser has none). Checked in a recorded headless browser, including fast repeated switches
- Final test-split run done once (`scripts/final_test.py`), results per installer in `docs/data/findings.md`. Test matches dev, so the dev work did not overfit

## Not done

- Pitch deck, demo recording: not started
- Every assumed value and default, with its source, is in `docs/assumptions.md`. Keep it current when a constant changes

## Next steps

1. User tries the full flow in the browser, with and without the map
2. Check the engine fixes in `reports/`: 2 m² per panel, price in sizing, roof area as limit. They change scored numbers
3. Check the own-electricity share and saving before a planner quotes them
4. Decide where expert comparison and results go
5. Planner view plan proposed in `reports/Planner planı.md`, awaiting the user's answers to its five questions
6. Pitch deck and demo recording, with `docs/demo-script.md` rewritten for this flow and the final test numbers. Feature freeze at 12:00

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
