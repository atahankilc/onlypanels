"""Hourly energy estimate. Sun comes hour by hour from real weather years (PVGIS, Munich), so cloudy runs and
sunny runs both happen and a battery's size matters. Household, car and heat shapes are simple stated assumptions,
not measured profiles and not learned from the data."""
import json
import time
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np

HOURLY = "https://re.jrc.ec.europa.eu/api/v5_3/seriescalc"
HOURLY_CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "pvgis-hourly"  # weather shapes only, no project data
WEATHER_AT = (48.14, 11.58)  # the app covers Munich, so one place's weather years stand for every home
YEARS = (2018, 2019, 2020)
AGENT = "energy-design-desk-demo"

FEED_IN_CT_KWH = 7.7  # EEG, systems up to 10 kWp commissioned 1 Aug to 31 Dec 2026 (Bundesnetzagentur); open after 2026
BATTERY_USABLE = 0.9
ROUND_TRIP = 0.9
WAY = ROUND_TRIP ** 0.5  # lost on the way in and again on the way out
C_RATE = 0.5  # a home battery moves at most half its capacity in an hour
STANDBY_KWH = 0.025  # the battery system's own use, every hour it holds charge
# Hour steps hide minute peaks that miss the sun, so own use comes out high. Measured against HTW Berlin calculator values
# for 6,000 kWh and 10 kWp (35, 62, 70, 74% with 0, 6, 9, 12 kWh usable) the hourly model was 4 to 5 points over;
# this factor removes that. scripts/check_energy.py repeats the comparison.
SUB_HOUR = 0.93
MONTH_SHARE = [3, 5, 9, 12, 14, 14, 14, 12, 9, 5, 2, 2]  # typical German PV yield by month, %
MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
HOUSE_DAY = [.5, .4, .4, .4, .4, .5, .9, 1.2, 1.1, .9, .9, 1, 1.2, 1, .9, .9, 1.1, 1.5, 1.9, 1.9, 1.6, 1.2, .9, .6]
EV_DAY = [.5, .3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1.5, 1, 1]


def _year(day_shape, month_weight):
    day = np.array(day_shape, float) / sum(day_shape)
    days = np.repeat(np.array(month_weight, float) / np.array(MONTH_DAYS), MONTH_DAYS)
    year = (days[:, None] * day[None, :]).ravel()
    return year / year.sum()


SEASON = [1.2, 1.15, 1.05, 1, .9, .85, .85, .85, .95, 1, 1.1, 1.2]
HOUSE = _year(HOUSE_DAY, [s * d for s, d in zip(SEASON, MONTH_DAYS)])
# Who is home in the day on weekdays moves use towards or away from the sun. Assumed weekday shapes, not measured; weekends keep
# the standard day, so each is mixed 5 to 2 with it. Same yearly total, only the hours differ. Unanswered: the standard day.
HOUSE_DAY_HOME = [.5, .4, .4, .4, .4, .5, .9, 1.2, 1.3, 1.3, 1.3, 1.4, 1.5, 1.3, 1.2, 1.2, 1.3, 1.6, 1.9, 1.8, 1.5, 1.1, .8, .6]  # home office, retired
HOUSE_DAY_AWAY = [.5, .4, .4, .4, .4, .6, 1.1, 1.3, .7, .5, .5, .5, .5, .5, .5, .6, .9, 1.6, 2.1, 2.1, 1.8, 1.3, .9, .6]  # everyone out at work or school


def _week(weekday):
    day, base = np.array(weekday) / sum(weekday), np.array(HOUSE_DAY) / sum(HOUSE_DAY)
    return (5 * day + 2 * base).tolist()


HOUSES = {None: HOUSE, "most": _year(_week(HOUSE_DAY_HOME), [s * d for s, d in zip(SEASON, MONTH_DAYS)]),
          "rarely": _year(_week(HOUSE_DAY_AWAY), [s * d for s, d in zip(SEASON, MONTH_DAYS)])}
EV = _year(EV_DAY, MONTH_DAYS)
# A car that stands at home in the day charges while the sun shines. Assumed shape, not measured.
EV_SUN_DAY = [0, 0, 0, 0, 0, 0, 0, 0, .3, .8, 1.3, 1.6, 1.7, 1.6, 1.3, .8, .4, .2, .1, 0, 0, 0, 0, 0]
EV_SUN = _year(EV_SUN_DAY, MONTH_DAYS)
HEAT = _year([1] * 24, [20, 17, 14, 8, 3, 1, 0.5, 0.5, 2, 7, 12, 17])


def _solar():
    hours = np.arange(24)
    out = []
    for share, days, month in zip(MONTH_SHARE, MONTH_DAYS, range(12)):
        half = 4 + 4.5 * np.sin(np.pi * month / 11)  # longer days in summer
        day = np.clip(np.cos((hours + 0.5 - 13) / half * np.pi / 2), 0, None)
        out.append(np.tile(day / day.sum() * share / days, days))
    year = np.concatenate(out)
    return year / year.sum()


SOLAR = _solar()  # fallback when real weather is not reachable: the same clear-ish day all month, so it flatters batteries


