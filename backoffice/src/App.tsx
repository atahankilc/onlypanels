import { useState } from "react";
import { ASK, CANNOT, FLOWS, REAL, STATUS, Status, TENSION, USERS, VALUE } from "./content";

const PAGES = [["istenen", "Bizden istenen"], ["kullanicilar", "Kullanıcılar"], ["gercek", "Bugünkü akış"], ["deger", "Kattığımız değer"], ["akislar", "Ürün akışları"]] as const;
type Page = (typeof PAGES)[number][0];
const Chip = ({ s }: { s: Status }) => <span className={`st ${s}`}>{STATUS[s]}</span>;

export default function App() {
  const [page, setPage] = useState<Page>("istenen");
  return (
    <div className="shell">
      <aside>
        <p className="brand">Back Office</p>
        <nav aria-label="Bölümler">
          {PAGES.map(([id, label]) => (
            <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>{label}</button>
          ))}
        </nav>
        <p className="source">Kaynak: Reonic brief</p>
      </aside>
      <main>
        {page === "istenen" && <Ask />}
        {page === "kullanicilar" && <Users />}
        {page === "gercek" && <RealFlow />}
        {page === "deger" && <Value />}
        {page === "akislar" && <Flows />}
      </main>
    </div>
  );
}

function Users() {
  return (
    <>
      <h1>İki kullanıcı</h1>
      <p className="lead">Çözüm iki kişiye hizmet ediyor. İhtiyaçları örtüşüyor ama aynı değil.</p>
      <div className="pair">
        {USERS.map((u) => (
          <section key={u.id}>
            <h2>{u.name}</h2>
            <p className="role">{u.role}</p>
            <p className="tagline">{u.focus}</p>
            <dl>
              <dt>Kim</dt><dd>{u.who}</dd>
              <dt>İster</dt><dd>{u.wants}</dd>
              <dt>İhtiyacı</dt><dd>{u.needs}</dd>
              <dt>Korkar</dt><dd>{u.fears}</dd>
            </dl>
          </section>
        ))}
      </div>
      <h2 className="gap">Aralarındaki gerilim</h2>
      <dl className="tension">
        {TENSION.map((t) => <div key={t.label}><dt>{t.label}</dt><dd>{t.text}</dd></div>)}
      </dl>
    </>
  );
}

function Flows() {
  return (
    <>
      <h1>Ürün akışları</h1>
      <p className="lead">Brief'teki üç senaryo: ikisi planlayıcının, biri ev sahibinin. Sağda bugünkü durumumuz var.</p>
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
      <h1>Bizden istenen</h1>
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
      <h1>Bugünkü akış</h1>
      <p className="lead">Çözümümüz olmadan işin gerçekte nasıl yürüdüğü. İki yol, ev sahibi soru sorduğunda birleşir: her soru planlayıcıya iş olarak döner.</p>
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
      <h1>Kattığımız değer</h1>
      <p className="lead">Hedefimiz planlayıcının saatlerini alan karar işini dakikalara indirmek. Son söz yine planlayıcıda kalıyor.</p>
      <table>
        <thead><tr><th>Bugün</th><th>Bizimle</th><th>Kime</th><th>Kazanç</th><th>Durum</th></tr></thead>
        <tbody>{VALUE.map((v) => <tr key={v.today}><td>{v.today}</td><td>{v.ours}</td><td>{v.who}</td><td><b>{v.gain}</b></td><td>{v.state}</td></tr>)}</tbody>
      </table>
      <h2 className="gap">Şu an söyleyemeyeceklerimiz</h2>
      <ul className="plain">{CANNOT.map((c) => <li key={c}>{c}</li>)}</ul>
    </>
  );
}
