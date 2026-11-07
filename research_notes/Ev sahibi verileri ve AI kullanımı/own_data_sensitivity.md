# Which homeowner inputs actually change the proposed design: measurements on our own data

Measured 2026-11-07 on the dev split only: 1,041 design projects (788 at installer A = `2a8ba8e2`, 253 at installer B = `23c108b7`). The test split was dropped straight after loading and was never used. Everything below is an aggregate.

**How it was measured.** Each home was run through an engine that never trained on it (5 folds, grouped by customer, same as `cross_validate`). Sensitivity uses the real `Engine.design()`, fed the way the app feeds it (price default 32, EV default 15,000 km). 1,039 homes qualify; 2 have no valid demand. Accuracy uses the same path as `scripts/evaluate.py`.

**Check that the setup is right.** The unchanged engine reproduces the published dev scores in `docs/data/findings.md`: kWp error 2.653 (published 2.65), battery error 2.854 (2.85), exact battery tier 22.0% (22.0%) — [demand].

**How to reproduce.** From the repo root:

```bash
S=/private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad
OMP_NUM_THREADS=2 uv run python $S/sensitivity.py all   # or: profile | sens | demand | perm
OMP_NUM_THREADS=2 uv run python $S/extra.py $S
OMP_NUM_THREADS=4 uv run python $S/extra2.py $S
```

Seeds are fixed. The scratchpad is temporary, so the three scripts are copied in full at the end of this file. CLAUDE.md requires that numbers in `docs/` be reproducible from `scripts/`, so these scripts must move there before any number below goes into `docs/`.

**Sources.** Each link below points to a saved aggregate output of those scripts, or to engine code.

[profile]: /private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad/out_profile.txt
[sens]: /private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad/out_sens.txt
[demand]: /private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad/out_demand.txt
[perm]: /private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad/out_perm.txt
[extra]: /private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad/out_extra.txt
[extra2]: /private/tmp/claude-501/-Users-atahankilic-Documents-thinc-hack/53155cab-2f6e-4be4-9fed-93298074f3cc/scratchpad/out_extra2.txt
[design.py]: /Users/atahankilic/Documents/thinc-hack/engine/src/reonic_engine/design.py

## How complete and trustworthy is each input?

### Takeaway
Only three inputs carry real signal for size: demand, "already has a heat pump", and the installer. Roof area would probably matter most but is not in the data at all. Price is complete but tells us nothing about size, and the EV, solar and storage flags are too rarely set to learn from.

### Cited Findings

| Input | Filled | Looks like a default | Real signal? |
|---|---|---|---|
| `demand_mwh` | 99.8% valid | 97.2% are multiples of 100 kWh, 83.4% of 500, 47.2% of 1,000. 4,500 kWh alone is 16.3%, top 5 values 49.8% | **Yes, the strongest.** Rank correlation 0.35 with kWp, 0.29 with battery |
| `price_ct_kwh` | 100% | 52.2% at 32 ct (A 66.2%, B 8.3%). B has its own spike: 39 ct on 34.4% | **No for size.** Rank correlation -0.04 with kWp on the 497 PV homes not at 32 ct. Weak signal for battery yes or no only |
| Heating type | 15.0% (156 homes) | Blank means unknown, not "none". 136 of the 156 are Heatpump, then Gas 15, Oil 4, OtherRenewable 1 | **Yes for "has a heat pump"** (see below). Gas and oil are too few to learn from |
| Heat demand | 14.9% (155 homes) | 83.2% of filled rows are exactly 3.5 × heating electricity, and 94.9% of existing heat pump rows. Top value 20.6% of filled rows | **Weak.** Mostly a derived default, and only 19 gas or oil homes have it |
| `has_ev` | Always true or false; true on 47 (4.5%) | "False" cannot be trusted: 237 of 266 homes that bought a wallbox say False. `ev_km` is filled on all 47 | **Weak but right direction.** Flagged homes have +1.34 kWp (95% range +0.18 to +2.66; includes zero within each installer) |
| `has_solar` | Always true or false; true on 3 (0.3%) | False is the blank state | **None.** Too few to learn |
| `has_storage` | Always true or false; true on 5 (0.5%) | False is the blank state | **None learned.** Works only through a hard rule |
| Installer | 100% | Not applicable | **Yes**, strongest for battery yes or no (94% at A, 79% at B). Not a homeowner input |
| Area limit | 0%: no such column | Not applicable | **Unknown.** The engine's 2 m² per panel is a stated assumption |

All rows from [profile] and [extra]; area from `MOUNTS` in [design.py].

- House size and number of inhabitants exist on 5 of 1,041 homes each — [profile].
- Recorded demand appears to be household electricity only. Existing heat pump homes have lower recorded demand (median 3.75 against 4.5 MWh), and the heat pump's own electricity is at least as large as the recorded demand in 70.6% of them. Among EV homes, distance driven has no link to demand (rank correlation -0.02) — [extra].
- Existing heat pump homes buy more PV: 11.57 against 9.54 kWp (difference 95% range +1.31 to +2.83) and the gap holds at both installers — [extra].
- Homes at exactly 4,500 kWh differ from their neighbours: kWp spread 4.13 against 2.51 to 3.19 at 3,500, 4,000 and 5,000 kWh, and fewer existing heat pumps (8.3% against 13.9% to 25%) — [extra2].
- The existing-storage rule rests on 5 homes: experts still sold a battery in 2 of them, both at A; at B it was 0 of 3 — [extra], [profile].

### Inferences
- Only 2.8% of homes have a demand that is not a round hundred, so very few values look like exact meter readings. The "real" demand we score against is largely a rounded estimate already.
- 4,500 kWh looks like a catch-all value (hypothesis for Reonic to confirm): it is twice as common as its neighbours and its designs vary more.
- Both installers seem to have their own default price (32 at A, 39 at B). That would make price partly an installer label rather than a homeowner fact.
- An existing heat pump's electricity is probably not inside recorded demand, which would explain why those homes get more PV despite "lower demand". The engine captures this only through a yes or no flag.

### Gaps
- For the three flags, a false can mean "no" or "nobody asked". The data cannot separate the two.
- For gas and oil, the 3.5 check cannot be run: only 2 of the 19 homes have a heating electricity value. So we cannot say whether their heat demand is measured or default.

## How much does each input move the proposal?

### Takeaway
Roof area, heat pump status, EV and demand all move the size in the expected direction, by roughly 2 to 10 modules. Price moves almost as many homes but in a zig-zag with no accuracy behind it, and `has_solar` moves nothing at all. Apart from `has_storage`, no input really decides battery yes or no.

### Cited Findings

Starting point on 1,039 homes: median 21 modules (10th to 90th percentile 17 to 28), 9.45 kWp, battery in 98.1% of proposals against 90% for experts — [sens].

Mean change per home. "Changed" is the share of homes where the number differs at all. All rows from [sens].

