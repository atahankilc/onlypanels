import { useState } from "react";
import { Compare, Results } from "./quality";
import { ASK, CANNOT, FLOWS, REAL, STATUS, Status, TENSION, USERS, VALUE } from "./content";

const PAGES = [["istenen", "The ask"], ["kullanicilar", "Users"], ["gercek", "Today's flow"], ["deger", "Our value"], ["akislar", "Product flows"], ["karsilastir", "Compare with expert"], ["sonuclar", "Overall results"]] as const;
type Page = (typeof PAGES)[number][0];
const Chip = ({ s }: { s: Status }) => <span className={`st ${s}`}>{STATUS[s]}</span>;

export default function App() {
  const [page, setPage] = useState<Page>("istenen");
  return (
    <div className="shell">
      <aside>
        <p className="brand">Back Office</p>
        <nav aria-label="Sections">
          {PAGES.map(([id, label]) => (
            <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>{label}</button>
          ))}
        </nav>
        <a className="source" href="http://127.0.0.1:5173">Go to the app</a>
      </aside>
      <main>
        {page === "istenen" && <Ask />}
        {page === "kullanicilar" && <Users />}
        {page === "gercek" && <RealFlow />}
        {page === "deger" && <Value />}
        {page === "akislar" && <Flows />}
        {page === "karsilastir" && <Compare />}
        {page === "sonuclar" && <Results />}
      </main>
    </div>
  );
}

function Users() {
  return (
    <>
      <h1>Two users</h1>
      <p className="lead">The solution serves two people whose needs overlap but are not the same.</p>
      <div className="pair">
        {USERS.map((u) => (
          <section key={u.id}>
            <h2>{u.name}</h2>
            <p className="role">{u.role}</p>
            <p className="tagline">{u.focus}</p>
            <dl>
              <dt>Who</dt><dd>{u.who}</dd>
              <dt>Wants</dt><dd>{u.wants}</dd>
              <dt>Needs</dt><dd>{u.needs}</dd>
              <dt>Fears</dt><dd>{u.fears}</dd>
            </dl>
          </section>
        ))}
      </div>
      <h2 className="gap">The tension</h2>
      <dl className="tension">
        {TENSION.map((t) => <div key={t.label}><dt>{t.label}</dt><dd>{t.text}</dd></div>)}
      </dl>
    </>
  );
}

function Flows() {
  return (
    <>
      <h1>Product flows</h1>
      <p className="lead">The brief's three use cases: two for the planner, one for the homeowner. Current status is on the right.</p>
      {FLOWS.map((f) => (
        <section key={f.name} className="flow">
          <h2>{f.name} <span className="muted">{f.who} · {f.need}</span></h2>
          <p>{f.goal}</p>
          <ol className="steps">
            {f.steps.map((s) => <li key={s.does}><span className="who">{s.who}</span><span>{s.does}</span><Chip s={s.status} /></li>)}
          </ol>
        </section>
      ))}
    </>
  );
}

function Ask() {
  return (
    <>
      <h1>The ask</h1>
      <p className="lead">{ASK.core}</p>
      <div className="grid4">
        {ASK.groups.map((g) => (
          <section key={g.title}><h2>{g.title}</h2><ul>{g.items.map((i) => <li key={i}>{i}</li>)}</ul></section>
        ))}
      </div>
    </>
  );
}

function RealFlow() {
  return (
    <>
      <h1>Today's flow</h1>
      <p className="lead">How the work runs without our solution. The two paths meet when the homeowner asks a question: each question returns to the planner as work.</p>
      <div className="pair">
        {REAL.map((r) => (
          <section key={r.who}>
            <h2>{r.who}</h2>
            <p className="role">{r.intro}</p>
            <ol className="real">
              {r.steps.map((s) => (
                <li key={s.step}><div><b>{s.step}</b><span>{s.pain}</span></div><em className={s.src === "Brief" ? "b" : "c"}>{s.src}</em></li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}

function Value() {
  return (
    <>
      <h1>Our value</h1>
      <p className="lead">Our goal is to turn hours of decision work into minutes, while the planner keeps the final say.</p>
      <table>
        <thead><tr><th>Today</th><th>With us</th><th>For</th><th>Gain</th><th>Status</th></tr></thead>
        <tbody>{VALUE.map((v) => <tr key={v.today}><td>{v.today}</td><td>{v.ours}</td><td>{v.who}</td><td><b>{v.gain}</b></td><td>{v.state}</td></tr>)}</tbody>
      </table>
      <h2 className="gap">What we cannot claim yet</h2>
      <ul className="plain">{CANNOT.map((c) => <li key={c}>{c}</li>)}</ul>
    </>
  );
}
