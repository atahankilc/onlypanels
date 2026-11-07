# Reonic challenge brief (full extraction)

Source: `docs/brief/Reonic_Hackathon_Challenge_final.pdf`, 8 pages, generated 2026-11-06. thinc! München 2026.
Tagline: "Designing home energy systems in *minutes*, not hours."

## Key facts

| | |
|---|---|
| Mission | Turn a few facts about a home into a complete energy system design, deciding the way an experienced planner would |
| Build starts | Saturday 7 November 2026, 14:00 |
| Submission deadline | **Sunday 8 November 2026, 15:00** |
| Finalists selected | Sunday, using the four criteria below |
| Deliverables | Working demo, code (e.g. GitHub link) with short README, short pitch deck |
| Data rule | Use the data only for this hackathon and do not share it outside your team |
| Help | Reonic experts are on site throughout for data, domain and installer questions |

## Terms

- **Installer:** a company that sells, plans and installs energy systems. Reonic's customers.
- **Planner:** the person at an installer who designs systems and writes offers.
- **Homeowner:** the installer's end customer, who receives the offer and lives with the system.
- **Expert design:** the system design an installer actually delivered for a project, as recorded in the data.

## Context

Reonic builds the operating system for renewable energy installers. Since 2023, more than 3,000 installation companies in 13 markets across Europe and Latin America have used it for lead generation, CRM, technical planning, offers and digital signatures, installation and documentation.

This challenge targets the step that decides whether a project happens: designing the system and turning it into an offer. The installer's question: **which combination of solar, storage and heat pump fits this specific home?**

## The problem

- Design is among the most time-consuming installation steps because every home differs. Annual consumption, household size, existing heating, an EV, local electricity price, feed-in tariff and budget all matter.
- Planners spend **hours on every design**: sizing PV, deciding whether a battery pays off and how large, checking whether a heat pump makes sense, balancing it against affordability.
- The knowledge lives in experienced planners' heads. It takes years to learn, is applied inconsistently and does not scale.

## Why it is technically hard

- **Decisions are coupled.** Larger PV changes battery value. A heat pump changes consumption and so PV size. An EV shifts consumption to the evening. Sizing each alone gives plausible but wrong systems.
- **Expert decisions are not a clean optimisation.** Planners apply implicit rules: typical sizes, budget limits, product availability, homeowner preferences. There is rarely one right answer and real data is noisy.
- **A language model alone will not do it.** A strong solution reproduces what experts decide, stays physically and economically plausible, and explains its recommendations.

## Users

**Persona 1, the installer's planner.** Mid-sized installer, several offers per day, often between site visits, knows the products, under constant time pressure.
- Wants a solid first design right away that they can trust and build an offer on.
- Needs control: can override any part and keeps the final say.
- Fears a black box proposing something they cannot justify to the homeowner.

**Persona 2, the homeowner.** Owns a single-family home, has received an offer for solar, possibly with battery or heat pump, and must decide whether to sign.
- Wants to understand the offer and try variants (larger battery, no heat pump) and what each change means.
- Needs plain language instead of data sheets.
- Fears being oversold or committing to the wrong system.

**Tension:** the planner wants speed and full control over a sound offer. The homeowner wants transparency and room to explore, but only within options the installer allows, such as switching a battery on or off or resizing a component. The home's data stays fixed.

**Focus:** the minimum result serves the planner. A homeowner view is a stretch goal on the same engine. Be explicit about where you favour one over the other.

**"As appropriate" matters:** a complete design does not mean every component. Recommending no battery or no heat pump can be the right expert decision, and the system must be able to make it.

## Business impact

- The energy transition is short of installer capacity, not demand. Design work ties up much of it, often for offers that never sign.
- Slow offers lose deals: homeowners compare, and the first credible offer often wins.
- Inconsistent designs cost trust: undersized disappoints, oversized loses on price.

**Three use cases, one engine:**
1. **Faster offers (planner):** enter the basics, get a complete starting design.
2. **Design validation (planner):** compare the planner's own design with what experts delivered for similar homes and flag unusual choices, such as an oversized battery.
3. **Exploring the offer (homeowner):** try variants within allowed options and understand each change before signing.

**What this changes:** installer capacity (more time on site, more projects), win rate (faster, consistent, well-explained offers), quality and trust (juniors design like seniors, homeowners understand sizing).

## Core building blocks

1. **Propose a complete system.** From a small set of inputs, decide whether the home gets PV, battery and heat pump, and how large each is. It must make sense as a whole, not as three independent guesses.
2. **Let the user refine it.** When the planner changes an input or component, the rest adapts as an expert would expect, and the planner understands why.
3. **Prove it decides like an expert.** Measure closeness to expert designs on projects the system has not seen.

Model choice, architecture and interface are up to us.

## Ideas to explore (optional, not a checklist)

- What do expert decisions have in common? Are there unwritten thresholds or typical bundles?
- How do you combine learning from past designs with physical and economic reasoning, such as self-consumption, so results stay plausible for homes unlike anything in the data?
- What is the minimum input for a good design, and how do you handle missing or uncertain information?
- How should the system communicate confidence, alternatives and trade-offs?
- What does refinement feel like: sliders, constraints, natural language, something else?
- How would a validation view say "this battery is unusually large for a home like this"?
- What can a homeowner change in an offer, and what stays in the installer's control?

**AI requirement:** AI must be a real part of the solution. Statistical and ML models trained on the data qualify. A language model is optional. A single prompt to a language model, without grounding in the data, will not reproduce expert decisions reliably.

## Expected outcome

A working slice with an end-to-end demo story, not a production system. Reach the minimum first, then aim higher.

**Minimum**
- For a given project, propose a complete design (PV, battery and heat pump as appropriate) with a short explanation of why.
- Measure how close designs come to expert designs on unseen projects.
- The planner changes at least one input or component and receives an updated design.

**Stretch**
- Analysis of where and why designs deviate from the experts.
- Alternatives and confidence for every recommendation.
- A validation view for planners, or a homeowner exploration view, on the same engine.

## The demo moment (five-minute story)

1. **A home is described:** a planner enters a few basic facts.
2. **A complete system appears:** PV, battery and heat pump as appropriate, with a short explanation.
3. **The design is refined:** e.g. "the family is buying an electric car next year", and the design adapts sensibly.
4. **It is checked against reality:** the proposal is compared with the expert design for the same project, and you show how well the system does across many projects.

## Evaluation criteria

Technology counts as much as user and business value.

| Criterion | What it asks |
|---|---|
| Technical depth | How well do designs reproduce expert decisions, and how convincingly do you measure that across the data? |
| User fit | Does it work for the planner, the homeowner or both, including refining and understanding a design? |
| Business impact | Is the value clear (time per offer, design quality, win rate) and would it matter to installers? |
| Execution and demo | Does it work end to end, and does the demo tell a convincing story? |

No weights are given.

## Submission (by Sunday 8 November 2026, 15:00)

- **Working demo** that runs end to end. A short recording as fallback is recommended.
- **Code**, e.g. a GitHub link, with a short README on setup, approach and known limitations.
- **Short pitch deck** covering the problem, the solution, how it was evaluated, and the value for installers and homeowners.

## Good to know

- Free choice of approach, models, tools and architecture.
- Do not spend time on infrastructure. A simple, well-explained solution beats a complex one that does not run.
- Use the data only for this hackathon and do not share it outside the team.
- Stuck on data or domain? Ask a Reonic expert.

Closing line: "Every home is different. The expertise to design for it should not be the bottleneck."
