# Final pitch: talk track (about 5 minutes)

Slides: `OnlyPanels-pitch.pdf` (or `.pptx`). Live demo on this laptop: web at http://127.0.0.1:5173, the same app the jury got through the tunnel. Keep the API, web and tunnel running.

Speak in English. Roughly 130 words a minute. Bold lines are the ones to land.

## 0:00 Slide 1, intro (15 s)

> Hi, we're OnlyPanels. We built a system that designs solar, battery, wallbox and heat pump the way an expert planner at Reonic would, and it starts from every fact it can find about a home.

## 0:15 Slide 2, team (15 s)

> I'm Atahan. And this is Utku. Utku couldn't make it into the photo, he's our emotional support teammate. *(pause for the laugh)* Two of us, one weekend.

## 0:30 Slide 3, same request, different offer (45 s)

> Before building anything we looked at Reonic's past projects. And we found something strange.
> **59% of solar requests are identical to another customer's request at the same installer. Every field the same.**
> **And in 99% of those, the expert still designed something different.** On average 6.3 kWp apart, about 14 modules.
> The experts aren't random. They knew things the request never said: the roof, the shade, the street. Half the request fields are empty.
> **So AI is smart enough. What it lacks is context.** A bigger model would just learn noise. We decided to go get the context.

## 1:15 Slide 4, one click, twelve sources (25 s)

> One click on a house, and we fuse twelve sources into one draft: Bavaria's 3D roof model, the aerial photo, sun per roof side from real weather years, the trees that shade it, the neighbourhood's age and heating, Munich's district heating plan, monument rules, and the installer's own prices, grants and energy law.

## 1:40 Slide 5, your home stays in your browser (25 s)

> Many people in Germany don't want to share where they live. We respect that.
> **The homeowner's browser fetches these facts itself. Nothing about the home reaches us or the installer before they press Send**, and they choose what goes. Even if they never send, it helps them answer. And with no map at all, they still get a priced offer.

## 2:05 Live demo (about 2 minutes)

Switch to the browser, planner view, request list.

1. **The inbox** (15 s). *"This is the installer's planner. Three requests came in. Before anyone opened them, a full draft is already there. Under each one, the steps and what they found. On this one: five buildings, trees take 16% of the sun, 478 panels fit, sized, rules checked, priced."* Point at Sondermeierstraße 86.
2. **Open Sondermeierstraße 74** (30 s). *"Gas heating, wants a heat pump, has an electric car. Here's the system: solar, battery, wallbox, heat pump. The modules sit on the real roof, and the roof windows the AI found on the aerial photo are kept free."* Click **Yearly sun**: *"Sun per roof side."*
3. **Cost** (25 s). *"The price comes from the installer's own price book, with KfW and Munich grants and this year's rules counted. Payback, and twenty years. The homeowner sees the same number."*
4. **Facts and confirm** (20 s). Open **Am Blütenring 42**. *"This owner knew little. Every fact is marked: customer, measured, or assumed. Assumed facts block Send until the planner confirms them. Nothing goes out on a guess."*
5. **Refine** (20 s, optional). Either the sentence box: *"only 18 panels fit"* and the design follows; or the voice ball: *"what does it cost without a battery?"* Try it once before going on stage. If it hangs, skip it and say: *"The planner can also talk to the desk."*

Back to the slides.

## 4:05 Slide 6, everything we use (10 s)

> This is everything we use, for the home, for learning, for money and law, and for every assumption. Each one has a source in the repo.

Don't read it. Let it sit for a beat.

## 4:15 Slide 7, smart and deterministic (30 s)

> We didn't let the AI do everything. **Smart where it helps, deterministic where it counts.** Claude reads the roof photo, understands the planner, and runs the desk by voice with ElevenLabs. But the engine sizes and prices, the same answer every time, and any number the AI didn't get from the engine is dropped.
> On 276 projects it never saw, it beats one design for everyone and a rule of thumb, **with none of this context**. Every fact we now collect is on top of that.

## 4:45 Slide 8, close (15 s)

> **Better facts, not a bigger model.** A first design and its price in minutes. The planner stays in control, and the homeowner decides what's shared. Thank you.

## Likely questions

| Question | Answer |
|---|---|
| How accurate is it? | On 276 held-out projects, split by customer: solar mean error 2.65 kWp, against 3.06 for one design for all and 4.02 for a rule of thumb. 49% within 20% of the expert. Battery 2.66 kWh error. And experts differ from themselves by about as much. |
| Why not a bigger model? | Because 59% of requests are identical and still got different designs. No model can separate those homes from the request alone. The roof, shade and place can. |
| What does the LLM do, and can it hallucinate a size? | It reads the roof photo, understands the planner's sentences, and drives the desk by voice. Sizes and prices come from the engine and rules; a number the AI did not get from the engine is dropped. |
| Does it work outside Munich? | The map data is Bavarian and Munich's. Without the map it works anywhere in Germany from the answers, with typical sun. Each German state publishes a similar 3D building model, so the map part scales state by state. |
| Heat pumps? | Only 17 past projects had one, too few to learn. So heat pumps are rules: size from heat need, efficiency from the heating system and build year, with grants. We say so. |
| Privacy and GDPR? | Facts about the home are read in the homeowner's browser from Bavarian and EU services. Our server only serves whole 2 km map squares, so it never learns which house. Nothing about the home leaves before Send, and the homeowner picks what goes. |
| Business value for installers? | A full, priced, checked draft before the planner opens the request. The planner calls with two questions instead of twenty, and the first credible offer often wins. |
| What would you do next? | Learn from the planner's corrections (the desk already records sent offers), more states' map data, and real win-rate data, which the export doesn't have. |

## Before going on stage

- Laptop plugged in, sleep off (`caffeinate -dimsu &`), notifications off.
- Browser open on the planner list; each demo request opened once, so nothing loads on stage.
- PDF in full screen in a second window. Switch with Cmd+Tab.
- If the live demo fails: play the submitted video and keep talking over it.
