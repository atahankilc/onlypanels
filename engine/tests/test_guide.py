"""The homeowner's voice helper over a real in-process MCP client: no network."""
import asyncio
import json

from mcp import Client

from reonic_engine.guide import Guide, build
from reonic_engine.voice import checked

CONTEXT = {"screen": "questions", "page": "use", "pages": ["roof", "solar", "battery", "use", "big", "house", "heat", "car", "goal", "send"],
           "answers": {"demand_kwh": None, "has_solar": False, "address": "never sent"}}


def call(guide, name, args):
    async def go():
        async with Client(build(guide)) as mcp:
            return await mcp.call_tool(name, args)
    return asyncio.run(go())


def test_the_address_never_reaches_the_helper():
    guide = Guide(CONTEXT)
    assert "address" not in json.dumps(guide.overview())
    assert call(guide, "set_answers", {"answers": {"address": "Lindwurmstraße 12"}}).is_error and guide.actions == []


def test_answers_are_checked_and_become_one_page_action():
    guide = Guide(CONTEXT)
    assert call(guide, "set_answers", {"answers": {"demand_kwh": "90"}}).is_error  # not a household's yearly use
    out = call(guide, "set_answers", {"answers": {"demand_kwh": "4,200", "heating": "gas", "big_users": ["sauna"]}})
    assert not out.is_error
    assert guide.actions == [{"type": "answers", "answers": {"demand_kwh": 4200, "heating": "Gas", "big_users": ["sauna"]}}]


def test_pages_only_inside_the_questions():
    assert call(Guide(CONTEXT), "go_to_page", {"page": "nowhere"}).is_error
    g = Guide(CONTEXT)
    assert not call(g, "go_to_page", {"page": "heat"}).is_error and g.actions == [{"type": "goto", "page": "heat"}]
    start = Guide({"screen": "start"})
    assert call(start, "go_to_page", {"page": "heat"}).is_error
    assert not call(start, "choose_start", {"way": "questions"}).is_error and start.actions == [{"type": "start", "way": "form"}]


def test_numbers_the_homeowner_said_may_be_repeated_others_not():
    guide = Guide(CONTEXT)
    said = "I noted 4,200 kWh a year. A system of 8 kWp would suit you."
    assert checked(said, guide.seen, heard="we use about 4200 kWh") == "I noted 4,200 kWh a year."


def test_a_new_request_opens_the_questions_in_the_same_turn():
    g = Guide({"screen": "requests", "pages": ["where", "roofq", "use", "send", "share"]})
    assert call(g, "go_to_page", {"page": "use"}).is_error
    async def go():
        async with Client(build(g)) as mcp:
            await mcp.call_tool("new_request", {})
            return await mcp.call_tool("go_to_page", {"page": "use"})
    assert not asyncio.run(go()).is_error and g.actions == [{"type": "new"}, {"type": "goto", "page": "use"}]


def test_choosing_questions_opens_them_in_the_same_turn():
    g = Guide({"screen": "start"})
    async def go():
        async with Client(build(g)) as mcp:
            said = await mcp.call_tool("choose_start", {"way": "questions"})
            return said, await mcp.call_tool("go_to_page", {"page": "use"})
    said, moved = asyncio.run(go())
    assert "start page" in text_of(said) and not moved.is_error
    assert g.actions == [{"type": "start", "way": "form"}, {"type": "goto", "page": "use"}]


def text_of(result):
    return result.content[0].text
