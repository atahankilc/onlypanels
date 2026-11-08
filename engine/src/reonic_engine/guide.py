"""The homeowner's voice helper as an MCP server: it walks them through the app, explains each question and fills in
what they say. It never shows a result: no size, price, saving or advice reaches a homeowner before a planner has
checked it (D62). It never takes the address or the home, and it never sends: the homeowner presses Send.

Built per turn around what the homeowner's page sends (`context`): where they are, the pages of their flow and their
answers so far, without the address, the buildings, the meter photo or the census. Tools record actions, which the page
carries out as taps (voiceBus.ts), exactly like desk.py for the planner.
"""
import json

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

# What each page asks and why, in the words of the pages (Review.tsx) and what stands in for a skipped answer (questions.ts).
PAGES = {
    "where": "Where is your home? The address, for the installer's visit. It is typed, never said to the helper.",
    "roofq": "The roof in words: which way the larger side faces, how steep it is, how big the house is. Rough answers are fine.",
    "roof": "On the map: mark the parts of the roof you would like panels on, with Whole surface or Draw. Optional.",
    "solar": "Is there solar here already? Electricity, hot water or both, its size in kWp and the year, if known.",
    "battery": "Is there a home battery? Its size in kWh, if known.",
    "use": "Electricity a year in kWh, from the bill. Or a range, the monthly payment, or the household size. Skipped, we assume 4,000 kWh.",
    "big": "Anything big that runs on electricity: pool, sauna, air conditioning, electric water heater.",
    "house": "Living area in m², when it was built, and the energy certificate's figure if there is one.",
    "heat": "How the home is heated, how much gas or oil a year, the boiler's age, underfloor heating or radiators, and interest in a heat pump.",
    "car": "An electric car now or planned, km a year, how much is charged at home, whether it is home in the day, a wallbox.",
    "goal": "What matters most: low cost, independence or the environment. And whether power during an outage is wanted.",
    "send": "The overview: every answer, what was found and what is assumed. Any answer can be changed from here.",
    "share": "What goes to the installer: the home, the marked areas, or only rounded roof numbers. The homeowner chooses and presses Send.",
    "sent": "The request is sent. The installer checks it and sends an offer, which then shows here.",
}
SCREENS = {
    "start": "The start: find the home on the map, or answer questions without the map.",
    "pick": "The map: type an address or move the map to the area, click the buildings that belong to the home, then Continue. "
            "The helper cannot click on the map or type the address.",
    "requests": "The list of requests already sent, and New request.",
}
# What the helper may fill in, as the page's answers: (kind, lowest, highest) or (kind, allowed values).
ANSWERS = {
    "demand_kwh": ("number", 500, 30_000), "monthly_eur": ("number", 10, 1_000), "price_ct_kwh": ("number", 10, 80),
    "solar_kwp": ("number", 0.5, 50), "solar_year": ("number", 1990, 2026), "battery_kwh": ("number", 1, 50),
    "heat_kwh": ("number", 1_000, 100_000), "gas_eur": ("number", 100, 10_000), "oil_l": ("number", 100, 10_000), "hp_kwh": ("number", 500, 20_000),
    "ev_km": ("number", 1_000, 100_000), "ev_count": ("number", 1, 3), "ev_kwh_month": ("number", 10, 2_000),
    "living_m2": ("number", 30, 1_000), "cert_kwh_m2": ("number", 10, 400), "roof_m2": ("number", 10, 1_000),
    "has_solar": ("bool",), "has_storage": ("bool",), "wants_hp": ("bool",), "ev": ("bool",), "ev_planned": ("bool",),
    "ev_day": ("bool",), "has_wallbox": ("bool",), "backup": ("bool",),
    "solar_kind": ("choice", ["pv", "thermal", "both"]),
    "heating": ("choice", ["Heatpump", "Gas", "Oil", "District", "Electric", "OtherRenewable", "OtherNonRenewable"]),
    "heat_dist": ("choice", ["floor", "radiators", "both"]), "boiler_age": ("choice", ["under10", "10to20", "over20"]),
    "ev_when": ("choice", ["soon", "later"]), "ev_charge_home": ("choice", ["most", "half", "little"]),
    "goal": ("choice", ["cost", "independence", "environment"]), "home_day": ("choice", ["most", "some", "rarely"]),
    "owner": ("choice", ["sole", "shared", "tenant"]), "built": ("choice", ["before1979", "1979to1990", "1991to2000", "2001to2010", "since2011"]),
    "roof_facing": ("choice", ["south", "south-east", "south-west", "east", "west", "north", "flat", "unsure"]),
    "roof_slope": ("choice", ["gentle", "steep", "unsure"]), "roof_size": ("choice", ["small", "medium", "large", "known"]),
    "big_users": ("list", ["pool", "sauna", "ac", "water"]),
}
NEVER = {"address", "meter_photo", "area"}  # never through the helper, either way


