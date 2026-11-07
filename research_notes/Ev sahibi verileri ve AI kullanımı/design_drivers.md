# What really determines a good residential PV, battery and heat pump design (Germany, Munich focus)

Research date: 7 November 2026. Source grading used below:

- **[P]** primary document opened and read (full text extracted, or the official page fetched).
- **[S]** secondary source (trade press, consumer guide, volunteer network, vendor).
- **[snippet]** seen only in a search result, page not opened. Treat as a lead, not a fact.

Calculations marked "own arithmetic" are mine, use only the cited inputs, and are illustrative. They are not findings of the sources.

## Overall ranking: which inputs change the design decision most

### Takeaway
For PV, the hard limit is usable roof, and the homeowner's goal and future loads then set how far toward that limit to go. Orientation, tilt and shading matter much less for sizing than their yield percentages suggest. For the battery, only two numbers set the size (PV size and electricity use). For the heat pump, the two decisive items are the current fuel use (for heat load) and the temperature the heating system really needs. Building year on its own says little; retrofit status says more. The largest open uncertainty is legal: the EEG rules for systems commissioned from 2027 were not law on 7 November 2026.

### Cited Findings
The ranking itself is my judgment (see Inferences). The evidence for each row is in the sections below.

| Rank | Input | Affects | Effect size | Can our tool know it? |
|---|---|---|---|---|
| 1 | Usable roof area, per face | PV | Hard cap. 5 to 7 m² per kWp | Yes, measured |
| 2 | Household goal | PV, battery | Same house: under 4.5 kW for high self-use, up to 9 kW for autarky, maximum roof for climate | Ask |
| 3 | Planned heat pump or EV | PV, battery | Can more than double electricity use | Ask |
| 4 | Fuel use plus boiler type and building standard | Heat pump | Sets heat load. Spread of about 2x if type and standard are unknown | Ask |
| 5 | Required flow temperature, radiator adequacy | Heat pump | The only factor that correlated with efficiency in the field test | Partly ask, mostly site visit |
| 6 | Annual electricity use | Battery, PV economics | Directly sets the battery upper limit | Ask |
| 7 | Feed-in regime at commissioning date | PV size, battery | 7.70 ct/kWh today; draft about 5.2 ct/kWh for 36 months from 2027 | Config value, not a question |
| 8 | District heating area (Munich) | Heat pump go/no-go | Can replace the heat pump option entirely | Address lookup |
| 9 | Orientation per face | Which faces to fill | E or W about -20%, N about -45%, but only about -10% in yearly value | Yes, measured |
| 10 | Budget and income | Battery, scope, subsidy | Heat pump grant ranges from 30% to 80% of up to 28,000 euros | Ask |
| 11 | Shading | Yield | 3 to 10% for year-round shade from neighbours | Yes, measured |
| 12 | Tilt | Yield | About 4 points across 20 to 50 degrees on a south roof | Yes, measured |
| 13 | Regional sun within Munich | Yield | Negligible inside one city | Yes, PVGIS |
| 14 | Building year alone | Heat pump efficiency | No correlation in a field sample of mostly retrofitted old buildings | Ask, but retrofit status is worth more |

### Inferences
- The tool already holds the items that matter less (orientation, tilt, shading). The biggest gains now come from questions, not from better roof data. This ranking is my synthesis. No source ranks these inputs side by side.
- Three inputs are chained: fuel use gives heat demand, heat demand gives heat pump electricity, and that electricity feeds the PV and battery sizing. One good fuel-use answer improves three designs.
- Inputs 7 and 8 should not be homeowner questions. They are a config value and an address lookup.

### Gaps
- I found no study that ranks all these inputs together. A sensitivity run on the project's own installer data would test this ranking better than any literature. It was out of scope here.

## PV sizing: is it driven by filling the roof or by demand?

### Takeaway
Both current German consumer guidance and the HTW study say to go larger than demand, up to the limits of roof and budget. That advice was formed under a 20-year fixed tariff. It holds for systems commissioned by 31 December 2026, but the 2027 draft weakens it for poor faces, so the engine should treat the tariff as a parameter.

