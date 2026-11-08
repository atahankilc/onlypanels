"""The planner's voice: speech in, the desk acts, speech out.

1. ElevenLabs Scribe turns the planner's recording into text (`transcribe`).
2. Claude reads the text with what the screen shows and works the desk through its MCP server (desk.py): it may run the
   engine, open a request, switch a section, change the design, confirm facts or send the offer. The page carries out
   the recorded actions exactly as clicks.
3. Any sentence of the answer with a number that no engine answer or the screen gave is dropped, as for the agent.
4. ElevenLabs turns the answer into speech (`speak`).

Only the planner's desk has a voice. The homeowner's pages never send audio anywhere (privacy promise, D102).
Without ELEVENLABS_API_KEY there is no speech, but a typed turn still works; without ANTHROPIC_API_KEY nothing acts.
"""
import base64
import json
import os
import re

import httpx2 as httpx

from .advise import _given, _said, _values
from .agent import MODEL
from .desk import Desk, build
from .guide import Guide, build as build_guide

STT_MODEL = "scribe_v2"
# Read when used, since the API loads .env after importing this module.
ELEVEN = lambda: os.environ.get("ELEVENLABS_BASE_URL") or "https://api.elevenlabs.io"  # https://api.eu.residency.elevenlabs.io with an EU plan
TTS_MODEL = lambda: os.environ.get("ELEVENLABS_TTS_MODEL") or "eleven_flash_v2_5"  # multilingual, lowest delay
VOICE = lambda: os.environ.get("ELEVENLABS_VOICE_ID") or "JBFqnCBsd6RMkjVDRZzb"  # a premade voice; any voice id of the account works
MAX_TURNS = 8
SYSTEM = """You are the voice of an installer's solar, battery and heat pump planning desk. A planner talks to you while
working; you act on the desk through your tools and then answer out loud.

- Do what the planner asks with the tools: open a request, show a section, run the engine, change the design, confirm
  facts, tick site checks, correct a fact, answer money questions (price, grant, payback) with the money tool. Pick the request by its title, street or reference from the screen overview; if two could match, ask which.
- Every number you say must come from a tool result or the screen overview, with its unit. Never work out differences,
  sums, payback or prices yourself.
- Money as the screen shows it comes from the money tool: what the homeowner pays (pays_eur), the first year's gain
  (first_year_eur.total_eur, the screen's "saves in year 1"), payback. The design's saving_eur_year is the electricity
  bill alone; say so if you use it, and never call it the saving.
- Change the design (set_design) only when the planner asks for a change; for a question, use try_design, battery_sizes
  or money, which change nothing. Correct a fact (set_fact) only when the planner states the new value; a question
  like "what if they drive more" is a what-if with try_design, not a correction.
- Send an offer only when the planner clearly says to send it now. Confirm facts only when the planner says they are right.
- If a tool refuses, say why in a few words.
- Your answer is spoken: one to three short sentences, plain words, no lists, no markdown, no ids. Answer in the
  language the planner spoke."""
GUIDE_SYSTEM = """You are the friendly voice helper of a solar installer's request page. A homeowner talks to you while
they tell the installer about their home, so the installer can make them an offer for solar, a battery and a heat pump.

- Help them through the whole page: say where they are and what to do next, explain a question in plain words and why
  it matters, and fill in what they tell you with set_answers. Move on with go_to_page when they want, or when a page
  is answered and they are ready. Every question is optional; skipping is fine.
- Say back briefly what you noted, so they can correct it.
- Never give a result: no system size, number of panels, battery size, price, saving, payback or advice on what to buy.
  The installer works that out and sends an offer. If they ask, say so kindly.
- Never ask for, repeat or take the address; it is typed on the page. You cannot click on the map: tell them what to
  click. Sending is always their own tap on Send.
- Numbers you say must be ones they said, their answers, or the page texts.
- Spoken answers: one to three short sentences, warm and plain, no lists, no markdown. Answer in the language they spoke."""


def ready():
    return {"speech": bool(os.environ.get("ELEVENLABS_API_KEY")), "agent": bool(os.environ.get("ANTHROPIC_API_KEY"))}


def _key():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")
    return key


async def transcribe(audio: bytes, filename: str = "speech.webm", content_type: str = "audio/webm") -> dict:
    """The planner's words and the language they spoke, from ElevenLabs Scribe."""
    async with httpx.AsyncClient(timeout=30) as http:
        res = await http.post(f"{ELEVEN()}/v1/speech-to-text", headers={"xi-api-key": _key()},
                              data={"model_id": STT_MODEL, "tag_audio_events": "false"},
                              files={"file": (filename, audio, content_type)})
        res.raise_for_status()
        out = res.json()
    return {"text": (out.get("text") or "").strip(), "language": out.get("language_code")}


async def speak(text: str) -> bytes:
    """The answer as MP3 speech."""
    async with httpx.AsyncClient(timeout=30) as http:
        res = await http.post(f"{ELEVEN()}/v1/text-to-speech/{VOICE()}", params={"output_format": "mp3_44100_64"},
                              headers={"xi-api-key": _key(), "accept": "audio/mpeg"},
                              json={"text": text, "model_id": TTS_MODEL()})
        res.raise_for_status()
        return res.content