class Guide:
    def __init__(self, context):
        self.context = context or {}
        self.screen = self.context.get("screen", "start")
        self.pages = [p for p in self.context.get("pages") or [] if p in PAGES]
        self.answers = {k: v for k, v in (self.context.get("answers") or {}).items() if k not in NEVER}
        self.actions: list[dict] = []
        self.steps: list[dict] = []
        self.seen: list = [self.overview(), PAGES, SCREENS, {"typical_use_kwh": 4000}]  # the stand-in a skipped use becomes

    def overview(self):
        page = self.context.get("page")
        return {"screen": self.screen, "what_this_screen_is": SCREENS.get(self.screen) or PAGES.get(page),
                "page": page if self.screen == "questions" else None,
                "pages_in_order": self.pages, "answers_so_far": {k: v for k, v in self.answers.items() if v not in (None, [], False, "")}}

    def act(self, action, said):
        self.actions.append(action)
        self.steps.append({"tool": action["type"], "said": said})
        return said


def _value(key, value):
    spec = ANSWERS[key]
    if spec[0] == "number":
        try:
            v = float(str(value).replace(",", ""))
        except ValueError:
            raise ToolError(f"{key} needs a number")
        if not spec[1] <= v <= spec[2]:
            raise ToolError(f"{key} between {spec[1]} and {spec[2]}; ask again")
        return int(v) if v.is_integer() else v
    if spec[0] == "bool":
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("true", "yes", "1", "ja", "evet")
    if spec[0] == "list":
        items = value if isinstance(value, list) else [x.strip() for x in str(value).split(",")]
        bad = [x for x in items if x not in spec[1]]
        if bad:
            raise ToolError(f"{key} takes {spec[1]}")
        return items
    v = next((c for c in spec[1] if c.lower() == str(value).strip().lower()), None)
    if v is None:
        raise ToolError(f"{key} must be one of {spec[1]}")
    return v


def build(guide: Guide) -> MCPServer:
    server = MCPServer("homeowner-guide", instructions="Helps a homeowner through their request: pages, questions and answers.")

    @server.tool(description="On the start screen: begin on the map (way=map) or with questions only (way=questions).")
    def choose_start(way: str) -> str:
        if guide.screen != "start":
            raise ToolError("That choice is only on the start screen.")
        if way not in ("map", "questions"):
            raise ToolError("way is map or questions")
        return guide.act({"type": "start", "way": "form" if way == "questions" else "map"}, f"Started with {way}.")

    @server.tool(description="On the list of sent requests: start a new request, which opens the questions at their first page. "
                             "Then go_to_page and set_answers work in the same turn.")
    def new_request() -> str:
        if guide.screen != "requests":
            raise ToolError("New request is only on the list of sent requests.")
        guide.screen = "questions"
        guide.pages = guide.pages or ["where", "roofq", "solar", "battery", "use", "big", "house", "heat", "car", "goal", "send", "share"]
        return guide.act({"type": "new"}, "New request started.")

    @server.tool(description="Go to a page of the questions by its name from pages_in_order, e.g. the next one, or 'send' for the overview.")
    def go_to_page(page: str) -> str:
        if guide.screen != "questions":
            raise ToolError("The questions are not open yet. " + (SCREENS.get(guide.screen) or ""))
        if page not in guide.pages and page not in ("send", "share"):
            raise ToolError(f"Pages: {guide.pages}")
        return guide.act({"type": "goto", "page": page}, f"Showing {page}.")

    @server.tool(description="Fill in answers the homeowner just said, as {key: value}. Keys and values: demand_kwh, monthly_eur, "
                             "price_ct_kwh (cents), solar_kwp, solar_year, battery_kwh, heat_kwh, gas_eur (a year), oil_l (a year), "
                             "hp_kwh, ev_km, ev_count, ev_kwh_month, living_m2, cert_kwh_m2, roof_m2 (numbers); has_solar, "
                             "has_storage, wants_hp, ev, ev_planned, ev_day, has_wallbox, backup (true/false); solar_kind (pv, "
                             "thermal, both); heating (Heatpump, Gas, Oil, District, Electric, OtherRenewable, OtherNonRenewable); "
                             "heat_dist (floor, radiators, both); boiler_age (under10, 10to20, over20); ev_when (soon, later); "
                             "ev_charge_home (most, half, little); goal (cost, independence, environment); home_day (most, some, "
                             "rarely); owner (sole, shared, tenant); built (before1979, 1979to1990, 1991to2000, 2001to2010, "
                             "since2011); roof_facing (south, south-east, south-west, east, west, north, flat, unsure); roof_slope "
                             "(gentle, steep, unsure); roof_size (small, medium, large, known); big_users (list of pool, sauna, ac, "
                             "water). Only what they said; never guess. Never the address.")
    def set_answers(answers: dict) -> str:
        if guide.screen not in ("questions", "start", "pick", "requests"):
            raise ToolError("Answers can only be changed before sending.")
        if any(k in NEVER for k in answers):
            raise ToolError("The address is typed by the homeowner on the page, never taken by voice.")
        unknown = [k for k in answers if k not in ANSWERS]
        if unknown:
            raise ToolError(f"Unknown answers {unknown}. Known: {list(ANSWERS)}")
        clean = {k: _value(k, v) for k, v in answers.items()}
        guide.answers.update(clean)
        guide.seen.append(clean)
        guide.act({"type": "answers", "answers": clean}, "Noted.")
        return json.dumps({"noted": clean})

    return server
