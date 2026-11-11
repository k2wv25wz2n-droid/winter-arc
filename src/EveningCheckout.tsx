import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";

type Nutrition = "yes" | "mostly" | "no" | "";
type Checkout = {
  sleep: string;
  water: string;
  energy: string;
  nutrition: Nutrition;
};

const empty: Checkout = { sleep: "", water: "", energy: "", nutrition: "" };

function readCheckout(data: Record<string, unknown> | undefined): Checkout {
  const text = (key: string) => {
    const value = data?.[key];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  };
  const nutrition = text("nutrition");
  return {
    sleep: text("sleep"),
    water: text("water"),
    energy: ["1", "2", "3", "4", "5"].includes(text("energy")) ? text("energy") : "",
    nutrition: nutrition === "yes" || nutrition === "mostly" || nutrition === "no" ? nutrition : "",
  };
}

const fieldStyle: React.CSSProperties = {
  background: "#161616", color: "#fff", border: "1px solid #444",
  borderRadius: 8, padding: "12px", fontSize: 15, width: "100%", boxSizing: "border-box",
};

export default function EveningCheckout({ date }: { date: string }) {
  const userId = auth.currentUser?.uid;
  const [values, setValues] = useState<Checkout>(empty);
  const [saved, setSaved] = useState<Checkout>(empty);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const isFuture = date > getTodayKey();

  useEffect(() => {
    if (!userId || !date) return;
    setReady(false);
    setError("");
    setSuccess(false);
    setValues(empty);
    const ref = doc(db, "users", userId, "eveningCheckouts", date);
    return onSnapshot(ref, (snapshot) => {
      const next = readCheckout(snapshot.data());
      setSaved(next);
      setValues(next);
      setReady(true);
    }, (err) => {
      console.error("Abend-Check-out laden:", err);
      setError("Check-out konnte nicht geladen werden.");
      setReady(false);
    });
  }, [userId, date]);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const update = (field: keyof Checkout, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setSuccess(false);
  };

  async function save() {
    if (!userId || !ready || saving || isFuture || !dirty) return;
    const parse = (value: string, maximum: number) => {
      if (!value.trim()) return true;
      const number = Number(value.replace(",", "."));
      return Number.isFinite(number) && number >= 0 && number <= maximum;
    };
    if (!parse(values.sleep, 24) || !parse(values.water, 20)) {
      setError("Bitte gültige Werte eingeben (Schlaf: 0–24 h, Wasser: 0–20 l).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "users", userId, "eveningCheckouts", date), {
        date,
        sleep: values.sleep.trim().replace(",", "."),
        water: values.water.trim().replace(",", "."),
        energy: values.energy,
        nutrition: values.nutrition,
        updatedAt: new Date().toISOString(),
      });
      setSuccess(true);
    } catch (err) {
      console.error("Abend-Check-out speichern:", err);
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <div className="eyebrow">DAILY RECOVERY / NUTRITION</div>
      <h2 style={{ margin: "10px 0 8px" }}>Evening Check-out.</h2>
      <p style={{ color: "#999", fontSize: 13, marginBottom: 22 }}>
        Dein Tagesabschluss. Alle Angaben sind freiwillig und später bearbeitbar.
      </p>
      {!ready ? <p style={{ color: "#aaa" }}>Check-out wird geladen ...</p> : (
        <div style={{ display: "grid", gap: 18 }}>
          <label style={{ display: "grid", gap: 7, fontSize: 13, color: "#ccc" }}>
            Schlafdauer der vergangenen Nacht (Stunden)
            <input type="text" inputMode="decimal" placeholder="z. B. 7,5" style={fieldStyle}
              disabled={isFuture || saving} value={values.sleep}
              onChange={(event) => update("sleep", event.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 7, fontSize: 13, color: "#ccc" }}>
            Heute getrunken (Liter)
            <input type="text" inputMode="decimal" placeholder="z. B. 2,5" style={fieldStyle}
              disabled={isFuture || saving} value={values.water}
              onChange={(event) => update("water", event.target.value)} />
          </label>
          <div>
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 10 }}>Energielevel heute</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" disabled={isFuture || saving}
                  onClick={() => update("energy", values.energy === String(n) ? "" : String(n))}
                  style={{ padding: "12px 0", borderRadius: 8, cursor: "pointer", border: "1px solid #555", background: values.energy === String(n) ? "#eee" : "#222", color: values.energy === String(n) ? "#111" : "#eee", fontWeight: 700 }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, color: "#888", fontSize: 11 }}>
              <span>Sehr erschöpft</span><span>Topfit</span>
            </div>
          </div>
          <div>
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 10 }}>Ernährungsplan eingehalten?</div>
            <div style={{ display: "grid", gap: 8 }}>
              {([ ["yes", "Ja, vollständig"], ["mostly", "Größtenteils"], ["no", "Nein"] ] as const).map(([value, label]) => (
                <button key={value} type="button" disabled={isFuture || saving}
                  onClick={() => update("nutrition", values.nutrition === value ? "" : value)}
                  style={{ textAlign: "left", padding: 13, borderRadius: 8, cursor: "pointer", border: "1px solid #555", background: values.nutrition === value ? "#eee" : "#222", color: values.nutrition === value ? "#111" : "#eee" }}>
                  {values.nutrition === value ? "✓ " : ""}{label}
                </button>
              ))}
            </div>
          </div>
          {isFuture && <p style={{ color: "#999", fontSize: 12 }}>Zukünftige Tage können noch nicht ausgefüllt werden.</p>}
          {error && <p role="alert" style={{ color: "#ff8585", fontSize: 13 }}>{error}</p>}
          {success && !dirty && <p style={{ color: "#b8e5b8", fontSize: 13 }}>Check-out gespeichert ✓</p>}
          <button type="button" disabled={isFuture || saving || !dirty} onClick={() => void save()}
            style={{ padding: "14px 16px", background: isFuture || !dirty ? "#333" : "#f0f0f0", color: isFuture || !dirty ? "#aaa" : "#111", border: "none", borderRadius: 8, fontWeight: 700, cursor: isFuture || !dirty ? "default" : "pointer" }}>
            {saving ? "Speichert ..." : dirty ? "CHECK-OUT SPEICHERN" : "Keine Änderungen"}
          </button>
        </div>
      )}
    </div>
  );
}
