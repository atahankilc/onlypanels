# Data findings

Measured 2026-11-07. Reproduce with `uv run python scripts/profile_data.py`. Interpretations marked *hypothesis* need a Reonic expert to confirm (see `docs/open-questions.md`).

## What this means for the build

1. **The inputs predict little.** A first gradient-boosting baseline barely beats always guessing the median. The big missing variable is probably roof capacity, which is not in the data. Our edge has to come from refinement, installer knowledge and honest measurement, not from a cleverer regressor.
2. **Treat expert designs as a range, not one answer.** The same home at the same installer often has options that differ. Score against that noise floor.
3. **Filter before training.** Roughly one project in six is a post-sale add-on, not a design.
4. **Heat pumps cannot be learned from this data.** Only 17 projects have one. Use physics and rules, and say so.
5. **The demo's EV moment cannot come from the EV flag.** Only 37 of 421 wallbox projects have `has_ev` set. It needs physics plus the EV-flagged subset.

## Traps that silently corrupt results

| # | Trap | Evidence | Handling |
|---|---|---|---|
| 1 | `inverter_power_kw` and `battery_capacity_kwh` are **swapped** | `inverter_power_kw` is non-null on exactly the `BatteryStorage` rows (1,488 and 292). "Battery LFP 10kWh" has 10000 there. "Hybrid Inverter 6kW" has 6000 in `battery_capacity_kwh` | Swap on load |
| 2 | Columns named kW, kWh or kWp hold **W or Wh** | `solar_size_kwp` 10000, `storage_size_kwh` 7000, `wb_charging_speed_kw` 22000, `heatpump_nominal_power_kw` 10000 | Convert on load. `heating_existing_electricity_demand_kwh` really is kWh |
| 3 | PV size is rarely explicit | `Module` rows exist in 4 of 1,637 options at `2a8ba8e2` and 65 of 357 at `23c108b7` | Reconstruct from proxies (dictionary). Sources: 1,379 count × assumed Wp, 193 package name, 69 exact, 353 none |
| 4 | `2a8ba8e2` module wattage is unknown | Only 4 rows give it (455 W and 475 W). kWp there is count × 0.45 | Use **module count** as the honest target for this installer |
| 5 | Add-ons look like designs | `-B--` options: 78% have an Extension battery, median 2 lines versus 13 for a PV plus battery option. Repeat customers show `PB--` then `--W-` or `-B--` | Exclude from training and scoring. Leaves 1,313 projects (987 + 326) and 1,627 options |
| 6 | Output-derived fields would leak | Roof type, scaffolding and meter lines exist only in parts | Never use parts-derived values as features |
| 7 | Repeat customers leak across folds | 42 customers, 85 projects | Group splits by `customer_contact_id` |
| 8 | Spec and name disagree | "Heat Pump 10.5kW" has 10000. "Aira 8kW" has 10140. "Sigenergy 25kW" inverter has 4049. "463W" modules have 450. "FoxESS 5kWh L2" has 9840 (*hypothesis:* whole stack) | Trust spec, list exceptions |
| 9 | Non-batteries in `BatteryStorage` | "AC Coupling Module (Free)", 40 rows, 1980 | Exclude |
| 10 | Outliers | 14 zero-demand projects; 21 below 1 MWh; 3 above 20 MWh; price of 0.32282 per Wh (likely per kWh); 2 prices near zero; a 108 kWh battery; a 222-module system | Filter from training, keep the rule visible |
| 11 | Defaults look like data | 32 ct/kWh on 58% of rows. H0 on 92%. `heating_demand = 3.5 × electricity_demand` on 161 of 174 rows | Do not read these as signal |

## Structural limits

- **Only won deals.** All 1,619 projects have `first_signed_at`. Win rate cannot be modelled, and business claims about it must be argued, not measured. We can measure offer-to-signature times (median 19 and 28 days).
- **Which option was delivered is unknown.** 300 of 1,593 projects have several options and nothing marks the winner. 33% of projects (531 of 1,593) have no option 1, so *hypothesis:* the export contains only signed options, or the options are filtered in some other way.
- **Key drivers are missing.** No roof area, orientation, shading, postcode, prices or budget. House size and inhabitants are 99.5% empty. So household size cannot stand in for an unknown use: only 6 dev projects have both (`scripts/profile_household.py`). The brief names budget as a driver, but it cannot be learned here.
- **Two installers, two styles.** Itemised against bundled, with different catalogs. A single global model hides this.
- **Thin slices.** Heat pumps in 17 projects. EV flag in 62. Existing solar in 18.

## What experts actually sell

Option shapes across both installers (P = PV, B = battery, W = wallbox, H = heat pump):

| Shape | Options | Reading |
|---|---|---|
| `PB--` | 1,076 | The default bundle |
| `PBW-` | 397 | Bundle plus wallbox |
| `-B--` | 207 | Mostly add-ons |
| `P---` | 137 | "No battery" is a real decision |
| `--W-` | 73 | Mostly add-ons |
| `----` | 30 | Fees or services only |
| `-BW-` | 22 | Mostly add-ons |
| `P-W-` | 21 | |
| `---H` | 21 | Heat pump alone |
| `PB-H` | 7 | |
| `PBWH` | 3 | |

