
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";

type Quest = {
  id: string;
  title: string;
  startDate: string;
  duration: number;
  completedDates: string[];
  createdAt: string;
  cancelledAt?: string;
};

type QuestStatus =
  | "draft"
  | "active"
  | "upcoming"
  | "success"
  | "failed"
  | "cancelled";

const DAY = 86400000;

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const timestamp = Date.parse(`${value}T12:00:00Z`);

  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function addDays(date: string, n: number): string {
  if (!isValidDateKey(date) || !Number.isFinite(n)) return "";

  const timestamp = Date.parse(`${date}T12:00:00Z`) + n * DAY;
  const result = new Date(timestamp);

  if (!Number.isFinite(result.getTime())) return "";

  return result.toISOString().slice(0, 10);
}

function endDate(q: Quest): string {
  if (!isValidDateKey(q.startDate)) return "";
  return addDays(q.startDate, q.duration - 1);
}

function dates(q: Quest): string[] {
  if (!isValidDateKey(q.startDate)) return [];

  if (
    !Number.isInteger(q.duration) ||
    q.duration < 1 ||
    q.duration > 5
  ) {
    return [];
  }

  return Array.from(
    { length: q.duration },
    (_, i) => addDays(q.startDate, i)
  ).filter(Boolean);
}

export function questStatus(
  q: Quest,
  today: string
): QuestStatus {
  if (q.cancelledAt) return "cancelled";

  // Eine vorbereitete Sidequest hat noch kein Startdatum.
  if (!q.startDate || !isValidDateKey(q.startDate)) {
    return "draft";
  }

  if (today < q.startDate) return "upcoming";

  const questDates = dates(q);

  if (
    questDates.length === q.duration &&
    questDates.every((date) => q.completedDates.includes(date))
  ) {
    return "success";
  }

  const lastDay = endDate(q);

  if (lastDay && today > lastDay) return "failed";

  return "active";
}

export function useQuestSummary(userId: string | undefined) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setQuests([]);
      setReady(true);
      return;
    }

    setReady(false);

    return onSnapshot(
      collection(db, "users", userId, "sidequests"),
      (snapshot) => {
        const loaded = snapshot.docs
          .map((item) => ({
            ...item.data(),
            id: item.id,
          } as Quest))
          .filter(
            (q) =>
              typeof q.title === "string" &&
              typeof q.startDate === "string" &&
              Number.isInteger(q.duration) &&
              q.duration >= 1 &&
              q.duration <= 5 &&
              Array.isArray(q.completedDates)
          )
          .map((q) => ({
            ...q,
            completedDates: q.completedDates.filter(isValidDateKey),
            createdAt:
              typeof q.createdAt === "string"
                ? q.createdAt
                : "",
          }));

        setQuests(loaded);
        setReady(true);
      },
      (error) => {
        console.error("Sidequests:", error);
        setReady(true);
      }
    );
  }, [userId]);

  const today = getTodayKey();

  const active = quests.filter(
    (q) => questStatus(q, today) === "active"
  );

  const success = quests.filter(
    (q) => questStatus(q, today) === "success"
  ).length;

  return { quests, active, ready, success };
}

const panel: React.CSSProperties = {
  background: "#191919",
  border: "1px solid #333",
  borderRadius: 12,
  padding: 18,
};

const btn: React.CSSProperties = {
  background: "#252525",
  border: "1px solid #444",
  color: "#eee",
  borderRadius: 8,
  padding: "10px 13px",
  cursor: "pointer",
};

const subtle: React.CSSProperties = {
  color: "#aaa",
  fontSize: 12,
};

const labels: Record<QuestStatus, string> = {
  draft: "BEREIT ZUM START",
  active: "AKTIV",
  upcoming: "GEPLANT",
  success: "ERFOLGREICH",
  failed: "NICHT GESCHAFFT",
  cancelled: "ABGEBROCHEN",
};

function formatDate(value: string): string {
  if (!isValidDateKey(value)) return "—";
  return value.split("-").reverse().join(".");
}

