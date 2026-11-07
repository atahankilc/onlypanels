# Reonic home energy design

thinc! München 2026 hackathon. An AI system that learns from real installer decisions and proposes the right mix of PV, battery and heat pump for a home, which planners can refine.

**Status:** Setup complete, build not started. See `docs/project-state.md`.

## Setup

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
cp .env.example .env                 # add your keys
# Copy the Reonic CSVs to data/raw/<installer>/ (they are not in git)
uv run python scripts/profile_data.py
```

## Docs

| Doc | Contents |
|---|---|
| [Project state](docs/project-state.md) | Where we are, next steps, timeline, risks |
| [Decisions](docs/decisions.md) | Confirmed and proposed decisions |
| [Open questions](docs/open-questions.md) | For Reonic, organisers and the team |
| [Challenge brief](docs/brief/challenge.md) | Full extraction of the brief |
| [Data dictionary](docs/data/dictionary.md) | Every column, units, reconstruction rules |
| [Data findings](docs/data/findings.md) | Traps, limits, baseline, noise floor |
| [Architecture](docs/architecture.md) | Proposed system |
| [Evaluation](docs/evaluation.md) | How we prove it decides like an expert |
| [Sponsor tools](docs/sponsor-tools.md) | Anthropic, Supabase, ElevenLabs, Lovable |
| [Demo script](docs/demo-script.md) | Five-minute story |
| [Roadmap](docs/roadmap.md) | Core scope, then features beyond the brief |

## Approach

To be completed for submission.

## Known limitations

To be completed for submission. Start from the structural limits in `docs/data/findings.md`.
