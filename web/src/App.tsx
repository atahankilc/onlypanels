import { useEffect, useRef, useState } from "react";
import FindHome from "./FindHome";
import { Mark } from "./icons";
import { DEMO_COUNT, loadDemo } from "./demo";
import { Handoff, Mine, Progress } from "./plan";
import Planner from "./Planner";
import { Button, Segmented } from "./ui";

export default function App() {
  const [view, setView] = useState<"homeowner" | "planner">("homeowner");
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  // The homeowner's requests and how far each is. The planner reports progress; a remounted planner never takes it back.
  const [mine, setMine] = useState<Mine[]>([]);
  const sent = (h: Handoff, sentAt = Date.now()) => {
    setHandoffs((l) => [...l.filter((x) => x.ref !== h.ref), h]);
    if (h.ref) setMine((l) => [{ ref: h.ref!, label: h.buildings[0]?.label ?? "Home", sentAt, handoff: h, opened: !!h.seed?.opened || !!h.seed?.offer, offer: h.seed?.offer ?? null }, ...l.filter((x) => x.ref !== h.ref)].sort((a, b) => b.sentAt - a.sentAt));
  };
  // The demo starts with three requests on real homes, oldest first, as if their homeowners had sent them.
  const [loading, setLoading] = useState(DEMO_COUNT); // demo requests still on their way
  useEffect(() => loadDemo((h) => sent(h, h.sentAt), () => setLoading((n) => Math.max(0, n - 1))), []);
  const progress = (ref: string, p: Progress) => setMine((l) => l.map((x) => (x.ref === ref ? { ...x, opened: x.opened || p.opened, offer: p.offer ?? x.offer } : x)));
  // The demo tools fold into one small button; a click elsewhere or Escape folds them again.
  const [devOpen, setDevOpen] = useState(false);
  const devRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!devOpen) return;
    const away = (e: PointerEvent) => { if (!devRef.current?.contains(e.target as Node)) setDevOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDevOpen(false); };
    addEventListener("pointerdown", away); addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [devOpen]);
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo"><Mark /><h1>Energy Design Desk</h1></div>
        <div className="dev" ref={devRef}>
          <Button variant="dev" aria-expanded={devOpen} aria-label="Demo tools" onClick={() => setDevOpen(!devOpen)}>DEV</Button>
          {devOpen && <div className="devmenu" role="group" aria-label="Demo tools">
            <Segmented label="Demo only: switch profile" variant="dev" value={view} onChange={setView} options={[{ value: "homeowner", label: "Homeowner" }, { value: "planner", label: "Planner" }]} />
          </div>}
        </div>
      </header>
      <FindHome onSend={sent} requests={mine} loading={loading} />
      {view === "planner" && <Planner handoffs={handoffs} onProgress={progress} loading={loading} />}
    </div>
  );
}
