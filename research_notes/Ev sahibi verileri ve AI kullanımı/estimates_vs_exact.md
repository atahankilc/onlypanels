# Homeowner energy data in Germany and Munich: what can be estimated, how well, and what must be exact

Status: researched 7 November 2026. Tags used below: **[primary]** read in the original document, **[secondary]** vendor, blog, news or a search summary, not checked against the original, **[own calc]** computed for these notes from public data, not yet in `scripts/`.

## Input-by-input verdict (objective summary)

### Takeaway
Most usage inputs can start as a default with a visible range, as long as the design and the payback are shown as ranges. Heat demand from age and area is the weakest estimate that still gets used. Legal, grid and grant facts cannot be estimated. They can only be flagged, and each one is a yes/no gate before an offer.

### Cited Findings
The table condenses the sections below, where every number has its source.

| Input | Estimable? | From what | Error | Wrong value is |
|---|---|---|---|---|
| Household electricity (kWh/yr) | Yes, as a default | Stromspiegel 2025 by building type, people, hot water | About -35% to +45% around the middle | Mild for PV, moderate for battery |
| Load shape | Yes | H25 | Fine for many homes, no figure for one home | Mild |
| Number of people | No, ask | One tap | Exact when asked | Moderate if guessed |
| Flats per building | Only as a band | Zensus 100 m cell, OSM storeys, doorbell count | Band, not a number | Harmful for grant cap, mild for roof PV |
| Building age | Only as a band | Zensus 100 m by decade | Neighbourhood, not the building | Moderate |
| Heated area | Roughly | LoD2 footprint and storeys | Not measured here | Moderate |
| Heat demand (kWh/yr) | Weakly | Age and area with calibrated typology | About +-55 kWh/m2 per year (1 SD) | Harmful if used for heat pump size |
| Heat load (kW) | No | DIN EN 12831, or real fuel use | Not applicable | Harmful |
| Electricity price | Yes | SWM price sheet, BDEW | Use energy price, not all-in | Moderate, payback only |
| Feed-in value | No guess needed, but changing | BNetzA, then successor law | Regime change for 2027 | Harmful for payback |
| Dynamic tariff | Default to "no" | About 6% have a smart meter | Small | Mild |
| EV kWh/yr | Yes, once EV is confirmed | 11,300 km x 20 kWh/100 km | About 1,300 to 4,200 kWh | Moderate |
| EV exists or planned | No, ask | One tap | Exact when asked | Moderate to harmful |
| Current heating type and age | No, ask | Zensus only gives the cell | Exact when asked | Harmful for grant |
| Owner-occupier, income, WEG | No, ask | Homeowner | Exact when asked | Harmful for grant and feasibility |
| Monument status | Flag only | Denkmal-Atlas, then the authority | Map gives a flag, "near" is a judgement | Harmful |
| Grid capacity, meter cabinet, roof statics | No | Grid operator, electrician, structural engineer | Site check | Harmful: cost or a stop |

### Inferences
- Three kinds of input exist. Defaults: show a range and let the user overwrite. Questions: one tap, never defaulted. Gates: never estimated, shown as "to be checked before an offer".
- The tool can be honest with no bill at all if it reports a range, and one number from a real bill narrows that range far more than any modelling.

### Gaps
- No study was found that measures end-to-end error of a homeowner tool that uses only defaults.

## Electricity use: Stromspiegel 2025, spread within a household size, H25

### Takeaway
Stromspiegel 2025 gives a good default by building type, people and hot water, and its class table shows the real spread: for the same household type, the top 15% start about 40-50% above the middle. H25 is fine as a shape but says nothing about one home's error.