| Change | Modules changed | Modules (mean) | A / B | kWp (mean) | Battery kWh changed | Mean battery change, kWh | Yes or no flips (A / B) |
|---|---|---|---|---|---|---|---|
| Demand × 0.5 | 86.1% | -3.9 | -3.6 / -4.9 | -1.75 (-16.7%) | 62.1% | 1.72 | 1.6% (0 / 6.7) |
| Demand × 0.75 | 80.6% | -2.1 | -2.0 / -2.5 | -0.94 (-9.1%) | 40.8% | 1.01 | 1.8% (0 / 7.5) |
| Demand × 1.25 | 78.3% | +1.9 | +1.8 / +1.9 | +0.83 (+8.5%) | 42.8% | 1.13 | 1.4% (0 / 5.5) |
| Demand × 1.5 | 94.3% | +3.4 | +3.4 / +3.4 | +1.55 (+15.8%) | 66.7% | 1.99 | 2.6% (0 / 10.7) |
| Demand × 2 | 97.3% | +6.7 | +6.6 / +7.0 | +2.99 (+31.1%) | 84.9% | 3.13 | 1.7% (0 / 7.1) |
| Price 32 → 25 ct | 87.3% | -2.0 | -1.9 / -2.3 | -0.90 | 39.3% | 0.81 | 0% |
| Price 32 → 28 ct | 93.5% | **+1.1** | +1.2 / +0.7 | +0.50 | 38.1% | 0.83 | 0% |
| Price 32 → 36 ct | 88.0% | **-0.8** | -0.8 / -1.0 | -0.38 | 29.7% | 0.65 | 0% |
| Price 32 → 40 ct | 79.8% | **+1.3** | +1.2 / +1.4 | +0.57 | 42.7% | 1.19 | 2.8% (0 / 11.5) |
| No heating → gas or oil, heat unknown | 20.0% | +0.5 | +0.5 / +0.5 | +0.22 | 5.4% | 0.17 | 1.0% (0 / 4.0) |
| No heating → existing heat pump | 98.9% | +5.9 | +5.3 / +7.8 | +2.67 (+29.4%) | 92.6% | 3.50 | 2.4% (0 / 9.9) |
| No heating → gas, 10,000 kWh heat | 98.0% | +4.8 | +4.7 / +5.1 | +2.15 (+23.5%) | 83.4% | 2.18 | 2.0% |
| No heating → gas, 15,000 kWh heat | 98.1% | +7.4 | +7.1 / +8.3 | +3.32 (+36.5%) | 92.5% | 3.20 | 1.6% |
| No heating → gas, 20,000 kWh heat | 98.1% | +9.3 | +9.0 / +10.2 | +4.18 (+46.7%) | 94.8% | 4.35 | 1.6% |
| No heating → gas, 30,000 kWh heat | 98.1% | +12.4 | +12.5 / +12.3 | +5.59 (+62.8%) | 96.2% | 6.40 | 1.6% |
| Gas → oil, same heat | 0% | 0 | 0 / 0 | 0 | 0% | 0 | 0% |
| EV off → 5,000 km | 70.8% | +1.4 | +1.4 / +1.5 | +0.63 (+6.7%) | 33.8% | 0.89 | 2.2% |
| EV off → 10,000 km | 93.7% | +2.7 | +2.7 / +3.0 | +1.23 (+13.2%) | 60.6% | 1.54 | 2.0% |
| EV off → 15,000 km | 96.8% | +4.1 | +3.9 / +4.5 | +1.83 (+19.6%) | 76.7% | 2.05 | 1.9% |
| EV off → 25,000 km | 97.8% | +6.9 | +6.6 / +8.0 | +3.12 (+33.5%) | 88.6% | 3.09 | 1.4% |
| `has_solar` off → on | 0% | 0 | 0 / 0 | 0 | 0% | 0 | 0% |
| `has_storage` off → on | 0% | 0 | 0 / 0 | 0 | 98.5% | 9.59 | 98.5% (100 / 93.7), all yes to no |
| Installer A → B | 95.8% | +2.9 | not applicable | +1.30 (+13.7%) | 92.8% | 1.95 | 1.7% |
| Area limit 24 m² (12 modules) | 100% | -10.2 | -9.6 / -12.0 | -4.58 (-43.7%) | 82.6% | 2.52 | 1.4% |
| Area limit 30 m² (15 modules) | 97.9% | -7.2 | -6.6 / -9.1 | -3.24 (-29.8%) | 54.5% | 1.54 | 1.4% |
| Area limit 40 m² (20 modules) | 55.6% | -2.9 | -2.4 / -4.4 | -1.29 (-10.4%) | 30.7% | 1.01 | 1.4% |
| Area limit 50 m² (25 modules) | 20.6% | -0.9 | -0.7 / -1.7 | -0.42 (-2.9%) | 3.3% | 0.13 | 0.1% |
| Area limit 60 m² (30 modules) | 6.4% | -0.3 | -0.1 / -0.6 | -0.12 (-0.7%) | 2.1% | 0.06 | 0% |
| Area limit 80 m² (40 modules) | 0.4% | 0 | 0 / 0 | 0 | 0% | 0 | 0% |

- Going from 25 to 40 ct adds 3.3 modules on average and changes the design in 94.4% of homes, yet the steps in between go down, up, down, up — [sens].
- Price also changes the estimated yearly saving: +€385 from 32 to 40 ct, and +€764 from 25 to 40 ct. These include the size change, so they are not pure price effects — [sens].
- The engine's response to demand matches experts on average: kWp rises about 0.32% per 1% of demand for both. Experts add 0.55 kWp per extra MWh, so one module takes about 0.8 MWh — [demand]. But demand alone explains only 17% of the variation in what experts sold (A 21%, B 12%) — [demand].
- A heat pump wish is not separate from heat demand: any gas or oil home with a known heat demand automatically gets a heat pump and its electricity is added to demand — `hp_wanted` in [design.py]. Without a heat demand it does not, which is why that row barely moves.
- **EV uplift, scored against experts for the first time.** The published scores skip this step. On the 47 EV homes, the engine without the uplift is 1.48 kWp too small, and with it 0.80 kWp too large. Error goes from 2.87 to 3.19 kWp, but that change could be chance (95% range -0.35 to +0.96) — [extra2].
- **Heat pump uplift, same check.** On the 19 gas or oil homes with a heat demand, kWp bias goes from -1.31 to +2.12 and battery error from 2.25 to 3.71 kWh. Experts sold a heat pump in only 7 of these 19 — [extra2].
- Across all homes, adding both uplifts changes nothing measurable: kWp error 2.653 to 2.669 — [extra2].

### Inferences
- **Price is noise in the sizing.** A rising tariff should not push PV down, up, down, up. The model has learned the clusters of default prices, not a price effect. Its accuracy result is in the permutation section below.
- **`has_solar` is a hole, not a neutral input.** A home with an existing large system gets the same new PV proposal as one with none. A warning or a simple rule is needed; the data cannot teach this.
- Roof area only matters once it is below the proposal: at 60 m² or more it rarely changes anything, and between 30 and 50 m² it is the dominant input.
- The EV uplift goes the right way but is about 1.5 times too strong for these 47 homes (it adds 2.28 kWp where the gap was 1.48). The sample is small, so treat this as a hint.
- The heat-demand uplift is the biggest mover in the table and the least tested. It assumes that every gas or oil home wants a heat pump, and 12 of the 19 did not buy one.

### Gaps
- Sensitivity shows what the engine does, not what is correct. Only demand, EV, heat pumps and price could be compared with experts here.
- `Engine.design()` is not currently served: `api/main.py` only has site routes. The numbers apply when the design step comes back from the `before-munich-focus` tag.
- Non-roof mounts and multi-surface placement were not tested, because the data has no such cases.

## What does estimating demand cost, instead of asking?

### Takeaway
Using one average for every home makes the PV proposal 6.8% worse (kWp error 2.65 to 2.83) and gives up about three quarters of the engine's edge over a fixed design. Five rough bands cost nothing measurable, so the homeowner needs to give a rough answer, not an exact one. An estimate only beats the flat average if its error stays below about 30%.

### Cited Findings

Scored against the expert's last option. Battery change is paired, on homes where both versions propose a battery. From [demand] and [extra2]; "Modules differ" is against the engine using real demand.

| Demand used | kWp error (A / B) | Change, 95% range | Within ±20% | Battery error | Change, 95% range | Modules differ |
|---|---|---|---|---|---|---|
| Real demand | 2.653 (2.571 / 2.909) | | 48.1% | 2.854 | | |
| 5 bands (2,500, 3,500, 4,500, 6,000, 8,500 kWh) | 2.654 (2.571 / 2.909) | 0.00 (-0.06 to +0.05) | 48.6% | 2.845 | -0.01 (-0.10 to +0.08) | 28.5% |
| Dev median for all (4,500 kWh) | 2.834 (2.728 / 3.165) | **+0.18 (+0.08 to +0.28)** | 45.5% | 2.913 | +0.12 (-0.01 to +0.24) | 65.9% |
| Engine trained without demand | 2.859 (2.755 / 3.178) | +0.21 (+0.10 to +0.31) | 45.9% | 3.018 | +0.17 (+0.03 to +0.30) | 88.5% |
| Fixed design, no inputs | 2.891 (2.749 / 3.328) | +0.24 (+0.13 to +0.35) | 46.3% | 2.884 | +0.04 (-0.11 to +0.17) | 87.8% |

- Both installers have the same median, 4,500 kWh, so a per-installer average gives identical results — [demand].
- Exact battery tier falls from 22.0% to 11.7% with the flat average (A 20.4% to 6.8%, B 28.4% to 33.5%) — [demand].

An imperfect estimate, simulated as real demand with a random error (mean of 5 seeds; sigma 0.3 means roughly two thirds of homes are within about ±30%). From [demand] and [extra2].

| Estimate error (sigma) | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 | 0.40 | Flat average |
|---|---|---|---|---|---|---|---|
| kWp error | 2.690 | 2.719 | 2.754 | 2.801 | 2.855 | 2.913 | 2.834 |

Who pays for the flat average, in kWp error — [demand]:

| Real demand, MWh | Homes | Real demand | Flat average | Cost |
|---|---|---|---|---|
| Up to 2.5 | 88 | 2.19 | 2.83 | +0.64 |
| 2.5 to 3.5 | 227 | 2.15 | 2.48 | +0.33 |
| 3.5 to 5 | 389 | 2.49 | 2.50 | +0.01 |
| 5 to 7 | 166 | 2.47 | 2.38 | -0.09 |
| 7 to 10 | 117 | 3.47 | 3.79 | +0.32 |
| Over 10 | 47 | 5.28 | 6.21 | +0.93 |

- For scale: on the 190 dev homes with several expert options, 34.7% differ in kWp, by 2.97 kWp on average when they differ. For battery, 43.2% differ, by 5.18 kWh — [demand].

### Inferences
- The engine's whole edge over a fixed design is 0.24 kWp, and demand supplies 0.18 of it (about 76%). So demand is the one homeowner answer worth asking, even though the absolute cost is small next to the 2.65 kWp error and the experts' own 2.97 kWp spread.
- A rough band is the cheapest good option: no measurable loss, and one tap instead of finding a bill. This assumes that homeowners pick the right band.
- The cost lands on the edges. Homes between 3.5 and 7 MWh lose nothing; very small and very large users lose the most. A good form can make sure these homes are caught, for example "much less or much more than average?".
- A bad estimate is worse than no estimate. Above about 30% error, the proposal jumps around without being right, and the flat average does better. Any Stromspiegel-style estimate needs to beat that, or it should not be shown as personal.
- Because recorded demand is itself mostly rounded, the "real demand" row is not a true meter baseline. The real value of exact meter data could be higher than measured here. We cannot tell from this data.

