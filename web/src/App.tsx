import { useEffect, useRef, useState } from "react";
import FindHome from "./FindHome";
import { Mark } from "./icons";
import { DEMO_COUNT, loadDemo } from "./demo";
import { Handoff, Mine, Progress } from "./plan";
import Planner from "./Planner";
import VoiceDock from "./Voice";
import { sunOf } from "./api";
import { Segmented } from "./ui";

type View = "homeowner" | "planner";
// The demo keeps every request in the page. With the homeowner and the planner on their own addresses, two tabs of the same browser
// each held their own: an offer sent in one never reached the other. The tabs now tell each other what was sent and how far each
// request is. It stays in this browser, as the requests do.
const tabs = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("onlypanels-demo") : null;
type TabNews = { type: "sent"; h: Handoff; sentAt: number; out: Handoff } | { type: "progress"; ref: string; p: Progress };
const viewOf = (): View => (location.pathname.replace(/\/+$/, "") === "/planner" ? "planner" : "homeowner");

export default function App() {
  // Each profile has its own address: /homeowner and /planner. Any other address, the empty one included, opens the homeowner.
  const [view, setViewState] = useState<View>(viewOf);
  useEffect(() => {
    if (location.pathname !== `/${view}`) history.replaceState(null, "", `/${view}${location.search}${location.hash}`);
    const back = () => setViewState(viewOf());
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  const setView = (v: View) => { if (v !== view) history.pushState(null, "", `/${v}`); setViewState(v); };
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  // The homeowner's requests and how far each is. The planner reports progress; a remounted planner never takes it back.
  const [mine, setMine] = useState<Mine[]>([]);
  // `out` is what reaches the installer (share.ts). Sun never travels: with the home shared, the installer works it out again
  // from the building, the same way, so marked cells still line up. Until then the request waits.
  const sent = (h: Handoff, sentAt = Date.now(), out: Handoff = h, told = false) => {
    if (!told && h.ref && !h.seed) tabs?.postMessage({ type: "sent", h, sentAt, out } satisfies TabNews); // the demo's own requests load in every tab
    const arrive = (x: Handoff) => setHandoffs((l) => [...l.filter((y) => y.ref !== x.ref), { ...x, sentAt }]);
    if (out.buildings.some((b) => b.sun === undefined))
      Promise.all(out.buildings.map((b) => (b.sun !== undefined ? b : sunOf(b.square, b.id).then((sun) => ({ ...b, sun })).catch(() => ({ ...b, sun: null })))))
        .then((buildings) => arrive({ ...out, buildings }));
    else arrive(out);
    if (h.ref) setMine((l) => [{ ref: h.ref!, label: h.buildings[0]?.label ?? "Home", sentAt, handoff: { ...h, shared: out.shared ?? h.shared }, opened: !!h.seed?.opened || !!h.seed?.offer, offer: h.seed?.offer ?? null }, ...l.filter((x) => x.ref !== h.ref)].sort((a, b) => b.sentAt - a.sentAt));
  };
  // The demo starts with three requests on real homes, oldest first, as if their homeowners had sent them.
  const [loading, setLoading] = useState(DEMO_COUNT); // demo requests still on their way
  useEffect(() => loadDemo((h) => sent(h, h.sentAt, h, true), () => setLoading((n) => Math.max(0, n - 1))), []);
  const progress = (ref: string, p: Progress, told = false) => {
    if (!told) tabs?.postMessage({ type: "progress", ref, p } satisfies TabNews);
    setMine((l) => l.map((x) => (x.ref === ref ? { ...x, opened: x.opened || p.opened, offer: p.offer ?? x.offer } : x)));
  };
  // News from another tab, applied as if it happened here, without telling it back.
  const latest = useRef({ sent, progress });
  latest.current = { sent, progress };
  useEffect(() => {
    if (!tabs) return;
    const hear = (e: MessageEvent<TabNews>) => { const m = e.data; if (m.type === "sent") latest.current.sent(m.h, m.sentAt, m.out, true); else latest.current.progress(m.ref, m.p, true); };
    tabs.addEventListener("message", hear);
    return () => tabs.removeEventListener("message", hear);
  }, []);
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo"><Mark size={30} /><h1>Only<span>Panels</span></h1></div>
        <div className="dev" role="group" aria-label="Demo tools">
          <span className="dev-tag">DEV</span>
          <Segmented label="Demo only: switch profile" variant="dev" value={view} onChange={setView} options={[{ value: "homeowner", label: "Homeowner" }, { value: "planner", label: "Planner" }]} />
        </div>
      </header>
      <FindHome onSend={(h, out) => sent(h, Date.now(), out)} requests={mine} loading={loading} />
      {view === "planner" && <Planner handoffs={handoffs} onProgress={progress} loading={loading} />}
      {view === "homeowner" && <VoiceDock who="homeowner" />}
    </div>
  );
}
