import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";

type Exercise = { id: string; name: string; sets?: number; reps?: number; weight?: number; minutes?: number; note?: string; phase: "warmup" | "main" | "cooldown" };
type Workout = { id: "A" | "B" | "C"; day: string; subtitle: string; exercises: Exercise[] };
type SetRecord = { weight: string; reps: string; done: boolean };
type Session = { workoutId: string; date: string; sets: Record<string, SetRecord[]>; checks: string[]; finished: boolean; updatedAt: string; startedAt?: string; finishedAt?: string };

const workouts: Workout[] = [
  { id: "A", day: "MITTWOCH", subtitle: "GYM A", exercises: [
    { id: "a-run", name: "Laufband", minutes: 5, phase: "warmup" },
    { id: "a-circles-f", name: "Armkreise vorwärts", phase: "warmup" },
    { id: "a-circles-b", name: "Armkreise rückwärts", phase: "warmup" },
    { id: "a-legs", name: "Beinschwünge auf allen Vieren", sets: 2, reps: 15, phase: "warmup" },
    { id: "a-band", name: "Schulteraufwärmen mit Trainingsband", sets: 1, reps: 15, phase: "warmup" },
    { id: "a-pendulum", name: "Pendelübung zum Schulteraufwärmen mit Trainingsband", sets: 2, reps: 15, phase: "warmup" },
    { id: "a-chest-flat", name: "Brustpresse Maschine liegend", sets: 2, reps: 10, phase: "main" },
    { id: "a-chest-incline", name: "Brustpresse Maschine Schrägbank", sets: 3, reps: 10, weight: 50, phase: "main" },
    { id: "a-lat", name: "Latzug mit weitem Parallelgriff", sets: 3, reps: 10, weight: 60, phase: "main" },
    { id: "a-row", name: "Rudern einarmig an Sitzhebelmaschine", sets: 6, reps: 10, weight: 72.5, phase: "main" },
    { id: "a-shoulder", name: "Schulterdrücken Maschine", sets: 2, reps: 10, weight: 25, phase: "main" },
    { id: "a-raise", name: "Seitheben Kabelzug einarmig stehend", sets: 6, reps: 15, weight: 2.5, phase: "main" },
    { id: "a-reverse", name: "Umgekehrte Fliegende sitzend an Maschine", sets: 2, reps: 15, weight: 42.5, phase: "main" },
    { id: "a-triceps", name: "Trizepsdrücken am Kabelzug (Push Downs)", sets: 2, reps: 12, weight: 21.5, phase: "main" },
    { id: "a-scott", name: "Scott Curls an der Maschine", sets: 2, reps: 15, weight: 46, phase: "main" },
  ] },
  { id: "B", day: "FREITAG", subtitle: "GYM B", exercises: [
    { id: "b-bike", name: "Radfahren", phase: "warmup" },
    { id: "b-band", name: "Schulteraufwärmen mit Trainingsband", sets: 1, reps: 15, phase: "warmup" },
    { id: "b-support", name: "Armstütz mit seitlicher Hüft-Abduktion und Beinstrecken, mit Band", sets: 2, reps: 15, phase: "warmup" },
    { id: "b-face", name: "Face Pulls mit Band", sets: 2, reps: 12, phase: "warmup" },
    { id: "b-stretch", name: "Dehnen der seitlichen Bauchmuskeln und des Rückens", note: "2 × 8 Sekunden", phase: "warmup" },
    { id: "b-lat", name: "Latzug an der Maschine (Untergriff)", sets: 2, reps: 10, phase: "main" },
    { id: "b-legpress", name: "Beinpresse sitzend", sets: 3, reps: 10, phase: "main" },
    { id: "b-legcurl", name: "Beinbeuger Maschine sitzend", sets: 3, reps: 12, phase: "main" },
    { id: "b-hip", name: "Stehende Hüftstreck-Maschine", sets: 3, reps: 12, phase: "main" },
    { id: "b-calf", name: "Einbeiniges Wadenheben stehend", sets: 6, reps: 12, weight: 85, phase: "main" },
    { id: "b-abduction", name: "Maschinelle Hüftabduktion im Stand", sets: 2, reps: 15, phase: "main" },
    { id: "b-kickback", name: "Einbeiniges Beinheben nach hinten am Kabelzug", sets: 4, reps: 10, phase: "main" },
  ] },
  { id: "C", day: "SONNTAG", subtitle: "GYM C", exercises: [
    { id: "c-bike", name: "Radfahren", minutes: 5, phase: "warmup" },
    { id: "c-swim", name: "Brustschwimmen (Flexor-Mobility-Übung)", note: "Trockenübung aus Flexor – kein Schwimmen im Wasser", phase: "warmup" },
    { id: "c-box", name: "Boxsprung", sets: 3, reps: 3, phase: "main" },
    { id: "c-hurdles", name: "Seitliche Hürdensprünge", sets: 3, reps: 8, phase: "main" },
    { id: "c-jumpsquat", name: "Sprung-Kniebeugen", sets: 3, reps: 4, phase: "main" },
    { id: "c-legcurl", name: "Beinbeuger Maschine sitzend", sets: 2, reps: 10, phase: "main" },
    { id: "c-calf", name: "Senkrechtes Wadenheben Maschine", sets: 3, reps: 15, phase: "main" },
    { id: "c-reverse", name: "Umgekehrte Fliegende sitzend an Maschine", sets: 2, reps: 15, phase: "main" },
  ] },
];

