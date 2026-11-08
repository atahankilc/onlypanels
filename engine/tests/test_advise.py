from reonic_engine.advise import Advice, checked

BRIEF = {"home": {"demand_kwh": 4500}, "options": {"draft": {"kwp": 8.1, "saving_eur": 1240}, "battery_up": {"kwp": 8.1}},
         "battery_sizes": [{"kwh": 0.0}, {"kwh": 10.0}], "engine_notes": []}


def test_sentences_with_unknown_numbers_are_dropped():
    a = checked(Advice(pick="battery_up", headline="Bigger battery", risk="Could save 2000 EUR more.",
                       reasons=["Saves 1240 EUR a year.", "Uses 4.5 MWh.", "Pays back in 9 years."], questions=["Is 8.1 kWp fine?"]), BRIEF)
    assert a.reasons == ["Saves 1240 EUR a year.", "Uses 4.5 MWh."]
    assert a.questions == ["Is 8.1 kWp fine?"] and a.risk is None


def test_unknown_pick_and_battery_fall_back():
    a = checked(Advice(pick="made_up", headline="x", reasons=[], questions=[], battery_kwh=7.0), BRIEF)
    assert a.pick == "draft" and a.battery_kwh is None
