# Submission text

Paste into https://thinc-hack.lovable.app/ (deadline Sunday 14:00). Numbers from `scripts/profile_same_request.py` and `scripts/final_test.py`.

## Team

- Team name: OnlyPanels
- Case: Reonic
- Repository: https://github.com/atahankilc/onlypanels
- Pitch slides: `OnlyPanels-pitch.pdf` in the repository root

## One-sentence pitch

AI is smart enough, what it lacks is context: OnlyPanels fuses twelve data sources about a home, even when the owner shares no address, so the first solar, battery and heat pump design is one an expert planner would sign.

## What it does, who it's for, what makes it unique

In Reonic's past projects, 59% of solar requests are identical to another customer's request field for field, yet in 99% of those the experts designed differently, by 6.3 kWp on average. The experts knew what the request did not say: the roof, the shade, the street. Homeowners leave half the fields empty, because they don't know or don't want to share where they live. So a bigger model only learns noise; the bottleneck is context.

OnlyPanels is for two people. The **homeowner** clicks their house on a 3D map of Munich, or just answers a few optional questions without a map. Every question says what we already know, what we assume if they skip it, and what it is used for. Nothing leaves the browser before Send, and they choose what goes. The **installer's planner** opens a request and finds a full draft already waiting: system size, modules fitted on the real roof, battery, wallbox, heat pump, price after grants and payback. Every fact is tagged as customer, measured, found or assumed, and assumed facts must be confirmed before an offer can go out.

What makes it unique is the data fusion. One click combines Bavaria's 3D roofs, the 20 cm aerial photo, sun per roof side from PVGIS weather years, tree shade from Bavaria's single-tree map, Census 2022, Munich's heat plan (is district heating coming?), the monument map, a vision check that finds roof windows and chimneys on the photo, the planner's own price book, local power prices, feed-in, KfW and Munich grants, and how this installer sized past homes. The language model never invents a design number: a trained engine and explicit rules do, and the review reruns the engine at the edges of each guess to tell the planner which one question still changes the offer.

On 276 held-out projects the engine beats one-design-for-all and the rule of thumb (solar mean error 2.65 vs 3.06 and 4.02 kWp), even though past projects carry none of the context the app now collects.

## Tech stack

Python, FastAPI, pandas, scikit-learn, an hourly energy simulation on EU PVGIS weather years; React 19, TypeScript, Vite, MapLibre GL, three.js, web workers; Claude (Anthropic) for roof photo vision, the planner's sentence box and a voice agent using MCP tools; ElevenLabs for speech; open data from Bayerische Vermessungsverwaltung (LoD2, DOP20, single trees), the Bavarian monument map, Munich's heat plan, Destatis Census 2022, Photon and OpenStreetMap.

## ElevenLabs

Yes. The planner runs the desk by voice: ElevenLabs hears the command (about 0.5 s), Claude acts on the desk through MCP tools (open a request, change the design, correct a fact, answer what it costs, send), and ElevenLabs speaks the answer. The homeowner has a voice helper, off until allowed, that explains questions and fills in answers in English or German, and never sends anything on its own.

## Demo

A video of at most 2 minutes: plan and voiceover in `docs/demo-video.md`.

Live app: https://aberdeen-kde-designs-indiana.trycloudflare.com (homeowner at `/`, planner at `/planner`). It runs on our laptop through a tunnel, so it is online only while the laptop is (D134).
