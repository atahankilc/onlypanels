"""The planner's desk as an MCP server: what a spoken request may do in the app.

One server is built per voice turn around what the planner's page sees right now (`context`, sent by the page). Engine
tools (`try_design`, `battery_sizes`) answer from the design engine; app tools (`open_request`, `show_tab`, `set_design`,
`confirm_facts`, `send_offer`, ...) do not change anything themselves: they check the step is allowed and record an
action, which the page then carries out exactly as a click would, with the same change card and undo. Every number a
tool returns is kept in `seen`, so the spoken answer can be checked against it (voice.py).

The same server can be reached by any MCP client; the voice turn talks to it in-process (mcp.Client on the instance).
"""
import json

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError  # its message reaches the model; any other error is hidden as a crash

from .agent import Run, summary

TABS = ("overview", "home", "design", "cost", "checks", "offer")
PAGES = ("requests", "prices")
# Facts the planner may correct by voice, as the Home tab's fields: (kind, lowest, highest) or (kind, allowed values).
FACTS = {
    "demand_kwh": ("number", 500, 100_000), "price_ct_kwh": ("number", 5, 80), "heat_kwh": ("number", 0, 200_000),
    "hp_kwh": ("number", 0, 50_000), "ev_km": ("number", 0, 200_000), "living_m2": ("number", 20, 2_000),
    "ev": ("bool",), "has_wallbox": ("bool",), "backup": ("bool",), "has_storage": ("bool",),
    "heating": ("choice", ["Gas", "Oil", "OtherNonRenewable", "OtherRenewable", "District", "Electric", "Heatpump"]),
    "heat_dist": ("choice", ["floor", "radiators", "both"]), "home_day": ("choice", ["most", "some", "rarely"]),
    "goal": ("choice", ["cost", "independence", "environment"]), "owner": ("choice", ["sole", "shared", "tenant"]),
    "built": ("choice", ["before1979", "1979to1990", "1991to2000", "2001to2010", "since2011"]),
}
MONEY_KEYS = ("gross_eur", "pays_eur", "payback_years", "gain_eur", "irr_pct", "solar_ct_kwh", "battery_eur")


class Desk:
    """One turn's state. `engine(inputs, overrides)` is the API's own design call, as for the planner's agent."""

    def __init__(self, engine, context, money=None):
        """`money(inputs, overrides, options)` is the Cost tab's money view (costs.evaluate), when the API has one."""
        self.engine, self.context, self.money = engine, context or {}, money
        self.requests = {r["id"]: r for r in self.context.get("requests") or [] if r.get("id")}
        self.open = self.context.get("open") or None
        self.actions: list[dict] = []
        self.steps: list[dict] = []
        self.seen: list = [self.overview()]
        self.run = None
        if self.open and self.open.get("inputs") is not None:
            self.run = Run(engine, self.open["inputs"], self.open.get("overrides") or {})
            self.seen += self.run.seen

    def overview(self):
        """What the planner's screen shows, as the model reads it at the start of the turn."""
        o = self.open
        return {
            "page": "request" if o else self.context.get("page", "requests"),
            "requests": [{k: r.get(k) for k in ("id", "ref", "title", "status")} for r in self.requests.values()],
            "open_request": None if not o else {
                "id": o.get("id"), "ref": o.get("ref"), "title": o.get("title"), "tab": o.get("tab"), "status": o.get("status"),
                "facts_to_confirm": o.get("to_confirm") or [], "site_checks": o.get("checks") or [],
            },
        }

    def act(self, action, said):
        self.actions.append(action)
        self.steps.append({"tool": action["type"], "said": said})
        return said

    def opened(self):
        if not self.run:
            raise ToolError("No request is open. Open one first; its design tools work once it is on screen.")
        if any(a["type"] in ("open", "back", "page") for a in self.actions):
            raise ToolError("The screen changes in this turn. Finish the turn; the planner can ask again once it shows.")
        return self.run


