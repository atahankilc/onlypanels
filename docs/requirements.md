# Requirements checklist

Every requirement in the brief, with page and current status. Update the status as work lands.

## Must have (minimum, page 7)

| Requirement | Page | Status |
|---|---|---|
| Decide whether a home gets PV, battery and heat pump, and how large each is | 2, 6 | Partly: first models, weak on "no battery" |
| Proposal makes sense as a whole, not three independent guesses | 6 | Done for v1: battery follows final PV, checks in `scripts/evaluate.py` |
| Can recommend no battery or no heat pump | 4 | Partly: rule for existing batteries, otherwise flags an open decision. Data does not support stronger "no" answers |
| Short explanation of why | 2, 7 | Done for v1: template text from engine facts |
| Measure closeness to experts on unseen projects | 2, 6, 7 | Done on dev; final test run pending |
| Planner changes at least one input or component and gets an updated design | 2, 7 | Done |
| Rest of the design adapts the way an expert would expect | 6 | Done for v1: 96.9% to 100% on 192 unseen homes |
| Planner understands why | 6 | Done for v1 |
| Planner can override any part and keeps the final say | 4 | Done |
| AI is a real part, grounded in data | 6 | Done: models trained on the data |

## Must show (five-minute demo, page 7)

| Beat | Status |
|---|---|
| Planner enters a few basic facts | Done |
| Complete system appears with explanation | Done |
| Refinement, for example the family buying an electric car | Done with checkbox and free text. Claude path untested until an API key is added |
| Comparison with the expert for the same project | Done, on held-out projects |
| Results across many projects | Done, dev scores; final test run pending |

## Must submit (page 8, by Sunday 15:00)

| Item | Status |
|---|---|
| Working end-to-end demo | First local version works |
| Short recording as fallback (recommended) | Not started |
| Code with README: setup, approach, known limitations | Setup written; approach and limitations pending |
| Pitch deck: problem, solution, evaluation, value for installers and homeowners | Not started |

## Must state (page 4)

Be explicit about where we favour the planner over the homeowner.

## Must respect (page 8)

Data stays inside the team. Do not spend time on infrastructure.

## Judged on (page 8)

All four are selection criteria, and the brief says technology counts as much as user and business value. No weights are given.

| Criterion | What it means for us |
|---|---|
| Technical depth | Accuracy and how convincingly we measure it |
| User fit | Refining and understanding a design |
| Business impact | Clear value: time per offer, design quality, win rate |
| Execution and demo | Works end to end, convincing story |

## Stretch (page 7)

Deviation analysis; alternatives and confidence for every recommendation; validation view or homeowner view on the same engine.

## Where the brief and the data differ

| The brief says | The data shows |
|---|---|
| The delivered design is recorded | 300 projects have several options and none is marked as delivered |
| Household size and budget influence the design | Household size is 99.5% empty; there is no budget |
| Feed-in tariff matters | Filled on 1 project |
| EV usage is an input | Under-recorded: set on 37 of 421 wallbox projects |
| Heat pump is one of three core components | Sold in 17 projects |
