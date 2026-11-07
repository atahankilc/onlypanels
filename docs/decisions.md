# Decisions

**Status:** Confirmed = user or brief decided. Proposed = recommended, awaiting team agreement. Add new decisions at the bottom and never rewrite history: mark old ones Superseded.

| # | Decision | Status | Why |
|---|---|---|---|
| D1 | Do not use Lovable to build our main UI | Confirmed (user) | User preference. See `docs/sponsor-tools.md` for other uses |
| D2 | Raw data, derived per-project data and trained models never enter git | Confirmed (brief) | Brief forbids sharing data outside the team, and code goes to GitHub |
| D3 | Serve the planner first; homeowner view is stretch | Confirmed (brief) | Minimum result serves the planner |
| D4 | Python with `uv`, version 3.12, isolated from system Anaconda | Confirmed (environment) | System numpy and pandas are broken |
| D5 | Swap and convert spec columns on load | Confirmed (evidence) | `docs/data/findings.md` traps 1 and 2 |
| D6 | Hybrid engine: learned models propose, physics checks, catalog snaps, LLM only parses and explains | Proposed | Brief says an LLM alone fails. Dev scores show coupling pays during refinement, not in the first proposal |
| D7 | Exclude add-on options from training and scoring | Proposed, needs Q3 | They are not designs |
| D8 | Score against the closest option in a project; also report last option | Proposed, needs Q1 | Delivered option is unknown |
| D9 | Module count is the primary PV target | Proposed, needs Q5 | Module wattage is unknown at the larger installer |
| D10 | Heat pump by rules and physics, not ML | Proposed | Only 17 projects |
| D11 | Add a planner input for maximum modules or roof capacity | Proposed | Probably the largest missing driver, and a natural refinement control |
| D12 | Models per installer catalog; shared logic across installers | Proposed | Different catalogs and sales styles |
| D13 | Stack: FastAPI engine and a React web app | Proposed | Python ML stays in-process; simple to demo locally |
| D14 | Run locally or on one simple host; Supabase only if a feature needs it | Proposed, needs Q2 | Brief warns against infrastructure work |
| D15 | Natural-language refinement uses `claude-opus-5-5`, with structured output into typed changes | Proposed | The engine stays the source of numbers |
| D16 | ElevenLabs voice is a late add-on, after feature freeze criteria are met | Proposed | Fits "between site visits" but is not needed for the minimum |
| D17 | Each size is output as a recommended value plus a plausible range, snapped to real catalog products | Proposed, based on a verbal comment from a Reonic team member on 2026-11-07, needs Q23 | Experts differ for the same home, so a range is the honest output. Also serves the planner: a starting value and how much room there is |
| D18 | Build order: core decision accuracy first, behind a plain back-office UI. Polished UI and extra features come only after the minimum works | Confirmed (user) | Accuracy on unseen projects comes first. Extras go beyond the brief |
| D19 | The core model uses only fields that exist in `projects_status_quo.csv`. Anything else, such as a roof limit (D11), stays optional and must not be required | Proposed, needs Q24 | A hidden test can only supply the fields in the data |
| D20 | Work only on `main`, no feature branches | Confirmed (user) | User does not want to deal with branches |
