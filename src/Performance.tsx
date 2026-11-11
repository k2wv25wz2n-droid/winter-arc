import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";

type Task = { id: string; title: string };
type Day = { date: string; plannedTasks?: Task[]; completedTaskIds?: string[] };
type Checkout = { date: string; sleep?: string | number; water?: string | number; energy?: string | number; nutrition?: string; updatedAt?: string };
type SetData = { weight?: string; reps?: string; done?: boolean };
type Session = { date: string; workoutId: string; finished?: boolean; sets?: Record<string, SetData[]> };
type Week = { label: string; days: string[] };
const START = "2026-11-29";
const END = "2027-01-22";
const checkoutTask = (title: string) => /abend[\s-]*check[\s-]*out|evening[\s-]*check[\s-]*out/i.test(title);
const numeric = (value: string | number | undefined): number | null => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const fmt = (n: number | null, decimals = 1) => n === null ? "—" : n.toLocaleString("de-DE", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const dateLabel = (date: string) => date.slice(8, 10) + "." + date.slice(5, 7) + ".";
const panel: React.CSSProperties = { background: "#191919", border: "1px solid #333", borderRadius: 12, padding: 18 };
const small: React.CSSProperties = { color: "#999", fontSize: 12 };
function arcDays() {
  const result: string[] = [];
  for (let t = Date.parse(START + "T12:00:00Z"); t <= Date.parse(END + "T12:00:00Z"); t += 86400000) result.push(new Date(t).toISOString().slice(0, 10));
  return result;
}
const allDays = arcDays();
const weeks: Week[] = Array.from({ length: Math.ceil(allDays.length / 7) }, (_, i) => {
  const days = allDays.slice(i * 7, i * 7 + 7);
  return { label: `${dateLabel(days[0])} – ${dateLabel(days[days.length - 1])}`, days };
});

export default function Performance() {
  const userId = auth.currentUser?.uid;
  const [days, setDays] = useState<Day[]>([]);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState([false, false, false]);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"arc" | "all">("arc");
  useEffect(() => {
    if (!userId) return;
    const sources = [
      { path: "dailyPlanDays", set: (data: Record<string, unknown>[]) => setDays(data as Day[]) },
      { path: "eveningCheckouts", set: (data: Record<string, unknown>[]) => setCheckouts(data as Checkout[]) },
      { path: "trainingSessions", set: (data: Record<string, unknown>[]) => setSessions(data as Session[]) },
    ];
    const unsubs = sources.map((source, i) => onSnapshot(collection(db, "users", userId, source.path), snap => {
      source.set(snap.docs.map(doc => doc.data()));
      setLoaded(prev => prev.map((v, j) => j === i ? true : v));
    }, err => { console.error(err); setError(`Firebase-Daten aus ${source.path} konnten nicht geladen werden.`); }));
    return () => unsubs.forEach(unsub => unsub());
  }, [userId]);

  const stats = useMemo(() => {
    const today = getTodayKey();
    const inRange = (date: string) => !!date && date <= today && (period === "all" || (date >= START && date <= END));
    const relevantDays = days.filter(d => inRange(d.date));
    const checkoutMap = new Map(checkouts.filter(c => inRange(c.date) && c.updatedAt).map(c => [c.date, c]));
    const relevantCheckouts = [...checkoutMap.values()];
    const relevantSessions = sessions.filter(s => s.finished && inRange(s.date));
    const ratios = relevantDays.flatMap(day => {
      if (!Array.isArray(day.plannedTasks) || day.plannedTasks.length === 0) return [];
      const completed = day.completedTaskIds ?? [];
      const count = day.plannedTasks.filter(task => checkoutTask(task.title) ? checkoutMap.has(day.date) : completed.includes(task.id)).length;
      return [{ date: day.date, percentage: count / day.plannedTasks.length * 100 }];
    });
    const sleeps = relevantCheckouts.map(c => numeric(c.sleep)).filter((n): n is number => n !== null);
    const waters = relevantCheckouts.map(c => numeric(c.water)).filter((n): n is number => n !== null);
    const energies = relevantCheckouts.map(c => numeric(c.energy)).filter((n): n is number => n !== null && n >= 1 && n <= 5);
    const nutrition = relevantCheckouts.filter(c => ["yes", "mostly", "no"].includes(c.nutrition ?? ""));
    const completedSets = relevantSessions.reduce((sum, s) => sum + Object.values(s.sets ?? {}).reduce((n, sets) => n + sets.filter(set => set.done).length, 0), 0);
    const bests = new Map<string, number>();
    for (const session of relevantSessions) for (const [id, sets] of Object.entries(session.sets ?? {})) for (const set of sets) {
      if (!set.done) continue;
      const weight = numeric(set.weight);
      if (weight !== null && weight > (bests.get(id) ?? 0)) bests.set(id, weight);
    }
    const activeWeeks = period === "arc" ? weeks.filter(w => w.days.some(inRange)) : (() => {
      const dates = [...new Set([...relevantDays.map(d => d.date), ...relevantCheckouts.map(c => c.date), ...relevantSessions.map(s => s.date)])].sort();
      if (!dates.length) return [];
      const groups = new Map<string, string[]>();
      dates.forEach(date => { const d = new Date(date + "T12:00:00Z"); const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10); groups.set(monday, [...(groups.get(monday) ?? []), date]); });
      return [...groups].map(([label, days]) => ({ label: dateLabel(label), days }));
    })();
    const weekly = activeWeeks.map(w => {
      const r = ratios.filter(x => w.days.includes(x.date));
      return { label: w.label, discipline: mean(r.map(x => x.percentage)), workouts: relevantSessions.filter(s => w.days.includes(s.date)).length, sleep: mean(relevantCheckouts.filter(c => w.days.includes(c.date)).map(c => numeric(c.sleep)).filter((n): n is number => n !== null)) };
    });
    return { ratios, discipline: mean(ratios.map(r => r.percentage)), workouts: relevantSessions.length, completedSets, sleeps, waters, energies, nutrition, checkouts: relevantCheckouts.length, weekly, bests: [...bests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
  }, [days, checkouts, sessions, period]);
  const ready = loaded.every(Boolean);
  const maxWorkouts = Math.max(1, ...stats.weekly.map(w => w.workouts));
  return <section style={{ maxWidth: 980, margin: "0 auto", padding: "12px 0 90px", color: "#f5f5f5" }}>
    <div className="eyebrow">WINTER ARC / ANALYTICS</div>
    <h1 style={{ fontSize: "clamp(30px, 6vw, 48px)", margin: "12px 0 8px" }}>Your Performance.</h1>
    <p style={{ color: "#999", marginBottom: 24 }}>Dein Fortschritt. Basierend auf deinen echten Einträgen.</p>
    <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
      {(["arc", "all"] as const).map(p => <button key={p} onClick={() => setPeriod(p)} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #444", background: period === p ? "#eee" : "#222", color: period === p ? "#111" : "#eee", fontWeight: 700, cursor: "pointer" }}>{p === "arc" ? "WINTER ARC · 55 TAGE" : "GESAMTER ZEITRAUM"}</button>)}
    </div>
    {error && <p role="alert" style={{ color: "#ff8888" }}>{error}</p>}
    {!ready ? <p style={{ color: "#aaa" }}>Performance-Daten werden geladen ...</p> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 26 }}>
        {[
          ["Ø DISZIPLIN", stats.discipline === null ? "—" : `${Math.round(stats.discipline)} %`, `${stats.ratios.length} dokumentierte Tage`],
          ["GYM WORKOUTS", String(stats.workouts), `${stats.completedSets} erfasste Sätze`],
          ["Ø SCHLAF", stats.sleeps.length ? `${fmt(mean(stats.sleeps))} h` : "—", `${stats.sleeps.length} Einträge`],
          ["Ø WASSER", stats.waters.length ? `${fmt(mean(stats.waters))} l` : "—", `${stats.waters.length} Einträge`],
          ["Ø ENERGIE", stats.energies.length ? `${fmt(mean(stats.energies))} / 5` : "—", `${stats.energies.length} Einträge`],
          ["ERNÄHRUNG", stats.nutrition.length ? `${Math.round(stats.nutrition.filter(c => c.nutrition === "yes").length / stats.nutrition.length * 100)} %` : "—", `${stats.nutrition.length} Bewertungen · vollständig`],
        ].map(([label, value, note]) => <div key={label} style={panel}><div style={{ ...small, letterSpacing: 1, fontSize: 10 }}>{label}</div><div style={{ fontSize: 29, fontWeight: 800, margin: "12px 0 6px" }}>{value}</div><div style={small}>{note}</div></div>)}
      </div>
      <div style={{ ...panel, marginBottom: 16 }}>
        <div className="eyebrow">DISCIPLINE</div><h2 style={{ margin: "9px 0 5px" }}>Wochenvergleich</h2>
        <p style={{ ...small, marginBottom: 22 }}>Durchschnittliche Tagesquote je Woche. Leere Wochen bleiben ohne Wert.</p>
        {stats.weekly.length ? stats.weekly.map(w => <div key={w.label} style={{ display: "grid", gridTemplateColumns: "105px 1fr 48px", gap: 10, alignItems: "center", marginBottom: 13 }}><span style={{ ...small, fontSize: 11 }}>{w.label}</span><div style={{ background: "#333", borderRadius: 4, height: 11, overflow: "hidden" }}>{w.discipline !== null && <div style={{ height: "100%", width: `${w.discipline}%`, background: "#eee", borderRadius: 4 }}/>}</div><strong style={{ fontSize: 12, textAlign: "right" }}>{w.discipline === null ? "—" : `${Math.round(w.discipline)} %`}</strong></div>) : <p style={small}>Noch keine Daten in diesem Zeitraum.</p>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={panel}><div className="eyebrow">TRAINING</div><h2 style={{ margin: "9px 0 18px" }}>Gym pro Woche</h2>{stats.weekly.length ? stats.weekly.map(w => <div key={w.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 20px", gap: 10, alignItems: "center", marginBottom: 12 }}><span style={{ ...small, fontSize: 11 }}>{w.label}</span><div style={{ background: "#333", height: 11, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${w.workouts / maxWorkouts * 100}%`, background: "#eee" }}/></div><strong style={{ fontSize: 12 }}>{w.workouts}</strong></div>) : <p style={small}>Noch keine abgeschlossenen Trainings.</p>}</div>
        <div style={panel}><div className="eyebrow">RECOVERY</div><h2 style={{ margin: "9px 0 18px" }}>Schlaf pro Woche</h2>{stats.weekly.length ? stats.weekly.map(w => <div key={w.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 48px", gap: 10, alignItems: "center", marginBottom: 12 }}><span style={{ ...small, fontSize: 11 }}>{w.label}</span><div style={{ background: "#333", height: 11, borderRadius: 4, overflow: "hidden" }}>{w.sleep !== null && <div style={{ height: "100%", width: `${Math.min(w.sleep / 10 * 100, 100)}%`, background: "#eee" }}/>}</div><strong style={{ fontSize: 12, textAlign: "right" }}>{w.sleep === null ? "—" : `${fmt(w.sleep)} h`}</strong></div>) : <p style={small}>Noch keine Schlafdaten.</p>}</div>
      </div>
      <div style={{ ...panel, marginBottom: 16 }}><div className="eyebrow">NUTRITION</div><h2 style={{ margin: "9px 0 16px" }}>Ernährungstreue</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 9 }}>{[["VOLLSTÄNDIG", "yes"], ["GRÖSSTENTEILS", "mostly"], ["NICHT EINGEHALTEN", "no"]].map(([label, value]) => <div key={value} style={{ background: "#222", padding: 12, borderRadius: 8 }}><div style={{ ...small, fontSize: 10 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, marginTop: 8 }}>{stats.nutrition.filter(c => c.nutrition === value).length}</div></div>)}</div><p style={{ ...small, marginTop: 14 }}>Nur Tage mit einer Ernährungsbewertung werden berücksichtigt.</p></div>
      <div style={panel}><div className="eyebrow">GYM RECORDS</div><h2 style={{ margin: "9px 0 16px" }}>Höchste dokumentierte Gewichte</h2>{stats.bests.length ? stats.bests.map(([id, weight]) => <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: "1px solid #333" }}><span style={{ color: "#bbb", fontSize: 13 }}>{id}</span><strong>{fmt(weight)} kg</strong></div>) : <p style={small}>Noch keine abgeschlossenen Workouts mit Gewichtsangaben.</p>}<p style={{ ...small, marginTop: 15 }}>Die Übungsnamen und detaillierten Rekorde findest du weiterhin im Training-Bereich.</p></div>
      <p style={{ ...small, marginTop: 20, lineHeight: 1.7 }}>Statistiken zeigen nur gespeicherte Daten. Disziplin wird nur für Tage mit gesichertem Aufgaben-Snapshot berechnet. Der Abend-Check-out zählt automatisch als erledigt, wenn er gespeichert wurde. Vergangene Tage ohne Daten werden nicht als 0 % gewertet.</p>
    </>}
  </section>;
}
