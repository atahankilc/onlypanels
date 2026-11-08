# OnlyPanels

OnlyPanels is our thinc! München 2026 hackathon entry for Reonic. A homeowner describes their home, and a planner gets a solar, battery, wallbox and heat pump design the way an expert would propose it, with every fact and number traceable.

**Pitch slides:** [`OnlyPanels-pitch.pdf`](OnlyPanels-pitch.pdf)

> **AI is smart enough. What it lacks is context.** OnlyPanels gathers every fact about a home it can find, with or without the owner's address, so the first design is one an expert would sign.

## Why: same request, different offer

We looked at the past projects before building anything. **59% of solar projects share their exact request with another customer**: every field the same. **In 99% of those identical requests the experts still designed differently**, by 6.3 kWp of solar on average. Half of the request fields are empty.

The experts are not random. They knew things the request did not say: the roof, the shade, the street. Homeowners leave fields empty because they don't know the answer, or don't want to share where they live, and that is their right. So a bigger model only learns noise. On this data a learned model is only a little better than giving every home the same design.

So most of the work here goes into getting the facts, while respecting what the homeowner chooses to share:
- **The map fuses twelve sources** into one picture of the home: Bavaria's 3D roofs (LoD2), the 20 cm aerial photo (DOP20), sun per roof side from EU PVGIS on real weather years, Bavaria's single-tree map for shade, Census 2022 for building age and heating nearby, Munich's heat plan (is district heating coming?), the Bavarian monument map, address search, a vision model that finds roof windows, chimneys and old panels on the photo, the planner's own price book, local power price, feed-in and grants, and how this installer sized 1,041 past homes.
- **Without the map, it still extracts.** A described roof ("south, 40 m²"), an address in words, a gas bill in euros: each becomes a design fact, and every gap gets a stated, sourced assumption (`docs/assumptions.md`).
- **The planner and the homeowner both get the complete view:** the design, the sun and shade on each roof side, the price after grants, payback, and what is assumed.

Reproduce the finding: `uv run python scripts/profile_same_request.py` (aggregates only).

## What it does

**Homeowner** (Munich, with or without the map)
- Type an address and click the house. The roof comes from Bavaria's 3D building model: area, slope, direction and sun per side. Census 2022 gives how old homes nearby are and how they heat. Shade comes from Bavaria's tree map. The monument list and Munich's heat plan are checked.
- Nine short pages, every question optional. Under each question a card shows what we already know, what we assume if it is left open, and what the installer checks later.
- Nothing leaves the browser before Send, and the homeowner picks what goes. The homeowner never sees a design: that is the planner's job.

**Planner**
- A draft is ready when a request opens. Every fact is tagged as customer, measured, found or assumed. Assumed facts must be confirmed before an offer can be sent.
- The review reruns the engine at the edges of each guessed answer. It lists the answers that would move the design ("the bill: 16 → 18 modules, battery 7 → 10 kWh") and the ones that would not. These are rules over the engine, with no language model.
- Design tab: variants, a battery table for this home, the planner's own design checked against similar homes, and the engine's step-by-step trace.
- Cost tab: bill of materials from a price book the planner can edit, VAT, grants, the first year before and after, payback and 20-year gain.
- Offer tab: a printable one-page offer. It says who decided each part and lists open site checks as conditions.
- Proof page: the engine against experts on past projects it never saw.

## Approach

- **The engine decides, not a language model.** Solar and battery sizes are learned per installer from 1,041 past projects, split by customer. Catalog snapping reproduces the installer's typical sizes. Heat pump and wallbox are rules, because heat pumps appear in only 17 projects. An hourly simulation on real Munich weather years gives own power and saving, checked against HTW Berlin values.
- **Measured facts override averages.** The roof limits the module count, and its sun moves the size. Existing solar and batteries are counted. Answers such as heating type, how rooms are heated, build year, boiler age, backup power and when a car comes are turned into design facts by rules (`engine/src/reonic_engine/derive.py`).
- **Assumptions are visible.** Every default and stand-in, with its source, is in `docs/assumptions.md`.

## Results

Scored once on 276 held-out test projects (`uv run python scripts/final_test.py`, details per installer in `docs/data/findings.md`):

| | Engine | Same design for every home | Rule of thumb |
|---|---|---|---|
| Solar, mean error | 2.65 kWp | 3.06 kWp | 4.02 kWp |
| Solar, within 20% of the expert | 49% | 44% | 31% |
| Battery, mean error | 2.66 kWh | 3.03 kWh | 3.56 kWh |
| Whole set right (battery, wallbox, heat pump) | 64% | 63% | 63% |

