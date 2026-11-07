# Where AI helps and harms in a homeowner-facing solar, battery and heat pump tool

Evidence tags used below:
- **[Measured]**: a peer-reviewed paper or a reproducible public benchmark.
- **[Vendor]**: a company's own claim, with no independent check.
- **[Snippet]**: read only through a search summary. The full text could not be opened (403 or bot wall), so check it before quoting it in the pitch.
- **[Unverified]**: from my memory or a weak source. Do not quote without checking.

Research date: 7 November 2026. Legal points are research notes, not legal advice.

## Accuracy evidence: bills, roof obstacles, arithmetic and technical advice

### Takeaway
Reading a printed bill is the most reliable candidate, but no independent benchmark exists for German electricity bills, and a user check is still needed. Roof obstacle detection is the weakest candidate. Even trained models at 7 to 10 cm per pixel only reach about 0.37 to 0.44 mean IoU, and human labellers agree only about 0.48. Project imagery at 20 cm is coarser than all of these. Language models make procedural slips in multi-step calculation, which supports the project rule that the engine produces every number.

### Cited Findings

**Bill and document extraction**
- A benchmark of eight multimodal models (GPT-5, Gemini 2.5, Gemma 3) on three open invoice datasets, zero-shot, found that native image input generally beats converting to markdown first, and that performance varies by model and document type. **[Measured, abstract only: I did not get the numbers]** — [arXiv 2509.04469](https://arxiv.org/abs/2509.04469)
- That benchmark's authors note the public invoice datasets may have been seen in training, which could inflate scores. **[Snippet]** — [Pith summary](https://pith.science/paper/2509.04469)
- Vendor blogs claim 97 to 99% field accuracy on standard invoices, or over 95% standard and over 90% complex, without reproducible method. **[Vendor]** — [Invoice OCR guide](https://invoicedataextraction.com/blog/invoice-ocr-accuracy-developer-guide); [Kunavo](https://kunavo.com/guides/invoice-data-extraction-api)
- One vendor benchmark defines hallucination as a returned value found nowhere in the document, and reports 3.8% for LLaMA 3.2-Vision, plus 88.7% per-row line-item accuracy for GPT-4V. These are older models, and the source sells a competing product. **[Vendor]** — [DataUnchain](https://dataunchain.com/en/llm-document-extraction-benchmark/)
- A single-vendor beta on about 4,800 invoices reports 95 to 97% on critical fields but 88 to 92% on line items, and says the result does not generalise. **[Vendor]** — [Invoox](https://invoox.io/en/blog/ai-vision-invoice-extraction-accuracy/)
- A small GitHub test reports 99.3% field accuracy on 51 invoices, but its ground truth was "Claude-verified", so the check is partly circular. **[Weak]** — [GitHub](https://github.com/GyanendraChaubey/invoice-extraction-vlm-vs-ocr)
- Practitioner advice: allow null for optional fields, because forcing a value forces a hallucination, and check that items sum to the total. **[Practitioner]** — [Vision LLM guide](https://invoicedataextraction.com/blog/vision-llm-invoice-extraction-nodejs)
- Anthropic says Claude may hallucinate on low-quality, rotated or very small images (under 200 pixels), and tells users to verify results in high-stakes uses. — [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)

**Roof obstacles from aerial imagery**
- RID dataset: Wartenberg in Bavaria, about 2,000 buildings, 10 cm per pixel, 12,359 superstructure polygons, classes include PV module, dormer, window, ladder, chimney, tree, shadow. The best network reached mean IoU 0.44, against annotator agreement of 0.48. Annotator agreement ranged from 0.15 to 0.70 by class. PV module annotations were the most consistent (mean IoU 0.68, median 0.82). **[Measured, Snippet]** — [RID paper, MDPI](https://www.mdpi.com/2072-4292/14/10/2299); [RID repository](https://github.com/TUMFTM/RID)
- RID authors call superstructure labelling hard because the objects are small and their boundaries ambiguous. **[Snippet]** — [RID paper](https://www.mdpi.com/2072-4292/14/10/2299)
- Geneva study: about 35,000 buildings, U-Net with ResNet-152, IoU 0.40 for superstructures. Removing obstructed roof segments cut estimated solar potential by 43%. I could not confirm the image resolution. **[Measured, Snippet]** — [Renewable Energy 2025](https://www.sciencedirect.com/science/article/abs/pii/S0960148125007505)
- Swiss STDL rooftops project: 6.8 cm true orthophotos plus LiDAR. Image segmentation on the test set scored precision 0.75, recall 0.71, F1 0.73, mIoU 0.37, with about 40% relative error on occupied area. A simpler per-roof-plane "occupied or free" classifier got about 85% right, with expert satisfaction of 83 to 86%. The report says results "are indications that need to be verified by an expert". **[Measured, public report]** — [STDL PROJ-ROOFTOPS](https://tech.stdl.ch/PROJ-ROOFTOPS/)
- Zero-shot open-vocabulary detectors on aerial data: best model (OWLv2) F1 27.6%, recall 24.7%, YOLO-family under 4% F1. This covers open-vocabulary detectors, not chat models. **[Measured]** — [arXiv 2601.22164](https://arxiv.org/html/2601.22164v1)
- Anthropic: Claude's localisation outputs are approximate and must be verified, counts are approximate especially with many small objects, and it should not be used for tasks needing perfect precision without human oversight. Claude reads images in 28×28-pixel patches. — [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- I found no benchmark of GPT, Gemini or Claude on finding chimneys or roof windows in aerial photos.

**Google Solar API, Aurora**
- Google's Satellite Sunroof research paper reports about 1 m DSM error on buildings, about 5 degrees roof pitch error and about 56% IoU on roof segments. These describe the paper's models, not the commercial API, and the paper lists roof obstacle detection as future work. **[Measured by Google, Snippet]** — [arXiv 2408.14400](https://arxiv.org/html/2408.14400v2)
- Solar API release notes list medium-quality coverage expansion to Germany in September 2025, and responses carry an imagery quality tag. — [Solar API release notes](https://developers.google.com/maps/documentation/solar/release-notes?authuser=9)
- Press coverage said the API accounts for chimneys and tall trees, which sits awkwardly with the paper calling obstacle detection future work. The two are not reconciled by any source I found. — [winfuture](https://winfuture.de/news,138191.html); [arXiv 2408.14400](https://arxiv.org/html/2408.14400v2)
- Aurora ran 4,000 US homes and reports results "essentially tied, if not slightly better" than human models. The three metrics are not named on the summary page, and the benchmark is against its own designers' models. **[Vendor]** — [Aurora AI white paper](https://resources.aurorasolar.com/ai-whitepaper/executive-summary)
- The Aurora study only included places with LIDAR and HD imagery, and Aurora says accuracy drops by around 20% on standard-resolution imagery. Its "25% more accurate obstruction detection" is a relative gain with no absolute figure. **[Vendor, Snippet]** — [Aurora methodology](https://resources.aurorasolar.com/ai-whitepaper/methodology)
- The "98% obstruction accuracy" figure on a directory site has no cited study. Do not use it. **[Unverified]** — [findailist](https://findailist.com/tools/aurora-solar-ai)
- The NREL "2 degrees, six inches" validation traces only to Aurora's own text. I did not find NREL's report. **[Vendor]** — [Aurora blog](https://aurorasolar.com/?p=813)

**Arithmetic and technical advice**
- A 2026 study of 15 models over 55,000 examples finds accuracy falls as the procedure gets longer. **[Measured, Snippet]** — [arXiv 2605.00817](https://arxiv.org/html/2605.00817)
- ORCA, built from real calculator-style problems in finance, physics and health: rounding or precision issues (34.7%) and calculation errors (33.4%) were the most common failure types. **[Measured, Snippet]** — [ORCA](https://arxiv.org/pdf/2511.02589)
- A 2025 step-level study of GPT-4o, o1, DeepSeek-V3 and R1 found procedural slips most common, while o1 was perfect at multiplying two 5-digit numbers. So the problem is long procedures more than single sums. **[Measured, Snippet]** — [AIME-Con 2025](https://aclanthology.org/2025.aimecon-main.45.pdf)
- A 2026 Journal of Financial Planning study, as reported by CNBC, says AI programs can give inconsistent, inaccurate or biased personal finance recommendations. **[Secondary]** — [CNBC](https://www.cnbc.com/2026/07/07/ai-personal-finance-advice.html)

### Inferences
- **Pixel arithmetic at 20 cm.** A 40 cm chimney is about 2×2 pixels. A typical roof window (about 80×120 cm, a size I am assuming) is about 4×6 pixels. A 28-pixel Claude patch covers 5.6 m of ground at native scale. Upscaling makes the patch smaller but adds no information. Published work needed 7 to 10 cm to reach 0.37 to 0.44 mIoU, so 20 cm should do worse. This is my reasoning, as no paper gives a 20 cm figure.
- Existing PV arrays are the exception: they are large, regular, and the most consistent class in RID. "Is there already a PV array on this plane?" is a feasible question. "Where is every chimney?" is not.
- The STDL contrast matters: the coarse question (is this plane occupied?) reached about 85%, while pixel outlines had about 40% area error. Ask coarse questions.
- Bill risks are about meaning, not reading. These come from domain knowledge, not a source: the bill can show forecast and actual consumption, a billing period that is not 12 months, separate heat pump or day and night meters, and monthly instalments near the kWh figures. A model can read every digit correctly and still pick the wrong one.
- Reading a bill does not break the project rule, in my reading: it copies a user fact that the user confirms, and the engine still does the design. Annualising to 12 months must happen in the engine, not the model.
- Estimating consumption should not be a language model task. It is a number that feeds the design and has no document behind it, so the rule forbids it. A deterministic table or the engine's own model should do this.

### Gaps
- No independent benchmark on German electricity bills (Stromrechnung). Only a small self-made test would answer this, using synthetic or team members' own bills.
- No 20 cm obstacle result, and no per-class IoU for chimney or window: the RID paper returned 403 and the TUM PDF was behind a bot wall.
- No independent validation of Google Solar API obstacles in Germany.
- No study of language model error rates on PV, battery or heat pump advice. No source on tool-assisted error rates either.
- No study of language models estimating household consumption.

## What commercial solar tools actually use AI for, and what they avoid

### Takeaway
They use trained computer vision and optimisers for roof geometry and layout, and forecasting for battery control. Humans still confirm obstacles. Reonic, the challenge sponsor, seeds roofs with its "Building AI", then expects review, keeps obstacle heights manual and calls imagery "visual reference only". I found no evidence of any major vendor letting a language model produce the design or savings numbers for a homeowner, but that is an absence of evidence, not proof.

### Cited Findings
- **Reonic:** "Building AI" seeds roof outline, chimneys and nearby trees from OpenStreetMap, and the user reviews and corrects them. Obstacle heights, tilts and setbacks are set by hand. Imagery is "visual reference only", and the simulation depends on what the user sets. Layout optimiser reaches "typically 80 to 90% of the final layout". The shading FAQ gives no error margin. **[Vendor]** — [Reonic Solar Design](https://reonic.com/en-gb/product/360h/planning/)
- **Reonic also** has "AI Circuit Plan" for single-line diagrams, and lists Call Agent, WhatsApp assistants, Sales AI, Component AI and Validation AI in its navigation, without describing them on that page. **[Vendor]** — [Reonic Solar Design](https://reonic.com/en-gb/product/360h/planning/)
- A third-party review says Reonic does not disclose which AI model it uses. **[Secondary]** — [Sectorpunk](https://sectorpunk.com/en/reviews/reonic)
- **Enpal (via dida):** U-Nets segment roof and obstacles in satellite and customer photos. Classical vision and trigonometry give the dimensions. Planning time reportedly fell from about 120 to 6 to 7 minutes. No accuracy figure is given, and the system takes a customer roof photo as well as satellite data. **[Vendor, a supplier's case study]** — [dida](https://dida.do/projects/automatic-planning-of-solar-systems)
- **1KOMMA5°:** "Heartbeat AI" is operations, not design. It uses price, solar and consumption forecasts for a 24-hour plan, recalculated as data arrives. Savings claims are company claims. **[Vendor]** — [1KOMMA5 help](https://help.1komma5.com.au/knowledge-base/how-does-heartbeat-ai-work/); [press release](https://1komma5.com/en/press/press-releases/heartbeat-ai-available-for-millions-of-existing-energy-systems/)
- **Aurora:** AI builds 3D roof models in about 30 seconds from imagery and LIDAR, with an expert design service behind it. **[Vendor]** — [Aurora white paper](https://resources.aurorasolar.com/ai-whitepaper/executive-summary)
- A competitor says Aurora's auto detection is hit-or-miss on unusual roofs, tree cover and places without LIDAR. **[Competitor claim]** — [SurgePV](https://www.surgepv.com/best-solar-software/roof-modeling)
- **Zolar, Otovo:** two searches found nothing usable.

### Inferences
- The pattern across vendors: vision proposes, a person confirms, a deterministic simulation computes. This matches the project rule, which is a pitch point the sponsor should recognise.
- Enpal's use of a customer photo suggests that a homeowner's own input is a cheap way round the limits of overhead imagery. A click on the map is the same idea.
- The team's decision D52 (no panel count because obstacles are invisible) is the same caution Reonic shows. Obstacle knowledge is valuable, but it comes through confirmation, not silent detection.

### Gaps
- No public detail on Zolar or Otovo, or on Enpal's current system. The dida page describes a project with no accuracy data.
- No vendor discloses homeowner-facing language model use in a way I could verify.
- "What they avoid" is inferred from pages describing what is manual. No vendor states it directly.

## Trust: AI advice for costly home decisions, overreliance, disclosure effects

### Takeaway
The research points two ways: people can over-follow AI advice, and disclosing AI can lower trust in the person using it. Neither was tested on home energy purchases. The strongest sector-specific fact is that solar calculators already overpromise, so a tool that shows its assumptions and ranges has a real trust advantage.

### Cited Findings
- In an incentivised behavioural experiment, knowing advice came from an AI was enough to make people overrely on it, even against context and their own interests. **[Measured, Snippet]** — [Computers in Human Behavior 2024](https://www.sciencedirect.com/science/article/pii/S0747563224002206)
- A 2025 article on appropriate reliance reports, citing Trinh et al. (2025), that calibrated trust improved appropriate reliance on AI recommendations in financial decisions. This is a secondhand citation. **[Secondary]** — [Journal of Decision Systems](https://www.tandfonline.com/doi/full/10.1080/12460125.2025.2593251)
- Across 13 experiments, people who disclosed using AI for a task were trusted less than those who did not. Being exposed by a third party was worst of all, and mandatory disclosure did not remove the penalty. Proposed cause: legitimacy concerns. **[Measured, Snippet]** — [Schilke and Reimann, SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5205850); [2026 follow-up](https://journals.sagepub.com/doi/10.1177/01902725261425997)
- With identical inputs, online solar calculators differed by more than 20 percentage points in self-sufficiency. One gave 99% for a 10 kW PV and 9 kWh battery home, which HTW Berlin calls unattainable. Some assume 5% annual power price rises, which inflates storage savings. Doubtful tools are increasing. **[Measured, by a research group]** — [Solarserver on HTW Berlin, April 2025](https://www.solarserver.de/2025/04/30/htw-berlin-legt-qualitaetsstandards-fuer-vertrauenswuerdige-solarstromrechner-vor/)
- HTW's standards ask for realistic default assumptions on power prices and transparent presentation of results and assumptions. — [Solarserver](https://www.solarserver.de/2025/04/30/htw-berlin-legt-qualitaetsstandards-fuer-vertrauenswuerdige-solarstromrechner-vor/)
- Self-sufficiency of 25 to 90% is the range Verbraucherzentrale NRW gives, calling full autarky a misconception. — [pv magazine, 2023](https://www.pv-magazine.de/2023/03/15/verbraucherzentrale-nrw-raeumt-mit-den-vier-gaengigsten-photovoltaik-irrtuemern-auf/)
- A Credit Karma survey (September 2025) says 66% of US adults who used a generative AI tool used it for financial advice. **[Survey by a finance company, Snippet]** — [CNBC](https://www.cnbc.com/2025/12/03/ai-financial-advice-risks.html)

**Conversational intake**
- A pre-registered KU Leuven study found no evidence chatbots beat web surveys. The web survey often gave better data, and users rated the chatbot lower on enjoyment, usefulness and security. **[Measured, Snippet]** — [KU Leuven](https://lirias.kuleuven.be/retrieve/697279)
- A CHI study found chatbot respondents gave more differentiated answers and satisficed less. **[Measured, Snippet]** — [CHI 2019](https://www.springerprofessional.de/doi/10.1145/3290605.3300316)
- A health-assessment study found higher Net Promoter Score for a chatbot (24 vs 13) but longer completion time. **[Measured]** — [Frontiers in Digital Health](https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2022.954069/full)
- Completion-rate claims (for example 73% vs 33%) come from vendors or unnamed secondary sources. **[Vendor]** — [Specific.app](https://specific.app/blog/ai-survey-builder-vs-traditional-forms-why-conversational-surveys-are-transforming-feedback-and-response-rates/)

### Inferences
- Overreliance and the disclosure penalty do not really conflict. Schilke and Reimann measured trust in a person who used AI. The overreliance study measured following advice labelled as AI. A homeowner may trust a company slightly less yet still accept a fluent AI sentence uncritically. That second risk is the costly one on a five-figure purchase.
- Practical wording: say what the AI did, narrowly. "Text written by AI, numbers calculated by our engine" is more honest and likely less damaging than a general "AI-powered" label. This wording is untested.
- Fluency is the danger: a confident paragraph hides uncertainty. The fix is to show ranges and assumptions next to the text.
- Chat intake adds time on a flow that has few fields and a map. On current evidence a form is at least as good.

### Gaps
- No study on AI advice in home energy, solar or heat pump purchases.
- No German consumer study on AI labels in energy offers.
- Schilke and Reimann test people disclosing AI, not products. Transfer is uncertain.
- I did not read the full text of the overreliance paper.

## Regulation and liability: AI Act, GDPR, German consumer law

### Takeaway
Telling people they are talking to an AI has applied since 2 August 2026, and the Digital Omnibus did not postpone it. Bills are personal data, and direct Anthropic API use has no EU-only inference option. I found no German ruling on AI-generated solar savings claims, but existing UWG cases on solar advertising show courts strike down unrealistic independence claims, and the company is likely responsible for what its AI says.

### Cited Findings

**EU AI Act**
- Regulation (EU) 2026/1744 (Digital Omnibus on AI) entered into force on 27 July 2026, and did not amend Article 50. **[Law-firm and vendor summaries, not the Official Journal]** — [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)
- The duty to tell users they are interacting with AI was unaffected and applied from 2 August 2026. Gibson Dunn's timeline table says "Partially Deferred" while its text says it proceeds on schedule. That piece predates publication. — [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)
- Machine-readable marking under Article 50(2) has a grace period to 2 December 2026, only for generative systems on the market before 2 August 2026. Later systems must comply at once. — [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)
- High-risk rules moved to 2 December 2027, and to 2 August 2028 for Annex I embedded systems. **[Secondary]** — [Legalithm](https://www.legalithm.com/en/blog/eu-ai-act-what-applies-2-august-2026); [i-SCOOP](https://i-scoop.eu/eu-ai-act-timeline-digital-omnibus)
- Commission Article 50 guidelines were reportedly adopted on 20 July 2026, and the Code of Practice on marking was still in draft as of the source. **[Secondary, single source each]** — [Techjack](https://techjacksolutions.com/ai-brief/eu-ai-act-article-50-august-2-annex-iii-december-2027/); [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)

**GDPR**
- The German data protection authorities (DSK) issued AI guidance in May 2024 with a language model focus, technical measures guidance in June 2025, and a RAG guide later. — [DSK orientation aids](https://www.datenschutzkonferenz-online.de/orientierungshilfen.html); [Noerr](https://www.noerr.com/de/insights/ki-und-datenschutz-orientierungshilfe-der-dsk-konferenz); [Sachsen DPA](https://www.datenschutz.sachsen.de/dsk-veroeffentlicht-orientierungshilfe-zu-ki-systemen-mit-retrieval-augmented-generation-rag-7768.html)
- Anthropic's default: API inputs and outputs are deleted within 30 days, with exceptions for Files API, agreed zero retention, flagged content (up to 2 years) and legal duties. A third-party site claims 7 days, which conflicts. Trust the Anthropic page. — [Anthropic privacy centre](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data); [Anthropic data retention docs](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- Third-party guides say the DPA with standard contractual clauses is part of the commercial terms and API data is not used for training. Confirm in Anthropic's own terms. **[Secondary]** — [Sonomos](https://sonomos.ai/blog/claude-dpa-explained-2026/index.md)
- `inference_geo` on the direct API offers "global" or "us". I found no EU option there. EU processing is reported through AWS Bedrock or Google Vertex. **[Snippet for the EU routes]** — [companyscope](https://companyscope.io/vendors/anthropic); local Claude API skill reference, `shared/platform-availability.md`
- The public Marktstammdatenregister shows only postcode and town for home systems, never street or house number, per a consumer guide. **[Secondary]** — [photovoltaik.info](https://www.photovoltaik.info/oeffentliche-daten-pv-anlage-mastr/); [Bundesnetzagentur](https://www.bundesnetzagentur.de/mastr)

**German consumer law and liability**
- LG Frankfurt a.M. barred Viessmann's misleading "independence" advertising and a clause allowing price rises when systems fed in less than expected. The ruling is final. — [pv magazine](https://www.pv-magazine.de/2021/12/07/verbraucherzentrale-nrw-klagt-erfolgreich-gegen-irrefuehrende-werbung-bei-viessmanns-prosumer-tarif/)
- LG Dortmund (2012) issued an injunction on the claim of independence from rising power prices when 100% of power is fed in. — [Verbraucherzentrale](https://www.verbraucherzentrale.de/urteile/irrefuehrende-werbeaussagen-zum-kauf-und-bau-von-photovoltaikanlagen-14002)
- LG Bremen (2025, 9 O 345/24) found advertising about a non-existent nationwide solar duty misleading under § 5a UWG. — [ratgeberrecht.eu](https://www.ratgeberrecht.eu/aktuell/irrefuehrende-werbung-zur-solarpflicht/)
- LG München I (2023, Aura "SolarCloud") was a case under §§ 3, 5, 8 UWG about unclear cost disclosure. I did not read the outcome. — [Judgment PDF](https://www.verbraucherzentrale.nrw/sites/default/files/2023-09/2023-02-28_lg-munchen-i_urteil_vom-28.02.2023_33-o-8940_22_geschwarzt.pdf)
- Moffatt v. Air Canada (2024 BCCRT 149): a Canadian tribunal rejected the argument that a chatbot is responsible for itself, and correct information elsewhere on the site was no excuse. This is not German law, and it is a small claims decision. — [ABA](https://www.americanbar.org/groups/business_law/resources/business-law-today/2024-february/bc-tribunal-confirms-companies-remain-liable-information-provided-ai-chatbot/); [McCarthy Tétrault](https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot)

### Inferences
- A chat or AI-written text should carry a visible note from the first message. It is cheap and appears to be legally required for a real product. Whether a hackathon demo counts as "placed on the market" is doubtful, but showing the label is free and looks professional.
- A real product launched now would get no Article 50(2) grace period. Whether a company calling a model API counts as the provider for marking is a question for a lawyer.
- This tool is unlikely to be high-risk under Annex III (my reading, not verified against the annex).
- GDPR Article 22 (automated decisions) probably does not bite, since a proposal is not a decision with legal effect, but I found no source on this.
- A bill photo likely holds name, address, meter number and possibly bank details. Minimise it: crop or blank it in the browser, send the image with no address attached, do not store it, and delete after extraction. Avoid the Files API here, since it has longer retention.
- The riskiest AI sentence is a savings or independence claim. Free text that says "you will be independent of rising prices" repeats what courts have barred. Forbid those phrases and show a range with assumptions.
- **Hackathon rule:** use synthetic bills only. The Q2 question in `docs/open-questions.md` is still open, and D27 says only the sentence goes to Claude.

### Gaps
- The Official Journal text of 2026/1744 and the Commission guidelines were not read directly.
- Do not quote the "EUR 35 million or 7%" figure for Article 50: that tier is for the most serious violations. From memory the Article 50 tier is EUR 15 million or 3%. **[Unverified]**
- No German ruling on AI-generated savings claims or solar yield forecasts specifically. My search for LG Kiel (2024, as I recall on automated false company information) found nothing. **[Unverified]**
- DSK papers were not read for bills, Article 22 or Article 28. No authority statement on building-level data found.
- Whether address plus building data is personal data in this flow is unresolved (see Q26 in `docs/open-questions.md`).
- The 30 kW and other MaStR rules were not confirmed.

## Cost and latency per use of current models, and failure modes in live demos

### Takeaway
Cost does not matter here: every use is cents or less. Latency and reliability are what matter, and Anthropic publishes no latency figures I could find, so the team must time this on venue wifi. A live demo should be able to run with the network off.

### Cited Findings
- Prices per million tokens, input and output, USD: Opus 5.5 $4 and $20, Sonnet 5.5 $2 and $10, Haiku 5.5 $0.10 and $0.50 (for prompts up to 100K). Cached 2026-10-06, so check before quoting. — local Claude API skill reference; [Claude pricing](https://claude.com/pricing)
- Image cost is ⌈width/28⌉ × ⌈height/28⌉ visual tokens. Claude 4.7 and later models take up to 2,576 px long edge and 4,784 visual tokens. Maximum image size 8000×8000 px. On Opus 5.5, a 1000×1000 image costs about $5.18 per thousand and a 4K image about $19.14 per thousand. — [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Opus 5.5 thinking cannot be disabled and effort defaults to medium. Sonnet 5.5 can turn thinking off with `between_tools`. Haiku 5.5 allows disabling at high effort or below. — local Claude API skill reference
- SDK default timeout is 10 minutes with 2 retries, so wall-clock wait can reach timeout × 3 unless overridden. A safety refusal comes back as HTTP 200 with `stop_reason: "refusal"`, so code must check it. — local Claude API skill reference
- Structured outputs and `strict: true` tools constrain output to a schema. — local Claude API skill reference

**Estimated cost per use** (my calculation at the prices above; token counts are my assumptions, and thinking tokens are billed as output so real figures may be higher)

| Use | Assumed tokens in / out | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|
| Bill photo, full size | 5,300 / 1,000 | $0.041 | $0.021 | $0.001 |
| Explanation | 2,500 / 800 | $0.026 | $0.013 | $0.0006 |
| Roof crop question | 2,000 / 1,500 | $0.038 | $0.019 | $0.0009 |
| Chat, 10 turns, uncached | 60,000 / 5,000 | $0.34 | $0.17 | $0.0085 |

### Inferences
- Since an offer is worth thousands, per-use cost is noise. Pick the model on latency and measured accuracy. D15 names Opus 5.5 for refinement. Test Sonnet or Haiku only if Opus feels slow.
- Likely demo failures:
  - Venue network or API outage, or a 429 rate limit.
  - A long silent wait while the model thinks.
  - A different answer from the rehearsal, because output is not deterministic.
  - A live question that draws a confident wrong statement, in front of expert judges.
  - A blurry bill photo taken on stage.
  - A missing key.
- Countermeasures:
  - Keep the D27 fallback to simple rules.
  - Set a hard timeout of around 10 to 15 seconds (my suggestion) and at most one retry.
  - Stream text or show progress.
  - Cache rehearsal responses for the demo case.
  - Use one pre-tested synthetic bill.
  - Ensure the engine result appears without any model call.
  - Keep the demo recording as a backup.

### Gaps
- No published latency numbers found for these models. Measure median and worst case on the real prompts and network. Each test call costs cents but needs the user's approval.
- No published rates of API failure during events.

## Where is the line: clearly positive, conditional, negative, with guardrails

### Takeaway
Net positive AI is narrow: language in and language out around a deterministic core. About three language model touchpoints are worth keeping: refinement parsing, explanation, and bill reading if time allows. All must be optional, so the tool still works with AI off. None of these directly raises design accuracy, so they must not delay the engine, which is what the challenge is judged on.

### Cited Findings
The evidence is cited above. Key anchors:
- Trained obstacle detection stays near human disagreement at far finer resolution than 20 cm, and experts still verify. — [RID](https://www.mdpi.com/2072-4292/14/10/2299); [STDL](https://tech.stdl.ch/PROJ-ROOFTOPS/)
- Market practice has a person confirming obstacles. — [Reonic](https://reonic.com/en-gb/product/360h/planning/)
- Multi-step arithmetic degrades with procedure length. — [arXiv 2605.00817](https://arxiv.org/html/2605.00817)
- Over-optimistic calculators are a known sector problem. — [Solarserver on HTW Berlin](https://www.solarserver.de/2025/04/30/htw-berlin-legt-qualitaetsstandards-fuer-vertrauenswuerdige-solarstromrechner-vor/)
- Chat intake has no reliable data-quality gain. — [KU Leuven](https://lirias.kuleuven.be/retrieve/697279)

### Inferences

The verdicts below are my judgement based on the evidence above.

| Use | Verdict | Why | Guardrails that keep it positive |
|---|---|---|---|
| Natural language refinement | **Clearly positive** | Turns a sentence into typed changes. Engine makes the numbers. Failure is visible and low cost | Schema output only, show "I understood: ..." before applying, rules fallback (D27), sliders remain |
| Plain-language explanation | **Clearly positive** with control | Experts explain, and the engine's output needs it. Risk is claims, not parsing | Numbers injected from engine by placeholder, or check that every number in the text exists in the engine payload. Banned phrases (autark, unabhängig, garantiert). Show assumptions and ranges. Fall back to a template. Label as AI text |
| Bill photo or PDF reading | **Positive if user confirms** | Real consumption beats a guess, and this is the task language models do best. Saves typing | Nullable fields, show value with the source crop for one-tap confirm, plausibility range, period and annualising in engine, ask which meter, never store, crop or mask, manual entry always available. Synthetic bills in demo |
| Existing panels on a roof plane | **Conditional** | Large and regular objects, coarse question | Phrase as a question to the homeowner ("It looks like panels are here. Correct?"). Asking directly is cheaper and may be enough. MaStR gives only postcode, so it cannot confirm an address |
| Chimneys and roof windows at 20 cm | **Conditional, weak; negative if treated as fact** | 2 to 6 pixels, no benchmark for general models, published models are poor at finer resolution | Never remove panels silently on AI output. Use as a hint at most, let homeowner click obstacles, carry the unknown as a range, and keep D52 until a person confirms. Only claim accuracy after labelling a small set of public images |
| Chat about the offer | **Conditional, last priority** | Useful but highest liability, and a live-demo risk | Answers only from the engine payload and a fixed FAQ. Any number via tool lookup. Refuse tax, legal, subsidy and guarantee questions and hand to a planner. Show AI notice at the start. Cut it if time is short |
| Conversational intake instead of forms | **Negative here** | Data quality evidence is mixed, chat takes longer, the flow is already a map with few fields | Keep the form. An optional free-text box that fills fields is the most that is worth doing |
| Estimating consumption with a language model | **Negative** | It is a design input with no document behind it, so it breaks the spirit of the rule | Use a deterministic estimate, show it as an estimate, and ask for the bill figure |
| Language model doing sizing, savings or payback | **Negative, forbidden** | Project rule, arithmetic slips, UWG exposure | Engine only |

**How much AI is net positive**
- Keep one rule: **AI may read and write words, the engine owns every number, and the person confirms every fact the AI read.**
- Test: if the AI is switched off, does the tool still give a correct design? It must.
- Second test: if the AI is wrong, will the user see it before it affects the design? If not, do not ship that use.
- Priority for the Sunday deadline: the design engine and expert comparison first, since the brief scores those. The state doc shows later steps are not back yet. Then refinement (already planned), then explanation. Bill reading only after that. Skip conversational intake and aerial chimney detection. Add chat only if everything else is done.
- A strong pitch line is what was left out and why: the team tested where AI fails and kept it out of the numbers, in line with what the sponsor's own tool does with obstacles.

### Gaps
- All verdicts rest on indirect evidence. None of these uses has a direct controlled study in home energy.
- A short team test would improve this more than further reading: a few synthetic German bills, and a small hand-labelled set of public aerial crops, with no project data.
- A deterministic source for typical household consumption (for example, a Stromspiegel-style table) was not researched.