### Gaps
- A real Stromspiegel estimate from household size could not be tested: inhabitants and house size exist on only 5 homes. The flat average is its worst case, and the simulation shows the range, but its real error is unknown.
- Random error is an assumption. Real homeowner errors may be one-sided, for example everybody underestimating.
- Battery error is compared only where both versions propose a battery, so it says little about yes or no decisions.

## How wide is the real spread of annual demand?

### Takeaway
Half of all homes are more than 25% away from the median, and the top tenth uses about 3 times what the bottom tenth uses. One average describes few homes well.

### Cited Findings

Annual demand in kWh, valid values only — [profile]:

| | p1 | p5 | p10 | p25 | p50 | p75 | p90 | p95 | p99 | p90 / p10 |
|---|---|---|---|---|---|---|---|---|---|---|
| All | 1,770 | 2,500 | 2,860 | 3,500 | 4,500 | 6,000 | 8,280 | 10,000 | 15,310 | 2.90 |
| A | 1,600 | 2,500 | 2,700 | 3,500 | 4,500 | 6,000 | 8,500 | 10,000 | 16,120 | 3.15 |
| B | 1,800 | 2,500 | 3,000 | 3,300 | 4,500 | 5,500 | 8,000 | 10,860 | 13,960 | 2.67 |

- Share of homes within ±10% of the median: 19.4%; within ±25%: 50.2%; within ±50%: 76.9% — [profile].
- The spread in log terms is 0.45 (0.40 if extremes are ignored) — [extra2].

### Inferences
- This spread (about 0.40) is the same size as the error of the flat average, which is why the sigma 0.35 to 0.40 estimates above perform about as badly as using no answer.
- Values below 1 MWh were removed by `clean_status`, so the low end is trimmed. These homes bought a system, so the spread is not the German household population.

### Gaps
- Data covers won deals only, so it says nothing about homes that did not buy.

## Which inputs matter most by permutation?

### Takeaway
Shuffling demand hurts accuracy most, then heating type, then installer. Shuffling price moves proposals almost as much as shuffling installer but costs no accuracy, and removing it makes size slightly better, not worse. `has_solar` and `has_storage` have exactly zero importance in the learned model.

### Cited Findings

Engine end to end on held-out homes, 30 shuffles, each input shuffled within its installer (installer itself across all). Mean rise in error ± spread across shuffles. Base: kWp error 2.653; battery size error 2.846; battery yes or no AUC 0.667 — [perm].

| Input | kWp error rise (A / B) | Battery error rise (A / B) | AUC drop | Mean move kWp | Mean move kWh | Yes or no flips |
|---|---|---|---|---|---|---|
| Demand | **+0.523 ± 0.041** (0.481 / 0.653) | **+0.381 ± 0.050** (0.433 / 0.190) | 0.052 ± 0.023 | 1.79 | 1.75 | 2.2% |
| Heating type | +0.185 ± 0.025 (0.153 / 0.286) | +0.254 ± 0.036 (0.237 / 0.314) | 0.018 ± 0.010 | 0.61 | 0.73 | 0.4% |
| Installer | +0.094 ± 0.016 (0.095 / 0.093) | +0.064 ± 0.039 (0.113 / -0.119) | **0.097 ± 0.017** | 0.47 | 0.62 | 1.4% |
| Price | -0.012 ± 0.015 (-0.023 / +0.020) | -0.019 ± 0.027 (+0.007 / -0.114) | 0.040 ± 0.017 | 0.43 | 0.38 | 1.9% |
| `has_solar` | 0 | 0 | 0 | 0 | 0 | 0% |
| `has_storage` | 0 | 0 | 0 | 0 | 0 | 0% |

`has_storage` shows 0 here because this path is the learned model. Its only effect is the rule in `design()`.

Retraining without one input is stricter, because the model can lean on other inputs. Change in error with 95% range — [demand]:

| Removed | kWp error | Battery error |
|---|---|---|
| Demand | +0.205 (+0.103 to +0.307) | +0.168 (+0.034 to +0.298) |
| Existing heat pump flag | +0.066 (+0.014 to +0.117) | +0.191 (+0.092 to +0.290) |
| Installer | +0.053 (+0.023 to +0.082) | -0.022 (-0.101 to +0.054) |
| Gas or oil flag | 0.000 | 0.000 |
| Price | -0.028 (-0.060 to +0.002) | -0.053 (-0.114 to +0.007) |
| `has_solar`, `has_storage` | 0 | 0 |

Inputs the engine does not use, in a wider model with all 12 features (base kWp error 2.683, battery 2.850), rise in error or AUC drop — [perm]:

| Input | kWp | Battery | Battery yes or no AUC | Wallbox AUC |
|---|---|---|---|---|
| Heat demand | +0.064 ± 0.015 | +0.136 ± 0.022 | 0.005 ± 0.009 | 0.009 ± 0.008 |
| `ev_km` | +0.001 ± 0.004 | +0.011 ± 0.007 | 0.022 ± 0.010 | 0.047 ± 0.010 |
| `has_ev` | +0.016 ± 0.008 | 0.000 ± 0.001 | 0.001 ± 0.006 | 0.000 |
| Flexible tariff | -0.007 ± 0.005 | +0.034 ± 0.011 | 0.007 ± 0.004 | 0.004 ± 0.006 |
| Load profile H0 | +0.008 ± 0.006 | 0.000 ± 0.003 | 0.005 ± 0.004 | -0.003 ± 0.003 |

In this model heat demand takes over from the existing heat pump flag (-0.007 kWp, +0.021 battery), because the two are nearly the same homes — [perm], [profile].

Removing price, tested directly — [extra2]:

| Version | kWp error (A / B) | Battery error (A / B) | Battery AUC | "No battery" found |
|---|---|---|---|---|
| Engine now | 2.653 (2.571 / 2.909) | 2.854 (2.708 / 3.427) | 0.667 | 5.8% |
| Retrained without price | 2.625 (2.532 / 2.913) | 2.801 (2.666 / 3.314) | 0.627 | 2.9% |
| Price always 32 | 2.620 (2.537 / 2.877) | 2.803 (2.703 / 3.174) | not run | 1.0% |
| Without price, 5 demand bands | 2.630 (2.529 / 2.942) | 2.800 (2.690 / 3.223) | not run | 1.9% |

The kWp and battery gains are small and their 95% ranges just include zero, for example -0.028 (-0.060 to +0.002).

Upper limit for a roof input: a hypothetical limit set from what the expert sold. This uses the answer, so it is a ceiling, not a result — [demand]:

| Roof limit | kWp error (A / B) | Battery error |
|---|---|---|
| None (today) | 2.653 (2.571 / 2.909) | 2.854 |
| 1.5 × sold size | 2.364 (2.321 / 2.497) | 2.786 |
| 1.25 × sold size | 2.065 (2.023 / 2.194) | 2.747 |
| 1.0 × sold size | 1.337 (1.290 / 1.482) | 2.631 |

### Inferences
- A short form loses nothing on size: rough demand, "do you have a heat pump?" and the installer carry almost everything the model can use. Price can stay in the form for the savings estimate only.
- Removing price has one real cost: a weaker battery yes or no ranking (AUC 0.667 to 0.627). In practice the engine says yes on 98% of homes anyway, and this signal may just be recognising installers' default prices. Worth a team decision.
- Even at 1.5 × sold size, a roof limit would cut the error by 0.29 kWp, more than the 0.21 lost by removing demand altogether. This supports the existing idea that roof limits are the missing driver, assuming real roofs bear some relation to what was sold. That link is not measured.
- Installer decides battery yes or no more than any homeowner answer does.

### Gaps
- Heat demand, EV and flag results rest on small groups (155, 47, 3 and 5 homes), so small importances there do not prove that the input is useless.
- Permutation shows use by this model, not cause. Demand and heating type are related, so importance can move between them.
- Real roof area could not be tested. Whether a roof limit from the 3D site step would come close to these ceilings needs projects with both roof data and expert designs, which we do not have.

### Scripts used

Copied here because the scratchpad is temporary. They contain no data.

<details><summary>sensitivity.py</summary>

