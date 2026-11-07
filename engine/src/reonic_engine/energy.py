"""Hourly energy estimate for one reference year. Shapes are simple stated assumptions,
not measured profiles and not learned from the data."""
import numpy as np

FEED_IN_CT_KWH = 7.5  # assumed; check the current tariff before quoting it
BATTERY_USABLE = 0.9
ROUND_TRIP = 0.9
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
EV = _year(EV_DAY, MONTH_DAYS)
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


SOLAR = _solar()


def simulate(house_kwh, ev_kwh, heat_kwh, production_kwh, battery_kwh, price_ct):
    load = (house_kwh * HOUSE + ev_kwh * EV + heat_kwh * HEAT).tolist()
    solar = (production_kwh * SOLAR).tolist()
    capacity = battery_kwh * BATTERY_USABLE
    charge, direct, from_battery = capacity / 2, 0.0, 0.0
    for need, sun in zip(load, solar):
        used = min(need, sun)
        direct += used
        need -= used
        spare = sun - used
        if spare > 0:
            charge = min(capacity, charge + spare * ROUND_TRIP)
        elif need > 0:
            out = min(need, charge)
            charge -= out
            from_battery += out
    total = sum(load)
    own = direct + from_battery
    exported = max(production_kwh - direct - from_battery / ROUND_TRIP, 0.0)
    return {
        "self_sufficiency_pct": round(own / total * 100) if total else 0,
        "self_use_pct": round(own / production_kwh * 100) if production_kwh else 0,
        "saving_eur": round((own * price_ct + exported * FEED_IN_CT_KWH) / 100 / 10) * 10,
    }
