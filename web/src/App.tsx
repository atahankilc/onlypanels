import { useState } from "react";
import FindHome from "./FindHome";
import { Mark } from "./icons";
import { Segmented } from "./ui";

export default function App() {
  const [view, setView] = useState<"homeowner" | "planner">("homeowner");
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo"><Mark /><h1>Energy Design Desk</h1></div>
        <Segmented label="Demo only: switch profile" variant="dev" value={view} onChange={setView} options={[{ value: "homeowner", label: "Homeowner" }, { value: "planner", label: "Planner" }]} />
      </header>
      <FindHome />
      {view === "planner" && <main className="blank"><p className="muted">The planner view comes in a later step.</p></main>}
    </div>
  );
}
