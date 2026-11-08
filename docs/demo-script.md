# Demo script (five minutes)

**One idea: data is everything.** Past installer projects hold almost nothing about the home: no roof, no address, no shade. On that data, any model is barely better than giving every home the same design. So the product is a machine for getting the facts: the map measures what the homeowner cannot know, the questions ask only what moves the design, and the planner sees where every fact came from and which missing one would still change the offer.

Numbers below were read off the screen on 8 November with the seeded requests. They come from the engine and move if it changes: walk the script once before recording.

| Time | Beat | On screen | Say |
|---|---|---|---|
| 0:00 | Problem | Title | A planner needs facts about a home before they can design for it. The first credible offer often wins |
| 0:20 | Data is the bottleneck | Planner, Proof: "Solar: typical gap to the expert" | Each past project was proposed by an engine trained without it: 2.5 kWp from the expert on average, against 2.7 for one design for every home. Barely better, because the export holds no roof, no address, no shade. The 276 held-out test projects say the same. An expert's own second option is 1.2 kWp away. The model is not the bottleneck. The data is |
| 0:50 | 1. Facts the homeowner never types | Homeowner, with map: type "Agnes-Bernauer-Straße 100", click the house. Roof page card: "Your roof from Bavaria's 3D model: 2 sides, 112 m²" | One click, and we know the roof from Bavaria's 3D building model: area, slope, direction, sun per side. Census 2022 tells us how old homes here are and how they heat |
| 1:20 | 2. Questions that say why | Click Next through a few pages. On any page point at the card: "We know", "If left open", "Later, your installer" | Nine short pages, every question optional. Each one says what we already know, what we assume if they skip it, and what the installer checks later. People answer more when they see why |
| 1:45 | Nothing leaves without consent | Overview: "9 from you, 2 found for you, 8 assumed for now". Choose what to send, switch "Your home" off and on, Send | They see what they gave, what we found, what we assume. Nothing has left the browser until they choose what to send |
| 2:05 | 3. Every fact has a source | Planner, Requests. Open Hugo-Weiss-Straße 7 (R-6HN3F, the owner knew little). Home tab: facts tagged Customer or Assumed | A full draft is waiting before anyone opened it: 7.7 kWp, 7 kWh. But most facts are assumed, and the desk says so |
| 2:30 | 4. The engine says which data to get | Design tab, Review card: "What does the electricity bill say for a whole year? At 1,900 kWh: 16 modules, 7 kWh battery. At 3,500 kWh: 20 modules, 10 kWh battery." "Fine as given: who is home in the day moves own power only from 72% to 73%" | The engine runs again at the edges of every guess. The bill matters here; the daytime question does not. The planner calls with one question, not twenty. Rules over the engine, no language model, same answer every time |
| 3:05 | Facts from open data | Open Bajuwarenstraße 139 (R-9TB2M: old 2006 solar, oil heating). Checks tab: "Trees take some of the roof's sun … 27 trees up to 22 m" and "Heat plan: homes here heat on their own" and the KfW speed bonus line | Shade from Bavaria's tree map, Munich's heat plan, monument list, grants for this heating. Nobody typed any of it. The draft already counts the old panels: sized for the 4.5 MWh they leave |
| 3:35 | Money and rules with their sources | Rathochstraße 101 (R-4K7QD: heat pump, car), Cost tab: "€45,658 less €12,049 KfW and city grant", pays €33,609, back in 12 years. Then R-6HN3F's Review, "To do before the order": switch on by 31 January 2027 to keep the feed-in tariff | Every line from a price book the planner can edit, grants and the law for this home included. The deadline for the tariff is a fact the planner must tell the customer |
| 3:55 | Nothing leaves on a guess | R-6HN3F Checks: "Confirm 3 facts to send". Then Rathochstraße 101 (R-4K7QD) Offer tab: "engine proposal, approved by the planner", "as the customer asked" | Assumed facts block sending until a person confirms them. The offer says who decided each part |
| 4:20 | Checked against reality | Proof: "Does it react like an expert?" 100% / 97% rows | On 192 unseen homes: adding a car never shrinks solar, the roof limit always holds. The engine behaves like a planner; the gap that remains is the data the old projects never had, and that is exactly what this app collects |
| 4:45 | Value | Title | Better facts, not a bigger model. A first design in minutes, with the planner in control and every number traceable |

## Optional beat: voice (only if D120 is committed and both keys are set)

Mic at the bottom right of the planner desk. Say "what does it cost without a battery?" on R-6HN3F. Fits after the Cost beat, take 15 seconds from "Facts from open data".

## Prepare

- API and web running (`uv run uvicorn main:app --app-dir api --port 8000`, `cd web && pnpm dev`). Restart the API after any engine change.
- `uv run python scripts/build_proof.py` run once, so the Proof page has data.
- Four seeded homeowner requests load with the app (`web/src/demo.ts`): Hugo-Weiss-Straße 7 (little information), Watteaustraße 6 (existing heat pump, two cars, garage), Bajuwarenstraße 139 (old solar and battery, oil), Rathochstraße 101 (offer already sent).
- Open each seeded request once before recording: designs, shade and PVGIS answers are then cached and appear at once.
- Map tiles, address search and sun data need the network. Squares already visited are cached.
- Without `ANTHROPIC_API_KEY` every beat above still works: the review and the cost are rules, and the planner's sentence box falls back to rules. Voice and the photo obstacle check need the key; voice also needs `ELEVENLABS_API_KEY`.
- The Proof page lists single past projects with their numbers. Keep that table out of a video that leaves the team until Q2 is answered; the bars above it are aggregates.
- A recorded fallback, by 13:00.
