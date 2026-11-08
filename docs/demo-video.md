# Demo video (2 minutes)

For the submission form's demo link. One idea, as in the deck: **AI is smart enough, what it lacks is context.** The full five-minute walk is `docs/demo-script.md`; this is its two-minute cut.

The voiceover is about 270 words, so it fits two minutes at a calm pace. Numbers on screen come from the engine and the price book and can move a little. Say what the screen shows, not what is written here.

## Shots and voiceover

| Time | On screen | Voiceover |
|---|---|---|
| 0:00 | Deck slide 1, "Same request. Different offer." | In Reonic's past projects, 59% of solar requests are identical to another customer's, field for field. Yet in 99% of them the experts designed something different. They knew what the request did not say: the roof, the shade, the street. |
| 0:15 | Deck slide 4, everything we use | AI is smart enough. What it lacks is context. So OnlyPanels gathers it. |
| 0:20 | Homeowner, with map. Type "Agnes-Bernauer-Straße 98", pick the suggestion, let the 3D city fly in | A homeowner finds their house on a 3D map of Munich: Bavaria's real roofs on the aerial photo. |
| 0:32 | Click the house behind the pin, Continue, Start. Question 1: the "We know" card, "2 sides, 128 m²" | One click, and we know every roof side: area, slope, direction. Every question is optional. Under each one it says what we know, what we assume if it is skipped, and what it is for. Nothing leaves the browser before Send, and the homeowner chooses what goes. |
| 0:55 | Planner, Requests: the three requests with their draft steps | On the installer's side, a full draft is already waiting: home loaded, trees checked, roof space, system sized, rules checked, priced. About a second. |
| 1:08 | Open Sondermeierstraße 74. Tiles at the top, modules on the 3D roof | Solar, battery, wallbox and heat pump, with the modules fitted on the real roof. Roof windows were found on the aerial photo, so no module sits on one. |
| 1:22 | Click "Yearly sun", then "Trees" | Sun per roof side from real weather years, minus the shade of the trees around it. |
| 1:32 | Cost tab: price after grants, payback, 20 years | The price comes from the installer's own price book, with KfW and Munich grants and this year's energy rules counted. Payback and twenty years, the same figure the homeowner sees. |
| 1:45 | Home tab: facts tagged Customer, Measured, Assumed. Optional: the voice ball, ask "what does it cost without a battery?" | Every fact has a source, and assumed facts must be confirmed before an offer goes out. The language model never invents a number: the engine does. |
| 1:55 | Deck last slide | Better facts, not a bigger model. OnlyPanels. |

If voice works on the day, it can replace the Home tab shot at 1:45: ElevenLabs hears the question, Claude changes the desk, ElevenLabs answers. Keep it only if the full turn (5 to 9 s) fits.

## Before recording

1. API and web running: `uv run uvicorn main:app --app-dir api --port 8000`, `cd web && pnpm dev`.
2. Start clean: `curl -X DELETE localhost:8000/api/approved`. Price book at its defaults.
3. Open Sondermeierstraße 74 once and wait until the list shows every step done, so the draft, shade and prices are cached. Fly to Agnes-Bernauer-Straße once so its map squares are cached.
4. Homeowner side: clear the browser's local storage for the app, so it opens on the start page.
5. Chrome full screen at 1920 × 1080, other tabs closed, notifications off (Focus mode).
6. Open `OnlyPanels-pitch.pdf` in a second window for the three slide shots (slides 1, 4 and 6).

## Recording

- **Screen:** macOS Cmd+Shift+5, "Record Selected Portion" around the Chrome window, or QuickTime. Record each shot as its own clip. A retake is then cheap.
- **Voice:** record the voiceover separately and lay it over the clips (iMovie or CapCut), cutting the clips to the voice. Optional, and good for the ElevenLabs prize: speak it with ElevenLabs text to speech. It only receives the script above, nothing about a home.
- **Edit:** at most 2:00. No music under the voice, or very quiet.
- **Upload:** YouTube (unlisted) or Loom. Paste the link into the form's demo field.

## Time

About 45 minutes: 10 to prepare, 15 to record, 15 to edit, 5 to upload. Submission closes at 14:00.