```python
"""Which homeowner inputs move the engine's proposal? Dev split only, aggregates only.
Run from the repo root:  OMP_NUM_THREADS=1 uv run python <this file> [profile|sens|demand|perm|all]
"""
import sys, time, warnings
import numpy as np, pandas as pd
from joblib import Parallel, delayed
from scipy.stats import spearmanr
from sklearn.ensemble import HistGradientBoostingClassifier as HC, HistGradientBoostingRegressor as HR
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
import reonic_engine.design as D
from reonic_engine.data import ASSUMED_KWP_PER_MODULE as KPM, INSTALLERS, battery_catalog, load_dataset
from reonic_engine.design import Engine, engine_predictor
from reonic_engine.evaluate import cross_validate, score
from reonic_engine.models import TREE, _frame, features, median_design

warnings.filterwarnings("ignore")
pd.set_option("display.width", 250, "display.max_columns", 40, "display.max_rows", 200)
A, B = INSTALLERS
FOLDS = 5


def load():
    projects, options = load_dataset()
    dev = projects[projects.split == "dev"].reset_index(drop=True)  # test rows dropped here, never used
    assert (dev.split == "dev").all()
    return dev, options[options.project_id.isin(dev.project_id)].reset_index(drop=True)


def folds(dev):
    return list(GroupKFold(FOLDS).split(dev, groups=dev.customer_contact_id))


def slices(d):
    return {"all": d, A: d[d.installer == A], B: d[d.installer == B]}


# ---------- 1. fill, defaults, signal ----------
def top_share(s, k=1):
    v = s.dropna().round(4).value_counts(normalize=True)
    return round(float(v.head(k).sum()), 3)


def profile(dev):
    print("\n=== PROFILE: dev design population ===")
    for name, d in slices(dev).items():
        n = len(d)
        dem, price = d.demand_mwh.dropna() * 1000, d.price_ct_kwh.dropna()
        heat = d.heat_mwh
        ratio = (d.heating_existing_heating_demand_wh / 1000) / d.heating_existing_electricity_demand_kwh
        ratio_d = d.heating_existing_electricity_demand_kwh / (d.demand_mwh * 1000)
        print(f"\n[{name}] n={n}")
        print(" demand valid", round(d.demand_mwh.notna().mean(), 3), "nunique", dem.round().nunique(),
              "top1", top_share(dem), "top5", top_share(dem, 5), "top10", top_share(dem, 10),
              "mult100", round((dem % 100 == 0).mean(), 3), "mult500", round((dem % 500 == 0).mean(), 3),
              "mult1000", round((dem % 1000 == 0).mean(), 3))
        print(" demand most common values kWh (share):", (dem.round().value_counts(normalize=True).head(6).round(3)).to_dict())
        print(" price valid", round(d.price_ct_kwh.notna().mean(), 3), "nunique", price.round(2).nunique(),
              "at32", round((price.round(2) == 32).mean(), 3), "top3", (price.round(2).value_counts(normalize=True).head(3).round(3)).to_dict(),
              "pcts 5/25/50/75/95", price.quantile([.05, .25, .5, .75, .95]).round(1).tolist())
        print(" heating type filled", round(d.heating_existing_type.notna().mean(), 3), d.heating_existing_type.value_counts().to_dict())
        print(" heat demand filled", round(heat.notna().mean(), 3), "nunique", heat.round(3).nunique(),
              "top1", top_share(heat), "top5", top_share(heat, 5), "n", int(heat.notna().sum()),
              "pcts 10/50/90 MWh", heat.quantile([.1, .5, .9]).round(1).tolist())
        print(" heat/elec ratio ==3.5 share of heat rows", round(((ratio - 3.5).abs() < .01).sum() / max(heat.notna().sum(), 1), 3),
              "| heat elec == household demand share", round(((ratio_d - 1).abs() < .01).sum() / max(heat.notna().sum(), 1), 3))
        print(" heat filled by type", d.groupby(d.heating_existing_type.fillna("none")).heat_mwh.agg(lambda s: int(s.notna().sum())).to_dict())
        fos = d[d.heating_existing_type.isin(D.FOSSIL)]
        print(" fossil rows", len(fos), "with heat", int(fos.heat_mwh.notna().sum()),
              "ratio 3.5 among fossil", int((((fos.heating_existing_heating_demand_wh / 1000) / fos.heating_existing_electricity_demand_kwh - 3.5).abs() < .01).sum()),
              "median heat MWh", round(float(fos.heat_mwh.median()), 1) if len(fos) else None)
        print(" has_ev", int(d.has_ev.sum()), round(d.has_ev.mean(), 3), "ev_km filled", int(d.ev_annual_drive_distance_km.notna().sum()),
              "km filled among has_ev", int(d[d.has_ev].ev_annual_drive_distance_km.notna().sum()),
              "km top", d.ev_annual_drive_distance_km.value_counts(normalize=True).head(3).round(3).to_dict())
        print(" sold wallbox", int(d.has_wallbox.sum()), "of which has_ev", int((d.has_wallbox & d.has_ev).sum()),
              "| has_ev with wallbox sold", int((d.has_ev & d.has_wallbox).sum()), "existing_wallbox", int(d.existing_wallbox.sum()))
        print(" has_solar", int(d.has_solar.sum()), "size filled", int(d.solar_size_kwp.notna().sum()),
              "| has_storage", int(d.has_storage.sum()), "size filled", int(d.storage_size_kwh.notna().sum()))
        print(" load H0", round(d.load_profile.eq("H0").mean(), 3), "flex tariff filled", round(d.energy_price_with_flexible_tariff.notna().mean(), 3),
              "| house size", int(d.house_size_sqm.notna().sum()), "inhabitants", int(d.num_inhabitants.notna().sum()))

    print("\n=== DEMAND SPREAD kWh, percentiles ===")
    qs = [.01, .05, .1, .25, .5, .75, .9, .95, .99]
    rows = {k: (v.demand_mwh.dropna() * 1000).quantile(qs).round(-1) for k, v in slices(dev).items()}
    t = pd.DataFrame(rows).T
    t.columns = [f"p{int(q*100)}" for q in qs]
    t["p90/p10"] = (t.p90 / t.p10).round(2)
    t["IQR/med"] = ((t.p75 - t.p25) / t.p50).round(2)
    print(t.to_string())
    for name, d in slices(dev).items():
        x = d.demand_mwh.dropna()
        m = x.median()
        print(name, "share within ±10/25/50% of median:", [round(float(((x / m - 1).abs() <= f).mean()), 3) for f in (.1, .25, .5)],
              "| global-median based:", [round(float(((x / dev.demand_mwh.median() - 1).abs() <= f).mean()), 3) for f in (.1, .25, .5)])

    print("\n=== SIGNAL vs expert ===")
    for name, d in slices(dev).items():
        pv, bt = d[d.has_pv], d[d.has_battery]
        print(f"[{name}] Spearman demand~kwp {spearmanr(pv.demand_mwh, pv.kwp, nan_policy='omit')[0]:.3f}  demand~batt {spearmanr(bt.demand_mwh, bt.battery_kwh, nan_policy='omit')[0]:.3f}"
              f"  kwp~batt {spearmanr(bt.kwp, bt.battery_kwh)[0]:.3f}")
        np32 = pv[pv.price_ct_kwh.round(2) != 32]
        if len(np32) > 20:
            print(f"   price~kwp, non-32 rows n={len(np32)}: {spearmanr(np32.price_ct_kwh, np32.kwp)[0]:.3f};",
                  f"price~batt {spearmanr(np32[np32.has_battery].price_ct_kwh, np32[np32.has_battery].battery_kwh)[0]:.3f}")
        groups = {"has_ev": d.has_ev, "has_solar": d.has_solar, "has_storage": d.has_storage,
                  "price=32": d.price_ct_kwh.round(2) == 32,
                  "fossil": d.heating_existing_type.isin(D.FOSSIL), "existing_hp": d.heating_existing_type.eq("Heatpump"),
                  "heating_known": d.heating_existing_type.notna(), "heat_known": d.heat_mwh.notna()}
        rows = []
        for g, m in groups.items():
            for flag, part in ((True, d[m]), (False, d[~m])):
                rows.append({"input": g, "value": flag, "n": len(part), "demand_med": part.demand_mwh.median(),
                             "kwp_med": part[part.has_pv].kwp.median(), "kwp_mean": part[part.has_pv].kwp.mean(),
                             "batt_rate": part.has_battery.mean(), "batt_med": part[part.has_battery].battery_kwh.median(),
                             "wallbox_rate": part.has_wallbox.mean(), "hp_sold": int(part.has_hp.sum())})
        print(pd.DataFrame(rows).round(2).to_string(index=False))
        bands = pd.cut(d.demand_mwh, [0, 3, 4, 5, 6, 8, 12, 99])
        print(d.groupby(bands, observed=True).agg(n=("kwp", "size"), kwp_med=("kwp", "median"), modules_med=("modules", "median"),
                                                  batt_rate=("has_battery", "mean")).round(2).to_string())


# ---------- 2. one-at-a-time sensitivity through Engine.design ----------
def to_input(r):
    return {"demand_kwh": r.demand_mwh * 1000, "price_ct_kwh": r.price_ct_kwh, "installer": r.installer,
            "heating": None if pd.isna(r.heating_existing_type) else r.heating_existing_type,
            "heat_kwh": None if pd.isna(r.heat_mwh) else r.heat_mwh * 1000,
            "has_solar": bool(r.has_solar), "has_storage": bool(r.has_storage), "ev": bool(r.has_ev),
            "ev_km": 15000 if pd.isna(r.ev_annual_drive_distance_km) else r.ev_annual_drive_distance_km}


def scen():
    """name -> change to apply to a home's recorded inputs."""
    s = {"recorded": lambda i: i}
    for f in (.5, .75, 1.25, 1.5, 2.0):
        s[f"demand x{f}"] = lambda i, f=f: {**i, "demand_kwh": i["demand_kwh"] * f}
    for p in (25, 28, 32, 36, 40):
        s[f"price {p}"] = lambda i, p=p: {**i, "price_ct_kwh": float(p)}
    for name, h, k in (("none", None, None), ("Gas no heat", "Gas", None), ("Oil no heat", "Oil", None), ("Heatpump", "Heatpump", None),
                       ("Gas 10000", "Gas", 10000), ("Gas 15000", "Gas", 15000), ("Gas 20000", "Gas", 20000),
                       ("Gas 30000", "Gas", 30000), ("Oil 20000", "Oil", 20000)):
        s[f"heat {name}"] = lambda i, h=h, k=k: {**i, "heating": h, "heat_kwh": k}
    s["ev off"] = lambda i: {**i, "ev": False}
    for km in (5000, 10000, 15000, 25000):
        s[f"ev {km}"] = lambda i, km=km: {**i, "ev": True, "ev_km": km}
    for c in ("has_solar", "has_storage"):
        s[f"{c} off"] = lambda i, c=c: {**i, c: False}
        s[f"{c} on"] = lambda i, c=c: {**i, c: True}
    s["installer A"] = lambda i: {**i, "installer": A}
    s["installer B"] = lambda i: {**i, "installer": B}
    for a in (24, 30, 40, 50, 60, 80):
        s[f"area {a}"] = lambda i, a=a: {**i, "area_m2": a}
    return s


def run_fold(dev, options, tr, te):
    train = dev.iloc[tr].reset_index(drop=True)
    e = Engine().fit(train, options[options.project_id.isin(train.project_id)])
    rows = []
    test = dev.iloc[te]
    test = test[test.demand_mwh.notna()]
    S = scen()
    for k, r in enumerate(test.itertuples()):
        base = to_input(r)
        for name, f in S.items():
            o = e.design(f(dict(base)))
            rows.append((k + 10000 * int(te[0]), r.installer, name, o["pv"]["modules"], o["pv"]["kwp"], o["battery"]["kwh"],
                         o["battery"]["probability"], o["battery"]["unsure"], o["pv"]["capped"],
                         o["energy"]["saving_eur"], o["energy"]["self_sufficiency_pct"], o["heatpump"]["included"]))
    return pd.DataFrame(rows, columns="h installer s modules kwp bat p unsure capped eur ss hp".split())


def compare(t, ref, name, sub=None):
    a = t[t.s == ref].set_index("h")
    b = t[t.s == name].set_index("h").reindex(a.index)
    if sub is not None:
        a, b = a[a.installer == sub], b[a.installer == sub]
    dm, dk, db = b.modules - a.modules, b.kwp - a.kwp, b.bat - a.bat
    yes_a, yes_b = a.bat > 0, b.bat > 0
    both = yes_a & yes_b
    return {"n": len(a), "mod_chg%": 100 * (dm != 0).mean(), "|dmod|": dm.abs().mean(), "dmod": dm.mean(), "dmod_p50": dm.median(),
            "dmod_p90abs": dm.abs().quantile(.9), "|dkWp|": dk.abs().mean(), "dkWp": dk.mean(), "dkWp%": 100 * (dk / a.kwp).mean(),
            "bat_chg%": 100 * (db != 0).mean(), "|dbat|": db.abs().mean(), "dbat": db.mean(),
            "bat_size_chg%": 100 * (db[both] != 0).mean() if both.any() else np.nan,
            "yes>no%": 100 * (yes_a & ~yes_b).mean(), "no>yes%": 100 * (~yes_a & yes_b).mean(), "|dp|": (b.p - a.p).abs().mean(),
            "deur": (b.eur - a.eur).mean(), "dss": (b.ss - a.ss).mean(), "capped%": 100 * b.capped.mean()}


def sens(dev, options):
    t0 = time.time()
    parts = Parallel(n_jobs=FOLDS)(delayed(run_fold)(dev, options, tr, te) for tr, te in folds(dev))
    t = pd.concat(parts, ignore_index=True)
    print("\n=== SENSITIVITY through Engine.design, out-of-fold ===  homes", t.h.nunique(), "seconds", round(time.time() - t0))
    base = t[t.s == "recorded"]
    print("base: median modules", base.modules.median(), "kWp", base.kwp.median(), "battery yes%", round(100 * (base.bat > 0).mean(), 1),
          "median bat|yes", base[base.bat > 0].bat.median(), "unsure%", round(100 * base.unsure.mean(), 1), "hp%", round(100 * base.hp.mean(), 1))
    print("distinct proposals: modules", base.modules.nunique(), "battery", base.bat.nunique(),
          "modules p10/50/90", base.modules.quantile([.1, .5, .9]).tolist(),
          "by installer battery share", base.groupby("installer").bat.value_counts(normalize=True).round(3).groupby(level=0).head(4).to_dict())
    pairs = [("recorded", f"demand x{f}") for f in (.5, .75, 1.25, 1.5, 2.0)]
    pairs += [("price 32", f"price {p}") for p in (25, 28, 36, 40)] + [("price 25", "price 40"), ("recorded", "price 32")]
    pairs += [("heat none", f"heat {h}") for h in ("Gas no heat", "Oil no heat", "Heatpump", "Gas 10000", "Gas 15000", "Gas 20000", "Gas 30000", "Oil 20000")]
    pairs += [("heat Gas 20000", "heat Oil 20000")]
    pairs += [("ev off", f"ev {k}") for k in (5000, 10000, 15000, 25000)]
    pairs += [("has_solar off", "has_solar on"), ("has_storage off", "has_storage on"), ("installer A", "installer B")]
    pairs += [("recorded", f"area {a}") for a in (24, 30, 40, 50, 60, 80)]
    for sub in (None, A, B):
        rows = {f"{r} -> {n}": compare(t, r, n, sub) for r, n in pairs}
        print(f"\n--- {sub or 'all'} ---")
        print(pd.DataFrame(rows).T.round(2).to_string())
    # Marginal: demand needed for one more module, and elasticity of the engine's kWp.
    a, b = t[t.s == "demand x0.75"].set_index("h"), t[t.s == "demand x1.25"].set_index("h")
    print("engine elasticity (dlnkWp/dlnDemand, x0.75 to x1.25): median", round(float((np.log(b.kwp / a.kwp) / np.log(1.25 / .75)).median()), 3),
          "mean", round(float((np.log(b.kwp / a.kwp) / np.log(1.25 / .75)).mean()), 3),
          {i: round(float((np.log(b.kwp / a.kwp) / np.log(1.25 / .75))[a.installer == i].mean()), 3) for i in INSTALLERS})


# ---------- 3. cost of estimating demand ----------
def replaced(fn):
    def predictor(train, test, catalog):
        return engine_predictor(train, test.assign(demand_mwh=fn(train, test)), catalog)
    return predictor


def global_median(tr, te):
    return tr.demand_mwh.median()


def installer_median(tr, te):
    return te.installer.map(tr.groupby("installer").demand_mwh.median()).values


def noise(sigma, seed):
    def fn(tr, te):
        v = te.demand_mwh.fillna(tr.demand_mwh.median()).values
        return v * np.exp(np.random.default_rng(seed + len(te)).normal(0, sigma, len(v)))
    return fn


def banded(tr, te):
    v = te.demand_mwh.fillna(tr.demand_mwh.median()).values
    edges = np.array([3, 4, 5, 7])
    mids = np.array([2.5, 3.5, 4.5, 6.0, 8.5])
    return mids[np.searchsorted(edges, v, side="right")]


def retrained_without(col):
    """Zero one engine column for fitting and predicting: the engine as if it never had this input."""
    def predictor(train, test, catalog):
        orig = D._x
        D._x = lambda d, demand=None: orig(d, demand).assign(**{col: 0})
        try:
            return engine_predictor(train, test, catalog)
        finally:
            D._x = orig
    return predictor


def roof_oracle(factor):
    """Hypothetical upper bound: a roof limit factor x what the expert sold. Not available in the data."""
    def predictor(train, test, catalog):
        e = Engine().fit(train, train)
        e.catalog = catalog
        kwp, bat, p = e.predict(test, max_modules=(test.kwp.values * factor / KPM))
        return _frame(test, kwp, p >= .5, bat, test.has_ev.astype(float).values)
    return predictor


def errs(pred, dev):
    m = dev.merge(pred, on="project_id", suffixes=("", "_p"))
    pv = m.has_pv
    bl = m.has_battery & m.has_battery_p
    return m, np.where(pv, (m.kwp - m.kwp_p).abs(), np.nan), np.where(bl, (m.battery_kwh - m.battery_kwh_p).abs(), np.nan)


def boot(m, ea, eb, n=2000, seed=0):
    """Paired difference in mean error, customers resampled."""
    g = pd.factorize(m.customer_contact_id)[0]
    ok = ~np.isnan(ea) & ~np.isnan(eb)
    d = np.bincount(g[ok], (eb - ea)[ok], g.max() + 1)
    c = np.bincount(g[ok], minlength=g.max() + 1).astype(float)
    r = np.random.default_rng(seed)
    w = r.multinomial(len(d), np.full(len(d), 1 / len(d)), n)
    s = (w @ d) / (w @ c)
    return round(float(d.sum() / c.sum()), 3), round(float(np.quantile(s, .025)), 3), round(float(np.quantile(s, .975)), 3)


def demand_cost(dev, options):
    print("\n=== COST OF ESTIMATING DEMAND (cross-validated, expert = last option unless noted) ===")
    base = cross_validate(engine_predictor, dev, options)
    keys = ["n", "kwp_mae_last", "kwp_mae_closest", "kwp_within20", "batt_mae_last", "batt_mae_closest", "batt_exact_closest", "no_batt_recall"]
    cases = {"engine, real demand": engine_predictor, "median design (no inputs at all)": median_design,
             "demand = dev median": replaced(global_median), "demand = installer median": replaced(installer_median),
             "demand 5 bands": replaced(banded), "retrained without demand": retrained_without("demand_mwh")}
    for sg in (.15, .25, .4):
        for sd in range(5):
            cases[f"noise s={sg} seed{sd}"] = replaced(noise(sg, sd))
    res, deltas = {}, {}
    m0, ek0, eb0 = errs(base, dev)
    for name, f in cases.items():
        p = cross_validate(f, dev, options)
        for sl, d in slices(dev).items():
            res[(name, sl)] = {k: score(p[p.project_id.isin(d.project_id)], d, options)[k] for k in keys}
        m, ek, eb = errs(p, dev)
        mv = base.merge(p, on="project_id", suffixes=("", "_n"))
        modchg = (np.round(mv.kwp / KPM) != np.round(mv.kwp_n / KPM)).mean()
        deltas[name] = {"dkWpMAE [CI]": boot(m, ek0, ek), "dBatMAE [CI]": boot(m, eb0, eb), "modules differ%": round(100 * modchg, 1),
                        "mean|dkWp| vs real": round(float((mv.kwp - mv.kwp_n).abs().mean()), 2),
                        "bat differs%": round(100 * float((mv.battery_kwh != mv.battery_kwh_n).mean()), 1)}
    r = pd.DataFrame(res).T
    r.index.names = ["case", "slice"]
    avg = r.copy()
    avg = avg.reset_index()
    avg["case"] = avg.case.str.replace(r" seed\d", "", regex=True)
    print(avg.groupby(["case", "slice"], sort=False).mean().round(3).to_string())
    dd = pd.DataFrame(deltas).T
    print(dd.to_string())

    # Who pays: error by distance from the median.
    p = cross_validate(replaced(global_median), dev, options)
    m, ek, eb = errs(p, dev)
    med = dev.demand_mwh.median()
    band = pd.cut(dev.set_index("project_id").loc[m0.project_id].demand_mwh.values, [0, 2.5, 3.5, 5, 7, 10, 99])
    q = pd.DataFrame({"band": band, "real_kwp": ek0, "median_kwp": ek, "real_bat": eb0, "median_bat": eb})
    print(q.groupby("band", observed=True).agg(n=("real_kwp", "count"), real_kwp=("real_kwp", "mean"), median_kwp=("median_kwp", "mean"),
                                               real_bat=("real_bat", "mean"), median_bat=("median_bat", "mean")).round(2).to_string())

    # Is the difference above the experts' own disagreement? same-home spread among multi-option projects.
    o = options[options.has_pv].groupby("project_id").agg(n=("kwp", "size"), rng=("kwp", lambda s: s.max() - s.min()), brng=("battery_kwh", lambda s: s.max() - s.min()))
    o = o[o.n > 1]
    print("multi-option dev homes", len(o), "differ kWp%", round(100 * (o.rng > 0).mean(), 1), "mean range when differ", round(o.rng[o.rng > 0].mean(), 2),
          "mean range all", round(o.rng.mean(), 2), "| battery differ%", round(100 * (o.brng > 0).mean(), 1), "mean range when differ", round(o.brng[o.brng > 0].mean(), 2))

    print("\n=== Expert vs engine response to demand ===")
    mm = dev.merge(base, on="project_id", suffixes=("", "_p"))
    mm = mm[mm.has_pv & mm.demand_mwh.notna()]
    for name, d in slices(mm).items():
        ex = np.polyfit(np.log(d.demand_mwh), np.log(d.kwp), 1)[0]
        en = np.polyfit(np.log(d.demand_mwh), np.log(d.kwp_p), 1)[0]
        lin = np.polyfit(d.demand_mwh, d.kwp, 1)
        ss = 1 - ((d.kwp - np.polyval(lin, d.demand_mwh)) ** 2).sum() / ((d.kwp - d.kwp.mean()) ** 2).sum()
        print(name, "elasticity expert", round(ex, 3), "engine", round(en, 3), "| expert kWp per extra MWh", round(lin[0], 2), "| R2 demand alone", round(ss, 3))
    print(mm.groupby([mm.installer, pd.cut(mm.demand_mwh, [0, 3, 4, 5, 6, 8, 12, 99])], observed=True).agg(
        n=("kwp", "size"), expert_med=("kwp", "median"), engine_med=("kwp_p", "median")).round(2).to_string())

    print("\n=== Retrain without one input (drop-column), and hypothetical roof limit ===")
    rows = {}
    ref = {sl: score(base[base.project_id.isin(d.project_id)], d, options) for sl, d in slices(dev).items()}
    for col in D.COLS:
        p = cross_validate(retrained_without(col), dev, options)
        m, ek, eb = errs(p, dev)
        row = {"dKwp [CI]": boot(m, ek0, ek), "dBat [CI]": boot(m, eb0, eb)}
        for sl, d in slices(dev).items():
            row[f"dKwp {sl}"] = round(score(p[p.project_id.isin(d.project_id)], d, options)["kwp_mae_last"] - ref[sl]["kwp_mae_last"], 3)
            row[f"dBat {sl}"] = round(score(p[p.project_id.isin(d.project_id)], d, options)["batt_mae_last"] - ref[sl]["batt_mae_last"], 3)
        rows[col] = row
    print(pd.DataFrame(rows).T.to_string())
    for fct in (1.0, 1.25, 1.5):
        p = cross_validate(roof_oracle(fct), dev, options)
        print("roof limit =", fct, "x sold kWp:", {sl: {k: round(score(p[p.project_id.isin(d.project_id)], d, options)[k], 3) for k in ("kwp_mae_last", "kwp_within20", "batt_mae_last")} for sl, d in slices(dev).items()})


# ---------- 4. permutation importance ----------
PERM = {"demand_mwh": ["demand_mwh"], "price_ct_kwh": ["price_ct_kwh"], "heating type": ["heating_existing_type"],
        "has_solar": ["has_solar"], "has_storage": ["has_storage"], "installer": ["installer"]}
REPEATS = 30


def shuffled(d, cols, r, within=True):
    x = d.copy()
    if within:
        for _, idx in d.groupby("installer").indices.items():
            pos = r.permutation(idx)
            for c in cols:
                x.iloc[idx, x.columns.get_loc(c)] = d[c].values[pos]
    else:
        pos = r.permutation(len(d))
        for c in cols:
            x[c] = d[c].values[pos]
    return x


def metrics(te, kwp, bat, p):
    out = {}
    for sl, m in {"all": np.ones(len(te), bool), A: (te.installer == A).values, B: (te.installer == B).values}.items():
        pv, b = m & te.has_pv.values, m & te.has_battery.values
        out[sl] = (np.abs(kwp[pv] - te.kwp.values[pv]).sum(), pv.sum(), np.abs(bat[b] - te.battery_kwh.values[b]).sum(), b.sum())
    return out


def perm_engine(dev, options):
    print("\n=== PERMUTATION, end-to-end through Engine.predict, held-out folds, shuffled within installer (installer: across all) ===")
    acc = {k: {sl: np.zeros((REPEATS, 4)) for sl in ("all", A, B)} for k in PERM}
    base = {sl: np.zeros(4) for sl in ("all", A, B)}
    move = {k: np.zeros((REPEATS, 4)) for k in PERM}
    allp, ally = {k: [[] for _ in range(REPEATS)] for k in PERM}, []
    basep = []
    for tr, te in folds(dev):
        train, test = dev.iloc[tr].reset_index(drop=True), dev.iloc[te].reset_index(drop=True)
        e = Engine().fit(train, options[options.project_id.isin(train.project_id)])
        k0, b0, p0 = e.predict(test)
        for sl, v in metrics(test, k0, b0, p0).items():
            base[sl] += v
        basep.append(p0); ally.append(test.has_battery.values)
        for name, cols in PERM.items():
            for rep in range(REPEATS):
                r = np.random.default_rng(rep * 100 + te[0] % 97)
                x = shuffled(test, cols, r, within=name != "installer")
                k1, b1, p1 = e.predict(x)
                # Keep the true installer's targets; x only changes inputs.
                for sl, v in metrics(test, k1, b1, p1).items():
                    acc[name][sl][rep] += v
                move[name][rep] += (np.abs(k1 - k0).sum(), np.abs(b1 - b0).sum(), ((p1 >= .5) != (p0 >= .5)).sum(), len(test))
                allp[name][rep].append(p1)
    y = np.concatenate(ally)
    auc0 = roc_auc_score(y, np.concatenate(basep))
    print("base kWp MAE", {s: round(v[0] / v[1], 3) for s, v in base.items()}, "battery size err on expert-yes homes", {s: round(v[2] / v[3], 3) for s, v in base.items()}, "battery AUC", round(auc0, 3))
    rows = {}
    for name in PERM:
        row = {}
        for sl in ("all", A, B):
            a = acc[name][sl]
            dk = a[:, 0] / a[:, 1] - base[sl][0] / base[sl][1]
            db = a[:, 2] / a[:, 3] - base[sl][2] / base[sl][3]
            row[f"dKwpMAE {sl}"] = f"{dk.mean():.3f}±{dk.std():.3f}"
            row[f"dBatMAE {sl}"] = f"{db.mean():.3f}±{db.std():.3f}"
        aucs = np.array([roc_auc_score(y, np.concatenate(allp[name][rep])) for rep in range(REPEATS)])
        row["dAUC"] = f"{(auc0 - aucs).mean():.3f}±{aucs.std():.3f}"
        mv = move[name].mean(axis=0)
        row["moves kWp"], row["moves bat"], row["yes/no flip%"] = round(mv[0] / mv[3], 2), round(mv[1] / mv[3], 2), round(100 * mv[2] / mv[3], 1)
        rows[name] = row
    print(pd.DataFrame(rows).T.to_string())


def perm_wide(dev):
    print("\n=== PERMUTATION, wider model with inputs the engine ignores (all 12 model features, plain boosted, held-out folds) ===")
    X = features(dev)
    targets = {"kWp MAE": ("r", dev.kwp.values, dev.has_pv.values), "Battery MAE": ("r", dev.battery_kwh.values, dev.has_battery.values),
               "Has battery AUC": ("c", dev.has_battery.values, np.ones(len(dev), bool)), "Wallbox AUC": ("c", dev.has_wallbox.values, np.ones(len(dev), bool))}
    out = {}
    for tname, (kind, y, mask) in targets.items():
        deltas = {c: np.zeros(REPEATS) for c in X}
        pred0 = np.full(len(dev), np.nan)
        permp = {c: np.full((REPEATS, len(dev)), np.nan) for c in X}
        for tr, te in folds(dev):
            trm = tr[mask[tr]]
            m = (HR(**TREE) if kind == "r" else HC(**TREE)).fit(X.iloc[trm], y[trm])
            f = m.predict if kind == "r" else (lambda z: m.predict_proba(z)[:, 1])
            pred0[te] = f(X.iloc[te])
            for c in X:
                for rep in range(REPEATS):
                    r = np.random.default_rng(rep * 100 + te[0] % 97)
                    xt = X.iloc[te].copy()
                    inst = xt["installer"].values
                    if c == "installer":
                        xt[c] = r.permutation(xt[c].values)
                    else:
                        for v in (0, 1):
                            idx = np.where(inst == v)[0]
                            xt.iloc[idx, xt.columns.get_loc(c)] = xt[c].values[r.permutation(idx)]
                    permp[c][rep, te] = f(xt)
        k = mask
        for c in X:
            if kind == "r":
                base = np.abs(pred0[k] - y[k]).mean()
                d = np.abs(permp[c][:, k] - y[k]).mean(axis=1) - base
            else:
                base = roc_auc_score(y, pred0)
                d = base - np.array([roc_auc_score(y, permp[c][rep]) for rep in range(REPEATS)])
            out.setdefault(c, {})[f"{tname} (base {base:.3f})"] = f"{d.mean():.3f}±{d.std():.3f}"
    print(pd.DataFrame(out).T.to_string())


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    dev, options = load()
    print("dev homes", len(dev), dev.installer.value_counts().to_dict(), "| options", len(options))
    if what in ("profile", "all"):
        profile(dev)
    if what in ("sens", "all"):
        sens(dev, options)
    if what in ("demand", "all"):
        demand_cost(dev, options)
    if what in ("perm", "all"):
        perm_engine(dev, options)
        perm_wide(dev)
```

