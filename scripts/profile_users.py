"""Behaviour evidence for docs/users.md. Aggregates only.

Run from the repo root:  uv run python scripts/profile_users.py
"""
import pandas as pd

from reonic_engine.data import INSTALLERS, build_options, load_raw


def days(a, b):
    return (b - a).dt.total_seconds() / 86400


def main():
    status, parts = load_raw()
    for c in ["request_created_at", "offer_created_at", "first_signed_at"]:
        status[c] = pd.to_datetime(status[c], format="mixed", errors="coerce")
    options = build_options(parts)
    n_opts = options.groupby("project_id").option_id.nunique()
    status = status.merge(n_opts.rename("n_options"), left_on="project_id", right_index=True, how="left")

    for i in INSTALLERS:
        s = status[status.installer == i]
        print(f"\n=== {i}: {len(s)} signed projects")
        o = s.offer_created_at.dropna()
        months = o.dt.to_period("M").value_counts().sort_index().iloc[1:-1]
        print("signed projects per month, median:", months.median(), "| max:", months.max())
        print("offers by hour, share 7-17h:", round(o.dt.hour.between(7, 16).mean(), 3),
              "| evening 17-23h:", round(o.dt.hour.between(17, 22).mean(), 3),
              "| weekend:", round((o.dt.day_of_week >= 5).mean(), 3))
        print("offer hour peak:", o.dt.hour.value_counts().head(4).to_dict())
        sign = days(s.offer_created_at, s.first_signed_at)
        sign = sign[sign >= 0]
        print("offer to signature days p25/50/75/90:", sign.quantile([.25, .5, .75, .9]).round(1).tolist())
        print("signed within 1 day:", round((sign <= 1).mean(), 3), "| within 7:", round((sign <= 7).mean(), 3),
              "| over 60:", round((sign > 60).mean(), 3))
        req = days(s.request_created_at, s.offer_created_at).dropna()
        req = req[req >= 0]
        print("request to offer n:", len(req), "days p25/50/75/90:", req.quantile([.25, .5, .75, .9]).round(1).tolist() if len(req) else None)
        print("same-day offers:", round((req < 1).mean(), 3) if len(req) else None)
        print("options per project:", s.n_options.value_counts().sort_index().head(5).to_dict(),
              "| multi share:", round((s.n_options > 1).mean(), 3))
        multi = sign[s.n_options.reindex(sign.index) > 1].median()
        single = sign[s.n_options.reindex(sign.index) == 1].median()
        print("median days to sign, one option:", round(single, 1), "| several:", round(multi, 1))

    print("\n=== Repeat customers")
    rep = status[status.customer_contact_id.duplicated(keep=False)].sort_values(["customer_contact_id", "offer_created_at"])
    gap = rep.groupby("customer_contact_id").offer_created_at.agg(lambda x: (x.max() - x.min()).days)
    print("customers:", rep.customer_contact_id.nunique(), "| gap days p25/50/75:", gap.quantile([.25, .5, .75]).tolist())

    print("\n=== Inputs a planner really fills (share non-empty or non-default)")
    print("non-default load profile:", round((status.load_profile != "H0").mean(), 3))
    print("custom price (not 32 ct):", round((status.energy_price_per_wh.round(5) != 0.00032).mean(), 3))
    print("demand on 500 kWh steps:", round(((status.energy_demand_wh % 5e5) == 0).mean(), 3))
    print("heating type known:", round(status.heating_existing_type.notna().mean(), 3))
    print("EV distance known:", round(status.ev_annual_drive_distance_km.notna().mean(), 3))
    print("house size known:", round(status.house_size_sqm.notna().mean(), 4))

    print("\n=== What gets added around the core system (share of options)")
    n = parts.component_name
    per = parts.option_id.nunique()
    for label, pat in [("emergency power / backup", "Emergency Power|Backup|Transfer Switch"),
                       ("energy manager / monitor", "Energy Manage|Home Energy Monitor|Energy Router"),
                       ("meter cabinet work", "Meter Cabinet|Meter Consolidation"),
                       ("insurance", "Insurance"), ("solar credit / financing", "Credit"),
                       ("scaffolding", "Scaffolding"), ("extra cable", "Additional (?:AC|DC) Cable|Extra Cable")]:
        print(f"{label}: {parts[n.str.contains(pat)].option_id.nunique() / per:.3f}")


if __name__ == "__main__":
    main()
