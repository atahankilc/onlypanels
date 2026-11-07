# Evaluation plan (proposed)

Technical depth is judged on how well we reproduce experts and how convincingly we measure it. Treat this as a product feature: the numbers appear in the demo's step 4.

## Protocol

- **Population:** new-system projects only (1,313). Report what was excluded and why.
- **Split:** hold out a test set grouped by `customer_contact_id`, fixed once and early. Add a time-based check: train on earlier offers, test on the latest.
- **Reporting:** always per installer as well as pooled.
- **Multi-option projects:** primary score is against the **closest** option in the project, since any of them was acceptable to the expert. Also report against the last option, to show the choice does not flatter us.

## Metrics

| Decision | Metric |
|---|---|
| Component set (P, B, W, H) | Exact-set accuracy and per-component F1. "No battery" recall matters most |
| PV | MAE in modules (primary) and kWp; share within ±2 modules and ±20% |
| Battery | Share matching the catalog tier, share within one tier, MAE in kWh |
| Heat pump | Reported on all 17 projects as a rule check, never as a learned result |
| Coupling | Battery error given predicted kWp versus true kWp |
| Range (D17) | Coverage: share of held-out expert designs inside the range. Always reported with mean range width and the point metrics above |
| Confidence | Do the 80% intervals contain 80% of held-out experts? |

## Sensible reactions (D22)

Accuracy cannot show whether refinement behaves like an expert, so test it directly on held-out homes:

- More demand or an added EV never shrinks the system
- A wallbox appears when an EV is added
- A heat pump raises effective demand, and PV does not fall
- A planner's locked value is never changed
- A battery never appears oversized for the PV system

Report the share of homes passing each check.

## Scoring ranges honestly

A wide enough range always contains the expert, so coverage alone proves nothing. Report coverage and width together, and compare with a fixed range around the median at the same coverage: we only win if our range is narrower. For multi-option projects, also check how many of the expert's options fall inside.

## Baselines to beat

1. Always the median design.
2. Rule of thumb, kWp = k × demand.
3. Independent per-component models, to prove coupling helps.
4. Nearest neighbours on inputs.
5. LLM with no data grounding. The brief predicts this fails, so showing it is a cheap and convincing slide.

The ceiling is the noise floor from `docs/data/findings.md`.

## Deviation analysis (stretch goal, cheap once the above exists)

Slice errors by demand band, installer, EV, heating and catalog. Read the worst 20 by hand and ask a Reonic expert about them. Expect the unseen roof to explain many.
