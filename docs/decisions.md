# Decisions

**Status:** Confirmed = user or brief decided. Proposed = recommended, awaiting team agreement. Add new decisions at the bottom and never rewrite history: mark old ones Superseded.

| # | Decision | Status | Why |
|---|---|---|---|
| D1 | Do not use Lovable to build our main UI | Confirmed (user) | User preference. See `docs/sponsor-tools.md` for other uses |
| D2 | Raw data, derived per-project data and trained models never enter git | Confirmed (brief) | Brief forbids sharing data outside the team, and code goes to GitHub |
| D3 | Serve the planner first; homeowner view is stretch | Confirmed (brief) | Minimum result serves the planner |
| D4 | Python with `uv`, version 3.12, isolated from system Anaconda | Confirmed (environment) | System numpy and pandas are broken |
| D5 | Swap and convert spec columns on load | Confirmed (evidence) | `docs/data/findings.md` traps 1 and 2 |
| D6 | Hybrid engine: learned models propose, physics checks, catalog snaps, LLM only parses and explains | Proposed | Brief says an LLM alone fails. Dev scores show coupling pays during refinement, not in the first proposal |
| D7 | Exclude add-on options from training and scoring | Proposed, needs Q3 | They are not designs |
| D8 | Score against the closest option in a project; also report last option | Proposed, needs Q1 | Delivered option is unknown |
| D9 | Module count is the primary PV target | Proposed, needs Q5 | Module wattage is unknown at the larger installer |
| D10 | Heat pump by rules and physics, not ML | Proposed | Only 17 projects |
| D11 | Add a planner input for maximum modules or roof capacity | Proposed | Probably the largest missing driver, and a natural refinement control |
| D12 | Models per installer catalog; shared logic across installers | Proposed | Different catalogs and sales styles |
| D13 | Stack: FastAPI engine and a React web app | Confirmed (built, user asked for the UI) | Python ML stays in-process; simple to demo locally |
| D14 | Run locally or on one simple host; Supabase only if a feature needs it | Proposed, needs Q2 | Brief warns against infrastructure work |
| D15 | Natural-language refinement uses `claude-opus-5-5`, with structured output into typed changes | Proposed | The engine stays the source of numbers |
| D16 | ElevenLabs voice is a late add-on, after feature freeze criteria are met | Proposed | Fits "between site visits" but is not needed for the minimum |
| D17 | Each size is output as a recommended value plus a plausible range, snapped to real catalog products | Proposed, based on a verbal comment from a Reonic team member on 2026-11-07, needs Q23 | Experts differ for the same home, so a range is the honest output. Also serves the planner: a starting value and how much room there is |
| D18 | Build order: the brief's minimum first, behind a plain back-office UI. Polished UI and extra features come only after the minimum works | Confirmed (user) | Brief: "Reach the minimum first, then aim higher". Extras go beyond the brief |
| D19 | Superseded by D21. It assumed a hidden test | Superseded | User confirmed there is no hidden test |
| D20 | Work only on `main`, no feature branches | Confirmed (user) | User does not want to deal with branches |
| D21 | No hidden test: we run our own evaluation on held-out projects. Measured scores use only fields in the data; a planner-entered roof limit can exist in the product but cannot be scored | Confirmed (user, no hidden test) | Data has no roof field to score against |
| D22 | First-proposal coherence is judged by rules, not error alone: designs must be physically consistent and react sensibly to input changes | Proposed | Brief requires a proposal that makes sense as a whole and adapts as an expert would expect |
| D23 | Site input is general, not roof only: roof, garden, carport or facade, plus usable area. Reonic said we may add such inputs. Non-roof sites are shown as assumptions | Confirmed (user) | Data is almost all rooftop, so these cannot be learned |
| D24 | Germany is the default and the training base. Other countries are selectable with a clear warning | Confirmed (user) | User: focus on Germany without being limited to it |
| D25 | Separate app (5173, daily work) and back office (5174, oversight), sharing the engine and API | Confirmed (user, done) | Different users and jobs. See `docs/users.md` |
| D26 | Scope users to the brief's two: planner and homeowner, with its three use cases. Other roles are parked | Confirmed (user) | The judges look at the brief's users |
| D27 | Free-text changes: Claude when a key is set, simple rules otherwise and on failure. Only the sentence is sent, never project data | Proposed | The demo must not depend on the network. Keeps Q2 from blocking this feature |
| D28 | Do not force more "no battery" answers. Default to a battery, respect an existing one, flag open decisions below 80% | Proposed | Forced answers are wrong about three times in four |
| D29 | UI language is English. Both the app and the back office are English only | Confirmed (user) | Judges and Reonic read English. Resolves Q22 |
| D30 | Flow: homeowner sends a request, AI drafts before the planner opens it, planner does the engineering and sends the offer, homeowner explores and can ask for a change. Planners can also create a request themselves | Confirmed (user) | Fits a faster first offer. Manual entry keeps the brief's demo step |
| D31 | No auth for now: one app with a Planner and Homeowner switch. State lives in the browser | Confirmed (user) | Demo scope |
| D32 | Hourly energy estimate (independence, yearly saving) from simple assumed profiles, shown as an estimate. No system cost or payback: the data has no prices | Proposed | Homeowners need to know what a change means |
| D33 | The homeowner starts from a 3D view of their home: type an address, click the house, choose and rank surfaces, mark places as "not here". This comes before the text fixes on the offer screen | Confirmed (user) | User wants the product as visual as possible. Overrides the earlier "map and roof later" order in D18 |
| D34 | 3D view is open source: MapLibre with OpenFreeMap tiles, Nominatim for addresses, three.js for the roof and panels. Bavarian LoD2 real roofs are the next step | Confirmed (user, option A first) | Works for any address with no key |
| D35 | Sun comes from PVGIS per surface (tilt, direction, address) and replaces the fixed yield when a site is known. Engine fills surfaces in the homeowner's order | Proposed | User asked for real sun data. Only coordinates are sent |
| D36 | Roof shape in option A is an estimate from the footprint: ridge along the long side, 35 degrees, flat for large buildings. The homeowner corrects it, the planner checks on site. OpenStreetMap roof tags are used when present | Proposed | Map tiles carry no roof slope. Public Overpass servers are often busy, so tags are best effort |
| D37 | Visual language follows the user's Steward project: dark full-screen map, floating glass panels, Geist and Geist Mono, round buttons, solid white primary action. Map style copied from Steward (same author, MIT). Dark only. Replaces the earlier light back-office look | Confirmed (user) | User: the old UI looked bad and Steward's was great |
| D39 | Buildings are split into single polygons before use, because map tiles merge several into one feature. A selected building keeps its exact shape and is only recoloured. Clicks pick nothing once a home is chosen, unless the homeowner asks to add a garage | Confirmed (user) | Merged features caused neighbours to light up and the wrong shape to be selected |
| D40 | In Bavaria, roofs come from the state's measured 3D buildings (LoD2), fetched per 2 km square into `data/cache/`. Real tilt, direction and area replace the guess. Elsewhere the guess stays, as a gable only on plain narrow footprints | Confirmed (user, option B) | Guessed roofs distorted buildings. Licence of the LoD2 files still to confirm |
| D41 | Address suggestions come from Photon while typing, Nominatim as fallback | Proposed | Nominatim's rules forbid search as you type |
| D38 | Back office removed (replaces D25). Expert comparison and overall results went with it; the code stays in git history before this change | Confirmed (user) | User does not want it. The brief still asks for a check against experts, so that needs a new home or a place in the pitch |
