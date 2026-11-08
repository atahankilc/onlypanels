# Which data would help

Researched 2026-11-07. Status means the Reonic export we hold today. Web figures are mostly from secondary sources; check originals before quoting them.

## Planner: to design a correct, buildable system

| Data | What it decides | Source | In our data? |
|---|---|---|---|
| Usable roof area, panels that fit | PV size, likely the main limit | Reonic roof planner, planner input, Google Solar API | No |
| Roof tilt, orientation, type | Yield, mounting, cost | Reonic, planner, Google Solar API | Only in sold line items |
| Shading | Smaller system or optimisers | Site visit, roof tools | No |
| Roof condition, statics, asbestos | Whether PV is possible | Site visit | No |
| Meter cabinet condition | Extra work and cost | Site visit. Work appears in 53% of options | Only in sold line items |
| Grid connection capacity | Inverter size, wallbox, heat pump | Grid operator, site visit | No |
| Cable route length | Cost | Site visit | Partly in line items |
| Installer catalog, stock, purchase prices | Which real product to propose | Installer | Names only, no prices |
| Selling prices | Budget balance, margin | Installer, Reonic | No |
| Delivered option | The true expert answer | Reonic | No (300 projects are ambiguous) |
| Lost offers | Win rate, what fails to sell | Reonic | No, signed projects only |
| Planner changes to a first design | What experts correct | Future override log | No |
| Heat load, building age, area, insulation, flow temperature | Heat pump size and suitability | Reonic heat load tool, site visit | Almost empty |
| Time per design today | Business value | Reonic | No |

## Homeowner: to understand and decide

| Data | What it answers | Source | In our data? |
|---|---|---|---|
| Location or postcode | How much sun I get | Homeowner, then PVGIS (free, hourly, no key) | No |
| Annual use from the bill | Sizing base | Homeowner | Yes, often rounded |
| People in the home | Estimate when the bill is unknown | Homeowner, then Stromspiegel | 99.5% empty |
| Electricity price and tariff | Saving | Bill | Yes, often a default |
| Budget, financing need | What I can afford | Homeowner | No |
| Goal: saving, independence, backup | Which system suits me | Homeowner | No |
| EV plans and distance | Extra use, wallbox | Homeowner | Under-recorded |
| Heating type and yearly fuel use | Heat pump value | Homeowner | 12% filled |
| System price, price per kWh of storage | Is this fair? | Installer | No |
| Feed-in tariff | Income from surplus | Bundesnetzagentur. About 7.8 ct/kWh until July 2026, slightly lower since (unconfirmed) | 1 project |
| Grants | Real cost of a heat pump | KfW. Base 30%, up to 70%, rules changed in July 2026 and change again in 2027 | No |
| Market prices | Am I overpaying? | Guides: wide range, 10 kWp with storage roughly €13,000 to €22,000 | No |
| Payback | When does it pay off? | Needs prices. Guides say about 8 to 14 years | No |
| Independence benchmark | Are the estimates credible? | HTW Berlin calculator | No |

## Now in use

Address search (Nominatim), building shape and height (OpenStreetMap through OpenFreeMap), sun per surface with terrain horizon (PVGIS) and aerial photos in Bavaria (CC BY 4.0). Roof tags and nearby trees come from Overpass when it answers. Monument status (BLfD's public map service) and Munich's heat plan areas (Geoportal München) come into the planner's checks, asked by the page directly, not through our server. Roof slope is still an estimate. Garden size is drawn by the homeowner, not detected.

## Priorities

Ask Reonic first: postcode, roof data, delivered option, prices, lost offers.

Add with no permission needed: PVGIS for real hourly sun instead of our assumed curves, and Stromspiegel values so a homeowner can answer with the number of people. PVGIS needs only coordinates, so no project data is sent.

Low value: outage history. Germany averaged 11.7 minutes without power in 2024, so it should not drive battery size.

Open: LoD2 building models and state solar registers were not confirmed by our search. Google Solar API is paid per query, and German coverage needs checking.
