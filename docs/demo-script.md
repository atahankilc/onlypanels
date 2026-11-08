# Demo script (five minutes)

Follows the brief's four beats on the app as it is now: the homeowner sends a request, the planner decides. Numbers on screen come from the engine; the ones quoted here are from `scripts/build_proof.py` and change if the engine changes.

| Time | Beat | On screen | Say |
|---|---|---|---|
| 0:00 | Problem | Title | Planners spend hours on every design. The first credible offer often wins |
| 0:20 | 1. A home is described | Homeowner: type a Munich address, click the house, keep or drop roof surfaces, one short page per topic, send | The homeowner gives facts, never sees an unapproved number. The roof is measured, not guessed |
| 1:00 | 2. A complete system appears | Planner, Requests: four requests, drafts ready before anyone opened them. Open Hugo-Weiss-Straße 7 (R-6HN3F): the customer only gave the household size, yet a full design sits on the measured flat roof, the brief on top | Solar and battery as appropriate, with three reasons. Similar homes show what experts chose. What the engine had to assume is marked, not hidden |
| 1:30 | Why | Open "How the engine decided": steps with their source (customer, assumed, measured, learned) | This is the engine's own trace, not a language model's story. The planner can check every step |
| 2:00 | 3. The design is refined | Open Bajuwarenstraße 139 (R-9TB2M: existing 2006 solar and a 5 kWh battery, no car). Type "the family is buying an electric car next year", Apply | The change card shows what moved and why: need up, solar up, wallbox added, battery stays. One click undoes it |
| 2:30 | Options and validation | Use "Larger solar" (this customer said no to a heat pump, so that card does not appear). Then click 20 in the battery chart | Variants are the same engine with one more decision fixed. The reviewer flags an unusual battery against similar homes; it never forbids |
| 3:00 | "As appropriate" | Heat pump only when asked; battery call shown as open below 80% | Not every home gets everything, and the engine says when it is unsure |
| 3:20 | Offer | Checks: confirm the two assumed facts, Send unlocks. Offer tab: one page, conditions, what the homeowner may change. Rathochstraße 101 (R-4K7QD) shows one already sent; switch to the homeowner's "Your requests" to see it arrive | Nothing leaves on a guess. Estimates carry their assumptions |
| 3:50 | 4. Checked against reality | Proof page: bars per installer, a past project next to the expert's options, sensible reactions | Each past project was proposed by an engine trained without it. Solar beats one design for all, but is not yet as close as an expert's own two options. Battery follows the installer's habit |
| 4:40 | Value | Title | Minutes instead of hours for a first design, with the planner in control and every number traceable |

## Prepare

- API and web running (`uv run uvicorn main:app --app-dir api --port 8000`, `cd web && pnpm dev`)
- `uv run python scripts/build_proof.py` run once, so the Proof page has data
- Four seeded homeowner requests load with the app (`web/src/demo.ts`): Hugo-Weiss-Straße 7 (little information), Watteaustraße 6 (existing heat pump, two cars, garage), Bajuwarenstraße 139 (existing solar and battery, no car, for beat 3), Rathochstraße 101 (offer already sent)
- Without a language model key, the sentence in beat 3 is read by rules; it still works
- Map tiles, address search and sun data need the network. Squares already visited are cached
- A recorded fallback, required by Sunday 13:00. The Proof page shows single past projects: decide before recording whether those rows may appear in a video that leaves the team (Q2)