</details>

<details><summary>extra.py</summary>

```python
import sys; sys.path.insert(0, "%s" % sys.argv[1])
import numpy as np, pandas as pd
from scipy.stats import spearmanr
from sensitivity import load, slices
dev, options = load()
h = dev[dev.heating_existing_type.eq("Heatpump")]
e = h.heating_existing_electricity_demand_kwh
print("existing HP homes", len(h), "| HP electricity filled", int(e.notna().sum()), "| median HP kWh", e.median(), "| p10/p90", e.quantile([.1,.9]).tolist())
print("ratio HP elec/recorded demand p10/50/90", (e/(h.demand_mwh*1000)).quantile([.1,.5,.9]).round(2).tolist(), "| equal share", round(float((((e/(h.demand_mwh*1000))-1).abs()<.01).mean()),3),
      "| demand>HP elec share", round(float((h.demand_mwh*1000>e).mean()),3))
print("ratio heat/elec ==3.5 among HP", round(float((((h.heating_existing_heating_demand_wh/1000)/e-3.5).abs()<.01).mean()),3))
print("house-only median", (h.demand_mwh).median(), "| others", dev[~dev.heating_existing_type.eq('Heatpump')].demand_mwh.median())
hp=h[h.has_pv&h.demand_mwh.notna()&e.notna()]
print("Spearman kWp~recorded", round(spearmanr(hp.demand_mwh,hp.kwp)[0],3), "| kWp~recorded+HP", round(spearmanr(hp.demand_mwh+hp.heating_existing_electricity_demand_kwh/1000,hp.kwp)[0],3), "n",len(hp))
for n,d in slices(dev).items():
    a=d[d.heating_existing_type.eq("Heatpump")];b=d[~d.heating_existing_type.eq("Heatpump")]
    print(n,"mean kWp HP",round(a.kwp.mean(),2),"others",round(b.kwp.mean(),2),"bootstrap diff CI",np.quantile([a.kwp.sample(frac=1,replace=True,random_state=s).mean()-b.kwp.sample(frac=1,replace=True,random_state=s).mean() for s in range(1000)],[.025,.975]).round(2).tolist())
    a=d[d.has_ev];b=d[~d.has_ev]
    print(n,"mean kWp EV",round(a.kwp.mean(),2),"others",round(b.kwp.mean(),2),"CI",np.quantile([a.kwp.sample(frac=1,replace=True,random_state=s).mean()-b.kwp.sample(frac=1,replace=True,random_state=s).mean() for s in range(1000)],[.025,.975]).round(2).tolist())
    # wallbox as a proxy for an EV the flag missed
    a=d[d.has_wallbox];b=d[~d.has_wallbox]
    print(n,"wallbox sold: mean kWp",round(a.kwp.mean(),2),"none",round(b.kwp.mean(),2),"| median demand",a.demand_mwh.median(),b.demand_mwh.median(),"| n",len(a),len(b))
s=dev[dev.has_storage]; print("has_storage homes",len(s),"expert sold battery",int(s.has_battery.sum()),"| has_solar homes",int(dev.has_solar.sum()),"sold PV",int(dev[dev.has_solar].has_pv.sum()))
f=dev[dev.heating_existing_type.isin(["Gas","Oil"])]; print("gas/oil homes",len(f),"HP sold",int(f.has_hp.sum()),"| HP sold anywhere",int(dev.has_hp.sum()),"| no heating type and HP sold",int(dev[dev.heating_existing_type.isna()].has_hp.sum()))
print("heat rows: elec filled",int(dev.heating_existing_electricity_demand_kwh.notna().sum()),"| fossil elec filled",int(f.heating_existing_electricity_demand_kwh.notna().sum()))
print("has_ev or existing wallbox etc: demand median EV",dev[dev.has_ev].demand_mwh.median(),"Spearman km~demand",round(spearmanr(dev[dev.has_ev].ev_annual_drive_distance_km,dev[dev.has_ev].demand_mwh,nan_policy='omit')[0],3))
```

