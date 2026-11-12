
import { useEffect, useMemo, useState } from "react";
import { auth } from "./firebase";
import {
  getTasksForDate,
  type DailyPlanTask,
  type DailyPlanEntry,
  type TaskRepeat,
} from "./dailyPlanTypes";
import {
  subscribeToPlanTasks,
  subscribeToPlanDay,
  savePlanTasks,
  savePlanDay,
  saveTodayTaskSnapshot,
} from "./dailyPlanService";
import { getTodayKey } from "./dailyProgress";


const weekdays = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" },
];

const inputStyle = {
  width: "100%",
  padding: "13px",
  background: "#161616",
  color: "#fff",
  border: "1px solid #444",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
} as const;

const primaryButton = {
  padding: "12px 16px",
  background: "#f0f0f0",
  color: "#111",
  border: "none",
  borderRadius: "8px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButton = {
  padding: "10px 13px",
  background: "#222",
  color: "#ddd",
  border: "1px solid #444",
  borderRadius: "7px",
  fontSize: "12px",
  cursor: "pointer",
} as const;

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DailyPlan() {
  const userId = auth.currentUser?.uid;

  const [date, setDate] = useState(getTodayKey);
  const [tasks, setTasks] = useState<DailyPlanTask[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [dayEntry, setDayEntry] = useState<DailyPlanEntry | null>(null);

  const [tasksReady, setTasksReady] = useState(false);
  const [dayReady, setDayReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [repeat, setRepeat] = useState<TaskRepeat>("daily");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [category, setCategory] =
    useState<DailyPlanTask["category"]>("other");

  useEffect(() => {
    if (!userId) return;

    setTasksReady(false);

    return subscribeToPlanTasks(
      userId,
      (nextTasks) => {
        setTasks(nextTasks);
        setTasksReady(true);
      },
      (err) => {
        console.error(err);
        setError("Aufgaben konnten nicht geladen werden.");
      }
    );
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    setDayReady(false);
    setCompletedIds([]);
    setDayEntry(null);

    return subscribeToPlanDay(
      userId,
      date,
      (entry) => {
        setCompletedIds(entry.completedTaskIds);
        setDayEntry(entry);
        setDayReady(true);
      },
      (err) => {
        console.error(err);
        setError("Tagesfortschritt konnte nicht geladen werden.");
      }
    );
  }, [userId, date]);

  const isPast = date < getTodayKey();
  const isFuture = date > getTodayKey();
  const missingHistory = isPast && !dayEntry?.plannedTasks;
  const visibleTasks = useMemo(
    () => isPast ? (dayEntry?.plannedTasks ?? []) : getTasksForDate(tasks, date),
    [tasks, date, isPast, dayEntry]
  );

  // Aktuellen Tagesstand speichern, auch wenn noch nichts abgehakt wurde.
  useEffect(() => {
    if (!userId || !tasksReady || !dayReady || !dayEntry || date !== getTodayKey()) return;
    const current = getTasksForDate(tasks, date);
    if (JSON.stringify(dayEntry.plannedTasks) === JSON.stringify(current)) return;
    saveTodayTaskSnapshot(userId, date, current).catch((err) => {
      console.error(err);
      setError("Tageshistorie konnte nicht gesichert werden.");
    });
  }, [userId, tasksReady, dayReady, dayEntry, date, tasks]);

  const inactiveTasks = useMemo(
    () => tasks.filter((task) => !task.active),
    [tasks]
  );

  const completedCount = visibleTasks.filter((task) =>
    completedIds.includes(task.id)
  ).length;

  const progress = visibleTasks.length
    ? Math.round((completedCount / visibleTasks.length) * 100)
    : 0;

  function resetForm() {
    setTitle("");
    setTime("");
    setRepeat("daily");
    setSelectedWeekdays([]);
    setCategory("other");
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
    setError("");
  }

  function startEdit(task: DailyPlanTask) {
    setEditingId(task.id);
    setTitle(task.title);
    setTime(task.time ?? "");
    setRepeat(task.repeat);
    setSelectedWeekdays(task.weekdays);
    setCategory(task.category);
    setShowForm(true);
    setError("");
  }

  function toggleWeekday(day: number) {
    setSelectedWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day]
    );
  }

  async function updateTasks(next: DailyPlanTask[]) {
    if (!userId || !tasksReady || saving || isPast) return false;

    const previous = tasks;

    setTasks(next);
    setSaving(true);
    setError("");

    try {
      await savePlanTasks(userId, next);
      return true;
    } catch (err) {
      console.error(err);
      setTasks(previous);
      setError("Änderung konnte nicht gespeichert werden.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTask() {
    if (!title.trim() || saving || !tasksReady || isPast) return;

    if (repeat === "weekdays" && selectedWeekdays.length === 0) {
      setError("Bitte mindestens einen Wochentag auswählen.");
      return;
    }

    const now = new Date().toISOString();

    let next: DailyPlanTask[];

    if (editingId) {
      next = tasks.map((task) =>
        task.id === editingId
          ? {
              ...task,
              title: title.trim(),
              time: time || null,
              repeat,
              weekdays:
                repeat === "weekdays" ? selectedWeekdays : [],
              date:
                repeat === "once"
                  ? task.repeat === "once"
                    ? task.date
                    : date
                  : null,
              category,
            }
          : task
      );
    } else {
      const newTask: DailyPlanTask = {
        id: crypto.randomUUID(),
        title: title.trim(),
        time: time || null,
        repeat,
        weekdays:
          repeat === "weekdays" ? selectedWeekdays : [],
        date: repeat === "once" ? date : null,
        category,
        active: true,
        createdAt: now,
      };

      next = [...tasks, newTask];
    }

    const success = await updateTasks(next);

    if (success) resetForm();
  }

  async function toggleActive(task: DailyPlanTask) {
    const next = tasks.map((item) =>
      item.id === task.id
        ? { ...item, active: !item.active }
        : item
    );

    await updateTasks(next);
  }

  async function deleteTask(task: DailyPlanTask) {
    const confirmed = window.confirm(
      `Aufgabe "${task.title}" wirklich löschen?`
    );

    if (!confirmed) return;

    const next = tasks.filter((item) => item.id !== task.id);
    const success = await updateTasks(next);

    if (success && editingId === task.id) resetForm();
  }

  async function toggleTask(taskId: string) {
    if (!userId || !dayReady || saving || isPast || isFuture) return;

    const previous = completedIds;

    const next = previous.includes(taskId)
      ? previous.filter((id) => id !== taskId)
      : [...previous, taskId];

    setCompletedIds(next);
    setSaving(true);
    setError("");

    try {
      await savePlanDay(userId, {
        date,
        completedTaskIds: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setCompletedIds(previous);
      setError("Fortschritt konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        width: "100%",
        maxWidth: "1000px",
        boxSizing: "border-box",
        padding: "28px clamp(16px, 3vw, 40px) 100px",
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <div className="eyebrow">DAILY EXECUTION</div>
        <h1 style={{ margin: "14px 0 10px", lineHeight: 1.12 }}>
          Daily Plan.
        </h1>
        <p style={{ color: "#888", margin: 0 }}>
          Plan your day. Execute with discipline.
        </p>
      </header>

      <div className="panel" style={{ marginBottom: "22px" }}>
        <div className="eyebrow">SELECTED DAY</div>

        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          style={{
            ...inputStyle,
            marginTop: "12px",
            maxWidth: "250px",
          }}
        />

        <h2
          style={{
            marginTop: "18px",
            textTransform: "capitalize",
          }}
        >
          {formatDate(date)}
        </h2>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "24px",
            marginBottom: "10px",
          }}
        >
          <span style={{ color: "#aaa", fontSize: "12px" }}>
            DAILY PROGRESS
          </span>
          <strong>{missingHistory ? "—" : `${progress}%`}</strong>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p style={{ color: "#888", fontSize: "12px", marginTop: "10px" }}>
          {missingHistory ? "Für diesen vergangenen Tag liegt noch kein gesicherter Aufgabenstand vor." : `${completedCount} von ${visibleTasks.length} Aufgaben erledigt`}
        </p>
      </div>

      <div className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div>
            <div className="eyebrow">YOUR TASKS</div>
            <h2 style={{ marginTop: "8px" }}>
              Today's execution
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showForm) resetForm();
              else startCreate();
            }}
            style={primaryButton}
            disabled={isPast}
          >
            {showForm ? "Schließen" : "+ Aufgabe"}
          </button>
        </div>

        {isPast && <p style={{ color: "#999", fontSize: "12px" }}>Vergangener Tag – schreibgeschützte Historie.</p>}
        {isFuture && <p style={{ color: "#999", fontSize: "12px" }}>Zukünftiger Tag – Aufgaben können geplant, aber noch nicht abgehakt werden.</p>}
        {error && (
          <p
            role="alert"
            style={{ color: "#ff8585", fontSize: "13px" }}
          >
            {error}
          </p>
        )}

        {showForm && (
          <div
            style={{
              padding: "20px",
              marginBottom: "24px",
              background: "#111",
              border: "1px solid #333",
              borderRadius: "10px",
              display: "grid",
              gap: "14px",
            }}
          >
            <h3>
              {editingId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
            </h3>

            <input
              placeholder="Aufgabenname"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              style={inputStyle}
            />

            <label>
              <span style={{ fontSize: "12px", color: "#aaa" }}>
                Uhrzeit (optional)
              </span>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                style={{ ...inputStyle, marginTop: "7px" }}
              />
            </label>

            <label>
              <span style={{ fontSize: "12px", color: "#aaa" }}>
                Wiederholung
              </span>
              <select
                value={repeat}
                onChange={(event) =>
                  setRepeat(event.target.value as TaskRepeat)
                }
                style={{ ...inputStyle, marginTop: "7px" }}
              >
                <option value="daily">Jeden Tag</option>
                <option value="weekdays">
                  Bestimmte Wochentage
                </option>
                <option value="once">
                  Nur am ausgewählten Tag
                </option>
              </select>
            </label>

            {repeat === "weekdays" && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {weekdays.map((day) => {
                  const selected =
                    selectedWeekdays.includes(day.value);

                  return (
                    <button
                      type="button"
                      key={day.value}
                      onClick={() =>
                        toggleWeekday(day.value)
                      }
                      style={{
                        padding: "10px",
                        borderRadius: "7px",
                        border: "1px solid #555",
                        background: selected
                          ? "#eee"
                          : "#222",
                        color: selected ? "#111" : "#eee",
                        cursor: "pointer",
                      }}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            )}

            <label>
              <span style={{ fontSize: "12px", color: "#aaa" }}>
                Kategorie
              </span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value as DailyPlanTask["category"]
                  )
                }
                style={{ ...inputStyle, marginTop: "7px" }}
              >
                <option value="routine">Routine</option>
                <option value="training">Training</option>
                <option value="nutrition">Ernährung</option>
                <option value="recovery">Regeneration</option>
                <option value="other">Sonstiges</option>
              </select>
            </label>

            <button
              type="button"
              onClick={saveTask}
              disabled={saving || !tasksReady || !title.trim()}
              style={primaryButton}
            >
              {saving
                ? "Speichert ..."
                : editingId
                  ? "Änderungen speichern"
                  : "Aufgabe erstellen"}
            </button>
          </div>
        )}

        {!tasksReady || !dayReady ? (
          <p style={{ color: "#888" }}>
            Lade Tagesplan ...
          </p>
        ) : visibleTasks.length === 0 ? (
          <p style={{ color: "#888" }}>
            Für diesen Tag sind keine Aufgaben geplant.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "10px",
            }}
          >
            {visibleTasks.map((task, index) => {
              const completed =
                completedIds.includes(task.id);

              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px",
                    background: "#161616",
                    border: "1px solid #303030",
                    borderRadius: "9px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    disabled={saving || isPast || isFuture}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: "transparent",
                      border: "none",
                      color: completed ? "#888" : "#eee",
                      textAlign: "left",
                      cursor: "pointer",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        color: "#777",
                        fontSize: "11px",
                        minWidth: "36px",
                      }}
                    >
                      {task.time ??
                        String(index + 1).padStart(2, "0")}
                    </span>

                    <span
                      style={{
                        flex: 1,
                        textDecoration: completed
                          ? "line-through"
                          : "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {task.title}
                    </span>

                    <span
                      style={{
                        width: "22px",
                        height: "22px",
                        display: "grid",
                        placeItems: "center",
                        border: "1px solid #777",
                        borderRadius: "5px",
                      }}
                    >
                      {completed ? "✓" : ""}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startEdit(task)}
                    disabled={saving || isPast}
                    style={secondaryButton}
                    aria-label={`${task.title} bearbeiten`}
                  >
                    ✎
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleActive(task)}
                    disabled={saving || isPast}
                    style={secondaryButton}
                    aria-label={`${task.title} pausieren`}
                  >
                    ⏸
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTask(task)}
                    disabled={saving || isPast}
                    style={{
                      ...secondaryButton,
                      color: "#ff9999",
                    }}
                    aria-label={`${task.title} löschen`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="panel"
        style={{ marginTop: "22px" }}
      >
        <div className="eyebrow">TASK MANAGEMENT</div>

        <h2 style={{ margin: "10px 0 16px" }}>
          Pausierte Aufgaben
        </h2>

        <button
          type="button"
          onClick={() =>
            setShowInactive((current) => !current)
          }
          style={secondaryButton}
        >
          {showInactive
            ? "Liste schließen"
            : `Anzeigen (${inactiveTasks.length})`}
        </button>

        {showInactive && (
          <div
            style={{
              display: "grid",
              gap: "10px",
              marginTop: "18px",
            }}
          >
            {inactiveTasks.length === 0 ? (
              <p style={{ color: "#888" }}>
                Keine pausierten Aufgaben vorhanden.
              </p>
            ) : (
              inactiveTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    background: "#161616",
                    borderRadius: "8px",
                  }}
                >
                  <span>{task.title}</span>

                  <button
                    type="button"
                    onClick={() => toggleActive(task)}
                    disabled={saving || isPast}
                    style={secondaryButton}
                  >
                    Aktivieren
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">DAILY REVIEW</div>
        <h2 style={{ margin: "10px 0 8px" }}>Evening Check-out</h2>
        <p style={{ color: "#999", fontSize: 13 }}>Schlaf, Wasser, Energie, Ernährung und Tagesreflexion trägst du jetzt gemeinsam im Journal ein (Menü → Mehr → Journal).</p>
      </div>
    </section>
  );
}
