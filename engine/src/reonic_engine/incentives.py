"""German and Munich rules and grants that change what a home system costs or earns, as of November 2026.

Each one is checked against the home and the design, and comes back with whether it applies, what it does in euros
(from costs.py), what to do, its legal status and its source. The money view uses the numbers; the planner and the
offer show the list. Rules only, no language model. Sources and dates are in docs/assumptions.md.

Status: "law" is in force; "draft" is a cabinet draft that may still change; "city" is Munich's own programme.
"""
MUNICH = True  # the prototype covers Munich only (project-state.md): the city's programme and grid operator apply

# Solarspitzengesetz (in force since 25 February 2025, EEG §51): no feed-in payment in hours with negative exchange prices.
# In 2025 about 27% of a fixed rooftop system's yearly output fell in such hours (logicenergy, 2025 evaluation of SMARD
# data). The unpaid hours are added after the 20 years (EEG §51a), which this view does not count.
NEG_PRICE_SHARE = 27
# The same law: a new system without a smart meter and control box may feed in at most 60% of its peak power.
# Above 7 kWp the smart meter is mandatory, so the limit ends when it is fitted; up to 7 kWp it stays unless one is ordered.
CAP_NO_METER = 0.6
SMART_METER_KWP = 7
# Smart meter and control box a year, at the legal price caps for systems of 7–15 kWp (MsbG; €50 each, gross).
SMART_METER_EUR = 100
# §14a EnWG: a heat pump or wallbox (and a battery charging from the grid above 4.2 kW) installed since 2024 must be
# controllable by the grid operator, and its owner pays less grid fee. Module 1, a flat rebate, at SWM Infrastruktur
# (Munich) in 2026: about €138 a year (42watt comparison of operators' 2026 price sheets).
GRID_REBATE_EUR = 138
# EEG 2027 cabinet draft (29 July 2026), for systems switched on from 1 January 2027: the fixed feed-in ends, a
# transitional payment of about 5.2 ct for at most 36 months, then market value; feed-in capped at 50% for good.
DRAFT_FEED_CT = 5.2
DRAFT_MONTHS = 36
DRAFT_CAP = 0.5
MARKET_CT = 4.0  # roughly the market value of rooftop solar power, our assumption
# Munich's Förderprogramm Klimaneutrale Gebäude (guideline of 28 September 2026, ch. 2.2.1): 15% for an air-water heat pump,
# on the BEG's eligible costs, only with BEG funding, not when BEG's speed or income bonus is claimed, not where district
# heating exists or is possible, and BEG + city at most 60%. Rooftop solar and batteries get nothing (ch. 5).
FKG_HP = 15
FKG_CAP = 60


def _standing(eur):
    return f"€{abs(round(eur)):,} {'ahead' if eur >= 0 else 'behind'}"


