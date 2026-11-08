"""The planner's agent: reviews a request by running the design engine itself, then proposes one change and says why.

Claude chooses what to try and writes; the engine makes every number. The agent calls `try_design` to run the engine on
a variant or a what-if, `battery_sizes` for what each catalog battery does, and ends with `finish`. Any sentence holding
a number that no engine answer in this run gave is dropped, and a proposed change is checked and run once more by the
engine, so the planner sees its numbers from the engine, not from the model. Nothing from past projects is sent.
Without ANTHROPIC_API_KEY, or on any failure, the engine's own warnings stand in.
"""
import json
import os
import re

from .advise import FROM_PAST, _given, _said, _values, brief

MODEL = "claude-opus-5-5"
MAX_TURNS = 10  # model calls in one run; each may hold several tool calls
SYSTEM = """You are an experienced solar, battery and heat pump planner at a German installer, working inside the
installer's planning desk. A design engine has drafted a system for one customer's home. Your job: check the draft the
way a senior planner would, by running the engine on the alternatives that matter for this customer, and then propose
what the planner should send.

How to work:
- Start from the customer's facts and stated priority. Decide which two to five variants are worth testing: solar size
  up or down, battery sizes, heat pump or wallbox, and what-ifs on facts the customer was unsure about (a car, a
  different yearly use). Use try_design and battery_sizes for that. Do not test what cannot matter for this home.
- Every number you write must come from a tool result or the input, with its unit (kWh, kWp, MWh, kW, EUR, %, modules).
  Never compute differences, sums, payback or prices yourself.
- What-ifs on facts (demand_kwh, ev, ev_km) are for questions only: never propose changing a customer fact. Your
  proposed change may only set modules, battery_kwh, heatpump or wallbox, and only to a variant you tested.
- When the planner asks you something, answer it in `answer`, testing with the tools when numbers are involved.
- End by calling finish exactly once. Keep reasons to two to four short, concrete sentences."""

DESIGN_FIELDS = {
    "modules": {"type": ["integer", "null"], "description": "Solar modules to fix, null keeps the current choice"},
    "battery_kwh": {"type": ["number", "null"], "description": "Battery size in kWh from the catalog, 0 for none, null keeps the current choice"},
    "heatpump": {"type": ["boolean", "null"], "description": "true adds a heat pump, false removes it, null keeps the current choice"},
    "wallbox": {"type": ["boolean", "null"], "description": "true adds a wallbox, false removes it, null keeps the current choice"},
}
WHAT_IF = {
    "demand_kwh": {"type": ["number", "null"], "description": "What-if: household use a year in kWh, null keeps the customer's"},
    "ev": {"type": ["boolean", "null"], "description": "What-if: the household has an electric car, null keeps the customer's"},
    "ev_km": {"type": ["number", "null"], "description": "What-if: the car's km a year, null keeps the customer's"},
}


def _object(props):
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


TOOLS = [
    {"name": "try_design", "strict": True,
     "description": "Run the design engine on the current design with some decisions fixed, and optionally a what-if on the "
                    "customer's facts. Returns the system and its yearly energy and saving estimate, and the engine's notes.",
     "input_schema": _object({**DESIGN_FIELDS, **WHAT_IF})},
    {"name": "battery_sizes", "strict": True,
     "description": "For a design (current choices, optionally with modules fixed), the share of the yearly need covered by "
                    "own power and the yearly saving for every battery size in the installer's catalog.",
     "input_schema": _object({"modules": DESIGN_FIELDS["modules"]})},
    {"name": "finish", "strict": True,
     "description": "Your final answer to the planner. Call once, at the end.",
     "input_schema": _object({
         "headline": {"type": "string", "description": "One line: what to send"},
         "reasons": {"type": "array", "items": {"type": "string"}},
         "questions": {"type": "array", "items": {"type": "string"}, "description": "Up to four things to confirm with the customer, most important first"},
         "risk": {"type": ["string", "null"]},
         "answer": {"type": ["string", "null"], "description": "Direct answer to the planner's last message, or null"},
         "change": {"anyOf": [{"type": "null"}, _object(DESIGN_FIELDS)], "description": "The change to the current design you propose, or null to keep it"},
     })},
]


def summary(d):
    """One design as the agent sees it: the system, its estimate and the engine's notes, without past-project figures."""
    e = d["energy"]
    return {
        "modules": d["pv"]["modules"], "kwp": d["pv"]["kwp"], "max_modules": d["pv"]["max_modules"],
        "battery_kwh": d["battery"]["kwh"], "heatpump_kw": d["heatpump"]["kw"] if d["heatpump"]["included"] else 0,
        "wallbox": d["wallbox"]["included"], "need_mwh": e["total_mwh"], "production_mwh": e["production_mwh"],
        "own_power_pct": e["self_sufficiency_pct"], "solar_used_at_home_pct": e["self_use_pct"], "saving_eur_year": e["saving_eur"],
        "notes": [n["text"] for n in d.get("review") or [] if n.get("code") not in FROM_PAST and n.get("text")],
    }