def _fetch(tilt, azimuth):
    """Output of 1 kWp, hour by hour, for each weather year. Azimuth as on the compass, 180 is south."""
    params = urllib.parse.urlencode({"lat": WEATHER_AT[0], "lon": WEATHER_AT[1], "pvcalculation": 1, "peakpower": 1, "loss": 14,
                                     "angle": tilt, "aspect": azimuth % 360 - 180, "startyear": YEARS[0], "endyear": YEARS[-1],
                                     "outputformat": "json"})
    request = urllib.request.Request(f"{HOURLY}?{params}", headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        hours = json.load(response)["outputs"]["hourly"]
    years = []
    for y in YEARS:
        row = np.array([h["P"] for h in hours if h["time"].startswith(str(y))], float)
        if len(row) == 8784:  # leap year: drop 29 February so every year lines up with the household shapes
            row = np.delete(row, np.s_[59 * 24:60 * 24])
        row = np.roll(row, 1)  # PVGIS gives UTC; the household shapes are in local standard time
        years.append(row / row.sum())
    return np.vstack(years)


@lru_cache(maxsize=64)
def weather(tilt=35, azimuth=180):
    """Hourly sun shape for one orientation over the weather years, each year summing to one. None when unreachable."""
    tilt, azimuth = int(round(min(max(tilt, 0), 90) / 10) * 10), int(round(azimuth / 30) * 30) % 360
    found = HOURLY_CACHE / f"{tilt}_{azimuth}.npy"
    if found.exists():
        return np.load(found)
    for wait in (0, 1.0):
        time.sleep(wait)
        try:
            shape = _fetch(tilt, azimuth)
        except (OSError, KeyError, ValueError):
            continue
        HOURLY_CACHE.mkdir(parents=True, exist_ok=True)
        np.save(found, shape.astype(np.float32))
        return shape
    return None


def sun_shape(surfaces=None, placed=None):
    """The roof's hourly sun: each surface's shape weighted by what its modules make there."""
    if surfaces and placed and sum(placed):
        parts = [(n * (s.get("kwh_per_kwp") or 950), weather(s.get("tilt") or 35, s.get("azimuth") if s.get("azimuth") is not None else 180))
                 for n, s in zip(placed, surfaces) if n]
        if all(shape is not None for _, shape in parts):
            total = sum(w for w, _ in parts)
            return sum(w * shape for w, shape in parts) / total
    return weather()


def simulate(house_kwh, ev_kwh, heat_kwh, production_kwh, battery_kwh, price_ct, sun=None, ev_day=False, home_day=None):
    """One estimate, averaged over the weather years. sun: hourly shapes from sun_shape(); the fallback is the clear-ish model.
    home_day: "most" or "rarely" when someone is home in the day on weekdays; anything else keeps the standard day."""
    years = sun if sun is not None else weather()
    house = HOUSES.get(home_day, HOUSE)
    if years is None:
        return _year(house_kwh, ev_kwh, heat_kwh, production_kwh, battery_kwh, price_ct, SOLAR, ev_day, house)
    runs = [_year(house_kwh, ev_kwh, heat_kwh, production_kwh, battery_kwh, price_ct, y, ev_day, house) for y in np.atleast_2d(years)]
    return {"self_sufficiency_pct": round(np.mean([r["self_sufficiency_pct"] for r in runs])),
            "self_use_pct": round(np.mean([r["self_use_pct"] for r in runs])),
            "saving_eur": int(round(np.mean([r["saving_eur"] for r in runs]) / 10) * 10),
            **{k: round(float(np.mean([r[k] for r in runs]))) for k in ("load_kwh", "own_kwh", "export_kwh")}}


def _year(house_kwh, ev_kwh, heat_kwh, production_kwh, battery_kwh, price_ct, shape, ev_day=False, house=HOUSE):
    load = (house_kwh * house + ev_kwh * (EV_SUN if ev_day else EV) + heat_kwh * HEAT).tolist()
    solar = (production_kwh * shape).tolist()
    capacity = battery_kwh * BATTERY_USABLE
    rate = battery_kwh * C_RATE
    charge, direct, from_battery, exported = capacity / 2, 0.0, 0.0, 0.0
    for need, sun in zip(load, solar):
        used = min(need, sun)
        direct += used
        need -= used
        spare = sun - used
        if spare > 0 and capacity:
            stored = min(spare, rate, (capacity - charge) / WAY)
            charge += stored * WAY
            exported += spare - stored
        elif spare > 0:
            exported += spare
        if need > 0 and charge > 0:
            out = min(need, rate, charge * WAY)
            charge -= out / WAY
            from_battery += out
        charge = max(0.0, charge - STANDBY_KWH) if charge > 0 else 0.0
    total = sum(load)
    own = (direct + from_battery) * SUB_HOUR
    exported += (direct + from_battery) * (1 - SUB_HOUR)  # what the peaks missed went to the grid instead
    return {
        "self_sufficiency_pct": round(own / total * 100) if total else 0,
        "self_use_pct": round(own / production_kwh * 100) if production_kwh else 0,
        "saving_eur": round((own * price_ct + exported * FEED_IN_CT_KWH) / 100 / 10) * 10,
        # The kWh behind the shares, for the money view (costs.py): what the home uses, covers itself and sells.
        "load_kwh": round(total), "own_kwh": round(own), "export_kwh": round(exported),
    }
