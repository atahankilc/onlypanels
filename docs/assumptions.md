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
| 2,500 / 3,500 / 4,500 / 6,000 / 8,500 kWh | The middle of each range the homeowner can pick | A range is picked | Our assumption: middle of each band, 8,500 for "over 7,000" | `Review.tsx` BANDS |
| Middle of from–to | Use from the homeowner's own range | Own range given | Arithmetic | `Review.tsx` |
| 2,000 / 2,700 / 3,500 / 3,800 / 4,500 kWh | Use by household size, 1 to 5+ | Last resort: no use and no range | Stromspiegel 2025, single-family house, from secondary sources; 1 person is our own guess | `Review.tsx` BY_PEOPLE |
| 11,300 km a year per car | Car driving | Car, but no km and no kWh | Our assumption, said to be the German average per car; source not recorded, check (D64) | `plan.ts` TYPICAL_KM |
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
| 10 kWh per litre | Heating oil → heat | Oil given in litres | Common conversion for heating oil (about 10 kWh per litre) | `Review.tsx` KWH_PER_LITRE_OIL |
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
| Roof told in words, without the map | Roof area and slope for a request without a home | Homeowner answered on the roof page instead of picking the home | Size: small 80, detached 110, large 160 m², the quartiles of measured roof area of 128,365 Munich buildings 3 to 12 m high with 50 to 400 m² footprint (`scripts/roof_size_bands.py`). Slope: gentle 25°, steep 45°, not sure 35°, our assumption | `share.ts` toldRoof |
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

## Not available

- **Energy certificate:** no public register; only the owner has it. Asked as an optional field.
- **House size and household size in past projects:** 99.5% empty, so nothing is learned from them (`scripts/profile_household.py`).