</details>

<details><summary>extra2.py</summary>

```python
import sys; sys.path.insert(0, sys.argv[1])
import numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score
import reonic_engine.design as D
from reonic_engine.design import Engine, engine_predictor, EV_KWH_PER_KM, HEAT_PUMP_COP
from reonic_engine.evaluate import cross_validate, score
from reonic_engine.models import _frame
from sensitivity import *
dev, options = load()

print("=== demand spread in log terms, and the 4500 value ===")
for n, d in slices(dev).items():
    x = np.log(d.demand_mwh.dropna())
    print(n, "sd of ln(demand)", round(float(x.std()), 3), "robust (IQR/1.349)", round(float((x.quantile(.75) - x.quantile(.25)) / 1.349), 3))
for v in (3.5, 4.0, 4.5, 5.0):
    g = dev[(dev.demand_mwh - v).abs() < 1e-6]
    print("demand", v, "n", len(g), "kWp median", g.kwp.median(), "sd", round(g.kwp.std(), 2), "battery yes", round(g.has_battery.mean(), 3), "existing HP share", round(g.heating_existing_type.eq("Heatpump").mean(), 3))
print("share of homes not on a multiple of 100 kWh", round(float(((dev.demand_mwh.dropna() * 1000).round() % 100 != 0).mean()), 3))

print("\n=== noise break-even, 5 seeds ===")
base = cross_validate(engine_predictor, dev, options)
m0, ek0, eb0 = errs(base, dev)
flat = errs(cross_validate(replaced(global_median), dev, options), dev)
print("real", round(np.nanmean(ek0), 3), "flat median", round(np.nanmean(flat[1]), 3))
for sg in (.2, .3, .35):
    v = [np.nanmean(errs(cross_validate(replaced(noise(sg, s)), dev, options), dev)[1]) for s in range(5)]
    print("sigma", sg, "kWp MAE mean", round(float(np.mean(v)), 3), "seed range", round(min(v), 3), round(max(v), 3))

print("\n=== EV and heat pump uplift, scored against experts for the first time ===")
def added(t):
    ev = np.where(t.has_ev, t.ev_annual_drive_distance_km.fillna(15000) * EV_KWH_PER_KM / 1000, 0.0)
    want = t.heating_existing_type.isin(D.FOSSIL) & t.heat_mwh.notna()
    hp = np.where(want, t.heat_mwh.fillna(0) / HEAT_PUMP_COP, 0.0)
    return ev, hp
def with_added(train, test, catalog):
    e = Engine().fit(train, train); e.catalog = catalog
    ev, hp = added(test)
    k, b, p = e.predict(test, added_mwh=ev + hp)
    return _frame(test, k, p >= .5, b, test.has_ev.astype(float).values)
up = cross_validate(with_added, dev, options)
m1, ek1, eb1 = errs(up, dev)
ev_m = m0.has_ev.values
hp_m = (m0.heating_existing_type.isin(D.FOSSIL) & m0.heat_mwh.notna()).values
print("all homes kWp MAE no uplift", round(np.nanmean(ek0), 3), "with", round(np.nanmean(ek1), 3), "battery", round(np.nanmean(eb0), 3), round(np.nanmean(eb1), 3))
for name, mask in (("EV flagged", ev_m), ("gas/oil with heat demand", hp_m)):
    for lab, mm, ek, eb in (("no uplift", m0, ek0, eb0), ("with uplift", m1, ek1, eb1)):
        print(name, lab, "n", int(mask.sum()), "kWp MAE", round(float(np.nanmean(ek[mask])), 2), "mean signed (engine-expert)", round(float((mm.kwp_p - mm.kwp)[mask & mm.has_pv.values].mean()), 2),
              "battery MAE", round(float(np.nanmean(eb[mask])), 2), "battery signed", round(float((mm.battery_kwh_p - mm.battery_kwh)[mask & mm.has_battery.values & mm.has_battery_p.values].mean()), 2))
print("gas/oil homes: expert sold HP", int(m0[hp_m].has_hp.sum()), "of", int(hp_m.sum()), "| kWp signed, HP sold only (with uplift)", round(float((m1.kwp_p - m1.kwp)[hp_m & m1.has_hp.values & m1.has_pv.values].mean()), 2),
      "n", int((hp_m & m1.has_hp.values & m1.has_pv.values).sum()), "| not sold", round(float((m1.kwp_p - m1.kwp)[hp_m & ~m1.has_hp.values & m1.has_pv.values].mean()), 2), "n", int((hp_m & ~m1.has_hp.values & m1.has_pv.values).sum()))
ci = boot(m0[ev_m], ek0[ev_m], ek1[ev_m]); print("EV delta kWp MAE [CI]", ci)

print("\n=== shorter form: what if price leaves the sizing? ===")
def no_price_bands(train, test, catalog):
    return retrained_without("price_ct_kwh")(train, test.assign(demand_mwh=banded(train, test)), catalog)
def price32(train, test, catalog):
    return engine_predictor(train, test.assign(price_ct_kwh=32.0), catalog)
def proba(fn):
    ps, ys = [], []
    for tr, te in folds(dev):
        train, test = dev.iloc[tr].reset_index(drop=True), dev.iloc[te].reset_index(drop=True)
        orig = D._x
        if fn == "noprice":
            D._x = lambda d, demand=None: orig(d, demand).assign(price_ct_kwh=0)
        e = Engine().fit(train, train)
        ps.append(e.predict(test)[2]); ys.append(test.has_battery.values); D._x = orig
    return round(roc_auc_score(np.concatenate(ys), np.concatenate(ps)), 3)
print("battery AUC with price", proba("x"), "without", proba("noprice"))
keys = ["kwp_mae_last", "kwp_within20", "batt_mae_last", "batt_exact_closest", "no_batt_recall"]
for name, f in {"engine": engine_predictor, "price fixed at 32 when asked": price32, "retrained without price": retrained_without("price_ct_kwh"), "without price + 5 demand bands": no_price_bands}.items():
    p = cross_validate(f, dev, options)
    m, ek, eb = errs(p, dev)
    print(name, {sl: {k: round(float(score(p[p.project_id.isin(d.project_id)], d, options)[k]), 3) for k in keys} for sl, d in slices(dev).items()}, "dKwp", boot(m, ek0, ek), "dBat", boot(m, eb0, eb))
```

