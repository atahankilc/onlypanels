import { useEffect, useState } from "react";
import { Request, START } from "./api";
import Homeowner from "./Homeowner";
import { Mark, Out, Undo } from "./icons";
import Planner from "./Planner";

const KEY = "energy-desk-v1";
const BACK_OFFICE = "http://127.0.0.1:5174";

// Made-up example requests, so the planner's inbox is not empty.
const EXAMPLES: Request[] = [
  { id: "ex1", title: "Family home, gas heating", from: "homeowner", status: "draft", overrides: {},
    inputs: { ...START, demand_kwh: 5200, heating: "Gas", heat_kwh: 20000, area_m2: 60 } },
  { id: "ex2", title: "Couple, electric car", from: "homeowner", status: "draft", overrides: {},
    inputs: { ...START, demand_kwh: 3800, ev: true, ev_km: 12000 } },
];

type Saved = { requests: Request[]; mine: string | null };
const load = (): Saved => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "") as Saved; } catch { return { requests: EXAMPLES, mine: null }; }
};

export default function App() {
  const [view, setView] = useState<"planner" | "homeowner">("homeowner");
  const [saved, setSaved] = useState(load);
  const [openId, setOpenId] = useState<string | null>(null);
  const { requests, mine } = saved;

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(saved)), [saved]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("project");
    if (!id) return;
    fetch(`/api/projects/${id}`).then((r) => r.json()).then((d) => {
      const request: Request = { id, title: "Held-out project", from: "planner", status: "draft", inputs: d.inputs, overrides: {} };
      setSaved((s) => ({ ...s, requests: [request, ...s.requests.filter((r) => r.id !== id)] }));
      setOpenId(id); setView("planner");
    }).catch(() => undefined);
  }, []);

  const add = (r: Request, isMine: boolean) => setSaved((s) => ({ requests: [r, ...s.requests], mine: isMine ? r.id : s.mine }));
  const update = (id: string, patch: Partial<Request>) =>
    setSaved((s) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const open = view === "planner";
  return (
    <div className="app">
      <header className={`topbar${open ? " solid" : ""}`}>
        <div className="logo"><Mark /><h1>Energy Design Desk</h1></div>
        <div className="topright">
          <div className="switch glass" role="group" aria-label="Choose who you are">
            {(["homeowner", "planner"] as const).map((v) => (
              <button key={v} className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "homeowner" ? "Homeowner" : "Planner"}
              </button>
            ))}
          </div>
          <a className="pill glass" href={BACK_OFFICE}>Back office<Out size={14} /></a>
          <button className="round glass big" aria-label="Reset demo" title="Reset demo" onClick={() => { setSaved({ requests: EXAMPLES, mine: null }); setOpenId(null); }}><Undo size={18} /></button>
        </div>
      </header>
      {view === "planner"
        ? <Planner requests={requests} openId={openId} setOpenId={setOpenId} add={(r) => add(r, false)} update={update} />
        : <Homeowner request={requests.find((r) => r.id === mine) ?? null} add={(r) => add(r, true)} update={update} />}
    </div>
  );
}
