import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Answers, NO_ANSWERS, Place, Poly, Real, Selected, View, measured, placeAt, searchPlace, chosenKeys, homeParts, homesIn, NO_CHOICE, Choice, sunOf, areaAt, markedOf, markedM2, paintChoice, panelsOf, panelsM2 } from "./api";
import { P2, P3, toLocal } from "./geometry";
import { Handoff, Mine } from "./plan";
import Requests, { RequestPage } from "./Requests";
import HomeMap, { Face, Picked, Step, Tool, letter } from "./HomeMap";
import { Close, Search, Undo } from "./icons";
import Review, { Stage, pagesFor } from "./Review";
import { setGuideContext, useVoiceActions } from "./voiceBus";
import SunView from "./SunView";
import { withTrees } from "./treeShade";
import StartChoice, { Start } from "./Start";
import { SHARE_ALL, Shared, forInstaller, roofNumbers, toldRoof } from "./share";
import { clean } from "./questions";
import { Button, IconButton, Segmented } from "./ui";

const PHOTO: View = { layer: "photo", moment: null }; // the questions show the photo only: sunlight waits for the offer
const short = (label: string) => label.split(", ").slice(0, 2).join(", ");

function toReal(answer: Awaited<ReturnType<typeof measured>>, origin: P2): Real {
  const here = (r: P3[]) => r.map((p) => [...toLocal(origin, [p[0], p[1]]), p[2]] as P3);
  const polys = (list: Poly[]): Poly[] => list.map((p) => ({ ring: here(p.ring), holes: p.holes.map(here) }));
  return { roofs: polys(answer.roofs), walls: polys(answer.walls) };
}

// The start choice is a preference of this browser, nothing about a home.
const START_KEY = "start-choice";
const savedStart = (): Start | null => { try { const v = localStorage.getItem(START_KEY); return v === "map" || v === "form" ? v : null; } catch { return null; } };
/** Between the two ways of answering, where the browser can. Plain: the page cross-fades. "in" / "out": the map
 *  opens as a circle out of the With/Without switch, or closes back into it (see html[data-vt] in styles.css). */
const swap = (fn: () => void, map?: "in" | "out") => {
  const d = document as Document & { startViewTransition?: (f: () => Promise<void>) => { finished: Promise<void> } };
  // The map switch plays even with the system's reduced motion on: it is one short movement the person asked for.
  if (!d.startViewTransition || (!map && matchMedia("(prefers-reduced-motion: reduce)").matches)) { fn(); return; }
  const html = document.documentElement;
  const from = map && document.querySelector(".startswitch")?.getBoundingClientRect();
  if (from) {
    const x = from.left + from.width / 2, y = from.top + from.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)); // reaches the farthest corner
    html.style.setProperty("--vt-x", `${x}px`); html.style.setProperty("--vt-y", `${y}px`); html.style.setProperty("--vt-r", `${r}px`);
    html.dataset.vt = map;
  } else delete html.dataset.vt;
  const mine = ++swaps;
  // The new picture is taken only once React has written the new page (see the layout effect in FindHome). flushSync
  // does not flush inside the transition's callback, so the page changed a moment later and, when the browser was busy
  // with the map, after the picture: the circle then showed the old page and the new one popped in without it.
  const update = () => new Promise<void>((res) => { committed = res; fn(); setTimeout(res, 600); });
  d.startViewTransition(update).finished.finally(() => { if (mine === swaps) delete html.dataset.vt; }); // a quicker second switch keeps its own circle
};
let swaps = 0;
let committed: (() => void) | null = null; // resolves the running swap once its page is in the DOM
const saveStart = (s: Start) => { try { localStorage.setItem(START_KEY, s); } catch { /* private mode: asked again next time */ } };

