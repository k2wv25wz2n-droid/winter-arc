import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";

type Checkout = { sleep: string; water: string; energy: string; nutrition: "yes" | "mostly" | "no" | "" };
const emptyCheckout = (): Checkout => ({ sleep: "", water: "", energy: "", nutrition: "" });
function readCheckout(data: Record<string, unknown> | undefined): Checkout {
  const text = (key: string) => { const value = data?.[key]; return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""; };
  const nutrition = text("nutrition");
  return { sleep: text("sleep"), water: text("water"), energy: ["1","2","3","4","5"].includes(text("energy")) ? text("energy") : "", nutrition: nutrition === "yes" || nutrition === "mostly" || nutrition === "no" ? nutrition : "" };
}
type JournalEntry = {
  date: string;
  mood: number;
  win: string;
  challenge: string;
  gratitude: string;
  thoughts: string;
  updatedAt: string;
};
type JournalDraft = Pick<JournalEntry, "mood" | "win" | "challenge" | "gratitude" | "thoughts">;
const emptyDraft = (): JournalDraft => ({ mood: 0, win: "", challenge: "", gratitude: "", thoughts: "" });
const card: React.CSSProperties = { background: "#191919", border: "1px solid #333", borderRadius: 12, padding: 20 };
const button: React.CSSProperties = { background: "#282828", color: "#f5f5f5", border: "1px solid #444", borderRadius: 8, padding: "11px 14px", cursor: "pointer" };
const field: React.CSSProperties = { width: "100%", minHeight: 88, resize: "vertical", boxSizing: "border-box", background: "#101010", color: "#f5f5f5", border: "1px solid #444", borderRadius: 8, padding: 12, font: "inherit", lineHeight: 1.5 };
const muted: React.CSSProperties = { color: "#aaa", fontSize: 13 };
const prompts: { key: Exclude<keyof JournalDraft, "mood">; title: string; placeholder: string }[] = [
  { key: "win", title: "Was lief heute gut?", placeholder: "Dein Erfolg des Tages ..." },
  { key: "challenge", title: "Was war schwierig?", placeholder: "Herausforderung oder Erkenntnis ..." },
  { key: "gratitude", title: "Wofür bist du dankbar?", placeholder: "Ein Moment, eine Person, eine Sache ..." },
  { key: "thoughts", title: "Freie Gedanken", placeholder: "Was möchtest du festhalten?" },
];
const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