class Run:
    """One agent run over one request. `engine(inputs, overrides)` is the API's own design call."""

    def __init__(self, engine, inputs, overrides):
        self.engine, self.inputs, self.overrides = engine, inputs, {k: v for k, v in (overrides or {}).items() if v is not None}
        self.draft = engine(inputs, self.overrides)
        self.seen = [brief(inputs, self.draft), summary(self.draft)]  # what the agent was told: the number check reads it
        self.steps = []

    def _design(self, args):
        fixed = {k: args.get(k) for k in DESIGN_FIELDS if args.get(k) is not None}
        facts = {k: args.get(k) for k in WHAT_IF if args.get(k) is not None}
        return self.engine({**self.inputs, **facts}, {**self.overrides, **fixed}), fixed, facts

    def tool(self, name, args):
        if name == "try_design":
            d, fixed, facts = self._design(args)
            out = summary(d)
            self.steps.append({"tool": name, "fixed": fixed, "what_if": facts, "result": {k: out[k] for k in (
                "modules", "kwp", "battery_kwh", "heatpump_kw", "wallbox", "production_mwh", "own_power_pct", "saving_eur_year")}})
        elif name == "battery_sizes":
            d, fixed, _ = self._design(args)
            out = {"modules": d["pv"]["modules"], "sizes": [{"battery_kwh": r["kwh"], "own_power_pct": r["own_pct"], "saving_eur_year": r["saving_eur"]}
                                                           for r in d.get("battery_curve") or []]}
            self.steps.append({"tool": name, "fixed": fixed, "what_if": {}, "result": {"sizes": len(out["sizes"])}})
        else:
            raise ValueError(f"unknown tool {name}")
        self.seen.append(out)
        return out

    def checked(self, final):
        """Sentences with numbers no engine answer gave are dropped; a change must be a valid, tested design."""
        values = _values({"seen": self.seen})

        def fine(text):
            return all(_given(x, values) for x in _said(text))

        def keep(text):
            """Line by line, sentence by sentence, so a list keeps its shape."""
            lines = [" ".join(s for s in re.split(r"(?<=[.!?])\s+", line) if s.strip() and fine(s)) for line in (text or "").split("\n")]
            return "\n".join(lines).strip() or None

        out = {
            "headline": final.get("headline") if fine(final.get("headline") or "") else "The agent's proposal",
            "reasons": [s for s in final.get("reasons") or [] if fine(s)],
            "questions": [s for s in final.get("questions") or [] if fine(s)][:4],
            "risk": final.get("risk") if final.get("risk") and fine(final["risk"]) else None,
            "answer": keep(final.get("answer")),
            "change": None, "after": None,
        }
        change = {k: v for k, v in (final.get("change") or {}).items() if v is not None}
        if change:
            choices = set(self.draft["battery"]["choices"]) | {0.0}
            cap = self.draft["pv"]["max_modules"]
            ok = (change.get("battery_kwh") is None or float(change["battery_kwh"]) in choices) and \
                 (change.get("modules") is None or 1 <= int(change["modules"]) <= (cap or 10_000))
            if ok:
                after = self.engine(self.inputs, {**self.overrides, **change})
                out["change"], out["after"] = change, summary(after)
        return out


def _rules(run):
    d = run.draft
    warn = [n["text"] for n in d.get("review") or [] if n.get("level") == "warn" and n.get("code") not in FROM_PAST]
    return {"headline": "Engine draft", "reasons": [], "questions": warn[:4], "risk": None, "answer": None, "change": None, "after": None}


def _claude(run, message, history):
    """Yields each step as the engine answers it, then the final answer."""
    import anthropic

    client = anthropic.Anthropic(timeout=60, max_retries=1)
    start = {"home_and_options": run.seen[0], "current_design": run.seen[1]}
    messages = [{"role": "user", "content": "Review this request and propose what to send.\n\n" + json.dumps(start, ensure_ascii=False)}]
    for h in history or []:  # earlier exchanges with the planner, as plain text
        if h.get("text"):
            messages.append({"role": "assistant" if h.get("role") == "agent" else "user", "content": h["text"]})
    if message:
        messages.append({"role": "user", "content": f"The planner asks: {message}"})
    for _ in range(MAX_TURNS):
        response = client.beta.messages.create(
            model=MODEL, max_tokens=16000, system=SYSTEM, tools=TOOLS, messages=messages,
            output_config={"effort": "medium"}, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise RuntimeError("refused")
        messages.append({"role": "assistant", "content": response.content})
        calls = [b for b in response.content if b.type == "tool_use"]
        done = next((c for c in calls if c.name == "finish"), None)
        if done:
            yield "final", dict(done.input)
            return
        if not calls:  # answered in text without finish: take it as the answer
            text = " ".join(b.text for b in response.content if b.type == "text").strip()
            yield "final", {"headline": "The agent's answer", "reasons": [], "questions": [], "risk": None, "answer": text, "change": None}
            return
        results = []
        for c in calls:
            try:
                results.append({"type": "tool_result", "tool_use_id": c.id, "content": json.dumps(run.tool(c.name, dict(c.input)))})
                yield "step", run.steps[-1]
            except Exception as error:  # an engine error goes back to the model, which can try something else
                results.append({"type": "tool_result", "tool_use_id": c.id, "content": f"Error: {error}", "is_error": True})
        messages.append({"role": "user", "content": results})
    raise RuntimeError("no finish within the turn limit")


def agent_events(engine, inputs, overrides, message=None, history=None):
    """("step", step) for every engine run as it happens, then ("done", answer)."""
    run = Run(engine, inputs, overrides)
    source, out = "rules", None
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            for kind, value in _claude(run, message, history):
                if kind == "step":
                    yield "step", value
                else:
                    out, source = run.checked(value), "claude"
        except Exception as error:  # the desk must keep working without the model
            out = {**_rules(run), "error": type(error).__name__}
    out = out or _rules(run)
    yield "done", {**out, "steps": run.steps, "source": source}


def run_agent(engine, inputs, overrides, message=None, history=None):
    return next(v for k, v in agent_events(engine, inputs, overrides, message, history) if k == "done")