Among new-system projects, 90% include a battery. Median size is 9.45 kWp and 10 kWh.

Heat pumps are never sold where one already exists (0 of 171). They sell on oil (5 of 8) and gas (8 of 18). Only 3 of the 17 have no recorded heating type.

**Heat pump sizing rule of thumb from the data:** median 2,480 heat kWh per kW across 27 options with a heat demand, so kW ≈ annual heat kWh / 2,500. Catalog steps are 5, 7, 10 and 12 kW.

**Catalog effect:** batteries cluster at 5, 7, 10, 14 and 15 kWh at `2a8ba8e2`, and 6, 9 and 18 kWh at `23c108b7`. Predicted sizes must snap to real products.

**Demand does shift size, gently.** At `2a8ba8e2`, median modules rise from 16 under 3 MWh to 22 at 6 to 8 MWh and 32 above 12 MWh.

## Baseline: signal check, not our result

Gradient boosting, 5 folds grouped by customer, new-system subset, last option per project. Inputs: demand, price, EV, existing solar, existing storage, heating, load profile, installer.

| Target | n | Model MAE | Always-median MAE | Comment |
|---|---|---|---|---|
| kWp, all | 1,309 | 2.64 | 2.95 | 48% within ±20% |
| kWp, `2a8ba8e2` | 983 | 2.52 | 2.70 | |
| kWp, `23c108b7` | 326 | 3.26 | 3.28 | No gain |
| Battery kWh | 1,180 | 2.95 | 2.98 | No gain from inputs alone |
| Battery kWh given true kWp | 1,180 | 2.63 | 2.98 | Helps only when PV is really known, see the dev scores below |
| kWp = k × demand | 1,309 | 3.82 | | Rule of thumb is worse than the constant |

| Decision | AUC | Base rate |
|---|---|---|
| Has battery | 0.717 | 90% |
| Has wallbox | 0.527 | 25%, effectively random from these inputs |

## Dev scores

From `uv run python scripts/evaluate.py`: 5-fold cross-validation grouped by customer, on the 1,041 dev projects. The 276 test projects are untouched. The design population is 1,317 projects: 1,313 with PV, plus heat-pump-only designs, minus commercial outliers.

| Predictor | kWp MAE | Battery MAE | Exact battery tier (closest option) |
|---|---|---|---|
| Median design | 2.89 | 2.88 | 36.8% |
| Rule of thumb | 3.72 | 3.53 | 23.5% |
| Nearest homes | 2.72 | 2.88 | 18.8% |
| Independent boosted models | 2.68 | 2.75 | 23.5% |
| Coupled, predicted PV feeds battery | 2.68 | 2.81 | 21.8% |
| Battery as catalog choice | 2.68 | 2.95 | 43.2% |
| Installer's most common battery | 2.89 | 2.82 | **44.7%** |
| **Planner fixes PV (true kWp)** | given | **2.43** | 27.9% |
| **Engine** (behind the UI: battery pulled to the installer's usual size within 2 kWh, no price input) | **2.63** | 2.73 | 38.7% |

What this shows:

- **Coupling does not help the first proposal.** Predicted PV comes from the same inputs, so it adds no information. This corrects our earlier reading of the baseline.
- **Coupling helps refinement.** Once a planner fixes PV, battery error falls 11%, from 2.75 to 2.43 kWh.
- **Our model does not beat the installer's habit on exact battery tier.** We report both tier match and size error. Taking the usual size when the learned answer is within 2 kWh raised the engine from 22.0% to 37.7% and lowered its battery error (D73). Removing the electricity price from the inputs then lowered both errors again and stopped the size from jumping when only the price changes (D82): the model had learned installers' default prices, not a price effect.
- **Our learned kWp range is no better than a fixed one yet:** 7.35 kWp wide against 7.20 at the same 74.5% coverage, which also falls short of the 80% target.
- **"No battery" is rarely found:** recall is 5% to 10%.
- **Heat pump rule:** finds 7 of 8 dev projects, but only 37% of its recommendations match a sold heat pump.

Sensible reaction checks on 192 unseen homes: adding a car never shrinks PV (100%) and grows it in 97.4%; never shrinks the battery (98.4%); a heat pump never shrinks PV (100%); more PV never shrinks the battery (100%); area limits hold (100%).

## "No battery" decisions

Forcing more "no battery" answers does not work: at 40% recall, only 23% of those answers are right (dev cross-validation). The inputs do not separate these homes well. Instead the engine keeps the battery by default, removes it when the home already has one, and flags an open decision below 80% confidence. On 192 unseen homes the flag covers 7.3%; 35.7% of flagged homes had no battery, against 8.4% of the others.

## Mounting sites

About 1,300 projects carry substructure lines and they are almost all rooftop: 1 facade line and no clear ground mount. "Garden Work" lines appear in about 19 projects but look like cable trenching (*hypothesis*). So garden, carport and facade behaviour in the engine is a stated assumption, not learned.

## Noise floor

237 new-system projects have several options for the same home. 33% differ in kWp, with a mean range of 2.94 kWp when they differ. 44% differ in battery size, with a mean range of 5.38 kWh when they differ.

So the installer's own options for one home can differ by about as much as the baseline's error. These are different statistics and only suggest a ceiling, but "our error is about the size of the spread between an expert's own options" is a claim worth testing properly.
