# Roadmap

Order confirmed by the user (D18). Do not start a later phase until the one before it works end to end.

## Phase 1: what the brief asks for

- Clean dataset and fixed test split
- Evaluation harness, with baselines scored first
- Engine: complete coupled design with a recommended value and range
- Refinement: change an input or component and get an updated design
- Short explanation of why
- Plain UI: enter a home, see the design, refine it, compare with the expert, see overall scores

## Phase 2: stretch goals in the brief

- Deviation analysis
- Alternatives and confidence for every recommendation
- Validation view for planners
- Homeowner view

## Phase 3: beyond the brief

These are presented as product vision or added on top of the working engine. Inputs marked "new data" are not in the Reonic data, so none can be trained or scored against the experts.

| Idea | What it adds | Needs |
|---|---|---|
| Location on a map | Replaces the assumed German site | New data: address or map input |
| Roof area and type | The likely main driver of PV size, feeding the optional roof limit (D11) | New data: planner input or roof imagery |
| Solar yield by location | Real kWh per kWp instead of an average | Public irradiance data, such as PVGIS |
| Battery size from outage history | Backup as a reason to buy. Outages are rare in Germany, so this may be a small effect. Emergency power lines in the data show some demand | New data: grid outage statistics |
| Forecasting | Usage, storage and earnings plan over time | Physics layer plus price and tariff assumptions |
| Price optimisation | Best system for a budget or payback target | New data: product prices, absent from the export |

Roof input is the one to try first: it could improve the core accuracy too, not only the UI.

## Planner: notes for later

The app focuses on the homeowner for now. The planner screen was removed and returns after that flow is finished.

- It should read what the homeowner produced, not ask again: buildings, chosen surfaces, wall requests, answers, and which numbers are measured, entered or estimated.
- Its first job is the things that cannot be estimated: who decides, grants, monument status, grid, meter cabinet, roof condition, room-by-room heat load.
- Keep it plain: one request list and one working screen, with override on every part. Speed and control matter more than visuals.
- Windows and chimneys stay a planner check on the photo, not an automatic deduction.
- Walls arrive as requests. The planner accepts or declines them.
- Expert comparison and scores need a home, on this screen or only in the pitch. Undecided.

