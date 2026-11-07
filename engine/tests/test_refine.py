import pytest

from reonic_engine.refine import Change, refine, rules, to_patches


@pytest.fixture(autouse=True)
def no_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


@pytest.mark.parametrize("text", [
    "Aile gelecek yıl elektrikli araba alıyor",
    "The family is buying an electric car next year",
    "Die Familie kauft nächstes Jahr ein Elektroauto",
])
def test_brief_example_in_three_languages(text):
    assert rules(text).ev is True


def test_car_with_distance():
    c = rules("Araba alıyorlar, yılda 20 bin km gidiyorlar")
    assert c.ev is True and c.ev_km == 20000


def test_negations():
    assert rules("Isı pompası istemiyor").heatpump is False
    assert rules("Batarya olmasın").no_battery is True
    assert rules("ohne Speicher").no_battery is True


def test_battery_size_is_not_read_as_demand():
    c = rules("10 kWh batarya istiyor")
    assert c.battery_kwh == 10 and c.demand_kwh is None


def test_demand():
    assert rules("Yıllık tüketim 6500 kWh").demand_kwh == 6500


def test_panels_that_fit_become_an_area_limit_not_a_lock():
    r = refine("Çatıya 16 panel sığıyor")
    assert r["inputs"] == {"mount": "roof", "area_m2": 32} and r["overrides"] == {}


def test_exact_panels_lock_the_design():
    assert refine("20 panel olsun")["overrides"] == {"modules": 20}


def test_garden_area():
    assert refine("Bahçede 60 m2 yer var")["inputs"] == {"mount": "ground", "area_m2": 60}


def test_mixed_sentence():
    r = refine("Araba alacaklar ama batarya istemiyorlar")
    assert r["inputs"]["ev"] is True and r["overrides"]["battery_kwh"] == 0


def test_nonsense_is_reported_not_guessed():
    r = refine("Hava bugün çok güzel")
    assert r["understood"] == [] and r["inputs"] == {} and r["overrides"] == {}


def test_patches_ignore_an_unknown_mount():
    assert to_patches(Change(mount="moon"))[0] == {}


def test_claude_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr("reonic_engine.refine.claude", lambda text: 1 / 0)
    r = refine("Araba alıyorlar")
    assert r["source"] == "rules" and r["inputs"]["ev"] is True
