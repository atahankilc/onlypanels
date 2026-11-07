import { useEffect, useState } from "react";
import { makeT } from "../../web/src/i18n";

const t = makeT("en");
const APP = "http://127.0.0.1:5173";
const API_ERROR = t("apiError");
const fmt = (v: number, unit: string) => (v ? `${v} ${unit}` : t("none"));

type Note = { code: string } & Record<string, unknown>;
type Row = { id: string; installer: string; demand_mwh: number | null; heating: string | null };
type Expert = { kwp: number; battery_kwh: number; wallbox: boolean; hp_kw: number };
type Detail = {
  design: {
    pv: { kwp: number }; battery: { kwh: number }; wallbox: { included: boolean }; heatpump: { kw: number }; reasons: Note[];
  };
  expert: Expert[];
};

export function Compare() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setRows).catch(() => setFailed(true));
  }, []);
  const pick = (id: string) => {
    setSelected(id);
    fetch(`/api/projects/${id}`).then((r) => r.json()).then(setDetail).catch(() => setFailed(true));
  };

  if (failed) return <p className="error">{API_ERROR}</p>;
  return (
    <>
      <h1>Compare with expert</h1>
      <p className="lead">276 projects the system has never seen. Pick one to see our proposal next to the expert design.</p>
      <div className="compare">
        <div className="scroll">
          {!rows && <p className="muted-text">{t("loading")}</p>}
          <table>
            <thead><tr><th>{t("installerShort")}</th><th>{t("demandShort")}</th><th>{t("heatShort")}</th></tr></thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id} className={selected === r.id ? "pickrow on" : "pickrow"} tabIndex={0} onClick={() => pick(r.id)} onKeyDown={(e) => e.key === "Enter" && pick(r.id)}>
                  <td>{r.installer}</td><td>{r.demand_mwh ?? "–"} MWh</td><td>{r.heating ? t(r.heating) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section>
          {!detail && <p className="muted-text">{t("pick")}</p>}
          {detail && (
            <>
              <table>
                <thead><tr><th></th><th>{t("pv")}</th><th>{t("battery")}</th><th>{t("wallbox")}</th><th>{t("heatpump")}</th></tr></thead>
                <tbody>
                  <tr className="ours">
                    <th scope="row">{t("ours")}</th><td>{detail.design.pv.kwp.toFixed(1)} kWp</td><td>{fmt(detail.design.battery.kwh, "kWh")}</td>
                    <td>{t(detail.design.wallbox.included ? "included" : "none")}</td><td>{fmt(detail.design.heatpump.kw, "kW")}</td>
                  </tr>
                  {detail.expert.map((e, i) => (
                    <tr key={i}>
                      <th scope="row">{t("expert")}{detail.expert.length > 1 ? ` · ${t("option")} ${i + 1}` : ""}</th>
                      <td>{fmt(e.kwp, "kWp")}</td><td>{fmt(e.battery_kwh, "kWh")}</td><td>{t(e.wallbox ? "included" : "none")}</td><td>{fmt(e.hp_kw, "kW")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2 className="gap">{t("why")}</h2>
              <ul className="plain">{detail.design.reasons.map((r) => <li key={r.code}>{t(`r_${r.code}`, r)}</li>)}</ul>
              <p className="open"><a href={`${APP}/?project=${selected}`}>{t("openInDesign")}</a></p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

type Scores = { dev_projects: number; check_homes: number; scores: Record<string, Record<string, number>>; checks: Record<string, number> };
const METHODS: [string, string][] = [["m_engine", "engine"], ["m_median", "median design"], ["m_mode", "installer mode"], ["m_rule", "rule of thumb"]];

export function Results() {
  const [data, setData] = useState<Scores | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/scores").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setData).catch(() => setFailed(true));
  }, []);
  if (failed) return <p className="error">{API_ERROR}</p>;
  if (!data) return <p className="muted-text">{t("loading")}</p>;
  return (
    <>
      <h1>Overall results</h1>
      <p className="lead">{t("resultsIntro", { n: data.dev_projects })}</p>
      <table>
        <thead><tr><th>{t("method")}</th><th className="n">{t("pvError")}</th><th className="n">{t("batError")}</th><th className="n">{t("tier")}</th></tr></thead>
        <tbody>
          {METHODS.map(([label, key]) => {
            const s = data.scores[key];
            return (
              <tr key={key} className={key === "engine" ? "ours" : ""}>
                <th scope="row">{t(label)}</th><td className="n">{s.kwp_mae_last.toFixed(2)}</td><td className="n">{s.batt_mae_last.toFixed(2)}</td><td className="n">{(s.batt_exact_closest * 100).toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 className="gap">{t("checks")}</h2>
      <p className="note-line">{t("checksIntro", { n: data.check_homes })}</p>
      <table>
        <tbody>{Object.entries(data.checks).map(([k, v]) => <tr key={k}><th scope="row">{t(k)}</th><td className="n">{(v * 100).toFixed(1)}%</td></tr>)}</tbody>
      </table>
    </>
  );
}