def rules(i, d, m):
    """The rules and grants for this home and design. m: the money view from costs.evaluate."""
    kwp = d["pv"]["kwp"] if d["pv"]["modules"] else 0
    hp, wb, bat = d["heatpump"]["included"], d["wallbox"]["included"], d["battery"]["kwh"] > 0
    out = []

    def add(id, title, status, applies, effect, text, action, source):
        out.append({"id": id, "title": title, "status": status, "applies": applies, "effect": effect, "text": text, "action": action, "source": source})

    if kwp:
        add("vat0", "No VAT on solar and battery", "law", True, f"saves about €{round((m['by_tech'].get('solar', 0) + m['by_tech'].get('battery', 0)) * 0.19):,}",
            "Solar systems up to 30 kWp on or near homes, their batteries and installation carry 0% VAT.", "Nothing to apply for: the invoice shows 0%.", "UStG §12(3), since 2023")
        add("tax_free", "No income tax on the system", "law", kwp <= 30, None,
            "Income from solar up to 30 kWp per home is free of income tax, and no trade needs registering.", None, "EStG §3 Nr. 72, since 2022")
        add("feed_in", "Feed-in tariff, fixed 20 years", "law", True, f"{m['year1']['feed_full_ct']:g} ct per kWh sold",
            "Systems switched on from 1 August 2026 to 31 January 2027 get 7.7 ct per kWh up to 10 kWp and 6.66 ct above, for 20 years.",
            "Switch the system on by 31 January 2027 to keep this rate.", "EEG 2023 §48, §49 (1% cut every six months)")
        add("negative_prices", "No payment in negative-price hours", "law", True, f"−€{m['neg_loss_eur']:,} a year",
            f"Since 25 February 2025 new systems are not paid for power fed in while the exchange price is negative: in 2025 about {NEG_PRICE_SHARE}% of a rooftop system's output. "
            "The unpaid hours are added after the 20 years. A battery and daytime use move power out of these hours.",
            "Count it in the offer; plan daytime use (car, heat pump, hot water) around midday.", "Solarspitzengesetz, EEG §51, §51a; share: logicenergy 2025")
        if kwp > SMART_METER_KWP:
            add("smart_meter", "Smart meter and control box required", "law", True, f"−€{SMART_METER_EUR} a year",
                "Above 7 kWp a smart meter and a control box are mandatory. Until they are fitted the system may feed in at most 60% of its peak power.",
                "Order the smart meter with the grid registration.", "MsbG §29, §30 (price caps); Solarspitzengesetz")
        else:
            add("cap60", "Feed-in limited to 60% without a smart meter", "law", True,
                f"−{m['curtailed_kwh']:,} kWh a year" if m.get("curtailed_kwh") else "little lost here",
                "Up to 7 kWp no smart meter is required, but without one the system may feed in at most 60% of its peak power for good.",
                "A smart meter lifts the limit; worth it only when much is lost.", "Solarspitzengesetz, EEG §9")
        draft = m.get("draft_2027") or {}
        add("eeg_2027", "EEG 2027 draft: no fixed feed-in from 2027", "draft", True,
            (f"payback {draft['payback_years']:g} years instead of {m['payback_years']:g}" if draft.get("payback_years") and m.get("payback_years")
             else f"{_standing(draft['gain_eur'])} after 20 years instead of {_standing(m['gain_eur'])}" if draft else None),
            f"The cabinet's draft for systems switched on from 1 January 2027: about {DRAFT_FEED_CT:g} ct for at most {DRAFT_MONTHS} months, then market value, "
            f"and feed-in capped at {round(DRAFT_CAP * 100)}% for good. Not law yet: Bundestag, Bundesrat and the EU still decide.",
            "Tell the customer: switching on before 2027 keeps the 20-year tariff.", "EEG 2027 cabinet draft, 29 July 2026")
        add("munich_pv", "No city grant for rooftop solar or batteries", "city", MUNICH, None,
            "Munich funds solar advice (60% of the fee, at most €3,000 for one or two homes), tenant power and balcony systems, not rooftop systems or batteries.",
            "If the customer pays an independent solar adviser, apply before ordering.", "Munich FKG guideline of 28 Sep 2026, ch. 5")
        add("kfw_270", "KfW loan 270 for solar and battery", "law", True, None,
            "A loan for the whole system; rates depend on the bank's rating, about 3.8% to 11.5% a year in July 2026.", "Only if the customer wants to finance: ask the house bank before ordering.", "KfW 270")
    if hp or wb or (bat and kwp):
        what = " and ".join(x for x, on in (("heat pump", hp), ("wallbox", wb)) if on) or "battery (when it charges from the grid above 4.2 kW)"
        add("grid_rebate", "Lower grid fee for controllable devices", "law", bool(hp or wb), f"+€{GRID_REBATE_EUR} a year" if hp or wb else None,
            f"A {what} installed since 2024 must let the grid operator limit it to 4.2 kW in a grid emergency; in return the grid fee drops. "
            f"Module 1, a flat rebate, is about €{GRID_REBATE_EUR} a year at SWM Infrastruktur in 2026; module 2 takes 60% off the grid fee per kWh with a separate meter.",
            "Register the device with the grid operator and pick the module.", "EnWG §14a; SWM Infrastruktur 2026 via 42watt")
    if hp:
        g = m.get("grant") or {}
        add("beg", "KfW heat pump grant (BEG)", "law", True, f"−€{g.get('beg_eur', 0):,}",
            "30% base, 16% speed bonus for replacing oil, coal, night storage or a gas boiler of 20 years or more, 10–40% by income; at most 70% (80% for low incomes) of at most €28,000.",
            "Apply at KfW before signing the order; a hydraulic balancing is required.", "BEG EM, reform of 21 July 2026")
        add("fkg_hp", "Munich heat pump grant (FKG)", "city", MUNICH, f"−€{g.get('fkg_eur', 0):,}" if g.get("path") == "fkg" else "not the better path here",
            "15% more from the city on the same costs, but only without KfW's speed and income bonuses, and not where district heating exists or is possible. KfW and city together at most 60%.",
            "If this path is better, apply at the city before ordering and ask SWM whether district heating can reach the home.", "Munich FKG guideline of 28 Sep 2026, ch. 2.2.1")
    if i.get("heating") in ("Gas", "Oil"):
        add("gmodg", "Gas and oil boilers allowed again, with a rising green share", "law", True, None,
            "The Gebäudemodernisierungsgesetz (July 2026) drops the 65% renewable rule: a new gas or oil boiler is allowed again, but from 2029 it must burn a rising share of green fuel, reported as 10% then, 60% by 2040.",
            "Keeping fossil heat is legal but gets dearer: show the heat pump next to it.", "GModG, passed 10 July 2026")
        add("co2", "CO₂ price on gas and oil", "law", True, None,
            "€55–65 a tonne in 2026 and 2027 (about 1.2–1.4 ct per kWh of gas), then the EU's market price from 2028. The view assumes gas and oil 4% dearer a year.",
            None, "BEHG; EU ETS2 moved to 2028")
    if i.get("owner") == "tenant":
        add("balcony", "Balcony system grant for tenants", "city", MUNICH, "up to €320",
            "A tenant can add a plug-in system of up to 800 Wp without the landlord's roof: Munich pays €0.40 per Wp, at most half the cost.",
            "Offer it if the landlord says no to the roof.", "Munich FKG guideline of 28 Sep 2026, ch. 5.3")
    return out
