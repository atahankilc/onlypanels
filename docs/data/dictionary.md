# Data dictionary

Two installers, each a folder in `data/raw/` with the same two files. Folder names are installer hashes (our reading, to confirm).

| Installer | Projects | With parts | Options | Part lines | Offers | Catalog style |
|---|---|---|---|---|---|---|
| `2a8ba8e2` | 1,277 | 1,257 | 1,637 | 19,257 | Jun 2024 to Apr 2026 | Itemised. Huawei, EcoFlow, SAJ, SolarEdge, Enphase; Vaillant and Aira heat pumps |
| `23c108b7` | 342 | 336 | 357 | 2,395 | Jun 2025 to Apr 2026 | Bundles ("Complete Package"). Sigenergy, GoodWe, FoxESS, EcoFlow |

No project or customer IDs overlap between installers. Join: `project_id`.

"Fill" below is the share of rows non-null as `2a8ba8e2` / `23c108b7`.

## `projects_status_quo.csv`: one row per project (model inputs)

| Column | Unit / values | Fill | Notes |
|---|---|---|---|
| `project_id`, `customer_contact_id` | hash | 100% | 42 customers have more than one project: split by customer |
| `request_created_at` | timestamp | 1% / 81% | |
| `offer_created_at` | timestamp | 100% / 95% | |
| `first_signed_at` | timestamp | 100% | Every project is signed. 5 precede the offer date |
| `country` | Germany, Slovenia | 100% | 1 Slovenian project |
| `energy_demand_wh` | **Wh** per year | 100% | 4,500,000 = 4.5 MWh. 85% are multiples of 500 kWh, so estimates. 14 are zero |
| `energy_price_per_wh` | **per Wh** | 100% | 0.00032 = 32 ct/kWh (currency assumed EUR). 937 of 1,619 are exactly this value, likely a default |
| `energy_price_increase` | fraction per year | 100% | Mostly 0.03 |
| `energy_price_with_flexible_tariff` | per Wh | 5% / 44% | |
| `base_price_per_month`, `base_price_increase` | currency, fraction | under 25% | One value of 180, likely an error |
| `load_profile` | H0, FamilyOfFour, HomeOfficeOnePerson, FullTimeOnePerson, SeniorOnePerson, PartTimeOnePerson, SingleParentThreePersons, CustomFromEditor | 100% | 92% H0, likely default |
| `load_profile_editor_id` | hash | under 2% | |
| `has_ev`, `ev_annual_drive_distance_km` | bool, km | 3% / 6% true | Badly under-recorded, see findings |
| `has_solar`, `solar_size_kwp` | bool, **W despite the name** | 18 / 0 rows | 10000 = 10 kWp. Existing system |
| `solar_angle`, `solar_orientation`, `solar_built_year` | degrees, year | existing systems only | Not roof data for the new system |
| `solar_feedin_renumeration(_post_eeg)` | per Wh | 1 row in total | Effectively empty |
| `has_storage`, `storage_size_kwh`, `storage_built_year` | bool, **Wh despite the name**, year | 11 rows true | Built years of 2026 suggest planned, not existing |
| `has_wallbox`, `wallbox_charge_speed_kw` | bool, **W** | 4 rows | |
| `heating_existing_type` | Heatpump, Gas, Oil, OtherNonRenewable, OtherRenewable | 12% / 14% | Mostly Heatpump (171 of 199) |
| `heating_existing_cost_per_year` | currency | 6% / 2% | 14 values between 0.01 and 10 look like unit prices. Many zeros |
| `heating_existing_cost_increase_per_year` | | 0% | Empty |
| `heating_existing_electricity_demand_kwh` | **kWh** | 10% / 13% | Only unit that matches its name |
| `heating_existing_heating_demand_wh` | **Wh** | 12% / 14% | Often a default, see findings |
| `house_size_sqm`, `house_built_year`, `num_inhabitants` | | **0.4% / 0.6%** | 7 rows. Unusable as features |

## `project_options_parts.csv`: one row per line item (model targets)

Key: `project_id` > `option_id` > line. An option is one proposed configuration; a project can have several.

| Column | Values | Notes |
|---|---|---|
| `option_number` | 1 to 19 | Gaps are common. 33% of projects have no option 1 |
| `technology` | solar, ses (storage), wallbox, heatpump | 1 null |
| `line_item_function` | default, heatpump, other, warmwaterStorage, heatingStorage | |
| `component_type` | see below | |
| `component_name` | 349 / 208 distinct | Anonymised English names, sizes often embedded |
| `component_brand` | | Mostly null |
| `quantity`, `quantity_units` | Item, SquareMeter, LinearMeter, FlatRate | Scaffolding area is in m² |
| `module_watt_peak` | W | Only on `Module` rows, which are rare |
| `inverter_power_kw` | **actually battery Wh** | Swapped. Populated only on `BatteryStorage` rows |
| `battery_capacity_kwh` | **actually inverter W** | Swapped. Populated only on `Inverter` rows |
| `wb_charging_speed_kw` | **W** | 11000 or 22000 |
| `heatpump_nominal_power_kw` | **W** | 5000 to 12000 |

There are **no prices** anywhere in the parts data.

Component types: `InstallationFee`, `ServiceFee`, `ModuleFrameConstruction`, `AccessoryToModule`, `BatteryStorage`, `Other`, `Wallbox`, `AccessoryToInverter`, `AccessoryToBatteryStorage`, `AccessoryToWallbox`, `AccessoryToHeatpump`, `WarmwaterStorage`, `Heatpump`, `HeatingStorage`, `Inverter`, `Module`.

## Reconstructing a design from line items

Implemented in `build_options` in `scripts/profile_data.py`. Move it into `engine/` once confirmed.

| Target | How |
|---|---|
| Module count | Max of `Module` qty, `DC Install*` qty, `Substructure*` qty (above 1), `Roof Mounting <size band>` qty. `DC Install` and `Substructure` agree on 99.6% of options that have both |
| PV kWp | Exact from `Module` rows if present, else package name ("10.8kWp"), else module count × 0.45 kWp (**assumption**) |
| Battery kWh | Sum of `inverter_power_kw × quantity / 1000` on `BatteryStorage` rows, excluding "AC Coupling Module" |
| Inverter kW | `battery_capacity_kwh / 1000` on `Inverter` rows. Only 52 rows in total, otherwise unknown |
| Wallbox | `Wallbox` row quantity and `wb_charging_speed_kw / 1000` |
| Heat pump kW | `heatpump_nominal_power_kw / 1000` on `Heatpump` rows |
| Add-on flag | Any line name containing "Extension" |
