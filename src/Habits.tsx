import { useEffect, useMemo, useState } from "react";
import { arrayRemove, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";

type Habit = { id: string; title: string; createdAt: string; weekdays: number[]; active: boolean; archivedAt?: string };
type HabitDay = { date: string; completedHabitIds: string[] };
const START = "2026-11-29";
const END = "2027-01-22";
const DAY_MS = 86400000;
const panel: React.CSSProperties = { background: "#191919", border: "1px solid #333", borderRadius: 12, padding: 18 };
const muted: React.CSSProperties = { color: "#999", fontSize: 12 };
const button: React.CSSProperties = { padding: "11px 14px", border: "1px solid #444", borderRadius: 8, background: "#242424", color: "#f5f5f5", cursor: "pointer" };
function keyFromDate(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(date: string, delta: number) { return keyFromDate(new Date(Date.parse(date + "T12:00:00Z") + delta * DAY_MS)); }
function dateRange(start: string, end: string) { const out: string[] = []; for (let d = start; d <= end; d = addDays(d, 1)) out.push(d); return out; }
function weekday(date: string) { return new Date(date + "T12:00:00Z").getUTCDay(); }
function scheduled(h: Habit, date: string) { return h.createdAt.slice(0, 10) <= date && (!h.archivedAt || date < h.archivedAt) && (h.weekdays.length === 0 || h.weekdays.includes(weekday(date))); }
function dayStatus(date: string, habits: Habit[], days: Map<string, HabitDay>) {
  const expected = habits.filter(h => scheduled(h, date));
  if (!expected.length) return "empty";
  const checked = new Set(days.get(date)?.completedHabitIds ?? []);
  return expected.every(h => checked.has(h.id)) ? "done" : "missed";
}
function computeStreak(habits: Habit[], dayEntries: HabitDay[], today: string) {
  const days = new Map(dayEntries.map(d => [d.date, d]));
  const first = habits.length ? habits.map(h => h.createdAt.slice(0, 10)).sort()[0] : today;
  const start = first > START ? first : START;
  const end = today < END ? today : END;
  if (start > end) return { current: 0, best: 0 };
  const dates = dateRange(start, end);
  let best = 0, run = 0;
  for (const date of dates) {
    const status = dayStatus(date, habits, days);
    if (status === "done") { run++; best = Math.max(best, run); }
    else if (status === "missed") run = 0;
    // Tage ohne geplante Habits beeinflussen die Serie nicht.
  }
  let current = 0;
  let cursor = end;
  // Der heutige Tag darf noch offen sein.
  if (cursor === today && dayStatus(cursor, habits, days) !== "done") cursor = addDays(cursor, -1);
  for (; cursor >= start; cursor = addDays(cursor, -1)) {
    const status = dayStatus(cursor, habits, days);
    if (status === "missed") break;
    if (status === "done") current++;
  }
  return { current, best };
}
function useHabitsData(userId: string | undefined) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [days, setDays] = useState<HabitDay[]>([]);
  const [readyParts, setReadyParts] = useState([false, false]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!userId) return;
    setReadyParts([false, false]);
    const unsubHabits = onSnapshot(collection(db, "users", userId, "habits"), snap => {
      setHabits(snap.docs.map(s => ({ ...s.data(), id: s.id } as Habit)).filter(h => typeof h.title === "string" && typeof h.createdAt === "string" && Array.isArray(h.weekdays)));
      setReadyParts(p => [true, p[1]]);
    }, e => { console.error(e); setError("Habits konnten nicht geladen werden."); });
    const unsubDays = onSnapshot(collection(db, "users", userId, "habitDays"), snap => {
      setDays(snap.docs.map(s => ({ ...s.data(), date: s.id } as HabitDay)));
      setReadyParts(p => [p[0], true]);
    }, e => { console.error(e); setError("Habit-Tage konnten nicht geladen werden."); });
    return () => { unsubHabits(); unsubDays(); };
  }, [userId]);
  return { habits, days, ready: readyParts.every(Boolean), error };
}
export function useHabitStreak(userId: string | undefined) {
  const { habits, days, ready } = useHabitsData(userId);
  const streak = useMemo(() => computeStreak(habits, days, getTodayKey()), [habits, days]);
  return { ...streak, ready };
}
export default function Habits() {
  const userId = auth.currentUser?.uid;
  const { habits, days, ready, error } = useHabitsData(userId);
  const [title, setTitle] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [viewMonth, setViewMonth] = useState<"2026-11" | "2026-12" | "2027-01">("2026-11");
  const today = getTodayKey();
  const active = habits.filter(h => h.active !== false);
  const map = useMemo(() => new Map(days.map(d => [d.date, d])), [days]);
  const todayHabits = active.filter(h => scheduled(h, today));
  const doneToday = new Set(map.get(today)?.completedHabitIds ?? []);
  const streak = useMemo(() => computeStreak(habits, days, today), [habits, days, today]);
  const calendar = dateRange(START, END).filter(d => d.startsWith(viewMonth));
  const completed = todayHabits.filter(h => doneToday.has(h.id)).length;
  function startEdit(h: Habit) {
    setEditingId(h.id);
    setTitle(h.title);
    setWeekdays([...h.weekdays]);
    setSaveError("");
  }
  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setWeekdays([]);
  }
  async function saveHabit() {
    const name = title.trim();
    if (!userId || !name || busy) return;
    setBusy(true); setSaveError("");
    try {
      if (editingId) {
        await updateDoc(doc(db, "users", userId, "habits", editingId), { title: name, weekdays });
      } else {
        const id = crypto.randomUUID();
        await setDoc(doc(db, "users", userId, "habits", id), { title: name, weekdays, createdAt: new Date().toISOString(), active: true });
      }
      cancelEdit();
    } catch (e) { console.error(e); setSaveError("Habit konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }
  async function deleteHabit(h: Habit) {
    if (!userId || busy || !window.confirm(`„${h.title}“ endgültig löschen? Auch alle bisherigen Haken für diese Gewohnheit werden entfernt. Das kann nicht rückgängig gemacht werden.`)) return;
    setBusy(true); setSaveError("");
    try {
      // Alle bekannten Tagesdokumente aktualisieren, bevor die Habit-Definition gelöscht wird.
      // Maximal 400 Operationen pro Batch, damit das Firestore-Limit eingehalten wird.
      const affected = days.filter(d => (d.completedHabitIds ?? []).includes(h.id));
      for (let i = 0; i < affected.length; i += 400) {
        const batch = writeBatch(db);
        for (const day of affected.slice(i, i + 400)) {
          batch.update(doc(db, "users", userId, "habitDays", day.date), { completedHabitIds: arrayRemove(h.id) });
        }
        await batch.commit();
      }
      await deleteDoc(doc(db, "users", userId, "habits", h.id));
      if (editingId === h.id) cancelEdit();
    } catch (e) { console.error(e); setSaveError("Habit konnte nicht vollständig gelöscht werden. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }
  async function toggle(id: string) {
    if (!userId || busy) return;
    setBusy(true); setSaveError("");
    const next = doneToday.has(id) ? [...doneToday].filter(x => x !== id) : [...doneToday, id];
    try { await setDoc(doc(db, "users", userId, "habitDays", today), { completedHabitIds: next, date: today, updatedAt: new Date().toISOString() }, { merge: true }); }
    catch (e) { console.error(e); setSaveError("Haken konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }
  async function archive(h: Habit) {
    if (!userId || busy || !window.confirm(`„${h.title}“ archivieren? Bisherige Einträge bleiben erhalten.`)) return;
    setBusy(true); setSaveError("");
    try { await setDoc(doc(db, "users", userId, "habits", h.id), { active: false, archivedAt: getTodayKey() }, { merge: true }); }
    catch (e) { console.error(e); setSaveError("Habit konnte nicht archiviert werden."); }
    finally { setBusy(false); }
  }
  return <section style={{ width: "100%", maxWidth: "1000px", boxSizing: "border-box", padding: "28px clamp(16px, 3vw, 40px) 100px", margin: "0 auto", color: "#f5f5f5" }}>
      <header style={{ marginBottom: "32px" }}>
        <div className="eyebrow">WINTER ARC / CONSISTENCY</div>
        <h1 style={{ margin: "14px 0 10px", lineHeight: 1.12 }}>
          Build consistency.
        </h1>
        <p style={{ color: "#888", margin: 0 }}>
          Deine Gewohnheiten. Jeden Tag ein bisschen besser.
        </p>
      </header>
    {(error || saveError) && <p role="alert" style={{ color: "#ff8888" }}>{error || saveError}</p>}
    {!ready ? <p style={muted}>Habits werden geladen ...</p> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[["CURRENT STREAK", `${streak.current} DAYS`], ["PERSONAL BEST", `${streak.best} DAYS`], ["TODAY", `${completed} / ${todayHabits.length}`]].map(([label, value]) => <div key={label} style={panel}><div style={{ ...muted, letterSpacing: 1 }}>{label}</div><div style={{ fontSize: 29, fontWeight: 800, marginTop: 12 }}>{value}</div></div>)}
      </div>
      <div style={{ ...panel, marginBottom: 16 }}><div className="eyebrow">DAILY EXECUTION</div><h2 style={{ margin: "8px 0 16px" }}>Heute · {today.slice(8)}.{today.slice(5, 7)}.</h2>
        {todayHabits.length === 0 ? <p style={muted}>Für heute sind noch keine Habits geplant.</p> : todayHabits.map(h => <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #333", padding: "12px 0" }}><button disabled={busy} onClick={() => toggle(h.id)} style={{ ...button, width: 44, fontSize: 18, background: doneToday.has(h.id) ? "#eee" : "#222", color: doneToday.has(h.id) ? "#111" : "#eee" }} aria-label={`${h.title} ${doneToday.has(h.id) ? "zurücksetzen" : "erledigen"}`}>{doneToday.has(h.id) ? "✓" : "○"}</button><span style={{ flex: 1, opacity: doneToday.has(h.id) ? .65 : 1 }}>{h.title}</span><button disabled={busy} onClick={() => startEdit(h)} style={{ ...button, fontSize: 11 }}>Bearbeiten</button><button disabled={busy} onClick={() => archive(h)} style={{ ...button, fontSize: 11 }}>Archivieren</button><button disabled={busy} onClick={() => void deleteHabit(h)} style={{ ...button, fontSize: 11, color: "#ff9999" }}>Löschen</button></div>)}
      </div>
      <div style={{ ...panel, marginBottom: 16 }}>
        <div className="eyebrow">ALL HABITS</div>
        <h2 style={{ margin: "8px 0 6px" }}>Alle Gewohnheiten</h2>
        <p style={{ ...muted, marginBottom: 16 }}>Auch Habits, die heute nicht stattfinden, kannst du hier jederzeit verwalten.</p>
        {active.length === 0 ? <p style={muted}>Noch keine aktiven Gewohnheiten vorhanden.</p> : active
          .slice().sort((a, b) => a.title.localeCompare(b.title, "de"))
          .map(h => <div key={h.id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottom: "1px solid #333", padding: "12px 0" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 650, fontSize: 14 }}>{h.title}</div>
              <div style={{ ...muted, marginTop: 5 }}>{h.weekdays.length === 0 ? "Täglich" : [[1,"Mo"],[2,"Di"],[3,"Mi"],[4,"Do"],[5,"Fr"],[6,"Sa"],[0,"So"]].filter(([day]) => h.weekdays.includes(day as number)).map(([,label]) => label).join(" · ")}</div>
            </div>
            <button type="button" disabled={busy} onClick={() => startEdit(h)} style={{ ...button, fontSize: 11 }}>Bearbeiten</button>
            <button type="button" disabled={busy} onClick={() => void archive(h)} style={{ ...button, fontSize: 11 }}>Archivieren</button>
            <button type="button" disabled={busy} onClick={() => void deleteHabit(h)} style={{ ...button, fontSize: 11, color: "#ff9999" }}>Löschen</button>
          </div>)}
      </div>
      <div style={{ ...panel, marginBottom: 16 }}><div className="eyebrow">HABIT EDITOR</div><h2 style={{ margin: "8px 0 16px" }}>{editingId ? "Gewohnheit bearbeiten" : "Gewohnheit hinzufügen"}</h2>
        <form onSubmit={e => { e.preventDefault(); void saveHabit(); }}><input value={title} onChange={e => setTitle(e.target.value)} maxLength={70} placeholder="z. B. 10 Minuten Mobility" style={{ boxSizing: "border-box", width: "100%", padding: 13, borderRadius: 8, background: "#242424", color: "#fff", border: "1px solid #444", marginBottom: 12 }}/>
          <div style={{ ...muted, marginBottom: 9 }}>Trainingstage auswählen · keine Auswahl = täglich</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>{[[1,"Mo"],[2,"Di"],[3,"Mi"],[4,"Do"],[5,"Fr"],[6,"Sa"],[0,"So"]].map(([day,label]) => <button type="button" key={day} onClick={() => setWeekdays(prev => prev.includes(day as number) ? prev.filter(x => x !== day) : [...prev, day as number])} style={{ ...button, background: weekdays.includes(day as number) ? "#eee" : "#242424", color: weekdays.includes(day as number) ? "#111" : "#eee" }}>{label}</button>)}</div>
          <button type="submit" disabled={busy || !title.trim()} style={{ ...button, background: "#eee", color: "#111", fontWeight: 800 }}>{editingId ? "ÄNDERUNGEN SPEICHERN" : "+ HABIT ERSTELLEN"}</button>{editingId && <button type="button" disabled={busy} onClick={cancelEdit} style={{ ...button, marginLeft: 8 }}>Abbrechen</button>}
        </form>
      </div>
       {habits.some(h => h.active === false) && <div style={{ ...panel, marginBottom: 16 }}>
         <div className="eyebrow">ARCHIVE</div><h2 style={{ margin: "8px 0 16px" }}>Archivierte Gewohnheiten</h2>
         {habits.filter(h => h.active === false).map(h => <div key={h.id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 0", borderBottom: "1px solid #333" }}>
           <span style={{ flex: 1, minWidth: 130, color: "#aaa" }}>{h.title}</span>
           <button disabled={busy} onClick={() => void deleteHabit(h)} style={{ ...button, fontSize: 11, color: "#ff9999" }}>Endgültig löschen</button>
         </div>)}
       </div>}
      <div style={panel}><div className="eyebrow">55 DAY TRACKER</div><h2 style={{ margin: "8px 0 16px" }}>Dein Kalender</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>{[["2026-11", "NOV"],["2026-12", "DEZ"],["2027-01", "JAN"]].map(([id,label]) => <button key={id} onClick={() => setViewMonth(id as typeof viewMonth)} style={{ ...button, background: viewMonth === id ? "#eee" : "#242424", color: viewMonth === id ? "#111" : "#eee" }}>{label}</button>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 7 }}>{["MO","DI","MI","DO","FR","SA","SO"].map(d => <span key={d} style={{ ...muted, textAlign: "center" }}>{d}</span>)}
          {Array.from({ length: (weekday(calendar[0]) + 6) % 7 }, (_, i) => <span key={`pad-${i}`} />)}
          {calendar.map(date => { const status = date > today ? "future" : dayStatus(date, habits, map); return <div key={date} title={`${date}: ${status === "done" ? "alles erledigt" : status === "missed" ? "nicht vollständig" : status === "empty" ? "keine geplanten Habits" : "zukünftig"}`} style={{ padding: "12px 0", textAlign: "center", borderRadius: 7, border: date === today ? "1px solid #fff" : "1px solid #333", background: status === "done" ? "#eee" : "#242424", color: status === "done" ? "#111" : status === "missed" ? "#ccc" : "#777", fontWeight: status === "done" ? 800 : 400 }}>{date.slice(8)}</div>; })}
        </div><p style={{ ...muted, marginTop: 16 }}>Hell = alle geplanten Habits erledigt. Dunkel = offen. Umrandung = heute. Habits werden erst ab ihrem Erstellungsdatum berücksichtigt.</p>
      </div>
    </>}
  </section>;
}
