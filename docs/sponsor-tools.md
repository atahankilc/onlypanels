# Sponsor tools

Credits: Anthropic, Supabase, Lovable, ElevenLabs. The brief's criteria do not reward tool use (see Q16), so each must earn its place in the demo. Anything sending project data waits for Q2.

| Tool | Verdict | Priority |
|---|---|---|
| Anthropic | Use. Core to refinement and explanations | During minimum |
| Supabase | Use only if a feature needs it | After minimum |
| ElevenLabs | Worth it as a short voice moment | After minimum |
| Lovable | Optional. Not for the main UI | Only with spare capacity |

## Anthropic

- **Refinement parser:** "the family is buying an electric car next year" becomes typed changes such as an EV with an annual distance. Use structured outputs with `claude-opus-5-5`.
- **Explanations:** planner text from engine facts; a plain-language version for homeowners.
- **Offline cleanup:** map the 500-plus component names onto a clean catalog with the Batch API, which runs at half cost. Component names are data, so this waits for Q2.
- **API notes:** on this model forced `tool_choice` returns a 400, so use `auto` with `strict: true` or `output_config.format`. Thinking cannot be disabled; set `output_config.effort` explicitly, starting at `low` for parsing. Enable server-side `fallbacks` and check `stop_reason`. Cache the stable system prompt.

## Supabase

Not needed for the minimum. Good reasons to add it:

- **Saved designs and share links**, needed for a homeowner view reachable by URL.
- **Override log:** record every planner change. It supports a strong pitch line: every correction is new training data.

Keep ML in Python and do not move raw data into it without Q2.

## ElevenLabs

Fits the persona, a planner working between site visits.

- **Dictate a home:** speech to text feeding the same refinement parser. Small to build, and strong in a demo.
- **Spoken homeowner explanation:** text to speech of the explanation, in German. Stretch goal.
- A full voice agent is more than this needs.

The React package is `@elevenlabs/react`. German support and tool wiring still need checking against the official docs.

## Lovable, without using it for the main UI

Lovable's strength is generating a whole app quickly, so it adds little to a hand-built planner tool. Reasonable ways to use the credit:

1. **Design exploration (best value):** prompt two or three layouts for the planner screen with made-up data, in the first hour. Take the best ideas into our own UI and discard the output.
2. **Homeowner view as a separate surface:** if we reach that stretch goal, it can be generated against our `/design` API. It is a different audience, so it stays independent of the planner UI. This is the one place it could save real time.
3. **Pitch microsite:** a landing page for the product story, if the deck needs one. Lowest value.

Avoid: backend logic, and pasting real project data into prompts (Q2). Leaving the credit unused is also fine.

Third-party guides warn that manual edits to synced GitHub code can be overwritten by later prompts, and that Edge Functions and migrations need a prompt to deploy. These were not confirmed against official docs, and they are another reason to keep it away from our main repo.

Sources: [Lovable features overview](https://www.lowcode.agency/blog/lovable-features), [integrating external services](https://promptito.super.site/prompt-engineering-playbook-for-lovable-ai-ides/integrating-external-services), [Lovable skill notes](https://claudeskills.info/skill/lovable/), [ElevenLabs React SDK docs](https://elevenlabs.io/docs/eleven-agents/libraries/react).