export default function Sidequests() {
  const userId = auth.currentUser?.uid;

  const { quests, active, ready, success } =
    useQuestSummary(userId);

  const today = getTodayKey();

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(3);
  const [startNow, setStartNow] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDuration, setEditDuration] = useState(3);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ordered = useMemo(() => {
    const priority: Record<QuestStatus, number> = {
      active: 0,
      draft: 1,
      upcoming: 2,
      success: 3,
      failed: 4,
      cancelled: 5,
    };

    return [...quests].sort((a, b) => {
      const difference =
        priority[questStatus(a, today)] -
        priority[questStatus(b, today)];

      return (
        difference ||
        (b.createdAt || "").localeCompare(a.createdAt || "")
      );
    });
  }, [quests, today]);

  const drafts = quests.filter(
    (q) => questStatus(q, today) === "draft"
  );

  async function create(e: React.FormEvent) {
    e.preventDefault();

    if (!userId || busy || !title.trim()) return;

    setBusy(true);
    setError("");

    try {
      const id = crypto.randomUUID();

      await setDoc(
        doc(db, "users", userId, "sidequests", id),
        {
          title: title.trim(),
          startDate: startNow ? today : "",
          duration,
          completedDates: [],
          createdAt: new Date().toISOString(),
        }
      );

      setTitle("");
      setDuration(3);
      setStartNow(false);
    } catch (err) {
      console.error(err);
      setError("Sidequest konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function activate(q: Quest) {
    if (
      !userId ||
      busy ||
      questStatus(q, today) !== "draft"
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await updateDoc(
        doc(db, "users", userId, "sidequests", q.id),
        {
          startDate: today,
          completedDates: [],
        }
      );
    } catch (err) {
      console.error(err);
      setError("Sidequest konnte nicht aktiviert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function check(q: Quest, date: string) {
    if (
      !userId ||
      busy ||
      date !== today ||
      questStatus(q, today) !== "active"
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await updateDoc(
        doc(db, "users", userId, "sidequests", q.id),
        {
          completedDates: q.completedDates.includes(date)
            ? arrayRemove(date)
            : arrayUnion(date),
        }
      );
    } catch (err) {
      console.error(err);
      setError("Fortschritt konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(q: Quest) {
    if (!userId || busy || !editTitle.trim()) return;

    setBusy(true);
    setError("");

    try {
      await updateDoc(
        doc(db, "users", userId, "sidequests", q.id),
        {
          title: editTitle.trim(),
          duration: editDuration,
        }
      );

      setEditing(null);
    } catch (err) {
      console.error(err);
      setError("Änderung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(q: Quest) {
    if (
      !userId ||
      busy ||
      !window.confirm(`„${q.title}“ abbrechen?`)
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await updateDoc(
        doc(db, "users", userId, "sidequests", q.id),
        {
          cancelledAt: new Date().toISOString(),
        }
      );
    } catch (err) {
      console.error(err);
      setError("Abbrechen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(q: Quest) {
    if (
      !userId ||
      busy ||
      !window.confirm(
        `„${q.title}“ endgültig löschen? Alle Fortschritte gehen verloren.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await deleteDoc(
        doc(db, "users", userId, "sidequests", q.id)
      );
    } catch (err) {
      console.error(err);
      setError("Löschen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "12px 0 90px",
        color: "#f5f5f5",
      }}
    >
      <div className="eyebrow">
        WINTER ARC / SIDE MISSIONS
      </div>

      <h1
        style={{
          fontSize: "clamp(30px, 6vw, 48px)",
          margin: "12px 0 8px",
        }}
      >
        Extra mile.
      </h1>

      <p
        style={{
          color: "#999",
          marginBottom: 24,
        }}
      >
        Freiwillige Challenges. 1–5 Tage. Jeder Tag zählt.
      </p>

      {error && (
        <p role="alert" style={{ color: "#ff8888" }}>
          {error}
        </p>
      )}

      {!ready ? (
        <p style={subtle}>
          Sidequests werden geladen …
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {[
              ["ACTIVE QUESTS", active.length],
              ["VORBEREITET", drafts.length],
              ["COMPLETED", success],
              [
                "ACHIEVEMENT",
                success >= 10
                  ? "LEGEND"
                  : success >= 5
                    ? "UNSTOPPABLE"
                    : success >= 1
                      ? "FIRST WIN"
                      : "—",
              ],
            ].map(([label, value]) => (
              <div key={String(label)} style={panel}>
                <div
                  style={{
                    ...subtle,
                    letterSpacing: 1,
                  }}
                >
                  {label}
                </div>

                <div
                  style={{
                    fontSize: 27,
                    fontWeight: 800,
                    marginTop: 12,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              ...panel,
              marginBottom: 16,
            }}
          >
            <div className="eyebrow">
              NEW CHALLENGE
            </div>

            <h2 style={{ margin: "8px 0 15px" }}>
              Sidequest vorbereiten
            </h2>

            <form
              onSubmit={create}
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "end",
              }}
            >
              <label
                style={{
                  flex: "2 1 230px",
                  ...subtle,
                }}
              >
                Herausforderung

                <input
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value)
                  }
                  maxLength={80}
                  placeholder="z. B. 3 Tage 2,5 l Wasser"
                  style={{
                    ...btn,
                    boxSizing: "border-box",
                    width: "100%",
                    display: "block",
                    marginTop: 7,
                  }}
                />
              </label>

              <label style={subtle}>
                Dauer

                <select
                  value={duration}
                  onChange={(e) =>
                    setDuration(Number(e.target.value))
                  }
                  style={{
                    ...btn,
                    display: "block",
                    marginTop: 7,
                  }}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Tag" : "Tage"}
                    </option>
                  ))}
                </select>
              </label>

              <label
                style={{
                  ...subtle,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingBottom: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={startNow}
                  onChange={(e) =>
                    setStartNow(e.target.checked)
                  }
                />

                Sofort starten
              </label>

              <button
                disabled={busy || !title.trim()}
                style={{
                  ...btn,
                  background: "#eee",
                  color: "#111",
                  fontWeight: 800,
                }}
              >
                + {startNow ? "STARTEN" : "SPEICHERN"}
              </button>
            </form>

            <p
              style={{
                ...subtle,
                marginTop: 12,
              }}
            >
              Standardmäßig wird die Sidequest nur
              gespeichert. Du kannst sie jederzeit
              manuell aktivieren; erst dann beginnt ihre
              Laufzeit. Mit „Sofort starten“ beginnt sie
              heute.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {ordered.length === 0 && (
              <div style={panel}>
                <p style={subtle}>
                  Noch keine Sidequests. Starte deine
                  erste Challenge!
                </p>
              </div>
            )}

            {ordered.map((q) => {
              const status = questStatus(q, today);
              const questDates = dates(q);

              const done = questDates.filter(
                (date) => q.completedDates.includes(date)
              ).length;

              const editable =
                status === "draft" ||
                (status === "active" && done === 0);

              return (
                <div key={q.id} style={panel}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 190,
                      }}
                    >
                      <div className="eyebrow">
                        {labels[status]}
                      </div>

                      <h2 style={{ margin: "8px 0" }}>
                        {q.title}
                      </h2>

                      <div style={subtle}>
                        {status === "draft"
                          ? `Noch nicht gestartet · ${q.duration} ${
                              q.duration === 1
                                ? "Tag"
                                : "Tage"
                            }`
                          : `${formatDate(q.startDate)} – ${formatDate(
                              endDate(q)
                            )} · ${done}/${q.duration} Tage`}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                      }}
                    >
                      {status === "draft" && (
                        <button
                          style={{
                            ...btn,
                            background: "#eee",
                            color: "#111",
                            fontWeight: 800,
                          }}
                          disabled={busy}
                          onClick={() => activate(q)}
                        >
                          ▶ Aktivieren
                        </button>
                      )}

                      {editable && (
                        <button
                          style={btn}
                          disabled={busy}
                          onClick={() => {
                            setEditing(q.id);
                            setEditTitle(q.title);
                            setEditDuration(q.duration);
                          }}
                        >
                          Bearbeiten
                        </button>
                      )}

                      {status === "active" && (
                        <button
                          style={btn}
                          disabled={busy}
                          onClick={() => cancel(q)}
                        >
                          Abbrechen
                        </button>
                      )}

                      <button
                        style={btn}
                        disabled={busy}
                        onClick={() => remove(q)}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>

                  {editing === q.id && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 15,
                      }}
                    >
                      <input
                        style={{
                          ...btn,
                          flex: "1 1 200px",
                        }}
                        value={editTitle}
                        maxLength={80}
                        onChange={(e) =>
                          setEditTitle(e.target.value)
                        }
                      />

                      <select
                        style={btn}
                        value={editDuration}
                        onChange={(e) =>
                          setEditDuration(
                            Number(e.target.value)
                          )
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} Tage
                          </option>
                        ))}
                      </select>

                      <button
                        style={btn}
                        disabled={
                          busy || !editTitle.trim()
                        }
                        onClick={() => saveEdit(q)}
                      >
                        Speichern
                      </button>

                      <button
                        style={btn}
                        onClick={() => setEditing(null)}
                      >
                        Abbrechen
                      </button>
                    </div>
                  )}

                  {status !== "draft" && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${q.duration}, minmax(0, 1fr))`,
                        gap: 8,
                        marginTop: 18,
                      }}
                    >
                      {questDates.map((date, i) => {
                        const checked =
                          q.completedDates.includes(date);

                        const canToggle =
                          status === "active" &&
                          date === today;

                        return (
                          <button
                            key={date}
                            disabled={!canToggle || busy}
                            onClick={() =>
                              check(q, date)
                            }
                            style={{
                              ...btn,
                              minWidth: 0,
                              padding: "12px 4px",
                              background: checked
                                ? "#eee"
                                : "#252525",
                              color: checked
                                ? "#111"
                                : "#aaa",
                              cursor: canToggle
                                ? "pointer"
                                : "default",
                              borderColor:
                                date === today
                                  ? "#eee"
                                  : "#444",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                              }}
                            >
                              TAG {i + 1}
                            </div>

                            <div
                              style={{
                                fontSize: 21,
                                fontWeight: 800,
                                margin: "5px 0",
                              }}
                            >
                              {checked ? "✓" : "○"}
                            </div>

                            <div
                              style={{
                                fontSize: 10,
                              }}
                            >
                              {date.slice(8)}.
                              {date.slice(5, 7)}.
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {status === "draft" && (
                    <p
                      style={{
                        ...subtle,
                        marginBottom: 0,
                      }}
                    >
                      Bereit, wenn du es bist. Die
                      Challenge startet erst mit
                      „Aktivieren“.
                    </p>
                  )}

                  {status === "success" && (
                    <p
                      style={{
                        color: "#eee",
                        marginBottom: 0,
                        fontWeight: 700,
                      }}
                    >
                      ★ QUEST COMPLETED
                    </p>
                  )}

                  {status === "failed" && (
                    <p
                      style={{
                        ...subtle,
                        marginBottom: 0,
                      }}
                    >
                      Die Laufzeit ist vorbei. Nicht alle
                      Tage wurden abgehakt.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
