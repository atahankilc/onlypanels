# Open questions

Resolve by moving the answer into `docs/decisions.md` and striking the row here.

## For Reonic experts: blocking, ask first

| # | Question | Why it matters |
|---|---|---|
| Q1 | When a project has several options, which was delivered? Does the export hold only signed options? Why do a third of projects have no option 1? | Defines the "expert design" we score against |
| Q2 | May we send project data to third parties we use: Anthropic API, Supabase, ElevenLabs? Must the GitHub repo be private? Can aggregated statistics appear in a public repo or the deck? | The brief says not to share data outside the team |
| Q3 | Are options with "Extension" lines and battery-only or wallbox-only projects post-sale add-ons to an earlier system? | Decides what is excluded (about 280 projects) |
| Q4 | Are `inverter_power_kw` and `battery_capacity_kwh` swapped in the export? Are all spec values W or Wh? | We are confident but should confirm |

## For Reonic experts: important

| # | Question | Why it matters |
|---|---|---|
| Q5 | What module wattage does `2a8ba8e2` use? Is `DC Install` quantity the module count? | kWp is estimated for most projects |
| Q6 | What usually limits PV size in practice: roof area, demand, budget, or inverter? Do planners fill the roof? | Our inputs predict size weakly, and this decides the main product input |
| Q7 | At the moment of design, which inputs does a planner really have? Which fields are defaults (32 ct, H0, 3.5 factor)? | Defines the input form and which fields to trust |
| Q8 | Does `energy_demand_wh` include existing heat pump or EV consumption? | Double counting in refinement |
| Q9 | Why does `has_ev` miss most wallbox buyers? Is a wallbox a proxy for an EV? | The demo's EV step |
| Q10 | Do `has_storage` and built years of 2026 mean planned systems? Is `heating_existing_type = Heatpump` always an existing unit? | Possible target leakage |
| Q11 | What do planners accept as "close enough" for kWp and battery? | Sets a credible accuracy threshold |
| Q12 | How long does a design take today, and how many offers per planner per week? | Business case needs real numbers. The brief only says "hours" |
| Q13 | Is there anything else in the export we should know about, such as a data README or more installers? | We received two installers with 1,619 projects |
| Q14 | What are the folder names? We assume two installers | Sanity check |
| Q25 | Can you add postcode, roof data, the delivered option, prices and lost offers for these projects? Reonic said roof inputs are fine, but it is unclear whether historic values exist | They would let us learn and measure the main drivers. See `docs/data-needs.md` |
| Q23 | A Reonic team member said verbally that our output could be a range. Does that replace a single recommendation or sit next to it? How would you judge a range: must the expert value fall inside, and how wide is acceptable? Does it apply to PV, battery, or both? | Sets the output format and the headline metric (D17) |

| Q26 | The 3D step sends the address a homeowner types to Nominatim, and coordinates to PVGIS, Overpass, OpenFreeMap and the Bavarian aerial photo service. No project data goes out. Is that fine for the demo, and what would a real product need? | Privacy of real addresses |

Resolved: Q24 (hidden test): there is none. See D21.

## For organisers

| # | Question | Why it matters |
|---|---|---|
| Q15 | How is the demo submitted and presented? Is a live URL needed, or is a recording enough? Pitch length? Where do we submit? | Hosting effort and rehearsal |
| Q16 | Is sponsor tool usage scored anywhere, including side prizes? | The brief's criteria do not mention it, so it decides how much effort voice and Lovable deserve |
| Q17 | How do we claim Anthropic, Supabase, Lovable and ElevenLabs credits, and what are the limits? | Setup |

## For the team

| # | Question |
|---|---|
| Q18 | Who is on the team, and who owns engine, evaluation, UI and pitch? |
| Q19 | Do we agree the Proposed decisions, especially the stack (D13)? |
| Q20 | Refinement style: natural language, sliders, or both? Recommendation: both, on the same typed changes |
| Q21 | Which stretch goal first? Recommendation: validation view, because it reuses the engine and answers use case 2 |