def _plain(sentence: str) -> str:
    """German and Turkish write 21.400 and 11,3: the check reads them as 21400 and 11.3, and their unit words as units.
    An English 2,020 (three digits after the comma) stays a thousands mark."""
    out = re.sub(r"\b(\d{1,3})((?:\.\d{3})+)\b", lambda m: m.group(1) + m.group(2).replace(".", ""), sentence)
    out = re.sub(r"\b(\d+),(\d{1,2})\b(?!\d)", r"\1.\2", out)
    out = re.sub(r"(?i)\byüzde\s+(\d[\d.,]*)", r"\1 %", out)
    return re.sub(r"(?i)\b(\d[\d.,]*)\s*(?:prozent)\b", r"\1 %", out)


def checked(text: str, seen: list, heard: str = "") -> str:
    """The answer without sentences holding a number the engine or the screen did not give. Sentences are kept as said.
    Numbers the speaker said themselves (`heard`) count as given, with the unit they said them in."""
    values = _values({"seen": seen}) + [(u, v) for u, v, _ in _said(_plain(heard))] + [(None, v) for _, v, _ in _said(_plain(heard))]
    sentences = re.split(r"(?<=[.!?])\s+(?=[^\d])", text or "")  # never inside 21.400
    keep = [s for s in sentences if s.strip() and all(_given(x, values) for x in _said(_plain(s)))]
    return " ".join(keep).strip()


async def _answer(system: str, server, messages: list) -> str:
    """Claude works one MCP server's tools, in-process, and answers in text."""
    from anthropic import AsyncAnthropic
    from anthropic.lib.tools.mcp import async_mcp_tool
    from mcp import Client

    async with Client(server) as mcp:
        tools = (await mcp.list_tools()).tools
        runner = AsyncAnthropic(timeout=60, max_retries=1).beta.messages.tool_runner(
            model=MODEL, max_tokens=4000, system=system, messages=messages, max_iterations=MAX_TURNS,
            tools=[async_mcp_tool(t, mcp.session) for t in tools],
            output_config={"effort": "low"}, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        )
        final = None
        async for message in runner:
            final = message
    if final is None or final.stop_reason == "refusal":
        raise RuntimeError("no answer")
    return " ".join(b.text for b in final.content if b.type == "text").strip()


def _history(history: list[dict]) -> list:
    return [{"role": "assistant" if h.get("role") == "desk" else "user", "content": h["text"]} for h in history[-8:] if h.get("text")]


async def think(text: str, context: dict, history: list[dict], engine, money=None) -> dict:
    """One spoken request from the planner: Claude works the desk's MCP tools, the page gets the actions, the answer is checked."""
    desk = Desk(engine, context, money)
    screen = {"screen": desk.overview(), **({"open_request_design": desk.run.seen[1], "home": desk.run.seen[0]} if desk.run else {})}
    messages = _history(history) + [{"role": "user", "content": f"Screen now:\n{json.dumps(screen, ensure_ascii=False)}\n\nThe planner says: {text}"}]
    said = await _answer(SYSTEM, build(desk), messages)
    reply = checked(said, desk.seen) or ("Done." if desk.actions else "I could not answer that with numbers from the engine.")
    return {"reply": reply, "actions": desk.actions, "steps": desk.steps}


async def guide_think(text: str, context: dict, history: list[dict]) -> dict:
    """One spoken request from the homeowner: Claude walks them through with the guide's MCP tools. No result is ever
    said; a sentence with a number that neither they, their answers nor the page texts gave is dropped."""
    guide = Guide(context)
    messages = _history(history) + [{"role": "user", "content": f"Screen now:\n{json.dumps(guide.overview(), ensure_ascii=False)}\n\nThe homeowner says: {text}"}]
    said = await _answer(GUIDE_SYSTEM, build_guide(guide), messages)
    reply = checked(said, guide.seen + [{"heard": text}], heard=text) or ("Noted." if guide.actions else "Sorry, I cannot say that. Your installer will.")
    return {"reply": reply, "actions": guide.actions, "steps": guide.steps}


async def turn(engine, context: dict, history: list[dict], audio: bytes | None = None, filename: str = "speech.webm",
               content_type: str = "audio/webm", text: str | None = None, voice: bool = True, money=None, who: str = "planner") -> dict:
    """Recording or typed text in; what was heard, the answer, the page's actions and the answer as speech out."""
    try:
        heard = await transcribe(audio, filename, content_type) if audio else {"text": (text or "").strip(), "language": None}
    except Exception as error:  # no key, a refused key or no network: say so, the page keeps working
        reason = str(error) if isinstance(error, RuntimeError) else f"Speech to text failed ({type(error).__name__})"
        return {"heard": "", "language": None, "reply": reason, "actions": [], "steps": [], "audio": None, "source": "failed"}
    if not heard["text"]:
        return {"heard": "", "language": None, "reply": "I did not catch that.", "actions": [], "steps": [], "audio": None, "source": "none"}
    try:
        out = await (guide_think(heard["text"], context, history) if who == "homeowner" else think(heard["text"], context, history, engine, money))
        source = "claude"
    except Exception as error:  # the desk keeps working without the model
        out, source = {"reply": "The assistant is not reachable right now.", "actions": [], "steps": [], "error": type(error).__name__}, "failed"
    sound = None
    if voice and ready()["speech"]:
        try:
            sound = base64.b64encode(await speak(out["reply"])).decode()
        except Exception as error:
            out["speech_error"] = type(error).__name__
    return {"heard": heard["text"], "language": heard["language"], **out, "audio": sound, "source": source}