</details>


<details><summary>extra3.py (added by the report step: table-style estimate and battery limits)</summary>

Run: `OMP_NUM_THREADS=4 uv run python $S/extra3.py $S`. Output, aggregates only:

```text
real 2.653 battery 2.854
flat 2.834 battery 2.913
table s 0.25 bias 1 kWp err 2.718 seed range 2.678 2.734 battery err 2.836
table s 0.3 bias 1 kWp err 2.745 seed range 2.737 2.751 battery err 2.846
table s 0.35 bias 1 kWp err 2.775 seed range 2.769 2.785 battery err 2.879
table s 0.4 bias 1 kWp err 2.809 seed range 2.802 2.818 battery err 2.909
table s 0.35 bias 0.85 kWp err 2.772 seed range 2.745 2.805 battery err 2.904

=== battery against the HTW and consumer guide limits (nominal sold size, no usable-size data) ===
all expert n 937 median kWh 10.0 above HTW limit 0.709 above 1 kWh per MWh 0.9 | engine n 1022 median kWh 9.2 above HTW limit 0.806
2a8ba8e2 expert n 738 median kWh 10.0 above HTW limit 0.688 above 1 kWh per MWh 0.89 | engine n 786 median kWh 9.2 above HTW limit 0.781
23c108b7 expert n 199 median kWh 9.0 above HTW limit 0.784 above 1 kWh per MWh 0.935 | engine n 236 median kWh 10.0 above HTW limit 0.89
```

