# Assumptions and defaults

Every fixed value the system uses in place of a real answer or measurement, where it comes from, and when it applies.
**Rule:** a value from the customer always wins. A default stands in only for an answer that is missing, and the planner sees it marked as assumed.
Where the source column says *our assumption*, nobody has checked the number against a source yet. Those are the first to check.

Code locations: engine `engine/src/reonic_engine/` (design.py, energy.py, models.py, data.py), API `api/main.py`, screens `web/src/` (api.ts, plan.ts, Review.tsx, panels.ts).

## Stand-ins for missing homeowner answers

| Value | Used for | Applies when | Source | Where |
|---|---|---|---|---|
| 4,000 kWh a year | Household electricity use | No use, range, payment or household size given | Our assumption, a typical German single-family home (D64) | `api/main.py` TYPICAL_USE_KWH |
| 32.4 ct/kWh | Electricity price: saving, monthly payment → kWh | No price given | SWM M-Strom basic supply in Munich, with VAT, since 1 Feb 2026 ([stromvermittlung.de](https://www.stromvermittlung.de/meldungen/muenchen-senkt-strompreise-ab-februar-2026-grundpreis-steigt-dennoch)) | `web/src/api.ts` PRICE_CT |
| 150 € a year | Fixed part of the bill, taken off before a monthly payment becomes kWh | Only a monthly payment given | SWM basic supply fixed price, quoted at 149.70 € and 161.60 € a year (same source); we use the lower | `design.py` BASE_FEE_EUR_YEAR |
| 2,500 / 3,500 / 4,500 / 6,000 / 8,500 kWh | The middle of each range the homeowner can pick | A range is picked | Our assumption: middle of each band, 8,500 for "over 7,000" | `questions.ts` BANDS |
| Middle of from–to | Use from the homeowner's own range; the edges go to the engine as `use_range`, and a closed band's edges too | Own range given | Arithmetic | `questions.ts` clean, `plan.ts` rangeOf |
| 2,000 / 2,700 / 3,500 / 3,800 / 4,500 kWh | Use by household size, 1 to 5+ | Last resort: no use and no range | Stromspiegel 2025, single-family house, from secondary sources; 1 person is our own guess | `questions.ts` BY_PEOPLE |
| 11,300 km a year per car | Car driving | Car, but no km and no kWh | Our assumption, said to be the German average per car; source not recorded, check (D64) | `questions.ts` TYPICAL_KM |
| 15 MWh a year | Heat use, which sizes a heat pump | Heat pump wanted, and no gas or oil figure, no energy certificate, no house facts | Our assumption (D64) | `design.py` (`heat_mwh or 15.0`) |

## The house

| Value | Used for | Applies when | Source | Where |
|---|---|---|---|---|
| Footprint × floors × 0.8 | Living area hint and stand-in | No living area given | Our assumption. Footprint from the measured roofs, full floors = eave height ÷ 3 m, half a floor more under a pitched roof (more than 2 m from eave to ridge), 0.8 for walls and stairs | `api.ts` modelM2 |
| 180 / 140 / 120 / 90 / 60 kWh per m² a year | Heat use by build period: before 1979, 1979–1990, 1991–2000, 2001–2010, 2011 or later (the 2022 census classes) | No gas or oil figure and no energy certificate | Our assumption, in the range of typical German values by insulation standard; check | `design.py` HEAT_KWH_PER_M2 |
| Most common build period nearby | Build period in the heat estimate | Customer gives no build period | Zensus 2022, 100 m grid, buildings by build year, summed over 300 m (700 m if fewer than 5 buildings). © Statistisches Bundesamt (Destatis), 2024, dl-de/by-2-0. `scripts/build_zensus.py` | `zensus.py`, `design.py` area_built |
| Most common heating nearby | "Common here" hint on the heating question; not used by the engine | Always shown as a hint | Zensus 2022, 100 m grid, residential buildings by heating energy, same area and licence | `zensus.py` |
| ±20%, calm within ±5%; below 75% of a typical yield the system shrinks, to half at 50% | Module count moved by the roof's yield against a typical 950 kWh per kWp: weaker roofs get more modules for the same power, stronger roofs fewer; a poor roof gets fewer and a warning | Measured roof surfaces, or a roof shared as direction and slope | Our assumption (D112): experts size by need and, in our data, never by roof, since the projects hold no roof | `design.py` SUN_SCALE, SUN_CALM, POOR_ROOF, POOR_FLOOR |
| PVGIS yield at Munich for the shared direction and slope, no shade | Yield of a roof the homeowner shared only as rounded numbers | Home not shared, roof numbers sent | PVGIS 5.3 (EU JRC), 14% losses, middle point of `web/public/sun-table.json` | `sun.py` typical_yield |
| 250 m² | Above this the 3D model's area is not used for the heat estimate (likely more than one home); the planner is warned | Living area is the model's estimate | Our assumption | `design.py` MODEL_M2_MAX |
| Energy certificate kWh per m² × area | Heat use | Certificate value given, no gas or oil figure | The customer's certificate | `design.py` |
| 10 kWh per litre | Heating oil → heat | Oil given in litres | Common conversion for heating oil (about 10 kWh per litre) | `questions.ts` KWH_PER_LITRE_OIL |
| Pool 1,500, sauna 1,000, air conditioning 600, electric water heater 2,000 kWh a year | Added to the household use | Ticked, and the yearly use is not from the bill | Our assumption; check | `design.py` BIG_USERS_KWH |

## Car

| Value | Used for | Applies when | Source | Where |
|---|---|---|---|---|
| 0.18 kWh per km | Car electricity from km | No kWh a month given | Our assumption, a common EV consumption figure | `design.py` EV_KWH_PER_KM |
| 90% / 50% / 20% | Share of driving charged at home: mostly home, half, mostly elsewhere | Answered | Our assumption | `design.py` HOME_SHARE |
| 100% at home | Share charged at home | Not answered | Behaviour before the question existed | `design.py` |
| 75% | Share of the car's use that sizes the solar | Car | Calibrated to experts: homes with a wallbox get about 1 kWp more (`scripts/profile_hp_ev.py`) | `design.py` EV_SIZING |
| Evening shape, or daytime shape | When the car charges in the hourly check | Daytime only when the car is often home in the day | Our assumption, both shapes | `energy.py` EV_DAY, EV_SUN_DAY |
| Household day shape by who is home on weekdays | Own-power share and saving in the hourly check, and the battery size comparison | "Mostly": more use from 8 to 17 h; "Rarely": less midday use, more in the evening; weekdays mixed 5 to 2 with the standard day. "Sometimes" or unanswered keeps the standard day. At 4,500 kWh and 9.5 MWh made, no battery: 39% standard, 42% mostly, 32% rarely. A battery narrows it | Our assumption, both shapes | `energy.py` HOUSE_DAY_HOME, HOUSE_DAY_AWAY |

## Systems already there

| Value | Used for | Applies when | Source | Where |
|---|---|---|---|---|
| 0.2 kWp per m² | Size of an existing solar system from its marked area | Solar there, no size given | Our assumption, typical module power per m² | `design.py` KWP_PER_M2 |
| 0.5% a year | Output an existing system loses with age | Year given; not applied when unknown | Our assumption, a common degradation figure | `design.py` AGEING |
| 20 years | Fixed feed-in tariff ends, so storing its power matters more (planner note) | Year given | EEG: the feed-in tariff is paid for 20 years | `design.py` FEED_IN_YEARS |
| Roof told in words, without the map | Roof area and slope for a request without a home | Homeowner answered on the roof page instead of picking the home | Size: small 80, detached 110, large 160 m², the quartiles of measured roof area of 128,365 Munich buildings 3 to 12 m high with 50 to 400 m² footprint (`scripts/roof_size_bands.py`). Slope: gentle 25°, steep 45°, not sure 35°, our assumption. A size given without a direction counts the direction as not known (typical yield); a direction given without a size keeps its yield with no roof limit | `share.ts` toldRoof |
| Half of a pitched roof's area | The area limit for a roof known only by numbers: the total counts every side, but the design puts it all on the main side | Told or rounded roof numbers, pitched (a flat roof keeps its whole area) | Our assumption: a gable roof's two sides are about equal | `plan.ts` MAIN_SIDE_SHARE |
| Spans per typed number (price 5–80 ct, use 100–100,000 kWh, payment 20–1,000 € a month, battery 1–100 kWh, living area 20–1,000 m², solar year 1990 to this year, …) | A typed number outside its span is left out, as if not given, and the field says so | Always | Our assumption: plausibility bounds for a single-family home | `questions.ts` SPAN, clean |
| Yearly sun per surface in the page | Sun on each roof and wall | Always, since D102 | PVGIS 5.3 (EU JRC), 14% losses, on a 3 × 3 grid over the region, tilt in 5° and azimuth in 10° steps, interpolated. Against exact PVGIS answers for 43 surfaces of 6 test homes: 1.6% off on average, 5.4% at worst (`scripts/check_sun_table.py`). `scripts/build_sun_table.py` | `site.worker.ts` yearly |
| Marked area: measured sun | Yield of the existing system | Area marked | Measured: PVGIS sun and the 3D model's shade on those cells | `plan.ts` existingArea |
| Half covered | A surface counts as taken for the planner, who works per surface | Existing panels drawn | Our assumption | `api.ts` installedKeys |
| Heat pump use on its own meter | Added to the need; the model stops counting "has a heat pump" | Its kWh given | Common in Germany (separate heat pump tariff); not checked per home | `design.py` own_hp |

## The customer's priority

| Value | Used for | Applies when | Source | Where |
|---|---|---|---|---|
| 70% | Engine certainty needed before a battery is added | Low cost first | Our assumption | `design.py` GOAL_BATTERY |
| 30% | Same | Independence first | Our assumption | `design.py` GOAL_BATTERY |
| 50% | Same | No priority given | Default threshold of the classifier | `design.py` |
| × 1.2, within the roof | Solar size | The environment first | Our assumption | `design.py` GOAL_PV |

## Read from the answers (`derive.py`)

| Value | Used for | Applies when | Source | Where |
|---|---|---|---|---|
| 3.6 / 3.2 / 2.8 | Heat pump's yearly efficiency (heat per kWh of electricity): underfloor only (about 35 °C); radiators, alone or with underfloor, in a house from 1991 on (about 45 °C); the same in an older or unknown-age house (about 55 °C) | Heat pump in the design and the customer said how rooms are heated | Our assumption, informed by Fraunhofer ISE field tests in existing homes (air-source about 3.1 on average, higher with underfloor, lower with radiators); check | `derive.py` COP |
| 0.85 | Share of a gas or oil figure that becomes heat, so what a heat pump must make | Heat pump, heat from a gas, oil or other fossil bill | Common boiler efficiency; the same factor is in the heat pump size rule (`models.py` HP_KWH_PER_KW) | `design.py` BOILER_EFFICIENCY |
| Bill or monthly payment | Big users are not added on top of a yearly use from either | Big users ticked | A payment is a real bill | `design.py` BILLED |
| 3.5 | The same, when the customer did not say | No answer on heating distribution | The data's own default, unchanged | `design.py` HEAT_PUMP_COP |
| 2,000 kWh heat at 2.5 | An electric water heater's hot water, moved to a new heat pump | Heat pump in the design and "electric water heater" ticked | Our assumption (same 2,000 kWh as the big users) | `derive.py` HOT_WATER_KWH, COP_HOT_WATER |
| 0.5 to 1.5 times | Heat per m² against the build period's value: outside it, the planner is asked to confirm | Customer gave heat use and living area | Our assumption | `derive.py` HEAT_CHECK |
| ±15% (range, payment), ±30% (household size), 2,500 to 6,000 kWh (not known) | Edges of a guessed yearly use, tried by the review | Use not from the bill | Our assumption; a band is about ±14% wide | `derive.py` DEMAND_SPREAD |
| ±30% heat, ±40% driving | Edges the review tries | Heat pump with no heat figure; car with no kWh a month | Our assumption | `casework.py` |
| 2 modules, 5 points | A guessed answer matters when its edges move solar by 2 modules, change the battery or heat pump, or move own power by 5 points (day at home) | Always | Our assumption | `casework.py` |
| 4 / 8 points | Own power a larger battery must add for an independence-first customer / a battery must add in a home empty in the day before the review proposes it | Always | Our assumption | `casework.py` |

## Engine rules and learned parts

| Value | Used for | Source | Where |
|---|---|---|---|
| 0.45 kWp per module | Modules ↔ kWp | Median module power where the data lists modules | `data.py` ASSUMED_KWP_PER_MODULE |
| 1.13 × 1.76 m module, 3 cm gap, 40 cm from each roof edge | How many modules fit a measured surface | Our assumption, a usual module and edge distance | `panels.ts` |
| 75% of the roof's best yield | A surface the homeowner left out whole takes overflow modules only if it yields at least this share | The design needs more than the homeowner's marked area holds | Our assumption: a planner does not fill a north roof to reach a size | `plan.ts` OVERFLOW_SHARE |
| 30 cm | Distance modules keep from an obstacle the planner keeps | Obstacles found on the photo | Our assumption | `roofObstacles.ts` CLEAR_M |
| "low" confidence starts switched off | Which found obstacles block cells before the planner looks | Photo check run | Our choice: a false box costs the customer modules | `roofObstacles.ts` |
| Module counts as marked | Its middle on a marked cell, and points 60% of the way to its corners on no cell the homeowner left free | Homeowner drew part of a surface | Our choice; cells are about 1 m | `panels.ts` ordered |
| 2,250 kWh of heat per kW | Heat pump size from heat use | Median of heat pumps sold here (`scripts/profile_hp_ev.py`), and use × 0.85 ÷ 1,900 h | `models.py` HP_KWH_PER_KW |
| 5, 7, 10, 12 kW | Heat pump sizes offered | Our assumption | `models.py` HP_SIZES |
| COP 3.5 | Heat → heat pump electricity | The data's own defaults (heat demand is 3.5 × heat pump electricity in 94% of heat pump homes, `scripts/profile_heating.py`) | `design.py` HEAT_PUMP_COP |
| Gas 11.8 ct per kWh, all in | Yearly gas payment → yearly heat (kWh), when the customer knows only the euros | SWM model household: 15,000 kWh for about €1,764 a year from January 2026, base fee and VAT included (SWM press release of 7 November 2025, read from a search summary; the price sheet itself was not readable). The base fee makes small users' real price higher, so their heat comes out a little high. Shown to the planner as assumed | `api.ts` GAS_CT |
| Tree crowns on the sun | How much of a roof's yearly sun trees take, in the planner | Each tree from Bavaria's tree map is a vertical cylinder from 35% of its height to its top, radius 20% of its height (1.5 to 6 m). A crown stops 35% of the sun's direct light December to March, 60% in April and November, 85% May to October. Diffuse light is left as it was, so the loss is if anything low. On the four demo homes roof sides lose 0 to 14% | Our assumption, no measured source | `treeShade.ts` CROWN_RADIUS, CROWN_FROM, STOPS |
| 2 kWh | A learned battery this close to the installer's most sold size becomes that size | Dev cross-validation (D73) | `design.py` HABIT_KWH |
| 80% | Below this the battery decision is flagged as open | Dev cross-validation (findings) | `design.py` UNSURE_BATTERY |
| 1.5 kWh per kWp and per MWh | Battery guideline note | HTW Berlin 2022 | `design.py` GUIDE_KWH_PER_UNIT |
| 950 kWh per kWp (Germany) | Yield when no measured roof | Our assumption, a typical German figure; measured roofs use PVGIS instead | `design.py` KWH_PER_KWP |
| 30 homes | Fewest "similar homes" shown | Our choice | `design.py` MIN_SIMILAR |
| Battery catalog sizes | Battery sizes offered | Sizes each installer sold at least 5 times (data) | `data.py` battery_catalog |

## Energy check (hour by hour, one year)

| Value | Used for | Source | Where |
|---|---|---|---|
| Weather years 2018–2020 at Munich | Hourly sun | PVGIS hourly series | `energy.py` |
| 7.7 ct/kWh | Feed-in tariff | EEG, systems up to 10 kWp commissioned 1 Aug – 31 Dec 2026 (Bundesnetzagentur) | `energy.py` FEED_IN_CT_KWH |
| 90% usable, 90% round trip, 0.5 C, 25 Wh an hour standby | Battery behaviour | Our assumption, typical home battery figures | `energy.py` |
| 0.93 | Correction for minute peaks an hourly model misses | Fitted to HTW Berlin calculator values (`scripts/check_energy.py`) | `energy.py` SUB_HOUR |
| Household, heat and car day shapes, monthly shares | When energy is used | Our assumption, simple stated shapes | `energy.py` |

## Money (`pricebook.py`, `costs.py`)

The data holds no prices. Every price below is a typical German end-customer price, net, for autumn 2026, and the planner can replace any of them on the Prices page (kept in `data/cache/pricebook.json`, not committed). Each item's source is in `pricebook.py` and shown on the page. Ranges checked: 10 kWp turnkey €9,500–17,000 without battery and €13,000–23,000 with 10 kWh (42watt, priwatt, Finanztip, 2026); battery €315–700 per kWh installed; air-water heat pump €27,000–40,000 gross installed, median of 160 offers about €35,000 (Utopia). Our defaults give about €11,000 for 9 kWp without extras and about €29,000 gross for a 10 kW heat pump replacing gas.

| Value | Used for | Source | Where |
|---|---|---|---|
| Module €115, mounting €65 pitched / €85 flat, DC install €75, each per module | Solar | Our estimate inside the 2026 turnkey ranges | `pricebook.py` |
| Hybrid inverter €900 + €110 per kW, sized to at least 85% of kWp | Solar | Our estimate | `pricebook.py`, `costs.py` DC_AC |
| Scaffolding €1,000, AC install €900, planning €400, grid registration €250, travel €450 | Every solar offer | Our estimate; these groups are in about 90% of installer A's offers | `pricebook.py` |
| Meter cabinet €2,200, energy manager €300, breakers €450, surge protection €350 | Extras, ticked by default where the installer adds them to at least half of its offers | Share of offers from `scripts/profile_products.py` | `pricebook.py` SHARE |
| Battery €400 per kWh + €600 install; backup box €900 | Battery | 2026 guides, low middle of the range | `pricebook.py` |
| Wallbox €750 + €900 install, 19% VAT | Wallbox | 2026 guides | `pricebook.py` |
| Heat pump €4,500 + €600 per kW; hydraulics €1,900, buffer €900, hot water tank €1,900, install €6,500, balancing €800, ground work €900; old heating out €900, oil tank €1,200 | Heat pump, 19% VAT | 2026 guides; every heat pump offer in the data holds unit, install and buffer | `pricebook.py` |
| 0% VAT on solar and battery | Price | UStG §12(3), systems up to 30 kWp on homes | `pricebook.py` |
| KfW grant: 30% base, +16% speed bonus, income bonus 10–40%, cap 70% (80% low income), at most €28,000 eligible | Heat pump grant | BEG as reformed 21 July 2026 (Ökozentrum NRW summary, 6 Aug 2026). Speed bonus for oil, other fossil, electric (night storage) heating or a gas boiler of 20 years or more; owners living in the home only | `costs.py` BEG_* |
| Feed-in 7.7 ct (first 10 kWp), 6.66 ct above | Money from sold power | EEG, 1 Aug 2026 – 31 Jan 2027 | `pricebook.py` RATES |
| Gas 11.8 ct, oil 10.5 ct per kWh | Fuel no longer bought | SWM model household 2026; oil our assumption | `pricebook.py` RATES |
| Electricity +3% a year, gas and oil +4%, panels −0.4% a year | Payback | Data default; our assumption (CO₂ price); module warranties | `pricebook.py` RATES |
| Upkeep: solar €150, heat pump €200, boiler and chimney sweep €250 a year | Payback | Our assumption | `pricebook.py` RATES |
| Inverter replaced once after 15 years; battery counts for 15 years; 20 years looked at; 4 ct after the 20 feed-in years | Payback | Our assumption; EEG pays 20 years | `costs.py` |

## Not available

- **Energy certificate:** no public register; only the owner has it. Asked as an optional field.
- **House size and household size in past projects:** 99.5% empty, so nothing is learned from them (`scripts/profile_household.py`).