### Cited Findings
- Stromspiegel 2025 rests on 57,000 household bills, plus 2,243 households tracked 2019 to 2024 for the trend. Published 13 May 2025. [primary] — [co2online press release](https://www.co2online.de/presse/stromspiegel-2025-deutsche-haushalte-verschwenden-jaehrlich-12-milliardeneuro-fuer-strom/)
- Class limits, kWh per year, hot water without electricity, upper limit of each class, 1 / 2 / 3 / 4 / 5+ people. Read from the flyer's table. [primary] — [Stromspiegel flyer 2025](https://mieterbund.de/app/uploads/2025/05/stromspiegel-flyer-2025-web.pdf)

| Type | People | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|---|
| House | 1 | 1,100 | 1,500 | 1,700 | 2,000 | 2,400 | 3,000 | over 3,000 |
| House | 2 | 1,900 | 2,200 | 2,500 | 2,900 | 3,300 | 4,000 | over 4,000 |
| House | 3 | 2,400 | 2,800 | 3,200 | 3,600 | 4,000 | 5,000 | over 5,000 |
| House | 4 | 2,600 | 3,100 | 3,500 | 4,000 | 4,500 | 5,600 | over 5,600 |
| House | 5+ | 3,000 | 3,600 | 4,100 | 4,800 | 5,500 | 7,000 | over 7,000 |
| Flat | 1 | 700 | 900 | 1,100 | 1,400 | 1,500 | 2,000 | over 2,000 |
| Flat | 2 | 1,200 | 1,500 | 1,700 | 2,000 | 2,400 | 3,000 | over 3,000 |
| Flat | 3 | 1,500 | 1,900 | 2,200 | 2,600 | 3,000 | 3,700 | over 3,700 |
| Flat | 4 | 1,700 | 2,000 | 2,500 | 2,900 | 3,400 | 4,100 | over 4,100 |
| Flat | 5+ | 2,000 | 2,400 | 2,800 | 3,500 | 4,000 | 5,000 | over 5,000 |

- With electric hot water the limits are higher, for example a 2-person house reaches class F at 5,500 kWh, a 5+ person house at 10,000 kWh. [primary] — [Stromspiegel flyer 2025](https://mieterbund.de/app/uploads/2025/05/stromspiegel-flyer-2025-web.pdf)
- Class meanings: E and F use more than every second comparable household. G uses more than 85% of comparable households. [primary] — [Stromspiegel flyer 2025](https://mieterbund.de/app/uploads/2025/05/stromspiegel-flyer-2025-web.pdf)
- Quoted average values, house without / with electric hot water: 1,800/2,100, 2,700/3,200, 3,500/4,100, 3,800/4,700, 4,500/6,000 kWh for 1 to 5 people. Flat: 1,200/1,600, 1,900/2,500, 2,400/3,500, 2,600/4,000, 3,100/5,000 kWh. [secondary] — [Utopia](https://utopia.de/ratgeber/stromspiegel-2025-ist-dein-stromverbrauch-normal_813088/), [vergleich.de](https://www.vergleich.de/stromverbrauch.html). The press release confirms the 1,900 kWh value for a 2-person flat — [co2online](https://www.co2online.de/presse/stromspiegel-2025-deutsche-haushalte-verschwenden-jaehrlich-12-milliardeneuro-fuer-strom/). Other portals quote different values, for example 3,000/3,600 for a 2-person house — [Check24](https://www.check24.de/strom-gas/ratgeber/stromverbrauch-2-personen).
- Use per person varies by state, from 1,075 kWh in Saxony to 1,365 kWh in Saarland. Bavaria is not named in the press release. [primary] — [co2online](https://www.co2online.de/presse/stromspiegel-2025-deutsche-haushalte-verschwenden-jaehrlich-12-milliardeneuro-fuer-strom/)
- BDEW's 2025 profiles (H25, G25, L25, P25, S25) add households with PV and with battery. [secondary] — [R package standardlastprofile README](https://cran.r-universe.dev/standardlastprofile)
- The package author says H25 tracks the 1999 H0 profile almost exactly, while P25 and S25 diverge because of PV and battery. [secondary] — [same source](https://ftp.fau.de/cran/web/packages/standardlastprofile/readme/README.html). Primary page, not read: [BDEW Standardlastprofile Strom](https://www.bdew.de/energie/standardlastprofile-strom/)
- Grid operators can choose new or old profiles. [secondary] — [PwC](https://www.pwc.de/de/energiewirtschaft/erneuerbare-energien/pwc--standardlastprofile-fuer-verteilnetzbetreiber.html)

### Inferences
- If E begins near the median, the top of D is about the median and the top of F is the 85th percentile. Then the 85th percentile sits 1.38 to 1.50 times the median across all ten rows, and the top of class A sits at 0.50 to 0.67 times the median. In plain terms: about -35% to +45%. The percentile of class A is not stated, so the low side is less sure.
- Use the "ohne Strom" row as the default only if hot water is not electric. In a flat with electric water heaters the average rises sharply (2,600 to 4,000 kWh for 4 people), so hot water type is worth one tap.
- For apartment buildings, totals add up. If flats vary independently, the relative error of the sum shrinks roughly with the square root of the number of flats. So a 12-flat building is more predictable than one flat, provided the flat count is right. This is statistics, not a measured result.
- H25 describes the average of many homes. Using it for one home is acceptable for yearly self-consumption, but it gives no error bar. Use P25/S25 only for grid-side questions, not as the household's own load.

### Gaps
- Stromspiegel's method for excluding heat pumps, night storage heating and EV charging was not confirmed. Treat its values as household electricity only, and add these loads separately, but confirm first.
- No published standard deviation for a household size was found. The spread above is read off class limits.
- No Munich or Bavaria value was found.
- No number was found for the error of self-consumption when H25 stands in for one real home.

## Number of flats or households per building from open data

### Takeaway
No open source gives the flat count of a single Munich building. Zensus gives a mix per 100 m cell, and OSM has the count on only 73 of about 192,000 Munich buildings. The best plan is to show a band from Zensus and storeys, then ask the user to count doorbells or letterboxes.

### Cited Findings
- Zensus 2022 publishes 100 m grid data: buildings by number of dwellings (classes 1, 2, 3-6, 7-12, 13+), by construction decade, by building type, by heating type and by energy source, plus ownership form, dwellings by floor area, vacancy, owner-occupier rate and mean dwelling area. Files are CSV in ZIPs. [primary] — [Destatis Zensus 2022 grid downloads](https://www.destatis.de/zensus2022)
- In the file, a dash means exactly zero or changed to zero, and sums can differ because of secrecy. Reference date 15 May 2022. Licence dl-de/by-2-0. [primary] — [Zensus file with dataset description](https://www.destatis.de/static/DE/zensus/gitterdaten/Gebaeude_nach_Anzahl_der_Wohnungen_im_Gebaeude.zip)
- Secrecy uses the Cell-Key method, which adds small offsets such as +2 or -1 to result cells. [primary] — [Destatis](https://www.destatis.de/zensus2022)
- [own calc] Rectangle around Munich (11.36-11.72 E, 48.06-48.25 N, so it includes some suburbs): 19,292 cells, 204,318 buildings with living space. Mix by class counts: 1 dwelling 56.2%, 2 dwellings 8.0%, 3-6 12.9%, 7-12 14.3%, 13+ 8.5%. 7.6% of cells have no class data at all. Of 11,752 cells with at least three buildings of 3+ dwellings, 65% have one class holding 80% or more of those buildings, 35% have at least two of the three classes, and 58% also hold 1-2 dwelling buildings. — [Zensus file](https://www.destatis.de/static/DE/zensus/gitterdaten/Gebaeude_nach_Anzahl_der_Wohnungen_im_Gebaeude.zip)
- [own calc] Overpass count of Munich building ways on 7 November 2026 (city boundary, ways only): 192,483 buildings, 73 with `building:flats` (0.04%), 81,931 with `building:levels` (42.6%), 993 with `start_date` (0.5%). — [Overpass API](https://overpass-api.de/api/interpreter), tag: [OSM wiki Key:building:flats](https://wiki.openstreetmap.org/Key:building:flats)
- `building:flats` is the count of dwellings, and mappers often get it by counting letterboxes. [secondary] — [OSM wiki](https://wiki.openstreetmap.org/Key:building:flats)
- Bavarian LoD2 has about 9.8 million objects, standard roof forms, address and descriptive attributes, each with a currency date. Height of ridges and eaves is normally 20-30 cm accurate, with more than 1 m possible in single cases. [primary] — [Bavarian LoD2 open data note](https://geodaten.bayern.de/odd/m/3/pdf/hinweise_daten_lod2_download.pdf)
- LoD2 customer documents list building function and above-ground storeys, the latter "not available everywhere". The Bavarian ALKIS product has a storey field. [secondary] — [LoD2 Kundeninformation](https://bayernlabs.bayern.de/mam/ldbv/dateien/lod2_kundeninformation.pdf), [ALKIS Shape format](https://ldbv.bayern.de/mam/ldbv/dateien/dfb_shape_komplettdaten.pdf)
- Munich's open data search found no per-building flat or age dataset. Tables exist by area and construction period, and the city's building stock is rolled forward from the 1987 census with building activity statistics. [secondary] — [Munich statistics](https://stadt.muenchen.de/infos/statistik-bau--und-wohnungswesen.html)

### Inferences
- Band logic: use cell classes for a prior, then shift by building volume (footprint x storeys). A long multi-entrance block and a villa can share a cell. 58% of apartment cells also hold small houses, so a cell alone can't type a building.
- Rule of thumb, uncalibrated: flats = footprint x storeys x usable share / mean flat size. Usable share and mean flat size would come from Zensus cell data. Show as a band.
- One address can be several buildings, and one building can have several house numbers. The answer needs care with terraces and blocks that share walls.
- Best question for a homeowner: "How many doorbells or letterboxes does your entrance have?" It is cheap, and it matches how mappers get the number.
- For roof PV the flat count often does not decide size. The roof does. It matters for the grant cap and for self-use if the operating model shares power.

### Gaps
- Exact attribute list of the Bavarian LoD2 CityGML file was not checked in a real file. Whether it has storey counts in Munich should be tested on the project's own tiles.
- No validated error for "flats from geometry" was found. A test against buildings with known counts would be needed.
- Whether ALKIS holds a dwelling count: not found, and I expect not.
- Open use of address-level registers (for example the Munich resident register) was not found, and it would not be open for privacy reasons.

## Heat demand: age and area estimate, error, and building age sources

### Takeaway
Age and area give a useful neighbourhood value but a poor single-building value. In one test on 80,000 buildings, the best adjusted estimate still missed by about 55 kWh/m2 per year (1 SD), and building data explained only 19% of the spread. A heat pump should not be sized from this. Real fuel use is much better.

### Cited Findings
- SEnerCon checked a simplified demand calculation on about 80,000 buildings in a co2online tool. Raw calculated demand ran 31 kWh/m2 a above measured use on average. Adjusted values cut the mean error to about 3 kWh/m2 a, but the standard deviation stayed at 55 (60 before), later 52 in a further model. Only two of three users saw a typical value within +-55 kWh/m2 a of their use. [primary] — [SEnerCon quality check](https://senercon.de/wp-content/uploads/2023/09/Qualitaetskontrolle_der_modifizierten_Waermebedarfsrechnung.pdf)
- Same study: r2 of 0.185, so 19% of variance in use is explained by the condition of the building parts. The rest is user behaviour, wear, efficiency, measurement and input errors. Calculated demand is too high for old buildings and too low for newer ones. Inputs here include renovation history, which is more than age and area. [primary] — [SEnerCon quality check](https://senercon.de/wp-content/uploads/2023/09/Qualitaetskontrolle_der_modifizierten_Waermebedarfsrechnung.pdf)
- IWU says TABULA calibrates results to typical use with an empirical use-to-demand factor, and that it is "not possible" to predict exactly the use of a single building. IWU's tool shows an expected range. [primary] — [IWU Energieprofil WebTool documentation 2026](https://www.iwu.de/fileadmin/publikationen/arbeitspapier/2026_IWU_Loga_Dokumentation-Energieprofil-WebTool.pdf)
- Prebound effect: occupants of older homes use on average about 30% less heating energy than the calculated rating, and the gap grows with the rating. [secondary, abstract only] — [Galvin and Sunikka-Blank 2016](https://econpapers.repec.org/RePEc:eee:energy:v:95:y:2016:i:c:p:415-424), [Sunikka-Blank and Galvin 2012](https://structurae.net/en/literature/journal-article/introducing-the-prebound-effect-the-gap-between-performance-and-actual-energy-consumption)
- Heizspiegel 2026, buildings to 1977, measured use incl. hot water, kWh/m2 per year. Natural gas, 150-250 m2: low to 73, middle to 133, raised to 214, too high from 215. Gas, 250-500 m2: 70 / 130 / 211 / 212+. Gas, over 500 m2: 66 / 129 / 204 / 205+. District heating, 150-250 m2: 51 / 112 / 197 / 198+. Heat pump (electricity), 150-250 m2: 19 / 36 / 73 / 74+. Values for billing year 2025. [primary] — [Heizspiegel 2026 flyer, to 1977](https://mieterbund.de/app/uploads/2026/09/HeizspiegelFlyer-2026_260915_BAK-bis-1977.pdf)
- The Heizspiegel series has separate flyers per age class, such as [to 1983](https://mieterbund.de/app/uploads/2026/09/HeizspiegelFlyer-2026_260915_BAK-bis-1983.pdf), [to 1994](https://mieterbund.de/app/uploads/2026/09/HeizspiegelFlyer-2026_260915_BAK-bis-1994.pdf), [from 2002](https://mieterbund.de/app/uploads/2026/09/HeizspiegelFlyer-2026_260915_BAK-ab-2002.pdf). [primary, only the first read in full]
- Fuel conversion: 1 litre of oil or 1 m3 of gas is about 10 kWh. Flats must use the whole building's area. If hot water is separate, add 24 kWh/m2 (gas, oil, district heat, pellets) or 9.6 kWh/m2 (heat pump). [primary] — [Heizspiegel 2026 flyer](https://mieterbund.de/app/uploads/2026/09/HeizspiegelFlyer-2026_260915_BAK-bis-1977.pdf)
- Building age sources: Zensus grid files by decade and by Mikrozensus classes at 100 m. A 1 km file crosses decade, type and energy source. [primary] — [Destatis](https://www.destatis.de/zensus2022)
- Zensus year means the year first ready for occupancy, and rebuilt buildings count from rebuild. [secondary] — [Saxony data sheet](https://www.zensus.sachsen.de/05_03_Datenblatt_Gemeinden/statistik-sachsen_zensus_gwz_gemeinde_kamenz-stadt.pdf)
- OSM has `start_date` on 0.5% of Munich buildings. [own calc] — [Overpass API](https://overpass-api.de/api/interpreter)
- A heat pump that is too large cycles, loses efficiency and wears faster. [secondary] — [co2online](https://www.co2online.de/modernisieren-und-bauen/waermepumpe/nachteile-einer-zu-grossen-waermepumpe/)
- Swiss OptiPower: multi-family systems stayed well oversized even by the planner's design (median 30%). [secondary] — [OST/BFE OptiPower report](https://www.ost.ch/fileadmin/dateiliste/3_forschung_dienstleistung/institute/spf/forschung/projekte/optipower_bfe_schlussbericht_final.pdf)

### Inferences
- At 130 kWh/m2, a standard deviation of 55 is about +-42% for one building. With age and area alone, the error can't be smaller than in the SEnerCon test, which also used renovation data. For 150 m2 that is 19,500 kWh, plus or minus about 8,000 kWh.
- Order of preference: three years of fuel bills, then one year's bill, then a Heizspiegel-based typical value by age class and fuel, then uncorrected typology last. Never show raw calculated demand as expected use.
- Ask renovation in plain terms: windows replaced? roof insulated? walls insulated? These are cheap and shift the estimate more than a better model.
- Show heat load as a band with "needs a room-by-room calculation before an offer". A heat pump list price can be shown, the final model cannot.
- Zensus 100 m age is a mix for a neighbourhood. Show it as "homes around you are mostly from the 1960s" and ask to confirm.

### Gaps
- No German per-age TABULA kWh/m2 table was read for these notes, so no values are quoted. Pull them from the IWU tool if the engine uses them.
- SEnerCon document's year is unclear. The file was uploaded in 2023, and its table cites 2009 factors. Treat as older data.
- No per-building age dataset was found for Munich. ALKIS may hold a year in some cases, this was not confirmed.
- No sourced factor turning kWh per year into kW. A common planning shortcut divides by about 2,000 full-load hours, and I did not verify it.
- dena values were not researched.
- A search summary reported Fraunhofer ISE field-test figures (air heat pumps about 50% above the load derived from real use, 51 systems, mean JAZ 3.4 in existing homes). Neither the blog page nor the original report was pinned down, so treat them as unverified and do not quote them.

## Electricity price default, spread, dynamic tariffs

### Takeaway
Do not use the headline 37 ct for savings. PV saves only the energy price, not the fixed charge. In Munich the official default (basic supply) is 32.44 ct/kWh plus 149.70 EUR per year. Using 37.3 ct instead overstates the value of each self-used kWh by about 20%.

### Cited Findings
- BDEW: 2026 household price so far averages 37.3 ct/kWh at 3,500 kWh per year, with fixed charge included. Procurement and sales 15.4, grid fees 9.2, taxes and levies 12.6. Grid fees fell 1.7 ct because of the transmission grid subsidy. Wholesale rises linked to the Iran war are now visible in new-customer tariffs at 1 October. [primary] — [BDEW Strompreisanalyse October 2026](https://www.bdew.de/media/documents/BDEW_Strompreisanalyse_102026_1.pdf)
- BDEW's number is a new-customer average of tariffs on offer, weighted 78% tariff products and 22% basic supply. It is not the average of existing contracts, and it excludes bonuses, heat and heat pump tariffs. [primary] — [BDEW](https://www.bdew.de/media/documents/BDEW_Strompreisanalyse_102026_1.pdf)
- BDEW at 1 October 2026: household new-customer tariffs 38.9 ct/kWh, green 38.5, heating tariffs with separate metering 29.0 (at 6,000 kWh), charging tariffs with separate metering 31.2 (at 2,500 kWh). [primary] — [BDEW](https://www.bdew.de/media/documents/BDEW_Strompreisanalyse_102026_1.pdf)
- Destatis first half 2026, all contracts: 37.97 ct/kWh, method not comparable. [secondary] — [monsterdealz](https://www.monsterdealz.de/magazin/strompreis)
- SWM basic supply, Munich, valid from 15 September 2026, gross: 32.44 ct/kWh plus 149.70 EUR per year, metering extra. Heat pump with separate meter, gross: 24.19 ct/kWh plus 75.33 EUR per year for contracts from 15 May 2025 without a module. With §14a Module 1: 27.81 ct/kWh plus 150.62 EUR per year. [primary] — [SWM Preisblatt M-Strom](https://www.swm.de/dam/doc/strom/preise-strom-2026-09.pdf)
- Basic supply averaged 44.93 ct versus 38.20 ct elsewhere on 1 April 2025, nationwide. [secondary] — [BNetzA Monitoringbericht 2025 as cited](https://data.bundesnetzagentur.de/Bundesnetzagentur/SharedDocs/Mediathek/Monitoringberichte/monitoringberichtenergie2025.pdf)
- Smart meters: about 6% of households in mid-2026. [secondary] — [Cleanthinking](https://www.cleanthinking.de/dynamischer-stromtarif/)
- A dynamic tariff cannot be billed without a smart meter. [secondary] — [Verbraucherzentrale Niedersachsen](https://www.verbraucherzentrale-niedersachsen.de/node/123774)
- A provider-funded poll of 2,043 adults in October 2026: 3% have a dynamic tariff, 15% are interested. [secondary, sponsor bias] — [ZfK](https://www.zfk.de/unternehmen/nachrichten/umfrage-15-prozent-dynamisch-tarif)
- Verivox: in H1 2026 competitive fixed tariffs beat dynamic ones, even after 75 EUR of §14a grid-fee relief. [secondary] — [Solarserver](https://www.solarserver.de/2026/07/16/verivox-dynamische-stromtarife-teurer-als-festpreistarife/)
- Dynamic tariffs suit homes with a heat pump, EV or battery that can shift use. [secondary] — [42watt](https://42watt.de/magazin/dynamischer-stromtarif)

### Inferences
- [own calc] SWM all-in at 3,500 kWh is 36.72 ct, close to BDEW, but the avoidable part is 32.44 ct. Value of one extra self-used kWh versus feed-in at 7.70 ct: 24.7 ct with SWM energy price, 29.6 ct with 37.3 ct. That is about 20% too high.
- Default: 32.44 ct in Munich, with 28 to 40 ct as an editable range. Ask for the kWh price, not the monthly payment. Monthly payments mix usage and price.
- Default "no dynamic tariff". Offer it as an optional scenario, not as a base case.
- Heat pump running costs depend on the tariff and module, so use a separate price from SWM's table, and flag it as basic-supply data.

### Gaps
- No sourced percentile spread of what German households actually pay was found.
- SWM's competing M-Strom product prices were not read, only basic supply.
- No sourced price forecast was used. The tool should treat future price rise as a scenario.

## Feed-in value and payback rules

### Takeaway
The current rates are known, but they end on 31 December 2026. A system installed in 2027 falls under a successor law still in parliament. A payback using 7.7 ct for 20 years may be wrong for anyone buying now.

### Cited Findings
- Rooftop PV commissioned 1 August to 31 December 2026: up to 10 kW 7.70 ct partial feed-in, 12.22 ct full feed-in. 10 to 40 kW: 6.66 ct and 10.24 ct. EEG 2023 applies to 31 December 2026, and a successor is in the parliamentary process. [primary] — [BNetzA EEG support page](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/ErneuerbareEnergien/EEG_Foerderung/start.html)
- Draft for 2027: cabinet decision 29 July 2026. Fixed tariff replaced for new small systems by a transition payment of about 5.2 ct/kWh for up to 36 months, partial feed-in only, and a 50% cap on feed-in at the connection point for roof systems under 100 kW. Not law as of the latest source found (mid-August 2026). [secondary] — [homeandsmart](https://www.homeandsmart.de/eeg-2027-regelung-solaranlage-gewinne-0014-092143), [Stiftung Umweltenergierecht](https://stiftung-umweltenergierecht.de/wp-content/uploads/2026/06/Einspeiseverguetung__EEG-2027_2026_06_03.pdf), [NWB](https://www.nwb-experten-blog.de/eeg-novelle-2027-dunkle-zeiten-fuer-den-solarausbau/)
- Solarspitzengesetz: no payment during negative price hours, with hours added at the end of the 20 years. [secondary] — [EMA](https://ema-energiewelt.de/wissen/solarspitzengesetz-negative-preise-einspeiseverguetung)

### Inferences
- Treat "commissioning date" as a required assumption in payback. Show one case under current rates and one under the draft.
- Under the draft, oversizing gets worse: exports earn less and may be capped. This shifts the design toward self-use, so a wrong consumption value costs more in 2027 than in 2026.

### Gaps
- Final EEG 2027 text and status in November 2026 were not found. Check before quoting any 2027 rate.

## EV use

### Takeaway
Whether there is an EV must be asked. Once confirmed, about 11,300 km and 20 kWh/100 km give about 2,300 kWh per year as a default, and the plausible range is about 1,300 to 4,200 kWh.

### Cited Findings
- KBA: 12,309 km per car in 2024, petrol 9,555 km, diesel 16,984 km. [secondary] — [auto motor und sport](https://www.auto-motor-und-sport.de/verkehr/jahresfahrleistungen-deutschland-antriebe-klassen/)
- KBA for 2025: battery-electric 11,312 km, up 25.8%, petrol 8,406 km. Total car km reported as 562.3 billion, versus 594.1 billion for 2024. This suggests a change of method, unexplained in my sources. [secondary] — [auto motor und sport](https://www.auto-motor-und-sport.de/verkehr/fahrleistungen-von-e-und-verbrenner-autos-wer-frisst-mehr-kilometer-sie-liegen-falsch/)
- ADAC Ecotest consumption: about 20 kWh/100 km on average, range 16 to 24.5 (January 2025) or 15.5 to 29.7 (2025), depending on the quoting source. WLTP numbers run lower, for example 20.4 against 16 kWh for an Audi Q4. [secondary] — [EnBW](https://www.enbw.com/blog/elektromobilitaet/wie-hoch-ist-der-stromverbrauch-von-elektroautos/), [Vattenfall](https://www.vattenfall.de/infowelt-energie/elektroauto-stromverbrauch)

### Inferences
- [own calc] Default 11,300 km x 20 kWh/100 km = 2,260 kWh. Low 8,000 x 16 = 1,280. High 17,000 x 24.5 = 4,165.
- A single EV can equal the whole household load in a flat, so "EV planned?" changes the design more than the choice of km value does.
- PV benefit depends on who is at home at midday, and where the car charges. Ask "mostly parked at home in daytime?". Without that, assume low solar overlap.

### Gaps
- Share of charging done at home was not researched.
- Whether ADAC values include charging losses was not confirmed.
- No Munich-specific mileage was found.

## Facts that must be exact before an offer

### Takeaway
These facts are yes/no or site facts. A tool can only prefill or flag them. The offer must wait for them, and each has an owner: grid operator, electrician, structural engineer, monument authority, KfW, or the owners' association.

### Cited Findings

**Grid connection and registration**
- SWM Infrastruktur separates PV up to 30 kW on an existing connection, larger systems above 30 kW, and plug-in units via quick MaStR registration. The connection holder must agree the installation before building. [primary] — [SWM Netzanschluss Erzeugungsanlagen](https://www.swm.de/kundenservice/netzanschluss/erzeugungsanlagen)
- A 2018 Munich case: a 90 kW request met a 30 kW limit at an existing connection. Illustration only. [secondary] — [Munich council document](https://risi.muenchen.de/risi/dokument/v/5203398)
- MaStR registration is due within one month of commissioning, and missing it risks payment. [secondary, from a search summary of several guides, these two pages not opened] — [Enpal](https://www.enpal.de/magazin/einspeiseverguetung), [ADAC](https://www.adac.de/rund-ums-haus/energie/spartipps/einspeiseverguetung-pv-anlagen)
- VDE-AR-N 4105:2026-03 is the new edition, with simpler rules for very small generators and storage. VDE calls application voluntary in principle, it binds through the grid operator's connection terms. [secondary] — [VDE FNN](https://www.vde.com/de/fnn/themen/tar/tar-niederspannung/erzeugungsanlagen-am-niederspannungsnetz-vde-ar-n-4105-2026), [Hager](https://hager.com/de/wissen/normen/vde-ar-n-4105-und-vde-ar-n-4110)
- §14a EnWG: heat pumps and wallboxes from 4.2 kW are steerable loads, must be registered, and the grid operator may temporarily limit them. Module 1 is a flat grid-fee cut. Module 2 is a percentage cut and needs its own meter. [secondary] — [SWM FAQ](https://www.swm.de/strom/faqs/steuerbare-verbrauchseinrichtungen), [Finanztip](https://finanztip.de/stromtarife/steuerbare-verbrauchseinrichtungen-14a-enwg/)

**Meter cabinet**
- No law requires a new cabinet across the board. The check is triggered by changes listed in VDE-AR-N 4100 section 4.4 and the operator's connection terms. [secondary] — [EMA on Munich](https://ema-energiewelt.de/wissen/zaehlerschrank-erneuern-waermepumpe-wallbox-muenchen-2026), [VDE FNN note on existing installations](https://www.vde.com/de/fnn/aktuelles/2023-11-30-zaehlerplaetze-in-bestandsanlagen)
- Reported cost: 1,500 to 3,500 EUR, paid by the owner. [secondary, vendor] — [reduco](https://reduco.ai/blog/solar/photovoltaik-zaehlerschrank-zaehlertausch)
- A claimed new VDE-AR-N 4100:2026-04 with transition to 1 April 2027 comes from one vendor only. [unverified] — [reduco](https://reduco.ai/blog/heizung/zaehlerschrank-erneuern-kosten)

**Roof and building law**
- PV on existing buildings is free of building permit in Bavaria (Art. 57 BayBO), but other public law still applies. [secondary] — [Munich PV notes on building law](https://lhm.muenchen.swm.de/dam/jcr:acbc7615-caa7-481a-be90-3ebb3e67d88a/PV_Hinweise_Bauordnung_Baurecht.pdf), [Art. 57 BayBO](https://lxgesetze.de/baybo/57)
- LoD2 roof shapes are generalised. Errors above 1 m can occur. [primary] — [Bavarian LoD2 note](https://geodaten.bayern.de/odd/m/3/pdf/hinweise_daten_lod2_download.pdf)

**Heritage protection in Munich**
- Permission is needed on listed buildings, inside Ensembles, near listed buildings, and above archaeological monuments. Authority: the Untere Denkmalschutzbehörde in the Lokalbaukommission. Solar on churches, chapels, monasteries, palaces and especially significant monuments is "generally not possible". Olympiadorf has its own PV framework plan and still needs a permit. [primary] — [Stadt München: Denkmalschutz und Solaranlagen](https://stadt.muenchen.de/infos/denkmalschutz-solaranlagen.html)
- Contradiction in practice: a Munich church, the Auferstehungskirche, received permission with conditions in 2026. [secondary] — [Solarserver](https://www.solarserver.de/2026/09/03/pv-im-denkmalschutz-solarstrom-fuer-muenchener-auferstehungskirche/)
- Bavaria's 2023 guidance: heritage does not oppose renewables in principle. Solar on surfaces not publicly visible is in principle acceptable without specific design demands. On visible surfaces of Ensemble buildings it is acceptable if the Ensemble's appearance is not harmed. Permission is still needed. [primary] — [Vollzugsschreiben BayDSchG, 23 June 2023](https://www.energieatlas.bayern.de/sites/default/files/Vollzugsschreiben_Bayerisches_Denkmalschutzgesetz_vom_23_Juni_2023.pdf)
- Denkmal-Atlas shows monuments and Ensembles, and a Munich leaflet treats marked areas as needing permission. An INSPIRE dataset of the list exists. [secondary] — [Munich leaflet](https://muenchenunterwegs.de/content/3003/download/13-hinweisblatt-denkmalschutzrechtliche-erlaubnis-2.pdf), [Geodatenkatalog](https://gdk.gdi-de.org/geonetwork/srv/api/records/2968f426-ca62-4d43-adb6-706cc3c8c317)

**BEG/KfW 458 (conditions from 21 July 2026)**
All from the KfW product page, read through a summarising fetch. Check the Merkblatt before quoting. [primary via summary] — [KfW 458](https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Heizungsf%C3%B6rderung-f%C3%BCr-Privatpersonen-Wohngeb%C3%A4ude-%28458%29/)
- Base 30%. Speed bonus 16% for owner-occupied homes replacing a working oil, coal, gas storage or night storage heater, or a gas or biomass heater at least 20 years old. It falls 4 points every six months from 1 February 2027 and ends for applications from 1 August 2028.
- Income bonus for owner-occupiers: 40, 30 or 10% up to 30,000, 40,000 or 50,000 EUR of taxable household income, limits up 10,000 EUR per child under 18 with Kindergeld.
- Total cap 70%, or 80% at the lower income limits.
- Eligible costs: 28,000 EUR for a single-family home. Multi-family: 28,000 first unit, 15,000 for units 2 to 6, 8,000 from unit 7. First-unit cap falls 750 EUR every six months from 1 February 2027.
- Eligible: private owners of houses, flats, and WEGs. If a GbR or legal entity is in the land register, product 459 applies. Usufruct holders are excluded.
- Building permit at least five years old. Hydraulic balancing is required. Work must not begin before approval.
- Order: BzA from a listed expert or registered company, then a contract with a condition tied to KfW approval, then application. The condition cannot be added to an existing contract. Complete within 36 months.
- Funding is subject to available budget, with no legal claim. [secondary] — [steuertipps](https://www.steuertipps.de/wohnen-haus-vermietung/kfw-heizungsfoerderung-uebergangsfrist-bis-20-juli-2026-nutzen)
- Natural refrigerant as a mandatory condition appears only in an AI-assisted news article. [unverified] — [boerse-express](https://www.boerse-express.com/news/articles/beg-reform-ab-heute-heizungszuschuesse-sinken-auf-28000-euro-930522)

**Heating law and Munich heat plan**
- The GModG, which repeals the 65% rule for new heating, passed the Bundestag and Bundesrat on 10 July 2026. Sources disagree on entry into force (29 July or 1 November 2026, or promulgation pending). [secondary, conflicting] — [Ökozentrum NRW](https://oekozentrum.nrw/aktuelles/detail/news/gebaeudeenergiegesetz-verabschiedet/), [42watt](https://42watt.de/magazin/geg), [Bundestag paper](https://dserver.bundestag.de/btd/21/070/2107071.pdf)
- Munich's heat plan was approved on 15 May 2024. It separates district heating densification and expansion areas, investigation areas, and decentral areas by groundwater, geothermal collector and air heat pump. The map is usually updated yearly. [secondary, via search summary] — [Wärmewende für München](https://stadt.muenchen.de/infos/waermewende-muenchen.html)
- Munich has a bylaw on sustainable heat supply, under which about two thirds of heat demand is to come from district heating. [secondary] — [Satzung nachhaltige Wärmeversorgung](https://stadt.muenchen.de/rathaus/stadtrecht/vorschrift/200/version1/0.html)

**Apartment buildings: WEG and tenants**
- Roof PV in a WEG counts as a structural change, and a simple majority of votes cast suffices. Only plug-in solar is privileged under §20(2) WEG. [secondary, vendor guides agree] — [photovoltaik.info](https://www.photovoltaik.info/pv-anlage-weg-genehmigung-baurecht/), [Haus und Grund](https://www.hausundgrund.de/steckersolargeraete)
- Costs: all owners pay by share if the change passed with more than two thirds of votes and half of all shares (unless costs are disproportionate), or if costs pay back in a reasonable period. Otherwise only those who approved pay. [primary] — [§21 WEG](https://www.gesetze-im-internet.de/woeigg/__21.html)
- Tenants have a parallel claim for plug-in solar under §554 BGB, subject to a balancing of interests. [secondary] — [Haus und Grund](https://www.hausundgrund.de/steckersolargeraete)
- §42b EnWG shared building supply: use in the same building without passing the grid, and no tenant electricity bonus for that power. A WEG resolution can replace the contract. Quarter-hourly values are required. [secondary, law text not read in full] — [Thüringer Energienetze](https://www.thueringer-energienetze.com/Content/Documents/Einspeisung/TEN-AR4-71_verb_Erklaerung_gemeinschaftl_Gebaeude.pdf), [§42b EnWG](https://lxgesetze.de/enwg/42b)
- A May 2026 open letter says few grid and metering operators enable it. [secondary, advocacy] — [abgeordnetenwatch](https://www.abgeordnetenwatch.de/profile/lina-seitzl/fragen-antworten/warum-duerfen-vnb/gmsb-geltende-gesetze-wie-42b-enwg-ggv-einfach-sanktions-und-straflos-ignorieren-und-sagen-sie)

### Inferences
Before offer, in order: who decides (sole owner, WEG, landlord), monument flag, grid operator's answer, meter cabinet photo, roof check, heat load calculation, grant eligibility.

- MaStR comes after commissioning, so it is a to-do item, not a blocker for the offer. The installer usually handles it.
- The monument check can be automated as a flag only. "No flag" does not prove "no permit", because "near a monument" is a judgement. A flag does not mean "no", because Bavaria's guidance is favourable on non-visible roof faces.
- An apartment-building user is often not the decision maker. The tool should say early: "this needs your owners' association", and output something they can bring to the meeting.
- In a building with no shared-supply model, roof PV can only serve common areas directly. Flat loads don't count until a model is chosen. So a "flats x Stromspiegel" self-use figure would be wrong without that step.

### Gaps
- No source on roof statics: load reserve, kg/m2, snow zone for Munich, or when an engineer is required. Treat as must-check, and research separately if the tool makes any claim.
- SWM's technical connection terms, processing times, and required documents were not read.
- Older manufacturer documents in search results give a 4.6 kVA limit per phase and central grid protection from 30 kVA. They predate the 2026 edition of VDE-AR-N 4105 and the exact page was not pinned down, so treat both as unverified.
- Whether §14a rules guarantee connection of a heat pump was not confirmed in a primary source.
- Heritage rules for outdoor heat pump units, and noise rules (TA Lärm, distance), were not researched.
- Bavarian monument data: no confirmed machine-readable service or licence.
- Mieterstrom conditions under EEG were not read.
- Whether Munich's heat bylaw creates any obligation for a given address was not read. Check it before recommending a heat pump in a district heating area.
- A heat plan map feed for the app was not found.
- Tenant consent for building-level PV: no source found.

## Cost of a wrong estimate

### Takeaway
Consumption errors mostly change payback by a modest amount, because roof size and feed-in soften them. The errors that really hurt are heat load, grant eligibility, feed-in regime, legal permission and hidden site costs, because they make the offer false rather than slightly off.

### Cited Findings
- HTW normalises design to kWp per MWh and usable kWh per MWh of yearly use, so consumption error passes straight into both ratios. [secondary, from a search summary, page not opened] — [HTW-based explainer](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_2_Studien_A_B_Grundlagen_PV-Speicher-HTW-LCOS_2026.pdf)
- Battery rule of thumb: 1 to 1.5 kWh usable per 1,000 kWh yearly use. [secondary] — [Augsburg Infoblatt 5](https://www.augsburg.de/fileadmin/user_upload/umwelt_soziales/umwelt/klima%20und%20energie/downloads_solaroffensive/Infoblatt_5_Unabh%C3%A4ngigkeit.pdf)
- Economics of PV with battery are mostly similar to PV without. The gain is mainly independence. [secondary] — [Augsburg Infoblatt 5](https://www.augsburg.de/fileadmin/user_upload/umwelt_soziales/umwelt/klima%20und%20energie/downloads_solaroffensive/Infoblatt_5_Unabh%C3%A4ngigkeit.pdf)
- HTW 2012, for a 4,700 kWh home: a 4 kWh battery with 5 kW PV doubles self-use from almost 30% to about 60%. [primary, old] — [HTW Berlin 2012](https://solar.htw-berlin.de/wp-content/uploads/WENIGER-2012-Solare-Unabhaengigkeitserklaerung.pdf)
- Battery cost 300 to 800 EUR per kWh. [secondary, weak] — [Utopia](https://utopia.de/ratgeber/photovoltaik-mit-speicher-lohnt-sich-das_702214)

### Inferences
All euro figures below are [own calc] illustrations from numbers above.

| Wrong input | Oversized | Undersized | Wrong payback | Severity |
|---|---|---|---|---|
| Electricity use too high (2,900 assumed, 2,000 real) | Battery about 1 kWh too large (2.9-4.4 instead of 2-3 kWh), about 300-1,100 EUR wasted | | Self-use overstated | Moderate |
| Electricity use too low | | Lost self-use, a battery can often be added later | Payback pessimistic | Mild |
| Price 37.3 instead of 32.44 ct | | | Value per self-used kWh about 20% high | Moderate |
| Feed-in 7.7 ct instead of draft 5.2 for 3 years, then market | PV exports valued too high, more so for large systems | | Payback too short | Harmful |
| Heat demand too high (old house, prebound) | Heat pump too large, cycling, lower efficiency, higher price | | Savings overstated | Harmful |
| Heat demand too low | | Backup heater runs, comfort complaints | Bills above forecast | Harmful |
| Speed bonus or income bonus assumed wrongly | | | On 28,000 EUR: 30% is 8,400, 70% is 19,600, a gap of 11,200 EUR | Harmful |
| Flats 6 instead of 12 | | | Grant cost cap 103,000 vs 151,000 EUR | Harmful for multi-family heat pumps |
| Contract signed without KfW condition | | | Grant lost entirely | Severe, and not fixable afterward |
| Monument missed | Project may be refused or redesigned | | All numbers void | Severe |
| WEG ignored | Offer cannot be accepted by that person | | All numbers void | Severe |
| Meter cabinet ignored | | | 1,500-3,500 EUR surprise | Moderate |
| EV ignored | | Battery and wallbox missed, cabinet load wrong | Self-use understated | Moderate |
| Flats' load counted with no sharing model | PV or battery sized for use it cannot reach | | Self-use strongly overstated | Harmful |

- Design rule: show a range wherever the error is moderate, and block the "final offer" state wherever it is harmful.
- A wrong PV size rarely fails badly when the roof limits it. Battery is the part most sensitive to consumption, so the tool should offer it as a choice, not as a certain gain, when there is no bill.
- Grant numbers should be labelled "up to", until the owner-occupier, income and heater questions are answered.

### Gaps
- No published payback sensitivity for German homes was found. The table is arithmetic, not measured. A sensitivity run in the project's engine would replace it.
- Liability of a homeowner tool for wrong estimates was not researched.
