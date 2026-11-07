# Architecture (proposed)

The aim is a simple system that runs. One Python service holds all intelligence, and the web app stays thin.

```text
 Planner input                                    Web app
 demand, price, EV, heating, roof limit ───────►  describe · propose · refine · compare
                                                       │  HTTP
                                                       ▼
 ┌────────────────────────── FastAPI service ──────────────────────────┐
 │                                                                     │
 │  Refinement parser (Claude)  text ──► typed input changes           │
 │                                                                     │
 │  Design engine (deterministic, no LLM)                              │
 │   1. Effective demand   add EV and heat pump load                   │
 │   2. Component set      PV? battery? wallbox? heat pump?            │
 │   3. Size jointly       PV, then battery given PV                   │
 │   4. Physics check      self-consumption, autarky, savings          │
 │   5. Catalog snap       nearest real product for the installer      │
 │   6. Similar homes      percentile, confidence, alternatives        │
 │                                                                     │
 │  Explanation (Claude)   engine facts ──► short planner text         │
 └─────────────────────────────────────────────────────────────────────┘
        ▲ trained offline on data/processed, artefacts in models/ (gitignored)
```

## Principles

- **The LLM never produces a number.** It turns text into typed changes and turns engine facts into prose. Every figure it mentions comes from the engine.
- **Works without the LLM.** Sliders call the same engine, so a failed API call does not stop the demo.
- **One function, all surfaces.** `design(inputs, overrides) -> Design` powers proposing, refining, validation and the homeowner view.
- **Overrides are constraints.** If the planner locks a 15 kWh battery, the rest re-solves around it. This is how refinement stays coupled.

## How the brief's hard parts are met

| Requirement | Approach |
|---|---|
| Decisions are coupled | Battery conditioned on PV when the planner fixes it: dev battery error falls from 2.75 to 2.43 kWh. Feeding in predicted PV gave no gain in the first proposal |
| Implicit expert rules | Learned per installer; catalog snapping reproduces typical sizes |
| Plausible for unusual homes | Physics check on an hourly simulation bounds the learned proposal |
| "As appropriate" | Explicit decision step that can return no battery or no heat pump |
| Missing inputs | Defaults taken from the data, shown as assumptions the planner can correct |
| Confidence and alternatives | Quantile models and the spread of similar homes |
| Validation ("unusually large") | Percentile of the planner's choice among similar homes |

## Physics layer

Hourly simulation for one reference year using public inputs: a standard load profile for the household, a PV yield curve for a typical German site, and simple EV and heat pump load shapes. Outputs self-consumption, autarky and annual savings. Location, roof orientation and prices are missing from the data, so these are stated assumptions, and the feed-in tariff needs a current sourced value.

## API sketch

| Route | Purpose |
|---|---|
| `POST /design` | Inputs and overrides to a full design with explanation, confidence and alternatives |
| `POST /refine` | Current state and text to typed changes and an updated design |
| `POST /validate` | A planner's design to flags against similar homes |
| `GET /evaluation` | Precomputed scores for the demo's step 4 |
| `GET /projects/{id}/compare` | Held-out project: our design next to the expert's |

## Repo map

| Path | Purpose |
|---|---|
| `engine/` | Python package: data loading, models, physics, evaluation |
| `api/` | FastAPI service |
| `web/` | Frontend |
| `scripts/` | Repeatable data and training commands |
| `notebooks/` | Exploration only, cleared of outputs before commit |
| `pitch/` | Deck, demo recording notes |
| `data/`, `models/` | Local only, gitignored |