function emptySession(workoutId: string, date: string): Session {
  return { workoutId, date, sets: {}, checks: [], finished: false, updatedAt: "" };
}
function getSet(session: Session, exercise: Exercise, index: number): SetRecord {
  return session.sets[exercise.id]?.[index] ?? { weight: exercise.weight === undefined ? "" : String(exercise.weight), reps: exercise.reps === undefined ? "" : String(exercise.reps), done: false };
}
function displayNumber(value: string) { return value.replace(".", ","); }

export default function Training() {
  const [workoutId, setWorkoutId] = useState<"A" | "B" | "C">("A");
  const [date, setDate] = useState(getTodayKey);
  const [session, setSession] = useState<Session>(emptySession("A", getTodayKey()));
  const [history, setHistory] = useState<Session[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyWorkout, setHistoryWorkout] = useState<"ALL" | "A" | "B" | "C">("ALL");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const userId = auth.currentUser?.uid;
  const workout = workouts.find((item) => item.id === workoutId)!;
  const docId = `${date}_${workoutId}`;

  useEffect(() => {
    if (!userId) return;
    setReady(false);
    setSession(emptySession(workoutId, date));
    return onSnapshot(doc(db, "users", userId, "trainingSessions", docId), (snap) => {
      const data = snap.data();
      setSession(data ? { ...emptySession(workoutId, date), ...data, sets: data.sets ?? {}, checks: data.checks ?? [] } as Session : emptySession(workoutId, date));
      setReady(true);
    }, () => { setError("Training konnte nicht geladen werden."); setReady(false); });
  }, [userId, workoutId, date, docId]);

  useEffect(() => {
    if (!userId) return;
    setHistoryReady(false);
    return onSnapshot(collection(db, "users", userId, "trainingSessions"), (snap) => {
      setHistory(snap.docs.map((item) => item.data() as Session).filter((item) => item.finished && typeof item.date === "string" && ["A", "B", "C"].includes(item.workoutId)).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)));
      setHistoryReady(true);
    }, () => { setError("Trainingshistorie konnte nicht geladen werden."); setHistoryReady(false); });
  }, [userId]);

  const total = useMemo(() => workout.exercises.reduce((sum, ex) => sum + (ex.sets ?? 1), 0), [workout]);
  const done = workout.exercises.reduce<number>((sum, ex) => sum + (ex.sets ? Array.from({ length: ex.sets }, (_, i) => getSet(session, ex, i).done ? 1 : 0).reduce<number>((a, b) => a + b, 0) : session.checks.includes(ex.id) ? 1 : 0), 0);
  const percentage = Math.round(done / total * 100);
  const filteredHistory = history.filter((item) => historyWorkout === "ALL" || item.workoutId === historyWorkout);
  const totalSets = history.reduce((sum, item) => sum + Object.values(item.sets ?? {}).reduce((n, sets) => n + sets.filter((set) => set.done).length, 0), 0);
  const arcSessions = history.filter((item) => item.date >= "2026-11-29" && item.date <= "2027-01-22").length;
  const bests = useMemo(() => {
    const records = new Map<string, { name: string; weight: number; reps: number; date: string }>();
    for (const entry of history) {
      const plan = workouts.find((item) => item.id === entry.workoutId);
      if (!plan) continue;
      for (const exercise of plan.exercises) {
        for (const set of entry.sets?.[exercise.id] ?? []) {
          if (!set.done) continue;
          const weight = Number(set.weight.replace(",", "."));
          const reps = Number(set.reps);
          if (!set.weight.trim() || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps <= 0) continue;
          const key = exercise.name;
          const previous = records.get(key);
          if (!previous || weight > previous.weight || (weight === previous.weight && reps > previous.reps)) records.set(key, { name: key, weight, reps, date: entry.date });
        }
      }
    }
    return [...records.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [history]);

  async function persist(next: Session) {
    if (!userId || busy || !ready) return;
    setBusy(true);
    setError("");
    const previous = session;
    const timestamp = new Date().toISOString();
    const savingSession: Session = { ...next, startedAt: next.startedAt ?? session.startedAt ?? timestamp, finishedAt: next.finished ? (session.finishedAt ?? timestamp) : undefined };
    setSession(savingSession);
    try {
      await setDoc(doc(db, "users", userId, "trainingSessions", docId), { ...savingSession, finishedAt: savingSession.finishedAt ?? null, updatedAt: timestamp });
    } catch (e) {
      console.error(e);
      setSession(previous);
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally { setBusy(false); }
  }
  function toggleCheck(id: string) {
    const checks = session.checks.includes(id) ? session.checks.filter((item) => item !== id) : [...session.checks, id];
    void persist({ ...session, checks, finished: false });
  }
  function saveSet(exercise: Exercise, index: number, value: SetRecord) {
    const entries = Array.from({ length: exercise.sets ?? 0 }, (_, i) => i === index ? value : getSet(session, exercise, i));
    void persist({ ...session, sets: { ...session.sets, [exercise.id]: entries }, finished: false });
  }

  return (
    <section style={{ maxWidth: 950, margin: "0 auto", padding: "12px 0 70px", color: "#f5f5f5" }}>
      <div className="eyebrow">WINTER ARC / TRAINING</div>
      <h1 style={{ fontSize: "clamp(30px, 6vw, 48px)", margin: "12px 0 8px" }}>Train. Track. Progress.</h1>
      <p style={{ color: "#999", marginBottom: 24 }}>Deine festen Workouts. Jeder Satz zählt.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 22 }}>
        {workouts.map((item) => <button key={item.id} type="button" onClick={() => setWorkoutId(item.id)} style={{ cursor: "pointer", borderRadius: 12, padding: "16px 8px", background: item.id === workoutId ? "#f5f5f5" : "#1c1c1c", color: item.id === workoutId ? "#111" : "#ddd", border: "1px solid #383838", fontWeight: 700 }}><span style={{ display: "block", fontSize: 11, opacity: .65, marginBottom: 5 }}>{item.day}</span>GYM {item.id}</button>)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div><h2 style={{ margin: 0, fontSize: 24 }}>{workout.subtitle}</h2><div style={{ color: "#999", fontSize: 12, marginTop: 5 }}>{done} / {total} Schritte abgeschlossen</div></div>
        <label style={{ fontSize: 12, color: "#aaa" }}>TRAININGSDATUM <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: "block", marginTop: 5, padding: 10, borderRadius: 8, border: "1px solid #444", background: "#1a1a1a", color: "#fff", colorScheme: "dark" }} /></label>
      </div>
      <div style={{ height: 6, background: "#333", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}><div style={{ height: "100%", width: `${percentage}%`, background: "#f5f5f5", transition: "width .2s" }} /></div>
      <div style={{ textAlign: "right", color: "#aaa", fontSize: 12, marginBottom: 22 }}>{percentage}%</div>
      {error && <p role="alert" style={{ color: "#ff8888" }}>{error}</p>}
      {!ready ? <p style={{ color: "#aaa" }}>Training wird geladen ...</p> : <>
        {(["warmup", "main", "cooldown"] as const).map((phase) => {
          const exercises = workout.exercises.filter((ex) => ex.phase === phase);
          if (!exercises.length) return null;
          return <div key={phase} style={{ marginBottom: 28 }}><div className="eyebrow" style={{ marginBottom: 12 }}>{phase === "warmup" ? "01 / WARM-UP" : phase === "main" ? "02 / WORKOUT" : "03 / COOLDOWN"}</div>
            {exercises.map((ex) => <ExerciseCard key={ex.id} exercise={ex} session={session} busy={busy} onToggle={() => toggleCheck(ex.id)} onSave={(index, value) => saveSet(ex, index, value)} />)}
          </div>;
        })}
        <p style={{ color: "#888", fontSize: 12, lineHeight: 1.6 }}>Die Übungen und bekannten Werte stammen aus deinen Screenshots. Nicht sichtbare Cooldown-Übungen und fehlende Angaben wurden nicht ergänzt.</p>
        <button type="button" disabled={busy} onClick={() => void persist({ ...session, finished: !session.finished })} style={{ width: "100%", marginTop: 12, padding: 17, borderRadius: 10, border: "1px solid #777", background: session.finished ? "#292929" : "#f5f5f5", color: session.finished ? "#fff" : "#111", fontWeight: 800, cursor: "pointer" }}>{session.finished ? "TRAINING ALS ABGESCHLOSSEN MARKIERT ✓" : "TRAINING ABSCHLIESSEN"}</button>
      </>}
      <div style={{ marginTop: 38 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>DEINE PERFORMANCE</div>
        <h2 style={{ fontSize: 25, margin: "0 0 16px" }}>Trainingsstatistiken</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 9, marginBottom: 28 }}>
          {[{ label: "WORKOUTS", value: history.length }, { label: "SÄTZE", value: totalSets }, { label: "WINTER ARC", value: arcSessions }].map((stat) =>
            <div key={stat.label} style={{ background: "#191919", border: "1px solid #333", borderRadius: 11, padding: "16px 10px" }}>
              <div style={{ fontSize: 10, letterSpacing: 1, color: "#999" }}>{stat.label}</div>
              <div style={{ fontSize: "clamp(24px, 5vw, 34px)", fontWeight: 800, marginTop: 8 }}>{historyReady ? stat.value : "–"}</div>
            </div>
          )}
        </div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>TRAININGSHISTORIE</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {(["ALL", "A", "B", "C"] as const).map((filter) =>
            <button key={filter} type="button" onClick={() => setHistoryWorkout(filter)} style={{ padding: "9px 15px", borderRadius: 8, border: "1px solid #444", background: historyWorkout === filter ? "#eee" : "#222", color: historyWorkout === filter ? "#111" : "#eee", cursor: "pointer", fontWeight: 700 }}>
              {filter === "ALL" ? "ALLE" : `GYM ${filter}`}
            </button>
          )}
        </div>
        {!historyReady ? <p style={{ color: "#999" }}>Historie wird geladen ...</p> : filteredHistory.length ? filteredHistory.map((item) => {
          const completedSets = Object.values(item.sets ?? {}).reduce((sum, sets) => sum + sets.filter((set) => set.done).length, 0);
          const duration = getDurationMinutes(item);
          return <button key={`${item.date}_${item.workoutId}`} type="button" onClick={() => { setWorkoutId(item.workoutId as "A" | "B" | "C"); setDate(item.date); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 16, marginBottom: 9, background: "#191919", color: "#eee", border: "1px solid #333", borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
            <span><strong>GYM {item.workoutId}</strong><span style={{ display: "block", fontSize: 12, color: "#999", marginTop: 5 }}>{formatDate(item.date)} · {completedSets} Sätze{duration !== null ? ` · ${duration} Min.` : ""}</span></span>
            <span style={{ fontSize: 18 }}>↗</span>
          </button>;
        }) : <p style={{ color: "#999", fontSize: 13 }}>Keine abgeschlossenen Workouts für diese Auswahl.</p>}
        <div className="eyebrow" style={{ margin: "32px 0 12px" }}>PERSÖNLICHE BESTLEISTUNGEN</div>
        <h2 style={{ fontSize: 25, margin: "0 0 14px" }}>Deine Rekorde</h2>
        {bests.length ? bests.map((best) =>
          <div key={best.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid #333" }}>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 650 }}>{best.name}</div><div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>{formatDate(best.date)}</div></div>
            <div style={{ textAlign: "right", flexShrink: 0, fontWeight: 800 }}>{displayNumber(String(best.weight))} kg<div style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>{best.reps} Wdh.</div></div>
          </div>
        ) : <p style={{ color: "#999", fontSize: 13 }}>Sobald du ein Workout abschließt und Gewichte erfasst hast, erscheinen hier deine Bestleistungen.</p>}
      </div>
    </section>
  );
}

function ExerciseCard({ exercise, session, busy, onToggle, onSave }: { exercise: Exercise; session: Session; busy: boolean; onToggle: () => void; onSave: (index: number, value: SetRecord) => void }) {
  const [drafts, setDrafts] = useState<Record<number, SetRecord>>({});
  useEffect(() => { setDrafts({}); }, [exercise.id, session.date, session.workoutId]);
  const checked = session.checks.includes(exercise.id);
  return <div style={{ background: "#191919", border: "1px solid #333", borderRadius: 12, padding: "16px", marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}><div><div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.45 }}>{exercise.name}</div><div style={{ color: "#999", fontSize: 12, marginTop: 5 }}>{exercise.minutes ? `${exercise.minutes} Minuten` : exercise.sets ? `${exercise.sets} × ${exercise.reps ?? "–"}${exercise.weight !== undefined ? ` · ${displayNumber(String(exercise.weight))} kg Startgewicht` : ""}` : exercise.note ?? "Ohne Vorgabe"}</div>{exercise.note && exercise.sets && <div style={{ color: "#999", fontSize: 12, marginTop: 5 }}>{exercise.note}</div>}</div>{!exercise.sets && <button type="button" disabled={busy} onClick={onToggle} style={{ flexShrink: 0, borderRadius: 8, border: "1px solid #555", padding: "9px 12px", background: checked ? "#f5f5f5" : "#292929", color: checked ? "#111" : "#fff", cursor: "pointer" }}>{checked ? "✓ Erledigt" : "Erledigt"}</button>}</div>
    {exercise.sets && <div style={{ marginTop: 14 }}><div style={{ display: "grid", gridTemplateColumns: "35px minmax(0, 1fr) minmax(0, 1fr) 78px", gap: 8, color: "#999", fontSize: 10, marginBottom: 8 }}><span>SATZ</span><span>KG</span><span>WDH.</span><span>STATUS</span></div>{Array.from({ length: exercise.sets }, (_, index) => {
      const stored = getSet(session, exercise, index);
      const value = drafts[index] ?? stored;
      return <div key={index} style={{ display: "grid", gridTemplateColumns: "35px minmax(0, 1fr) minmax(0, 1fr) 78px", gap: 8, alignItems: "center", marginBottom: 8 }}><span style={{ color: "#aaa", fontSize: 12 }}>{index + 1}</span><input aria-label={`Gewicht Satz ${index + 1} ${exercise.name}`} inputMode="decimal" value={value.weight} placeholder="–" onChange={(e) => setDrafts((prev) => ({ ...prev, [index]: { ...value, weight: e.target.value } }))} style={inputStyle} /><input aria-label={`Wiederholungen Satz ${index + 1} ${exercise.name}`} inputMode="numeric" value={value.reps} placeholder="–" onChange={(e) => setDrafts((prev) => ({ ...prev, [index]: { ...value, reps: e.target.value } }))} style={inputStyle} /><button type="button" disabled={busy} onClick={() => { const next = { ...value, done: !stored.done || JSON.stringify({ weight: value.weight, reps: value.reps }) !== JSON.stringify({ weight: stored.weight, reps: stored.reps }) }; onSave(index, next); setDrafts((prev) => { const updated = { ...prev }; delete updated[index]; return updated; }); }} style={{ padding: "11px 3px", background: stored.done ? "#f5f5f5" : "#292929", color: stored.done ? "#111" : "#eee", border: "1px solid #555", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>{stored.done ? "✓ / Ändern" : "Speichern"}</button></div>;
    })}</div>}
  </div>;
}
const inputStyle: React.CSSProperties = { minWidth: 0, width: "100%", boxSizing: "border-box", border: "1px solid #454545", borderRadius: 7, padding: "11px 7px", background: "#262626", color: "#fff", fontSize: 14 };

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}

function getDurationMinutes(session: Session): number | null {
  if (!session.startedAt || !session.finishedAt) return null;
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}