```python
"""Table-style demand estimate versus random error. Dev split only, aggregates only.
Run from the repo root: OMP_NUM_THREADS=4 uv run python <this file> <scratchpad>
A table estimate is a group average: smoother than the truth. Random error is the truth plus noise: wilder than the truth.
"""
import sys; sys.path.insert(0, sys.argv[1])
import numpy as np, pandas as pd
from sensitivity import *
dev, options = load()

def table(s, seed, bias=1.0):
    def fn(tr, te):
        lt = np.log(tr.demand_mwh.dropna()); m, sd = lt.mean(), lt.std()
        x = np.log(te.demand_mwh.fillna(tr.demand_mwh.median()).values)
        r2 = 1 - s**2 / sd**2
        r = np.random.default_rng(seed + len(te))
        return bias * np.exp(m + r2 * (x - m) + r.normal(0, np.sqrt(r2 * (1 - r2)) * sd, len(x)))
    return fn

base = cross_validate(engine_predictor, dev, options)
m0, ek0, eb0 = errs(base, dev)
print("real", round(np.nanmean(ek0), 3), "battery", round(np.nanmean(eb0), 3))
flat = errs(cross_validate(replaced(global_median), dev, options), dev)
print("flat", round(np.nanmean(flat[1]), 3), "battery", round(np.nanmean(flat[2]), 3))
for s, bias in ((.25, 1), (.30, 1), (.35, 1), (.40, 1), (.35, .85)):
    k, b, res = [], [], []
    for seed in range(5):
        p = cross_validate(replaced(table(s, seed, bias)), dev, options)
        m, ek, eb = errs(p, dev)
        k.append(np.nanmean(ek)); b.append(np.nanmean(eb))
    print("table s", s, "bias", bias, "kWp err", round(float(np.mean(k)), 3), "seed range", round(min(k), 3), round(max(k), 3), "battery err", round(float(np.mean(b)), 3))

print("\n=== battery against the HTW and consumer guide limits (nominal sold size, no usable-size data) ===")
mm = dev.merge(base, on="project_id", suffixes=("", "_p"))
for name, d in slices(mm).items():
    e = d[d.has_battery & d.demand_mwh.notna() & d.has_pv]
    cap = np.minimum(1.5 * e.kwp, 1.5 * e.demand_mwh)
    g = d[d.has_battery_p & d.demand_mwh.notna()]
    capg = np.minimum(1.5 * g.kwp_p, 1.5 * g.demand_mwh)
    print(name, "expert n", len(e), "median kWh", e.battery_kwh.median(), "above HTW limit", round(float((e.battery_kwh > cap).mean()), 3), "above 1 kWh per MWh", round(float((e.battery_kwh > e.demand_mwh).mean()), 3),
          "| engine n", len(g), "median kWh", g.battery_kwh_p.median(), "above HTW limit", round(float((g.battery_kwh_p > capg).mean()), 3))
```

</details>
