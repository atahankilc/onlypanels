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


REAL = {"home": {"demand_kwh": 2700, "built": "1979to1990", "roof_faces": [{"facing_deg": 180, "tilt_deg": 35, "kwh_per_kwp": 1010, "max_modules": 17}]},
        "options": {"draft": {"modules": 17, "kwp": 7.65, "battery_kwh": 7.0, "total_mwh": 3.3, "self_sufficiency_pct": 73, "saving_eur": 1130},
                    "pv_large": {"modules": 25, "kwp": 11.25, "battery_kwh": 7.0, "saving_eur": 1240}},
        "battery_sizes": [{"kwh": 0.0, "own_pct": 42, "saving_eur": 900}, {"kwh": 5.0, "own_pct": 71, "saving_eur": 1110}, {"kwh": 7.0, "own_pct": 73, "saving_eur": 1130}],
        "engine_notes": []}


def kept(sentence):
    return checked(Advice(pick="draft", headline="x", reasons=[sentence], questions=[]), REAL).reasons == [sentence]


def test_engine_numbers_pass_at_the_precision_shown():
    assert kept("Keep the 7.65 kWp solar, shown as 7.7 kWp, with 17 modules.")
    assert kept("The 5 kWh battery reaches 71% and saves 1110 EUR, against €1,130 with 7 kWh.")
    assert kept("Demand is 3.3 MWh, 2,700 kWh from the household.")
    assert kept("The south roof at 35 degrees gives 1010 kWh per kWp.")
    assert kept("Built 1979–1990.")


def test_numbers_the_engine_did_not_give_are_caught_even_when_small():
    assert not kept("The extra 2 kWh adds very little.")  # 7 − 5: computed, not given
    assert not kept("It saves 20 EUR more.")  # 1130 − 1110
    assert not kept("Self-sufficiency rises by 2%.")
    assert not kept("Use 3 modules more.")
    assert not kept("A 6 kWh battery would fit.")  # not a catalog size here


def test_a_number_without_unit_must_be_exact():
    assert not kept("That leaves 3 options.")  # 3.3 MWh rounds to 3, but a bare 3 is not given
    assert kept("Compare the 17 and the 25 option.")