const newRef = () => `R-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; // a reference the homeowner can quote

export default function FindHome({ onSend, requests, loading = 0 }: { onSend: (h: Handoff, out: Handoff) => void; requests: Mine[]; loading?: number }) {
  useLayoutEffect(() => { committed?.(); committed = null; }); // after every commit: a waiting swap may take its picture
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<P2 | null>(null);
  const [buildings, setBuildings] = useState<Selected[]>([]);
  const formFirst = useState(() => savedStart() === "form")[0]; // a browser that chose no map opens straight on it, no sweep
  const [step, setStep] = useState<Step>(formFirst ? "review" : "pick");
  const [move, setMove] = useState<"in" | "out" | null>(null); // while the map's edge sweeps between the steps: see .curtain
  const [waiting, setWaiting] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // the building shown in detail
  const [near, setNear] = useState<string | null>(null); // the building under the pointer in the list
  const [face, setFace] = useState<Face | null>(null); // the roof surface under the pointer, on the map or in the list
  const [look, setLook] = useState<{ id: string } | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [view, setView] = useState<View>(PHOTO); // what the offer page paints on the surfaces: photo or sunlight
  const [shaded, setShaded] = useState<{ ref: string; buildings: Selected[] } | null>(null); // the home with trees on its sun, for the offer
  const [ref, setRef] = useState(newRef);
  const [fromList, setFromList] = useState(false); // the home on screen is a sent request opened from the list
  // Map or questions only: asked once, then kept in this browser. Nothing shows on the map until chosen.
  const [start, setStart] = useState<Start | null>(() => savedStart());
  const [offerPanels, setOfferPanels] = useState<Record<string, number> | null>(null); // the offer's modules, or the variant being tried, on the roof
  const [answers, setAnswers] = useState<Answers>(NO_ANSWERS);
  const [choice, setChoice] = useState<Choice>(NO_CHOICE);
  const [shared, setShared] = useState<Shared>(SHARE_ALL); // what the homeowner lets go to the installer
  // What goes is the answers as they count: a typed number outside its span is left out (questions.ts clean).
  const counted = clean(answers);
  const request: Handoff = { buildings, answers: counted, choice, ref, roof: buildings.length ? roofNumbers(buildings) : toldRoof(counted) };
  // The homeowner keeps the whole request; the installer gets only what was switched on.
  useEffect(() => { if (stage === "sent" && !requests.some((m) => m.ref === ref)) onSend(request, forInstaller(request, shared)); }, [stage]);
  const [tool, setTool] = useState<Tool | null>(null); // no tool: the mouse moves the map
  const [undo, setUndo] = useState<Choice[]>([]); // one step per stroke
  const now = useRef(choice);
  now.current = choice;
  const typed = useRef("");
  const asked = useRef("");

  // Suggestions as you type. A slow answer to an older text never replaces a newer one.
  useEffect(() => {
    const text = q.trim();
    asked.current = text;
    if (text.length < 3 || text === typed.current) { setPlaces(null); return; }
    const timer = setTimeout(() => {
      setBusy(true);
      searchPlace(text)
        .then((found) => { if (asked.current === text) { setPlaces(found); setActive(0); setError(""); } })
        .catch(() => { if (asked.current === text) setError("Address search is not reachable right now."); })
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const show = (text: string) => { typed.current = text; setQ(text); };
  /** Search only takes you there. Which buildings count is the user's choice. */
  const choose = (p: Place) => { show(p.label); setPlaces(null); setFocus([p.lon, p.lat]); };
  const clear = () => { show(""); setPlaces(null); setError(""); setFocus(null); };

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setPlaces(null);
    if (!places?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % places.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + places.length) % places.length); }
    if (e.key === "Enter") { e.preventDefault(); choose(places[active]); }
  };

  const patch = (id: string, change: Partial<Selected>) => setBuildings((list) => list.map((b) => (b.id === id ? { ...b, ...change } : b)));
  // The row under the pointer goes with it and never reports the pointer leaving, so its highlight is cleared here.
  const remove = (home: string) => { setNear(null); setBuildings((list) => list.filter((b) => b.home !== home)); };
  const chosen = chosenKeys(buildings, choice);
  const marked = markedOf(buildings, choice), taken = panelsOf(buildings, choice);
  const drawn = stage === "solar" ? "panels" : "cells"; // the solar page draws where panels already are, the roof page the homeowner's priority
  const paint = (cells: Record<string, number[]>, on: boolean, start: boolean) => {
    if (start) setUndo((u) => [...u.slice(-40), now.current]);
    setChoice((c) => paintChoice(buildings, c, cells, on, drawn));
  };
  const startOver = () => { setUndo((u) => [...u, choice]); setChoice({ ...choice, [drawn]: {} }); };
  const stepBack = () => { const last = undo[undo.length - 1]; if (!last) return; setUndo(undo.slice(0, -1)); setChoice(last); };
  const drawing = stage === "roof" || (stage === "solar" && !!answers.has_solar);
  useEffect(() => setTool(null), [stage]); // each page starts with the mouse moving the map
  useEffect(() => { if (answers.has_solar === false && Object.keys(choice.panels).length) setChoice((c) => ({ ...c, panels: {} })); }, [answers.has_solar]); // no solar: no panels on the roof
  const retrySun = () => buildings.filter((b) => b.sun === null).forEach((b) => { patch(b.id, { sun: undefined }); sunOf(b.square, b.id).then((sun) => patch(b.id, { sun })).catch(() => patch(b.id, { sun: null })); });

  /** A click selects a building, a second click lets it go. Its roof loads quietly for the next step. */
  const toggle = (hit: Picked) => {
    if (buildings.some((b) => b.home === hit.home)) { remove(hit.home); return; }
    const { home, square } = hit;
    const addPart = (id: string, origin: P2) => {
      setBuildings((list) => (list.some((b) => b.id === id) ? list : [...list, { id, home, square, label: list.find((b) => b.home === home)?.label ?? "Building", origin, real: null, measuring: true }]));
      sunOf(square, id).then((sun) => patch(id, { sun })).catch(() => patch(id, { sun: null }));
      measured(square, id).then((m) => patch(id, { measuring: false, real: toReal(m, origin) })).catch(() => patch(id, { measuring: false }));
    };
    addPart(hit.id, hit.at);
    homeParts(square, home).then((parts) => parts.filter((p) => p.id !== hit.id).forEach((p) => addPart(p.id, p.at))).catch(() => undefined);
    placeAt(hit.at[1], hit.at[0]).then((p) => setBuildings((list) => list.map((b) => (b.home === home ? { ...b, label: short(p.label) } : b)))).catch(() => undefined);
  };

  // Sunlight is no part of the questions. It shows with the offer, once the planner has put trees on it, and only when the home
  // went to the installer: the trees are asked for by the home's 2 km square, which then says nothing the installer does not know.
  const mine = requests.find((m) => m.ref === ref);
  const sunShown = step === "review" && stage === "sent" && !!mine?.offer && buildings.length > 0 && (mine.handoff.shared?.home ?? true);
  useEffect(() => {
    if (!sunShown || shaded?.ref === ref) return;
    const forRef = ref;
    withTrees(buildings).then(({ buildings: b }) => setShaded((now) => (now?.ref === forRef ? now : { ref: forRef, buildings: b })));
  }, [sunShown, ref]);
  const sunHome = sunShown && shaded?.ref === ref ? shaded.buildings : null;
  // Move on as soon as the measured models are in.
  const measuring = buildings.some((b) => b.measuring || b.sun === undefined);
  useEffect(() => {
    if (!waiting || measuring) return;
    setWaiting(false); setOpen(buildings[0]?.home ?? null); setStep("review"); setMove("in");
    // The census around the home, as hints for the house and heating questions. Quietly skipped if it fails.
    const at = buildings[0]?.origin;
    if (at) areaAt(at[1], at[0]).then((area) => setAnswers((x) => ({ ...x, area }))).catch(() => undefined);
  }, [waiting, measuring]);
  const goTo = (id: string) => { setOpen(id); setLook({ id }); };

  const begin = (s: Start) => {
    setStart(s); saveStart(s);
    if (s === "map") setStage("intro");
    if (s === "form") { setFormView(null); setBuildings([]); setStage("intro"); setOpen(null); setStep("review"); setMove(null); }
  };
  // Questions only: no map behind the questions. Its frame asks once more for the home, keeping every answer.
  // Questions only: no map at all, the questions in the middle. A sent request with a home still opens on the map.
  const bare = start === "form" && step === "review" && buildings.length === 0;
  // Without the map, the requests come first when there are any; "New request" opens the questions.
  const [formView, setFormView] = useState<"list" | "form" | null>(null);
  const listing = bare && stage !== "sent" && (formView ?? (requests.length || loading ? "list" : "form")) === "list";
  const addHome = () => { setStart("map"); saveStart("map"); setStage("intro"); setFace(null); setStep("pick"); setMove(null); };
  /** Map or questions, switched at once from either side. Answers already given stay. */
  const switchTo = (s: Start) => { if (s === start) return; swap(() => (s === "form" ? begin("form") : addHome()), s === "form" ? "out" : "in"); };
  /** Back from the first page: the map's picking step, or the start choice for questions only. */
  const backToPick = () => { if (start === "form" && requests.length) { setFormView("list"); return; } setFace(null); setStep("pick"); setMove("out"); if (start === "form") setStart(null); };

  /** After sending: back to the map, ready for another home. The request stays in the list with its progress. */
  /** A sent request, opened from the start page: its home on the map and where it is, read only. */
  const openRequest = (m: Mine) => {
    const h = m.handoff;
    setFromList(true); setBuildings(h.buildings); setAnswers(h.answers); setChoice(h.choice); setShared({ ...SHARE_ALL, ...h.shared }); setRef(m.ref); setStage("sent"); setTool(null); setUndo([]);
    setOpen(h.buildings[0]?.home ?? null); setStep("review"); setMove("in");
  };
  // The page that is leaving keeps its content while the map's edge sweeps it away; the answers are cleared once it is gone,
  // so the first question does not flash up on the way out. Meanwhile the start page shows the list, not a picked home.
  const clearAfter = useRef(false);
  const newRequest = () => {
    setFace(null); setStep("pick"); setMove("out"); setTool(null); setUndo([]); setBuildings([]); setFromList(true); setStart(savedStart() === "map" ? "map" : null);
    clearAfter.current = true;
  };
  // While the page sweeps out it is drawn as it was the moment it started to leave: the home is already cleared for the map,
  // and drawing the page without it would shorten its lines and the panel on the way out.
  const reviewProps = { refId: ref, onPanels: setOfferPanels, progress: requests.find((m) => m.ref === ref), done: newRequest, stage, setStage, answers, setAnswers, buildings, setFace, m2: markedM2(buildings, choice), changed: Object.keys(choice.cells).length > 0, reset: startOver, panelM2: panelsM2(buildings, choice), retrySun, back: backToPick, request, shared, setShared };
  const leaving = useRef(reviewProps);
  if (move !== "out") leaving.current = reviewProps;
  const moved = () => {
    setMove(null);
    if (!clearAfter.current) return;
    clearAfter.current = false;
    setStage("intro"); setAnswers(NO_ANSWERS); setChoice(NO_CHOICE); setRef(newRef()); setFromList(false); setShared(SHARE_ALL); setView(PHOTO);
    if (savedStart() === "form") swap(() => begin("form")); // the next request starts the way this browser chose
  };

  // The voice helper sees where the homeowner is and their answers, never the home, the address, the photo or the census;
  // it starts, moves between pages and fills in answers as their own taps would (guide.py).
  const screen = step === "pick" && start === null ? "start" : listing ? "requests" : step === "pick" ? "pick" : stage === "sent" ? "sent" : "questions";
  const { address: _a, meter_photo: _m, area: _c, ...spoken } = answers;
  useEffect(() => { setGuideContext({ screen, page: screen === "questions" ? stage : null, pages: [...pagesFor(buildings.length > 0), "share"], answers: spoken }); });
  const starting = useRef<string | null>(null); // the page a voice start lands on
  useVoiceActions((x) => {
    // "Only questions" by voice opens the questions themselves, not first the list of sent requests, as the helper says.
    // The switch plays as a transition and lands later, so a page asked for in the same turn waits for it.
    if (x.type === "start" && start === null && !move) {
      starting.current = ""; // begin() picks the first page; a page asked for in the same turn replaces it
      swap(() => { begin(x.way); if (x.way === "form") { setFormView("form"); if (starting.current) setStage(starting.current as Stage); } starting.current = null; });
    }
    if (x.type === "new" && listing) { setFormView("form"); setStage("intro"); }
    if (x.type === "goto" && starting.current !== null) starting.current = x.page;
    else if (x.type === "goto" && step === "review" && (stage !== "sent" || listing)) setStage(x.page as Stage);
    if (x.type === "answers" && stage !== "sent") {
      const v = x.answers as Partial<Answers>;
      setAnswers((a) => ({ ...a, ...v,
        ...(v.demand_kwh != null ? { use_source: "exact" as const } : v.monthly_eur != null ? { use_source: "payment" as const } : {}),
        ...(v.price_ct_kwh != null ? { price_known: true } : {}) }));
    }
  });

  return (
    <main className={`stage ${step}${bare ? " bare" : ""}`}>
      <HomeMap buildings={sunHome ?? buildings} step={step} focus={focus} onPick={step === "pick" ? toggle : undefined}
        open={open} near={near} face={face} look={look} onFace={setFace} onOpen={goTo} view={sunHome ? view : PHOTO} chosen={step === "review" ? chosen : []} onToggle={() => undefined} editing={drawing && !!tool} installed={[]}
        marked={step === "review" ? marked : undefined} taken={step === "review" ? taken : undefined} editsOn={drawn === "panels" ? taken : marked} tool={drawing ? tool ?? undefined : undefined} onPaint={drawing ? paint : undefined}
        panels={step === "review" && stage === "sent" ? offerPanels ?? undefined : undefined} keepClear={mine?.offer?.basis?.obstacles} priority={step === "review" ? marked : undefined} />
      {step === "review" && drawing && !move && <div className="tools">
        <Button variant="glass" size="lg" aria-pressed={tool === "surface"} onClick={() => setTool(tool === "surface" ? null : "surface")}>Whole surface</Button>
        <Button variant="glass" size="lg" aria-pressed={tool === "draw"} onClick={() => setTool(tool === "draw" ? null : "draw")}>Draw</Button>
        <IconButton variant="glass" size="lg" label="Undo" disabled={!undo.length} onClick={stepBack}><Undo /></IconButton>
      </div>}
      {sunHome && !move && <SunView view={view} setView={setView} buildings={sunHome} />}
      {step === "pick" && !move && start === null && <StartChoice onChoose={(s) => swap(() => begin(s))} />}
      {listing && !move && <RequestPage list={requests} loading={loading} onNew={() => { setFormView("form"); setStage("intro"); }}
        onOpen={(m) => { if (!m.handoff.buildings.length) { openRequest(m); return; } setStep("pick"); setTimeout(() => openRequest(m), 0); }} />}
      {bare && !move && stage !== "sent" && <div className="startswitch"><Segmented label="With or without the map" variant="glass" size="lg" value="form" onChange={switchTo} options={[{ value: "map", label: "With map" }, { value: "form", label: "Without map" }]} /></div>}
      {step === "pick" && start === "map" && !move && !buildings.length && <div className="startswitch"><Segmented label="With or without the map" variant="glass" size="lg" value="map" onChange={switchTo} options={[{ value: "map", label: "With map" }, { value: "form", label: "Without map" }]} /></div>}
      {step === "pick" && start === "map" && !buildings.length && <div className="mapnote">Find your area, then click the buildings you want</div>}

      {(step === "pick" || move === "in") && <Curtain move={move} done={moved}>
      <div className="finder">
        <div className="field-pill">
          <Search />
          <input id="where" role="combobox" aria-expanded={!!places?.length} aria-controls="places" aria-label="Go to an address" autoComplete="off"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder="Go to an address in Munich" />
          {q && <IconButton label="Clear" onClick={clear}><Close /></IconButton>}
        </div>
        {(places || error) && <div className="suggest" id="places" role="listbox">
          {error && <p className="error">{error}</p>}
          {places?.length === 0 && !busy && <p className="muted">Nothing found in the Munich area.</p>}
          {places?.map((p, i) => {
            const [name, ...rest] = p.label.split(", ");
            return <button type="button" key={p.label} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => choose(p)}><b>{name}</b><small>{rest.slice(0, 3).join(", ")}</small></button>;
          })}
        </div>}
      </div>

      {/* One panel at a time on the start page: the requests, or the buildings being picked. A request opened from the list keeps
          the list on screen while the map's edge sweeps it away, instead of flashing that home's buildings as if just picked. */}
      {(!buildings.length || fromList) && (requests.length > 0 || loading > 0) && <Requests list={requests} loading={loading} onOpen={openRequest} gone={move === "in"} />}
      {buildings.length > 0 && !fromList && <aside className={move === "in" ? "panel gone" : "panel"}>
        <h2>Selected buildings</h2>
        <ul className="picked">{homesIn(buildings).map((b, i) => <li key={b.home} onMouseEnter={() => setNear(b.home)} onMouseLeave={() => setNear(null)}>
          <button type="button" className="row" onClick={() => goTo(b.home)}><span className="tag">{letter(i)}</span><span className="name">{b.label}</span></button>
          <IconButton label={`Remove ${b.label}`} onClick={() => remove(b.home)}><Close /></IconButton>
        </li>)}</ul>
        <div className="panelfoot"><Button variant="solid" size="lg" wide disabled={waiting} onClick={() => setWaiting(true)}>{waiting ? "Preparing your building…" : "Continue"}</Button></div>
      </aside>}
      </Curtain>}

      {(step === "review" || move === "out") && !listing && <div className={move === "out" ? "curtain new back" : "curtain new"} onAnimationEnd={(e) => e.target === e.currentTarget && moved()}><Review {...leaving.current} /></div>}
    </main>
  );
}

/** The picking controls: while the map's edge sweeps, inside the wrapper it wipes or uncovers; otherwise nothing extra around them. */
function Curtain({ move, done, children }: { move: "in" | "out" | null; done: () => void; children: React.ReactNode }) {
  if (!move) return <>{children}</>;
  return <div className={move === "out" ? "curtain old back" : "curtain old"} inert={move === "in"} onAnimationEnd={(e) => e.target === e.currentTarget && done()}>{children}</div>;
}