def build(desk: Desk) -> MCPServer:
    server = MCPServer("planner-desk", instructions="The installer's planning desk: requests, the engine's design, checks and the offer.")

    @server.tool(description="Open a request from the list by its id, so the planner sees its design.")
    def open_request(request_id: str) -> str:
        r = desk.requests.get(request_id)
        if not r:
            raise ToolError(f"No request with id {request_id}. Known ids: {', '.join(desk.requests) or 'none'}")
        return desk.act({"type": "open", "id": request_id}, f"Opened {r.get('title') or r.get('ref') or request_id}.")

    @server.tool(description="Close the open request and go back to the request list.")
    def go_back() -> str:
        if not desk.open:
            return "The request list is already showing."
        return desk.act({"type": "back"}, "Back to the request list.")

    @server.tool(description="On the request list, switch between the requests and the prices page (the price book every offer is costed from).")
    def show_page(page: str) -> str:
        if page not in PAGES:
            raise ToolError(f"page must be one of {PAGES}")
        if desk.open:
            raise ToolError("A request is open; go back to the list first.")
        return desk.act({"type": "page", "page": page}, f"Showing {page}.")

    @server.tool(description="In the open request, show a section: overview (the system, its money and the facts to confirm), home (facts and roof), design, cost (price and payback), checks (site checks) or offer.")
    def show_tab(tab: str) -> str:
        if tab not in TABS:
            raise ToolError(f"tab must be one of {TABS}")
        desk.opened()
        return desk.act({"type": "tab", "tab": tab}, f"Showing {tab}.")

    @server.tool(description="Run the design engine on the open request with some decisions fixed, and optionally a what-if on the "
                             "customer's facts. Changes nothing on screen. Returns the system, its yearly energy and saving, and notes.")
    def try_design(modules: int | None = None, battery_kwh: float | None = None, heatpump: bool | None = None, wallbox: bool | None = None,
                   demand_kwh: float | None = None, ev: bool | None = None, ev_km: float | None = None) -> str:
        run = desk.opened()
        out = run.tool("try_design", {"modules": modules, "battery_kwh": battery_kwh, "heatpump": heatpump, "wallbox": wallbox,
                                      "demand_kwh": demand_kwh, "ev": ev, "ev_km": ev_km})
        desk.seen.append(out)
        desk.steps.append(run.steps[-1])
        return json.dumps(out)

    @server.tool(description="For the open request, the own-power share and yearly saving of every battery size in the catalog. Changes nothing on screen.")
    def battery_sizes(modules: int | None = None) -> str:
        run = desk.opened()
        out = run.tool("battery_sizes", {"modules": modules})
        desk.seen.append(out)
        desk.steps.append(run.steps[-1])
        return json.dumps(out)

    @server.tool(description="Change the open request's design on screen, as the planner's own edit with undo. Only the decisions given "
                             "change: modules, battery_kwh (a catalog size, 0 for none), heatpump, wallbox. Returns the new design from the engine.")
    def set_design(modules: int | None = None, battery_kwh: float | None = None, heatpump: bool | None = None, wallbox: bool | None = None) -> str:
        run = desk.opened()
        change = {k: v for k, v in {"modules": modules, "battery_kwh": battery_kwh, "heatpump": heatpump, "wallbox": wallbox}.items() if v is not None}
        if not change:
            raise ToolError("Give at least one of modules, battery_kwh, heatpump, wallbox.")
        if desk.open.get("status") == "sent":
            raise ToolError("This offer is already sent.")
        choices = sorted(set(run.draft["battery"]["choices"]) | {0.0})
        if "battery_kwh" in change and float(change["battery_kwh"]) not in choices:
            raise ToolError(f"battery_kwh must be one of the catalog sizes {choices}")
        cap = run.draft["pv"]["max_modules"]
        if "modules" in change and not 1 <= int(change["modules"]) <= (cap or 10_000):
            raise ToolError(f"modules must be between 1 and {cap}")
        after = summary(run.engine(run.inputs, {**run.overrides, **change}))
        desk.seen.append(after)
        desk.act({"type": "set", "overrides": change}, "Design changed.")
        return json.dumps({"changed": change, "design_now": after})

    @server.tool(description="Confirm assumed facts of the open request as checked by the planner, by key, or all of them with keys=['all']. "
                             "Only when the planner says the facts are right.")
    def confirm_facts(keys: list[str]) -> str:
        desk.opened()
        open_keys = [f["key"] for f in desk.open.get("to_confirm") or []]
        keys = open_keys if keys == ["all"] else [k for k in keys if k in open_keys]
        if not keys:
            raise ToolError(f"Nothing to confirm with those keys. Facts to confirm: {open_keys or 'none'}")
        return desk.act({"type": "confirm", "keys": keys}, f"Confirmed {len(keys)} fact{'s' if len(keys) != 1 else ''}.")

    @server.tool(description="For the open request, what the system costs the homeowner and what it brings: price with VAT, KfW "
                             "grant, what they pay, the first year's money, the bills before and after, payback, gain over the "
                             "years and the solar power's cost per kWh, from the planner's price book. Optionally for a variant "
                             "with some decisions fixed. Changes nothing on screen.")
    def money(modules: int | None = None, battery_kwh: float | None = None, heatpump: bool | None = None, wallbox: bool | None = None) -> str:
        run = desk.opened()
        if not desk.money:
            raise ToolError("The money view is not available here.")
        fixed = {k: v for k, v in {"modules": modules, "battery_kwh": battery_kwh, "heatpump": heatpump, "wallbox": wallbox}.items() if v is not None}
        m = desk.money(run.inputs, {**run.overrides, **fixed}, desk.open.get("money") or {})
        out = {"fixed": fixed, **{k: m.get(k) for k in MONEY_KEYS}, "grant_eur": (m.get("grant") or {}).get("eur", 0),
               "first_year_eur": m["year1"], "bill_before_eur_year": m["bills"]["before"]["total_eur"],
               "bill_after_eur_year": m["bills"]["after"]["total_eur"], "years_counted": m["assumptions"]["years"]}
        desk.seen.append(out)
        desk.steps.append({"tool": "money", "fixed": fixed, "what_if": {}, "result": {k: out[k] for k in ("pays_eur", "payback_years")}})
        return json.dumps(out)

    @server.tool(description="Tick (done=true) or untick site checks of the open request, by their id from site_checks. "
                             "Only when the planner says the check is done.")
    def tick_checks(ids: list[str], done: bool = True) -> str:
        desk.opened()
        known = {c["id"]: c for c in desk.open.get("checks") or []}
        ids = [i for i in ids if i in known]
        if not ids:
            raise ToolError(f"No such site check. Ids: {list(known) or 'none'}")
        return desk.act({"type": "check", "ids": ids, "done": done}, f"{'Ticked' if done else 'Unticked'} {', '.join(known[i]['title'] for i in ids)}.")

    @server.tool(description="Correct one of the customer's facts on the open request with what the planner says, marked as the "
                             "planner's: demand_kwh (electricity a year), price_ct_kwh, heat_kwh (heat a year), hp_kwh, ev_km, "
                             "living_m2 (numbers); ev, has_wallbox, backup, has_storage (true/false); heating (Gas, Oil, "
                             "OtherNonRenewable, OtherRenewable, District, Electric, Heatpump); heat_dist (floor, radiators, both); "
                             "home_day (most, some, rarely); goal (cost, independence, environment); owner (sole, shared, tenant); "
                             "built (before1979, 1979to1990, 1991to2000, 2001to2010, since2011). Value as text. Only with a value "
                             "the planner said. Returns the design the engine makes with it.")
    def set_fact(key: str, value: str) -> str:
        run = desk.opened()
        if desk.open.get("status") == "sent":
            raise ToolError("This offer is already sent.")
        spec = FACTS.get(key)
        if not spec:
            raise ToolError(f"{key} cannot be changed by voice. Facts: {', '.join(FACTS)}")
        if spec[0] == "number":
            try:
                v = float(str(value).replace(",", ""))
            except ValueError:
                raise ToolError(f"{key} needs a number")
            if not spec[1] <= v <= spec[2]:
                raise ToolError(f"{key} must be between {spec[1]} and {spec[2]}")
            v = int(v) if v.is_integer() else v
        elif spec[0] == "bool":
            v = str(value).strip().lower() in ("true", "yes", "1", "ja", "evet")
        else:
            v = next((c for c in spec[1] if c.lower() == str(value).strip().lower()), None)
            if v is None:
                raise ToolError(f"{key} must be one of {spec[1]}")
        after = summary(run.engine({**run.inputs, key: v}, run.overrides))
        out = {"changed": {key: v}, "design_now": after}
        desk.seen.append(out)
        desk.act({"type": "fact", "inputs": {key: v}}, f"{key} set.")
        return json.dumps(out)

    @server.tool(description="Send the open request's offer to the customer. Only when the planner clearly asks to send it in this turn.")
    def send_offer() -> str:
        desk.opened()
        if desk.open.get("status") == "sent":
            raise ToolError("This offer is already sent.")
        if desk.open.get("to_confirm"):
            raise ToolError("Assumed facts must be confirmed first: " + ", ".join(f["label"] for f in desk.open["to_confirm"]))
        if any(a["type"] in ("set", "fact") for a in desk.actions):
            raise ToolError("The design changed in this turn. Let the planner see it, then send in the next turn.")
        return desk.act({"type": "send"}, "Offer sent.")

    return server