The test scores match the dev scores, so the work did not overfit. Experts disagree with themselves too: where one home has several options, a third differ in solar size, by 2.9 kWp on average. On 192 unseen homes the engine reacts like a planner: adding a car never shrinks solar or the battery, more use never shrinks the battery, and the roof limit always holds.

## Tech stack

- **Engine and API:** Python, FastAPI, pandas, scikit-learn (models per installer, split by customer), an hourly energy simulation on PVGIS weather years, rules for heat pump, wallbox, grants and German energy law. The language model never produces a design number: the engine does.
- **Web:** React 19, TypeScript, Vite, MapLibre GL, three.js for 3D roofs and fitted modules, web workers that shape a city's roofs off the page.
- **AI:** Claude (Anthropic) for the roof photo check, the planner's sentence box, and a voice agent that drives the planner's desk through MCP tools. **ElevenLabs** for speech in and out: the planner can open a request, change the design, ask what it costs and send by voice; the homeowner has a voice helper that explains questions and fills in answers.
- **Open data:** Bayerische Vermessungsverwaltung (LoD2, DOP20, single trees), Bavarian monument map, Landeshauptstadt München heat plan, Destatis Census 2022, EU JRC PVGIS, Photon and OpenStreetMap.

## Setup

Requires [uv](https://docs.astral.sh/uv/) and [pnpm](https://pnpm.io/).

```bash
uv sync
cp .env.example .env                       # keys are optional, see below
# Copy the Reonic CSVs to data/raw/<installer>/ (they are not in git)
uv run python scripts/evaluate.py          # dev scores; the API trains the engine from data/raw when it starts
uv run python scripts/build_proof.py       # data for the Proof page
```

Optional open data, which the app runs without:
- `scripts/build_zensus.py`: census hints.
- `scripts/build_trees.py`: tree shade.

Each script says what to download.

## Run

Two terminals, then open http://127.0.0.1:5173

```bash
uv run uvicorn main:app --app-dir api --port 8000
cd web && pnpm install && pnpm dev
```

Without keys, everything runs on rules. `ANTHROPIC_API_KEY` adds:
- the planner's sentence box, read by a model
- the photo check for roof obstacles
- voice, which also needs `ELEVENLABS_API_KEY`

Tests: `uv run pytest`.

Pitch slides: `docs/pitch/deck.html` is the source; `OnlyPanels-pitch.pdf` is printed from it in headless Chrome at 1920 × 1080 (screenshots in `docs/pitch/img/` are of the seeded demo requests). Eight slides: intro, the same-request finding, the fused draft, the home staying in the browser, every data source we use, AI next to the deterministic engine, team, close.

## Known limitations

- **The training data has no roof, address, shade, prices or budget.** The past-project scores show the engine at its weakest; the measured roof on the desk cannot be scored on them.
- **Only won deals are in the data,** so win rate cannot be learned, and which of several options was delivered is unknown.
- **Heat pumps are rules, not learned,** because there are only 17 projects with one. The heat pump size is preliminary: a room-by-room heat load decides the final model.
- **The homeowner flow covers Munich.** The 3D model, aerial photo, tree map, heat plan and monument list are Bavarian or Munich data.
- **Module wattage is unknown at one installer,** so its solar size is counted in modules at about 450 Wp.
- **Prices are a starting price book,** to be replaced by the installer's own.

## Docs

| Doc | Contents |
|---|---|
| [Project state](docs/project-state.md) | Where we are, next steps, risks |
| [Decisions](docs/decisions.md) | Confirmed and proposed decisions |
| [Demo script](docs/demo-script.md) | Five-minute story |
| [Data findings](docs/data/findings.md) | Traps, limits, scores, noise floor |
| [Assumptions](docs/assumptions.md) | Every default and stand-in, with its source |
| [Data dictionary](docs/data/dictionary.md) | Every column, units, reconstruction rules |
| [Evaluation](docs/evaluation.md) | How we prove it decides like an expert |
| [Architecture](docs/architecture.md) | System outline |
| [Challenge brief](docs/brief/challenge.md) | Full extraction of the brief |
| [Open questions](docs/open-questions.md) | For Reonic, organisers and the team |
| [Users](docs/users.md) | Personas, needs, flows |
| [Requirements](docs/requirements.md) | Every requirement in the brief, with status |