### Cited Findings
**Roof versus demand**
- Verbraucherzentrale, page dated 26 August 2026: larger systems are usually more worthwhile. The limits are available roof area and budget. Small systems cost more per kWp because fixed costs barely depend on size. About 5 to 7 m² per kWp — [Verbraucherzentrale, planning article](https://www.verbraucherzentrale.de/wissen/energie/erneuerbare-energien/photovoltaik-was-bei-der-planung-einer-solaranlage-wichtig-ist-5574) [P]
- HTW Berlin (Bergner and Quaschning, v1.2, March 2019): systems sized only to the building's consumption do not reach the economic optimum, and in most cases the largest possible systems give the highest return and savings. Commissioned by Verbraucherzentrale NRW. It uses 2017-2018 prices, Bochum weather and EEG 2018 rules, so the direction holds but the numbers are dated — [HTW Kurzstudie](https://solar.htw-berlin.de/wp-content/uploads/HTW-Studie-Sinnvolle-Dimensionierung.pdf) [P]
- The same study's Table 1 shows that the target changes the size. Households of 3,000 (S), 4,500 (M) and 7,000 kWh/a (L, including 2,500 kWh EV): high self-use under 3, 4.5 and 7 kW; high autarky up to 6, 9 and 14 kW; maximum savings 10 kW or over 12 kW; climate protection maximum size — [HTW Kurzstudie](https://solar.htw-berlin.de/wp-content/uploads/HTW-Studie-Sinnvolle-Dimensionierung.pdf) [P]
- It can be sensible and economic to size PV above 1 kWp per 1,000 kWh of use if the roof allows, and to size for a future EV or heat pump from the start — [VZ Bremen brochure 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- 1 kWp per 1,000 kWh gives about 30% self-consumption and about 30% autarky. Adding 1 kWh of usable battery per 1,000 kWh raises them to about 60% and 55% — [VZ Bremen brochure 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Households reach 20 to 40% self-consumption without storage, depending on system size. Larger systems raise coverage of demand but lower the self-consumption share — [Fraunhofer ISE, Aktuelle Fakten, version 5 May 2026, municipal mirror](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]. A later version may exist: [Fraunhofer page](https://www.ise.fraunhofer.de/de/veroeffentlichungen/studien/aktuelle-fakten-zur-photovoltaik-in-deutschland.html) [snippet] gives conflicting dates (5 May and 20 August 2026).
- If expected self-consumption is under 20% of generation, full feed-in is usually more economic, and batteries make no sense on full feed-in systems — [VZ Bremen brochure 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]

**Orientation and tilt**
- South-east or south-west loses at most 5 to 10%. East or west loses 10 to 20% — [VZ Bremen brochure 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Fraunhofer's table (unshaded, Freiburg, percent of best case, read directly from Figure 33): at 30° tilt, south 99, south-west 93, west 79, east 81, north 56. Horizontal 84. At 45°, west is about 26% below south — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- Same table, tilt on a south roof: 20° gives 96, 30° gives 99, 40° gives 100, 50° gives 99, 60° gives 95. For a west roof: 20° gives 81, 30° gives 79, 40° gives 76. Flatter is better on east and west faces — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- Tilt below 25° or above 50° can cost up to 10% — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]; the national page says above 60° — [Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/energie/erneuerbare-energien/photovoltaik-was-bei-der-planung-einer-solaranlage-wichtig-ist-5574) [P]. The two disagree; Fraunhofer's table is the better reference.
- Whether to add an east or west face to a south face is a marginal-cost question: extra modules cost relatively little, and the later generation profile raises self-consumption potential — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- An east-west layout allows an inverter about 30% smaller without energy loss. In the 2019 study, the EV household was profitable with 3 kW split east-west, while the frugal household needed 13 kW or more — [HTW Kurzstudie](https://solar.htw-berlin.de/wp-content/uploads/HTW-Studie-Sinnvolle-Dimensionierung.pdf) [P]

**Shading**
- Year-round shade from neighbouring buildings or trees can cost 3 to 10%. Thin shadows from cables or antennas can cause strong power loss. Keep one module width from dormers. Total system losses can reach 25% — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]

**Prices and tariffs**
- Rooftop tariffs for commissioning 1 August to 31 December 2026: up to 10 kW, 7.70 ct/kWh partial and 12.22 full feed-in; 10 to 40 kW, 6.66 and 10.24. EEG 2023 applies until 31 December 2026 and a successor is in parliament — [Bundesnetzagentur](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/ErneuerbareEnergien/EEG_Foerderung/start.html) [P]
- 6.66 ct applies to the share above 10 kWp, so tariffs blend across bands — [Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/energie/erneuerbare-energien/photovoltaik-was-bei-der-planung-einer-solaranlage-wichtig-ist-5574) [P]
- Small rooftop PV generation cost is 6 to 14 ct/kWh. Operating cost is about 1 to 2% of investment per year — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- System prices: 1,200 to 1,800 euros per kWp net up to 10 kW — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]. A blog attributes 900 to 1,500 euros/kWp net to Fraunhofer for late 2025 — [solaranlage-tipps](https://www.solaranlage-tipps.de/blog/photovoltaik-statistik-deutschland-2026) [snippet]. I could not confirm that in the Fraunhofer text, where the price series is a chart.
- Household electricity: 37.2 ct/kWh gross including base price in 2026 for a 3,500 kWh household (BDEW via Fraunhofer) — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]; contrasted with about 30 ct gross — [Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/energie/erneuerbare-energien/photovoltaik-was-bei-der-planung-einer-solaranlage-wichtig-ist-5574) [P]. These differ.

**What changed recently (EEG)**
- From 2025, new systems of 2 kWp or more with a smart meter get no tariff while the exchange price is negative, with compensation by extending the 20-year term. Until a smart meter and control box are in place, new systems from 2 kWp are capped at 60% of module power. Smart meter mandatory above 7 kWp — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- As of 1 November 2026, nothing had passed the Bundestag. Cabinet draft (late July): no fixed tariff for small and medium rooftop systems from 2027, a 36-month transition payment and then direct marketing, and a feed-in cap of 50% of capacity that also covers storage and EVs at the connection point. An alternative under negotiation offers a choice including price-based curtailment with a market-based payment plus bonus, estimated at 7 to 9 ct/kWh. Vote planned for the second week of November, and EU approval is still needed. If nothing is agreed, the article says all EEG support models expire on 1 January — [t-online](https://www.t-online.de/finanzen/energie/id_101505866/einspeiseverguetung-wird-abgeschafft-eeg-kompromiss-ist-in-sicht.html) [S]
- Draft details: Bundestag printed paper 21/7867; transition payment about 5.2 ct/kWh; staged scope (under 50 kW in 2027, under 25 kW in 2028, under 7 kW in 2029/30); vote 9 to 13 November, Bundesrat 20 November — [netz-trends](https://www.netz-trends.de/einspeisevergu-tung-endet-2027-bundestag-stimmt-ab-9-november-ab-frist-31-dezember/) and [bauersolar](https://bauersolar.net/eeg-reform-2027-einspeiseverguetung/) [snippet]. Sources differ on the details.
- Systems commissioned by 31 December 2026 keep their tariff for the full term — [cleanthinking](https://www.cleanthinking.de/eeg-novelle-kleine-pv-anlagen/) [snippet]

### Inferences
- **Answer: for 2026 commissioning, fill the good faces and do not size to demand.** For 2027 onward the answer depends on a law not yet passed.
- Own arithmetic on the VZ example (5 kWp, 4,870 kWh/a, 4,000 kWh use, 1,344 kWh self-used, 37.2 ct and 7.70 ct): yearly value is 771 euros. A west roof with 21% less yield and unchanged self-use gives 693 euros, so **a 21% yield loss costs only about 10% of value**. This is because the self-used kWh are worth nearly five times the exported ones.
- Same base, other shifts: feed-in down to 5.2 ct costs 88 euros (11%). Electricity at 30 ct instead of 37.2 ct costs 97 euros (13%). Shading of 3 to 10% that falls on exported kWh costs 11 to 38 euros (1.5 to 5%).
- Feed-in at 5.2 to 7.7 ct sits at or below the low end of the 6 to 14 ct generation cost. So under the 2027 draft, exported kWh barely pay at average cost. Extra modules still pay only at marginal cost, or when self-used. An engine rule such as "fill south-ish faces, add east and west if marginal value is positive, skip north" fits this better than a flat "fill the roof".
- The 37.2 ct figure includes the base price, which PV does not save. The 30 ct value is likely closer to the true saving per kWh, so use a working price rather than an average price. This is my reading of the definitions.
- The maxima of 8, 10 and 20 kW in the 2019 study likely reflect old EEG thresholds and should not be reused.
- Our shading data is worth more for placing modules on a face than for sizing. Its effect on total value is small, but a face that loses most of its sun should be dropped. It also cannot see cables, antennas or small chimneys.

### Gaps
- No recent primary study repeats the HTW fill-the-roof analysis at 2026 prices and 2027 tariffs.
- The final EEG 2027 text is unknown. Re-check after the vote planned for the week of 9 November. I did not read Drucksache 21/7867 itself.
- The Fraunhofer orientation table is for Freiburg. Munich values should come from PVGIS, which the tool already has. No Munich-specific kWh/kWp was collected here.
- No primary figure was found for how much self-consumption rises on east-west compared with south. VZ says only that this must be checked per case.

## Battery sizing: which inputs matter, and what the HTW and Verbraucherzentrale rules say

### Takeaway
Size is set by two numbers: annual electricity use and PV size. HTW gives upper limits rather than targets, and warns that the popular "1 kWh per kWp" rule oversizes. An EV or heat pump raises the size much less than it raises consumption, and about 10 kWh is usually enough.

### Cited Findings
- HTW rules (Orth, Weniger, Meissner, 2022): (1) install a battery only if the PV is at least 0.5 kW per 1,000 kWh/a of use; (2) usable capacity at most 1.5 kWh per kW of PV; (3) usable capacity at most 1.5 kWh per 1,000 kWh/a, which roughly equals average night-time use. Example: 10 kW PV with 4,000 kWh/a gives at most 6 kWh; with 8,000 kWh/a at most 12 kWh — [HTW authors, Sonnenenergie 2/2022](https://solar.htw-berlin.de/wp-content/uploads/ORTH-2022-Empfehlungen-zur-Auslegung-von-Solarstromspeichern.pdf) [P]
- HTW says the common "1 kWh per kW PV" advice and ranges of 0.9 to 1.6 kWh/kW often lead to clear oversizing. Beyond the limit, autarky rises only slightly — [same](https://solar.htw-berlin.de/wp-content/uploads/ORTH-2022-Empfehlungen-zur-Auslegung-von-Solarstromspeichern.pdf) [P]
- HTW names three cases where a larger battery can make technical sense: backup power reserve, a future heat pump, and a future EV. A heat pump draws mainly in winter; for an EV, presence and charging times decide — [Stromspeicher-Inspektion 2022](https://solar.htw-berlin.de/wp-content/uploads/HTW-Stromspeicher-Inspektion-2022.pdf) [P]
- System efficiency can matter more than capacity. With 10 kW PV and 9,364 kWh/a (heat pump plus EV), a lossless 10 kWh battery gives 57% autarky. Real systems lost 1.5 to 5.1 percentage points, and one efficient system beat a less efficient one nearly 3 kWh larger — [HTW authors 2022](https://solar.htw-berlin.de/wp-content/uploads/ORTH-2022-Empfehlungen-zur-Auslegung-von-Solarstromspeichern.pdf) [P]
- EV study, 40 real profiles: batteries of 3 to 4 kW and about 10 kWh are often sufficient even with an EV. Charging patterns vary widely (commuter car versus second car). The article does not quantify the change against a household without an EV — [HTW, pv magazine 2018](https://solar.htw-berlin.de/publikationen/speicherauslegung-elektromobilitaet/) [P]
- Verbraucherzentrale rule: about 1 kWh per 1,000 kWh of use. More can hurt the battery's performance and the economics, while PV may be sized larger. Batteries are "at the edge of economic viability" and can pay in individual cases. Cost 400 to 800 euros per usable kWh net including installation — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Fraunhofer is more positive: batteries are now so cheap that a battery should always be examined when planning PV of any size, and households can typically double self-consumption — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- VZ example: 5 kWp, 4,000 kWh, 5 kWh usable battery lifts self-use from 1,344 kWh (28%) to 2,719 kWh (56%) — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- The 2019 HTW study found batteries worsened returns. Battery prices have fallen a lot since, so this no longer describes the market — [HTW Kurzstudie](https://solar.htw-berlin.de/wp-content/uploads/HTW-Studie-Sinnvolle-Dimensionierung.pdf) [P]
- Field data, heat pump homes with PV (three sites each): without battery 25 to 40% autarky and 22 to 37% self-use; with battery 32 to 62% and 40 to 83%. The largest benefit is in spring and autumn — [Fraunhofer ISE WP-QS final report](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/projekte/WP-QS_Schlussbericht.pdf) [P]
- Market battery prices vary widely, from about 270 to 1,600 euros/kWh, because vendors mix device and installed prices — [reduco](https://reduco.ai/blog/stromspeicher-kosten-vergleich-2026), [enpal](https://www.enpal.de/stromspeicher/kosten) [snippet, vendor]. Not reliable.
- Vendor add-ons for heat pump and EV (3 to 4 kWh each, or 12 to 23 kWh in total) are not supported by HTW — [reduco](https://reduco.ai/blog/solar/stromspeicher-groesse-waermepumpe-eauto) [snippet, vendor]

### Inferences
- A direct engine rule: `if kWp >= 0.5 x MWh: usable_kWh <= min(1.5 x kWp, 1.5 x MWh)`, with the VZ value of 1.0 x MWh as the default target. Round to real product sizes.
- Heat pump electricity falls mainly in winter, when PV has little surplus, and EV charging depends on presence. So feeding their full consumption into rule 3 likely oversizes. Using household use plus only a part of these loads is safer. The fraction is my judgment and is not sourced.
- Own arithmetic on the VZ example: the 5 kWh battery shifts 1,375 kWh a year, worth 307 to 406 euros at 30 to 37.2 ct. At 400 to 800 euros per kWh, cost is 2,000 to 4,000 euros, so simple payback is about 5 to 13 years. A lower feed-in in 2027 adds about 34 euros a year.
- The 2027 draft's 50% feed-in cap, if passed, would favour batteries and load shifting. This follows from the draft and is not a stated source finding.
- Load profile matters mainly as "at home in the day or not" and "second car or commuter car". Detailed profiles add little beyond that. Battery size and PV size are the planners' levers, and backup power is the one goal that justifies going above the limit.

### Gaps
- HTW's 2021 Inspektion has the heat pump and EV autarky analysis. I did not read it, so no HTW number exists here for how much those loads shift the optimum.
- I found no independent 2026 battery price series. The VZ figure of 400 to 800 euros is from late 2025.
- Dynamic tariffs and grid arbitrage were not covered. The search returned nothing usable.
- The HTW Unabhängigkeitsrechner page confirms its inputs are annual use, PV size and usable capacity, which supports this ranking, but the page gives no rules of thumb — [HTW rechner](https://solar.htw-berlin.de/rechner/unabhaengigkeitsrechner/) [P]. Its Solarisator tool covers heat pump and EV and was not examined.

## Heat pumps: essential inputs and what fuel use can give us

### Takeaway
Fuel use gives a usable first estimate of heat load, annual heat demand and future electricity use. Boiler type and building standard must come with it, or the estimate spreads by about 2x. In the field data, efficiency tracked the heating circuit temperature rather than building age, so "what temperature does the house really need?" is the key question.

### Cited Findings
**Field evidence**
- Fraunhofer ISE WP-QS: 77 heat pumps in existing one- to three-family homes, main evaluation year 2024. Air-source seasonal performance (JAZ) averages 3.4 (range 2.6 to 4.9), up from 3.1 in the earlier project. Ground-source averages 4.3 (3.6 to 5.4) — [Fraunhofer ISE press release, 3 November 2025](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/presseinformationen/2025/3025_ISE_PI_Waermepumpen-heizen-auch-im-Altbau-klimafreundlich.pdf) [P]
- Efficiency correlated only with heating circuit temperatures. Temperatures were similar across all building ages, so no link between efficiency and building age was found. Adequately sized radiators can run at similarly low temperatures as underfloor heating. 81% of delivered heat went to space heating and 19% to hot water — [WP-QS final report](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/projekte/WP-QS_Schlussbericht.pdf) [P]
- Limits of this evidence: the study period was slightly warmer than the long-term mean, and temperatures below -5 °C were rare. 58% of buildings date to 1978 or earlier, but these were already well retrofitted: 95% of windows, 82% of roofs, 56% of outer walls and 28% of basement ceilings, against a national 2016 rate for pre-1979 buildings of 59% for roofs, 35% for walls and 16% for basement ceilings. So the sample is better insulated than the average old building â [WP-QS final report](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/projekte/WP-QS_Schlussbericht.pdf) [P]
- Electric heater use was about 1.3% of electricity. Larger units run in shorter cycles, but sizing was not the deciding factor in any system with very frequent switching. Other factors had more effect — [WP-QS final report](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/projekte/WP-QS_Schlussbericht.pdf) [P]. A blog says many systems were oversized — [search summary of secondary sites, including reduco](https://reduco.ai/blog/heizung/waermepumpe-ohne-daemmung) [snippet]; I did not confirm that wording in the report.
- PV-optimised operation lifted self-use clearly and lowered JAZ by about 6% for hot water and 4% for heating, a small loss against the cost benefit — [WP-QS final report](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/projekte/WP-QS_Schlussbericht.pdf) [P]

**Deriving from fuel use (method guide, volunteer network, March 2026, based on VDI 4645 and 4650)**
- Method: average 2 to 3 years of fuel; convert (oil litres x 10, gas m³ x 11 kWh); multiply by boiler efficiency; divide by full-load hours. This is a plausibility check, not a replacement for DIN EN 12831 — [BNS Worms, Praxisleitfaden](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxisleitfaden-im-Einfamilienhaus.pdf) [S]
- Boiler efficiency: old standard or low-temperature boiler 0.70 to 0.80; condensing about 0.90 to 0.95 — [BNS Worms](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxistipps-zur-Auslegung.pdf) [S]
- Full-load hours and typical heat load by standard — [BNS Worms, Praxisleitfaden](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxisleitfaden-im-Einfamilienhaus.pdf) [S]:

| Standard | kWh/m²a | Full-load h/a | W/m² |
|---|---|---|---|
| KfW-40, new build | 40 to 50 | 900 to 1,200 | 20 to 30 |
| Retrofitted old building | 70 to 90 | 1,300 to 1,600 | 40 to 55 |
| Partly retrofitted | 100 to 130 | 1,500 to 1,800 | 60 to 80 |
| Unretrofitted old building | 150 to 220+ | 1,800 to 2,200 | 90 to 130 |

- A vendor uses 1,800 to 2,000 hours and subtracts about 700 kWh per person for hot water first — [Greenox](https://www.greenox-group.de/waermepumpe-dimensionieren-gasverbrauch/) [snippet, vendor]. BNS's example has about 2,000 kWh of hot water heat a year for 4 people, which is lower.
- Radiators at lower temperature (relative to 75/65/20): 70/55 gives 0.85 to 0.90; 55/45 gives 0.55 to 0.65; 50/40 gives 0.45 to 0.55. Often it is enough to replace single radiators with larger ones — [BNS Worms, Praxisleitfaden](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxisleitfaden-im-Einfamilienhaus.pdf) [S]
- Target 55 °C or below — [Vaillant](https://vaillant.de/fachpartnernet/startseite/elektro/waermepumpen-unterlagen/a4-wp-beratungsleitfaden-ansicht-2883912.pdf) [snippet, manufacturer]
- Efficiency by flow temperature, device-level: 35 °C gives 4.5 to 5.0; 45 °C gives 4.0 to 4.5; 55 °C gives 3.3 to 3.9 — [BNS Worms](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxisleitfaden-im-Einfamilienhaus.pdf) [S]. These are above the measured field average of 3.4, so use field values for electricity estimates.

**Law and funding (changed in 2026)**
- The building law (GModG, formerly GEG) passed the Bundestag on 10 July 2026 and was published on 28 July — [BMWE information](https://berkenthin-amt.de/wp-content/uploads/2026/07/BMWE-informiert-ueber-Beschluss-Gebaeude-Modernisierungsgesetz.pdf), [Gleiss Lutz](https://www.gleisslutz.com/en/node/20876) [snippet]. The 65% renewable rule is reported dropped — [baukostenplan, secondary only](https://baukostenplan.de/ratgeber/waermepumpe-kosten-foerderung-2026-kfw-458) [snippet]
- KfW 458 from 21 July 2026: 30% base grant; 16% speed bonus for owner-occupiers replacing an eligible old heating system, falling 4 points on 1 February 2027 and every six months, ending for applications from 1 August 2028; income bonus up to 40%; eligible costs up to 28,000 euros for a single-family home, falling 750 euros per half-year from 1 February 2027; hydraulic balancing required — [KfW 458 page](https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Heizungsf%C3%B6rderung-f%C3%BCr-Privatpersonen-Wohngeb%C3%A4ude-(458)/) [P]
- Stricter noise requirement for air units since January 2026 (10 dB below EU limit) — [search summary across funding guides](https://www.enerix.de/ratgeber/foerderung-waermepumpe/) [snippet]. The KfW page itself gives no number.

**Munich**
- The city classifies areas as district heating densification, district heating expansion, heat network investigation, and decentral supply (groundwater heat pumps, ground collectors, air heat pumps). The map is usually updated yearly — [Stadt München, Wärmewende](https://stadt.muenchen.de/infos/waermewende-muenchen.html) [snippet]; [SWM](https://www.swm.de/energieloesungen/kommunale-waermeplanung) [snippet]
- Not all households will be connected to district heating, and some districts will only be reached in the long term — same sources [snippet]. A council document points to a new heat plan publication in November 2026 [snippet, document not identified].

### Inferences
- Essential inputs in order: fuel use over 2 to 3 years; boiler type; building standard or what has been retrofitted; heated area (as a cross-check); heating surfaces (radiators, underfloor, mixed); current flow temperature in cold weather; number of people.
- Own arithmetic, 20,000 kWh gas: with boiler type and standard unknown, heat load ranges from 6.4 kW (0.70, 2,200 h) to 12.7 kW (0.95, 1,500 h), about 2x. With a condensing boiler at 0.90 and 1,650 h it is about 10.9 kW. If 19% is hot water and is removed first, about 8.8 kW. Sources differ on whether to subtract hot water, and this choice alone moves the answer by about 20%, so the engine should state which it uses.
- Same case, electricity use: 18,000 kWh of heat at JAZ 3.4 is about 5,300 kWh a year. This more than doubles a 4,000 kWh household and is what feeds PV and battery sizing.
- A strong homeowner proxy for temperature need: "How hot does your boiler run on the coldest days?" or "Do all rooms stay warm when the flow temperature is turned down?". This is my suggestion. The test idea is common in guides but I did not trace a primary source.
- Building year should only be a fallback for missing fuel data, and retrofit status tells us more. The "no link to building age" result comes from a sample of already well-retrofitted old buildings, so it does not prove that an unretrofitted old house would do equally well. It shows that temperature, not age itself, is the driver.
- With the 65% rule gone, the heat pump is a choice driven by goals and economics rather than by compliance. The KfW grant is what still shapes timing, because the speed bonus drops on 1 February 2027.
- Munich: check the address against the heat plan first. In a district heating densification area the honest answer may be "compare with district heating", which an expert planner would say.

### Gaps
- BWP and dena primary guidance was not retrieved within the research budget. The fuel-to-load method here comes from a volunteer guide based on VDI, which should be treated as secondary.
- The Munich design outdoor temperature (DIN/TS 12831-1) was not verified. It is needed to set the design point.
- The current KfW Merkblatt 07/2026 PDF was not read, so income tier details come from a fetched summary of the KfW page.
- GModG details beyond the 65% rule (green gas quota, "Biotreppe" from 2029) were not verified.
- Which Munich areas fall in which class needs the city's map itself. Nothing here says how many homes are affected.

## EV and wallbox: what information matters

### Takeaway
The wallbox itself is close to a standard product (11 kW). What matters is the EV's yearly energy and when the car is at home, because that changes PV and battery value. Cable path and meter cabinet are site-visit items.

### Cited Findings
- 3 kWp at 950 kWh/kWp covers over 15,000 km a year on balance, with 15% charging losses — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- HTW used 2,500 kWh/a for its EV household. The EV household was the most robust case in the study, profitable even with a small east-west system — [HTW Kurzstudie](https://solar.htw-berlin.de/wp-content/uploads/HTW-Studie-Sinnvolle-Dimensionierung.pdf) [P]
- Daily driving, distance, and commuter versus second-car use drive charging patterns. Distance and battery capacity set the energy need — [HTW 2018](https://solar.htw-berlin.de/publikationen/speicherauslegung-elektromobilitaet/) [P]
- Up to 11 kW needs notification; above that, the grid operator's approval is needed — [Vattenfall](https://www.vattenfall.de/infowelt-energie/wallbox-anmelden) [snippet]. Thresholds are also stated as 12 kVA under NAV §19 — [search summary of vendor pages](https://reduco.ai/blog/solar/wallbox-anmelden-netzbetreiber) [snippet]
- §14a EnWG: private charging points and heat pumps above 4.2 kW grid draw are controllable. BNetzA ruling BK6-22-300 sets this, mandatory for systems commissioned after 1 January 2024. Control reduces draw, with at least 4.2 kW remaining. Modul 1 is a flat fee reduction; Modul 2 lowers the working price and needs separate metering — [EMA Energiewelt, Munich installer guide, 22 September 2026](https://ema-energiewelt.de/wissen/zaehlerschrank-erneuern-waermepumpe-wallbox-muenchen-2026) [S]
- The operator cannot refuse connection because of grid overload — [emobility.energy](https://www.emobility.energy/e-auto-magazin/14a-enwg-wallbox-regelung) [snippet]

### Inferences
- Own arithmetic: the Fraunhofer figures imply about 19 kWh per 100 km including charging losses (3 x 950 kWh over 15,000 km). So `km per year x 0.19` is a usable default.
- Questions that matter: do you have or plan an EV; yearly km; is the car at home in the daytime; do you have a private parking spot. The first three shape PV and battery value, and the last decides if a wallbox is possible.
- The 11 kW choice barely varies. Offering 22 kW adds an approval step with little benefit at home. This is my judgment, as no source compares them for homes.
- A wallbox and a heat pump both trigger §14a, so they should be planned with the meter cabinet in one step.

### Gaps
- PV-surplus charging: no primary data on the share of charging a household can shift. HTW's 2018 article describes patterns but not a usable percentage.
- Rules for shared garages and flats (WEG) were not researched.
- Whether a wallbox must be entered in the Marktstammdatenregister: sources conflict [snippet level].

## Household goals, budget and financing: how much do they change the design?

### Takeaway
Goals change the design more than most technical inputs: on the same house, PV size can vary by a factor of more than two. Budget mostly decides scope and whether a battery is included. Financing has weak direct evidence; for the heat pump, income can move the grant by thousands of euros.

### Cited Findings
- Goal effect on PV size (household of 4,500 kWh): high self-use under 4.5 kW, high autarky up to 9 kW, maximum savings 10 kW or above 12 kW, climate maximum size — [HTW Kurzstudie](https://solar.htw-berlin.de/wp-content/uploads/HTW-Studie-Sinnvolle-Dimensionierung.pdf) [P]
- From an ecological point of view it does not matter if power is exported or self-used — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Backup power can justify a larger battery with a reserve — [HTW 2022](https://solar.htw-berlin.de/wp-content/uploads/HTW-Stromspeicher-Inspektion-2022.pdf) [P]
- Budget and roof area are the two named limits for PV size — [Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/energie/erneuerbare-energien/photovoltaik-was-bei-der-planung-einer-solaranlage-wichtig-ist-5574) [P]
- Batteries can pay with low return expectations, or if strong power price rises are expected — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Fraunhofer's generation cost estimate assumes a 4% interest rate, 20 years and 1% yearly running costs — [Fraunhofer ISE, Aktuelle Fakten](https://www.ottobrunn.de/fileadmin/Dateien/Energie-Klimaschutz/aktuelle-fakten-zur-photovoltaik-in-deutschland_Mai_2026.pdf) [P]
- KfW income bonus by taxable household income: up to 30,000 euros 40%; 30,001 to 40,000 euros 30% (40% with a child under 18); 40,001 to 50,000 euros 10% (30% with child); 50,001 to 60,000 euros none (10% with child). Total capped at 70%, or 80% at the lowest incomes. Leasing, rental and contracting rates can count as eligible cost for up to 10 years — [KfW 458 page](https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Heizungsf%C3%B6rderung-f%C3%BCr-Privatpersonen-Wohngeb%C3%A4ude-(458)/) [P]; leasing point from [KfW search result](https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-(Inlandsf%C3%B6rderung)/PDF-Dokumente/6000005131_M_458.pdf) [snippet]
- Landlords get the base grant only — [enerix](https://www.enerix.de/ratgeber/foerderung-waermepumpe/) [snippet]

### Inferences
- Own arithmetic on the 28,000 euro cap: landlord 8,400 euros (30%); owner-occupier with speed bonus 12,880 euros (46%); with income bonus up to 19,600 euros (70%) or 22,400 euros (80%). So a single income band question can move the grant by up to about 9,500 euros.
- One goal question is enough, with about three options: lowest cost, most independence, most climate benefit. Backup power can be a yes/no add-on. Each option maps to a clear engine rule: size to self-use, size to autarky limit, or fill the roof.
- Budget should act as a constraint after the design: propose the best design, then show what drops first. The battery is the natural first item to drop, since it can be added later and VZ calls its economics marginal.
- Ask about owner-occupancy because it decides both bonuses. Income can be a band and should stay optional, because it is sensitive.

### Gaps
- I found no study quantifying how financing (cash, loan, leasing) changes the chosen system. The current KfW loan terms for PV and batteries were not researched.
- No data was found on how German homeowners actually split across goals. The project's own installer data may show this.

## What only a site visit can establish

### Takeaway
The tool should mark these as open checks rather than guess. Meter cabinet, roof structure and the real heating system decide feasibility and add cost, but a homeowner cannot judge them. A photo of the meter cabinet and the heating system may reduce the risk before a visit.

### Cited Findings
- Roof: a stable, asbestos-free covering is a basic condition. Roof structure and covering must be assessed, and statics must hold under wind and snow load with the added weight — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Small shading objects (cables, antennas) and clearance from dormers need an on-site look — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Meter cabinet: if the installation at the meter must be renewed, expect about 2,000 to 3,500 euros extra — [VZ Bremen 2025](https://www.verbraucherzentrale-bremen.de/sites/default/files/2025-11/vzbremen_photovoltaik_2025_final_druck.pdf) [P]
- Triggers for a new cabinet: no room for control equipment, a second meter space for Modul 2, or an installation that no longer meets current rules. For very old systems a rebuild may be cheaper than an extension. The electrician decides after reviewing it. Only the grid operator or a registered installer may work at the meter. Plan heat pump and wallbox together to avoid rebuilding twice — [EMA Energiewelt, Munich](https://ema-energiewelt.de/wissen/zaehlerschrank-erneuern-waermepumpe-wallbox-muenchen-2026) [S]
- Munich grid: SWM Infrastruktur inside the city, based on TAB 2023; Bayernwerk Netz in many surrounding municipalities. The address decides the operator — [EMA Energiewelt](https://ema-energiewelt.de/wissen/zaehlerschrank-erneuern-waermepumpe-wallbox-muenchen-2026) [S]
- Heat pump: planning and funding need a room-by-room heat load calculation to DIN EN 12831 — [BNS Worms](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxistipps-zur-Auslegung.pdf) [S]. This source still refers to BAFA, though funding has moved to KfW, so check the current KfW rule.
- Heat pump checklist items: radiators per room, noise and distance for the outdoor unit, existing heating system data — [BNS Worms, Praxisleitfaden](https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxisleitfaden-im-Einfamilienhaus.pdf) [S]
- Hydraulic faults must be avoided and installer training is recommended, and hydraulic balancing is required for KfW funding — [WP-QS final report](https://www.ise.fraunhofer.de/content/dam/ise/de/documents/projekte/WP-QS_Schlussbericht.pdf) [P]; [KfW 458](https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Heizungsf%C3%B6rderung-f%C3%BCr-Privatpersonen-Wohngeb%C3%A4ude-(458)/) [P]
- Batteries should not stand in cellars in flood-risk areas — [Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/energie/erneuerbare-energien/photovoltaik-was-bei-der-planung-einer-solaranlage-wichtig-ist-5574) [P]

### Inferences
Proposed split for the tool (my synthesis):

| Item | Tool can state | Site visit must confirm | Design risk |
|---|---|---|---|
| Roof condition, asbestos, statics | Ask roof age and covering | Rafters, fixings, load | Can stop PV or force re-roofing first |
| Meter cabinet | Ask age or a photo, add a 2,000 to 3,500 euro risk item | Space, rules, meter positions | Added cost, rarely stops the project |
| Grid connection | Name the operator from the address | Capacity with PV, heat pump and EV together | Delay, possible curtailment |
| Radiators and flow temperature | Estimate from the answers | Room-by-room heat load | Some radiators to replace, higher running cost |
| Outdoor unit location, noise | Flag small plots and tight spacing | Placement, distance to neighbours | Can force another position or source |
| Cable routes, battery and inverter location | Nothing reliable | Space, routes, flood risk | Cost |
| Small shading objects | Nothing, as measured data misses them | Module layout | Small yield loss |

- The first row is the only one that can stop PV outright, so the roof-age question is worth asking early.
- A re-roof planned within the next few years changes timing, since modules would have to come off again. This is common planner logic, but I have no source for it.

### Gaps
- No primary source was retrieved for TAB 2023 details, SWM Infrastruktur capacity checks, or how often grid capacity limits home systems in Munich.
- Monument protection and ensemble rules in Munich were not researched and can block or restrict PV.
- Bavarian distance and noise rules for outdoor units were not researched.
- A Munich grant of up to 1,000 euros for cabinet replacement linked to PV appeared in search results only. I could not attribute it to a specific page, so confirm with the city before use.
- No statistics were found on how often a site visit changes the proposed design. This could be tested against the project's own data, comparing first offers with final designs.
