# Reonic hackathon project

Build an AI system that proposes PV, battery and heat pump designs the way an expert planner would. **Submission deadline: Sunday 8 November 2026, 15:00.** A simple solution that runs beats a complex one that does not.

Read `docs/project-state.md` first. Keep `project-state.md`, `decisions.md` and `open-questions.md` current as work progresses.

## Hard rules

- Never commit, upload or paste raw project data, derived per-project data or trained models. They are gitignored; keep it that way. Sending data to any third party waits for an answer to Q2 in `docs/open-questions.md`.
- Docs may contain aggregates only, never project or customer IDs.
- The LLM never produces design numbers. The engine does.
- Do not use parts-derived values as model features: that leaks the answer.
- Split by `customer_contact_id`, and report results per installer.

## Data traps

- `inverter_power_kw` and `battery_capacity_kwh` are swapped.
- Most kW, kWh and kWp columns hold W or Wh.
- PV size must be reconstructed, and module wattage is unknown at installer `2a8ba8e2`.
- Some options are post-sale add-ons, not designs.

Details are in `docs/data/findings.md`. Any new number in the docs must be reproducible from `scripts/`.

## Commands

```bash
uv sync
uv run python scripts/profile_data.py
uv run pytest
```

Use `uv run`, never system Python: the Anaconda install has broken numpy and pandas. LightGBM needs `brew install libomp`; sklearn's `HistGradientBoosting*` works without it.
