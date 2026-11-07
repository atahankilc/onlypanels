# Project state

Living document. Update it whenever the phase, blockers or next steps change.

**Last updated:** 2026-11-07, before build start
**Phase:** App runs locally (design, compare, results). User and flow analysis is in the back office. Next steps follow from it.
**Deadline:** Sunday 8 November 2026, 15:00

## Done

- Brief fully extracted: `docs/brief/challenge.md`
- Data profiled and reproducible: `docs/data/`, `scripts/profile_data.py`
- Repo structure, data protection (`.gitignore`), Python environment (`uv`)
- Proposed architecture, evaluation plan, tool plan, demo script
- `engine/`: dataset, fixed customer-grouped split, predictors, scoring, tests. Scores in `docs/data/findings.md`

## Not done

- Pitch deck, demo recording, free-text refinement, final test-set run: not started
- Team decisions in `docs/decisions.md` marked Proposed are not yet agreed

## Next steps

1. Ask Reonic the blocking questions in `docs/open-questions.md` (Q1 to Q4, Q23)
2. Agree the proposed decisions and split roles
3. User reviews the analysis on port 5174 and picks the direction
4. Improve "no battery" and range quality, using dev scores only
5. Free-text refinement with Claude, once data sharing (Q2) is answered

## Proposed timeline

| By | Milestone |
|---|---|
| Sat 15:00 | Questions answered, decisions and roles agreed |
| Sat 18:00 | Clean dataset, fixed split, baseline scores |
| Sat 23:00 | Engine v1 with coupling, API returning designs. **Minimum result reachable from code** |
| Sun 09:00 | UI end to end: describe, propose, refine, compare |
| Sun 12:00 | **Feature freeze.** Stretch goals stop here |
| Sun 13:00 | Demo recording and pitch deck done |
| Sun 14:00 | Submit, keeping one hour of buffer |

## Focus

Core first (D18): accurate decisions on unseen projects, shown in a plain back-office UI. Everything else waits in `docs/roadmap.md`.

## Risks

| Risk | Mitigation |
|---|---|
| Inputs explain little, so accuracy looks weak | Score against the noise floor, add planner-supplied roof limit, lead with honest measurement |
| Raw data leaks through a public repo or third-party tool | `.gitignore` in place, Q2 asked before any upload, demo fixtures reviewed |
| Too many sponsor tools dilute the core | Tools only after the minimum works (`docs/sponsor-tools.md`) |
| Live demo fails | Recorded fallback, seeded example homes, works without LLM or voice |
