# OnlyPanels

OnlyPanels is our thinc! München 2026 hackathon entry for Reonic. A homeowner describes their home, and a planner gets a solar, battery, wallbox and heat pump design the way an expert would propose it, with every fact and number traceable.

**Data is everything.** Past installer projects hold almost nothing about the home: no roof, no address, no shade. On that data a learned model is only a little better than giving every home the same design. So most of the work here goes into getting the facts. The map measures what the homeowner cannot know. The questions ask only what moves the design. The planner sees where each fact came from, and which missing fact would still change the offer.

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