export default function Journal() {
  const userId = auth.currentUser?.uid;
  const today = getTodayKey();
  const [selected, setSelected] = useState(today);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<JournalDraft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [checkout, setCheckout] = useState<Checkout>(emptyCheckout);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [checkoutDirty, setCheckoutDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!userId) { setReady(true); return; }
    setReady(false);
    return onSnapshot(collection(db, "users", userId, "journalEntries"), snapshot => {
      setEntries(snapshot.docs.map(item => ({ ...item.data(), date: item.id } as JournalEntry)));
      setReady(true);
    }, e => { console.error("Journal laden:", e); setError("Journal konnte nicht geladen werden."); setReady(true); });
  }, [userId]);

  useEffect(() => {
    if (!userId) { setCheckoutReady(true); return; }
    setCheckoutReady(false);
    return onSnapshot(doc(db, "users", userId, "eveningCheckouts", selected), snapshot => {
      if (!checkoutDirty) setCheckout(readCheckout(snapshot.data()));
      setCheckoutReady(true);
    }, e => { console.error("Check-out laden:", e); setError("Check-out konnte nicht geladen werden."); setCheckoutReady(false); });
  }, [userId, selected, checkoutDirty]);
  function updateCheckout(key: keyof Checkout, value: string) {
    setCheckout(current => ({ ...current, [key]: value })); setCheckoutDirty(true); setNotice("");
  }
  const inputStyle: React.CSSProperties = { ...button, background: "#101010", width: "100%", boxSizing: "border-box", fontSize: 15 };
  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const entry = entries.find(item => item.date === selected);
  useEffect(() => {
    if (dirty) return;
    setDraft(entry ? { mood: entry.mood ?? 0, win: entry.win ?? "", challenge: entry.challenge ?? "", gratitude: entry.gratitude ?? "", thoughts: entry.thoughts ?? "" } : emptyDraft());
  }, [entry?.updatedAt, entry?.date, selected, dirty]);

  function selectDate(date: string) {
    if ((dirty || checkoutDirty) && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setDirty(false); setCheckoutDirty(false); setCheckout(emptyCheckout()); setSelected(date); setNotice(""); setError("");
    const found = entries.find(item => item.date === date);
    setDraft(found ? { mood: found.mood ?? 0, win: found.win ?? "", challenge: found.challenge ?? "", gratitude: found.gratitude ?? "", thoughts: found.thoughts ?? "" } : emptyDraft());
  }
  function update<K extends keyof JournalDraft>(key: K, value: JournalDraft[K]) {
    setDraft(current => ({ ...current, [key]: value })); setDirty(true); setNotice("");
  }
  async function save() {
    if (!userId || busy || !ready || !checkoutReady || !isValidDate(selected) || selected > getTodayKey()) return;
    const valid = (value: string, max: number) => !value.trim() || (Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) >= 0 && Number(value.replace(",", ".")) <= max);
    if (!valid(checkout.sleep, 24) || !valid(checkout.water, 20)) { setError("Bitte gültige Werte eingeben (Schlaf 0–24 h, Wasser 0–20 l)."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const batch = writeBatch(db);
      const updatedAt = new Date().toISOString();
      batch.set(doc(db, "users", userId, "journalEntries", selected), { ...draft, date: selected, updatedAt });
      batch.set(doc(db, "users", userId, "eveningCheckouts", selected), { ...checkout, sleep: checkout.sleep.trim().replace(",", "."), water: checkout.water.trim().replace(",", "."), date: selected, updatedAt });
      await batch.commit();
      setDirty(false); setCheckoutDirty(false); setNotice("Tagesabschluss vollständig gespeichert und synchronisiert.");
    } catch (e) { console.error(e); setError("Speichern fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!userId || busy || !entry || !window.confirm(`Journaleintrag vom ${selected} endgültig löschen?`)) return;
    setBusy(true); setError("");
    try { await deleteDoc(doc(db, "users", userId, "journalEntries", selected)); setDraft(emptyDraft()); setDirty(false); setNotice("Eintrag gelöscht."); }
    catch (e) { console.error(e); setError("Löschen fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 0 80px", color: "#f5f5f5" }}>
      <div className="eyebrow">REFLECTION / WINTER ARC</div>
      <h1 style={{ margin: "8px 0" }}>Journal</h1>
      <p style={{ ...muted, marginBottom: 24 }}>Dein kompletter Tagesabschluss: Schlaf, Wasser, Energie, Ernährung und Reflexion an einem Ort.</p>
      {error && <p role="alert" style={{ color: "#ff8888" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#bcbcbc" }}>{notice}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))", gap: 18, alignItems: "start" }}>
        <section style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
            <div><div className="eyebrow">DAILY REFLECTION</div><h2 style={{ margin: "5px 0" }}>Dein Eintrag</h2></div>
            <button type="button" style={button} onClick={() => selectDate(today)}>Heute</button>
          </div>
          <label style={{ display: "block", marginBottom: 18 }}>
            <span style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Datum</span>
            <input type="date" max={today} value={selected} onChange={e => { if (isValidDate(e.target.value) && e.target.value <= today) selectDate(e.target.value); }} style={{ ...button, colorScheme: "dark", maxWidth: "100%" }} />
          </label>
          <div className="eyebrow" style={{ marginBottom: 12 }}>RECOVERY / NUTRITION</div>
          <div style={{ display: "grid", gap: 14, marginBottom: 24 }}>
            <label style={{ display: "grid", gap: 7, fontSize: 13 }}>Schlaf letzte Nacht (Stunden)
              <input inputMode="decimal" placeholder="z. B. 7,5" style={inputStyle} value={checkout.sleep} onChange={e => updateCheckout("sleep", e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 7, fontSize: 13 }}>Heute getrunken (Liter)
              <input inputMode="decimal" placeholder="z. B. 2,5" style={inputStyle} value={checkout.water} onChange={e => updateCheckout("water", e.target.value)} />
            </label>
            <div><div style={{ fontSize: 13, marginBottom: 9 }}>Energielevel</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => updateCheckout("energy", checkout.energy === String(n) ? "" : String(n))} style={{ ...button, padding: "12px 0", background: checkout.energy === String(n) ? "#eee" : "#282828", color: checkout.energy === String(n) ? "#111" : "#eee" }}>{n}</button>)}
              </div>
            </div>
            <div><div style={{ fontSize: 13, marginBottom: 9 }}>Ernährungsplan eingehalten?</div>
              <div style={{ display: "grid", gap: 8 }}>
                {([ ["yes", "Ja, vollständig"], ["mostly", "Größtenteils"], ["no", "Nein"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => updateCheckout("nutrition", checkout.nutrition === value ? "" : value)} style={{ ...button, textAlign: "left", background: checkout.nutrition === value ? "#eee" : "#282828", color: checkout.nutrition === value ? "#111" : "#eee" }}>{checkout.nutrition === value ? "✓ " : ""}{label}</button>)}
              </div>
            </div>
          </div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>DAILY REFLECTION</div>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, marginBottom: 10 }}>Wie war dein Tag?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" onClick={() => update("mood", value)} aria-pressed={draft.mood === value} style={{ ...button, flex: "1 1 44px", background: draft.mood === value ? "#eaeaea" : "#282828", color: draft.mood === value ? "#111" : "#ddd", fontWeight: draft.mood === value ? 700 : 400 }}>{value}</button>)}
            </div>
            <div style={{ ...muted, marginTop: 7 }}>1 = schwerer Tag · 5 = richtig guter Tag</div>
          </div>
          {prompts.map(prompt => <label key={prompt.key} style={{ display: "block", marginBottom: 20 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{prompt.title}</span>
            <textarea value={draft[prompt.key]} onChange={e => update(prompt.key, e.target.value)} placeholder={prompt.placeholder} style={field} />
          </label>)}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" disabled={busy || !ready || !checkoutReady || !userId} onClick={save} style={{ ...button, background: "#f0f0f0", color: "#111", fontWeight: 700, opacity: busy ? .6 : 1 }}>{busy ? "Speichere ..." : entry ? "Tagesabschluss aktualisieren" : "Tagesabschluss speichern"}</button>
            {entry && <button type="button" disabled={busy} onClick={remove} style={{ ...button, color: "#ffaaaa" }}>Löschen</button>}
          </div>
          {(dirty || checkoutDirty) && <p style={muted}>Noch nicht gespeichert</p>}
        </section>
        <section style={card}>
          <div className="eyebrow">YOUR HISTORY</div>
          <h2 style={{ margin: "6px 0 12px" }}>Vergangene Einträge</h2>
          <p style={muted}>{ready ? `${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"} gespeichert` : "Lade Journal ..."}</p>
          {ready && sorted.length === 0 && <p style={muted}>Noch keine Einträge. Starte mit deinem heutigen Rückblick.</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {sorted.map(item => <button key={item.date} type="button" onClick={() => selectDate(item.date)} style={{ ...button, textAlign: "left", background: selected === item.date ? "#343434" : "#202020", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}><strong>{item.date.split("-").reverse().join(".")}</strong><span style={muted}>{item.mood ? `STIMMUNG ${item.mood}/5` : "OHNE BEWERTUNG"}</span></div>
              <div style={{ ...muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.win || item.thoughts || item.challenge || item.gratitude || "Eintrag öffnen"}</div>
            </button>)}
          </div>
        </section>
      </div>
    </div>
  );
}
