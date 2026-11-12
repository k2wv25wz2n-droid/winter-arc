
import { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTodayKey } from "./dailyProgress";
import {
  getTasksForDate,
  type DailyPlanTask,
  type DailyPlanEntry,
} from "./dailyPlanTypes";
import {
  subscribeToPlanTasks,
  subscribeToPlanDay,
  savePlanDay,
  saveTodayTaskSnapshot,
} from "./dailyPlanService";
import DailyPlan from "./DailyPlan";
import Training from "./Training";
import Performance from "./Performance";
import Habits, { useHabitStreak } from "./Habits";
import Sidequests, { useQuestSummary } from "./Sidequests";
import Journal from "./Journal";
import "./App.css";
import "./MobileExperience.css";
import SplashScreen from "./SplashScreen";

type CheckoutData = {
  sleep?: string;
  water?: string;
  energy?: string;
  nutrition?: string;
  updatedAt?: string;
};

function isCheckoutTask(task: DailyPlanTask) {
  return /abend[\s-]*check[\s-]*out|evening[\s-]*check[\s-]*out/i.test(task.title);
}

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "daily", label: "Daily Plan", icon: "▦" },
  { id: "training", label: "Training", icon: "↗" },
  { id: "habits", label: "Habits", icon: "◉" },
  { id: "quests", label: "Sidequests", icon: "◇" },
  { id: "performance", label: "Performance", icon: "⌁" },
  { id: "journal", label: "Journal", icon: "▤" },
];

const ARC_START = new Date(2026, 10, 29);
const ARC_END = new Date(2027, 0, 22);
const DAY_MS = 86_400_000;

function calendarDayNumber(date: Date) {
  return Math.floor(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ) / DAY_MS
  );
}

function getArcStatus(today: string) {
  const current = new Date(`${today}T12:00:00`);
  const start = calendarDayNumber(ARC_START);
  const end = calendarDayNumber(ARC_END);
  const now = calendarDayNumber(current);
  const total = end - start + 1;

  if (now < start) {
    return {
      label: "START IN",
      value: `${start - now} DAYS`,
      day: 0,
      total,
      percentage: 0,
      phase: "PREPARATION PHASE",
    };
  }

  const day = Math.min(now - start + 1, total);

  return {
    label: now > end ? "STATUS" : "CURRENT DAY",
    value: now > end ? "COMPLETED" : `DAY ${day}`,
    day,
    total,
    percentage: Math.round((day / total) * 100),
    phase: now > end ? "ARC COMPLETED" : "WINTER ARC ACTIVE",
  };
}

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [showSplash, setShowSplash] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [syncError, setSyncError] = useState("");

  const [today, setToday] = useState(getTodayKey);
  const [tasks, setTasks] = useState<DailyPlanTask[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [dayEntry, setDayEntry] = useState<DailyPlanEntry | null>(null);
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);

  const [tasksReady, setTasksReady] = useState(false);
  const [dayReady, setDayReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const userId = auth.currentUser?.uid;
  const habitStreak = useHabitStreak(userId);
  const questSummary = useQuestSummary(userId);
  const [dashboardHabits, setDashboardHabits] = useState<{id:string;title:string;createdAt:string;weekdays:number[];active:boolean;archivedAt?:string}[]>([]);
  const [dashboardHabitChecks, setDashboardHabitChecks] = useState<string[]>([]);
  const [habitsReady, setHabitsReady] = useState(false);
  const [habitDayReady, setHabitDayReady] = useState(false);
  const [habitSaving, setHabitSaving] = useState(false);
  const [trainingDone, setTrainingDone] = useState(false);
  const [trainingReady, setTrainingReady] = useState(false);
  const [journalSaved, setJournalSaved] = useState(false);
  const [journalReady, setJournalReady] = useState(false);
  const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const workoutToday = ({ 3: "A", 5: "B", 0: "C" } as Record<number, string>)[todayWeekday];
  const todayHabits = dashboardHabits.filter(h => h.active !== false && h.createdAt.slice(0,10) <= today && (!h.archivedAt || today < h.archivedAt) && (h.weekdays.length === 0 || h.weekdays.includes(todayWeekday)));
  const habitsCompleted = todayHabits.filter(h => dashboardHabitChecks.includes(h.id)).length;
  const dashboardPanel: React.CSSProperties = { background: "#191919", border: "1px solid #333", borderRadius: 12, padding: 20 };
  const dashboardButton: React.CSSProperties = { background: "#292929", border: "1px solid #444", color: "#eee", borderRadius: 8, padding: "10px 12px", cursor: "pointer" };

  useEffect(() => {
    if (!userId) return;
    setHabitsReady(false);
    return onSnapshot(collection(db, "users", userId, "habits"), snap => {
      setDashboardHabits(snap.docs.map(d => ({...d.data(), id:d.id} as typeof dashboardHabits[number])).filter(h => typeof h.title === "string" && typeof h.createdAt === "string" && Array.isArray(h.weekdays)));
      setHabitsReady(true);
    }, e => { console.error(e); setSyncError("Habits konnten nicht geladen werden."); });
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    setHabitDayReady(false);
    return onSnapshot(doc(db,"users",userId,"habitDays",today), snap => {
      setDashboardHabitChecks(Array.isArray(snap.data()?.completedHabitIds) ? snap.data()!.completedHabitIds : []);
      setHabitDayReady(true);
    }, e => { console.error(e); setSyncError("Habit-Fortschritt konnte nicht geladen werden."); });
  }, [userId,today]);
  useEffect(() => {
    if (!userId) return;
    setTrainingReady(false);
    if (!workoutToday) { setTrainingDone(false); setTrainingReady(true); return; }
    return onSnapshot(doc(db,"users",userId,"trainingSessions",`${today}_${workoutToday}`), snap => {
      setTrainingDone(snap.data()?.finished === true); setTrainingReady(true);
    }, e => { console.error(e); setSyncError("Training konnte nicht geladen werden."); });
  }, [userId,today,workoutToday]);
  useEffect(() => {
    if (!userId) return;
    setJournalReady(false);
    return onSnapshot(doc(db,"users",userId,"journalEntries",today), snap => {
      setJournalSaved(snap.exists() && Boolean(snap.data()?.updatedAt)); setJournalReady(true);
    }, e => { console.error(e); setSyncError("Journal konnte nicht geladen werden."); });
  }, [userId,today]);
  async function toggleDashboardHabit(id:string) {
    if (!userId || !habitsReady || !habitDayReady || habitSaving) return;
    const previous = dashboardHabitChecks;
    const next = previous.includes(id) ? previous.filter(x => x !== id) : [...previous,id];
    setDashboardHabitChecks(next); setHabitSaving(true);
    try { await setDoc(doc(db,"users",userId,"habitDays",today), { date:today, completedHabitIds:next, updatedAt:new Date().toISOString() }, {merge:true}); }
    catch(e) { console.error(e); setDashboardHabitChecks(previous); setSyncError("Habit konnte nicht gespeichert werden."); }
    finally { setHabitSaving(false); }
  }

  const todayTasks = useMemo(
    () => getTasksForDate(tasks, today),
    [tasks, today]
  );

  const checkoutSaved = Boolean(checkout?.updatedAt);
  const isCompleted = (task: DailyPlanTask) =>
    isCheckoutTask(task) ? checkoutSaved : completedIds.includes(task.id);

  const completedCount = todayTasks.filter(isCompleted).length;

  const progress = todayTasks.length
    ? Math.round((completedCount / todayTasks.length) * 100)
    : 0;

  const arc = getArcStatus(today);
  const syncReady = tasksReady && dayReady && checkoutReady;

  const mainNavigation = navigation.filter((item) =>
    ["dashboard", "daily", "training", "habits"].includes(item.id)
  );

  const moreNavigation = navigation.filter((item) =>
    ["quests", "performance", "journal"].includes(item.id)
  );

  const isMorePage = moreNavigation.some(
    (item) => item.id === activePage
  );

  const activePageLabel =
    navigation.find((item) => item.id === activePage)?.label ??
    "Dashboard";

  // Tageswechsel automatisch erkennen.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setToday(getTodayKey());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  // Aufgabenliste aus Firebase laden.
  useEffect(() => {
    if (!userId) return;

    setTasksReady(false);

    const unsubscribe = subscribeToPlanTasks(
      userId,
      (nextTasks) => {
        setTasks(nextTasks);
        setTasksReady(true);
      },
      (error) => {
        console.error("Aufgaben-Synchronisierung:", error);
        setSyncError("Aufgaben konnten nicht geladen werden.");
        setTasksReady(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Tagesfortschritt aus Firebase laden.
  useEffect(() => {
    if (!userId) return;

    setDayReady(false);
    setCompletedIds([]);
    setDayEntry(null);

    const unsubscribe = subscribeToPlanDay(
      userId,
      today,
      (entry) => {
        setCompletedIds(entry.completedTaskIds);
        setDayEntry(entry);
        setDayReady(true);
      },
      (error) => {
        console.error("Tages-Synchronisierung:", error);
        setSyncError("Tagesfortschritt konnte nicht geladen werden.");
        setDayReady(false);
      }
    );

    return () => unsubscribe();
  }, [userId, today]);

  // Abend-Check-out live aus derselben Firebase-Sammlung wie im Daily Plan laden.
  useEffect(() => {
    if (!userId) return;
    setCheckout(null);
    setCheckoutReady(false);
    return onSnapshot(doc(db, "users", userId, "eveningCheckouts", today), (snapshot) => {
      setCheckout(snapshot.exists() ? snapshot.data() as CheckoutData : null);
      setCheckoutReady(true);
    }, (error) => {
      console.error("Check-out-Synchronisierung:", error);
      setSyncError("Abend-Check-out konnte nicht geladen werden.");
      setCheckoutReady(false);
    });
  }, [userId, today]);

  // Den heutigen Aufgabenstand sichern. Alte Tage bleiben unverändert.
  useEffect(() => {
    if (!userId || !tasksReady || !dayReady || !dayEntry || today !== getTodayKey()) return;
    const current = getTasksForDate(tasks, today);
    if (JSON.stringify(dayEntry.plannedTasks) === JSON.stringify(current)) return;
    saveTodayTaskSnapshot(userId, today, current).catch((error) => {
      console.error("Tageshistorie:", error);
      setSyncError("Tageshistorie konnte nicht gesichert werden.");
    });
  }, [userId, tasksReady, dayReady, dayEntry, tasks, today]);

  function changePage(page: string) {
    setActivePage(page);
    setMoreOpen(false);
    setProfileOpen(false);
  }

  async function toggleTask(taskId: string) {
    if (!userId || !syncReady || saving) return;
    const task = todayTasks.find((item) => item.id === taskId);
    if (task && isCheckoutTask(task)) {
      changePage("journal");
      return;
    }

    const previous = completedIds;

    const next = previous.includes(taskId)
      ? previous.filter((id) => id !== taskId)
      : [...previous, taskId];

    setCompletedIds(next);
    setSaving(true);
    setSyncError("");

    try {
      await savePlanDay(userId, {
        date: today,
        completedTaskIds: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Speichern fehlgeschlagen:", error);
      setCompletedIds(previous);
      setSyncError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLogoutError("");

    try {
      await signOut(auth);
      setProfileOpen(false);
    } catch (error) {
      console.error("Abmeldung fehlgeschlagen:", error);
      setLogoutError("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
    }
  }

  return (
    <div className="app-shell">
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <div className="brand-name">WINTER ARC</div>
            <div className="brand-subtitle">2026 / 27</div>
          </div>
        </div>

        <div className="nav-label">MENU</div>

        <nav className="navigation">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => changePage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot" />
          PERSONAL PERFORMANCE SYSTEM
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">WINTER ARC / 2026–27</div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="profile"
              aria-label="Profilmenü öffnen"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((current) => !current);
                setMoreOpen(false);
              }}
              style={{
                background: "transparent",
                color: "#f5f5f5",
                cursor: "pointer",
              }}
            >
              WA
            </button>

            {profileOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "46px",
                  right: 0,
                  zIndex: 1000,
                  width: "230px",
                  padding: "12px",
                  background: "#191919",
                  border: "1px solid #444",
                  borderRadius: "10px",
                  boxShadow: "0 8px 35px #000c",
                }}
              >
                <div
                  style={{
                    padding: "10px 8px 14px",
                    borderBottom: "1px solid #333",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      color: "#888",
                      fontSize: "10px",
                      letterSpacing: "1.5px",
                    }}
                  >
                    ANGEMELDET ALS
                  </div>

                  <div
                    style={{
                      color: "#eee",
                      fontSize: "12px",
                      marginTop: "8px",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {auth.currentUser?.email ?? "Winter Arc User"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    padding: "13px",
                    background: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    color: "#f5f5f5",
                    textAlign: "left",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Abmelden ↗
                </button>

                {logoutError && (
                  <p
                    role="alert"
                    style={{ color: "#ff8585", fontSize: "11px" }}
                  >
                    {logoutError}
                  </p>
                )}
              </div>
            )}
          </div>
        </header>

        {activePage === "dashboard" ? (
          <div className="dashboard">
            <section className="welcome">
              <div>
                <div className="eyebrow">
                  YOUR PERSONAL PERFORMANCE SYSTEM
                </div>
                <h1>Stay disciplined.</h1>
                <p>Consistency creates performance.</p>
              </div>

              <div className="arc-status">
                <span className="status-dot" />
                {arc.phase}
              </div>
            </section>

            <section className="arc-card">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">YOUR WINTER ARC</div>
                  <h2>55 days. One mission.</h2>
                </div>

                <div className="date-range">
                  29 NOV 2026 <span>—</span> 22 JAN 2027
                </div>
              </div>

              <div className="arc-progress-info">
                <span>{arc.label}</span>
                <strong>{arc.value}</strong>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${arc.percentage}%` }}
                />
              </div>

              <div className="progress-caption">
                <span>
                  DAY {String(arc.day).padStart(2, "0")} / {arc.total}
                </span>
                <span>{arc.percentage} %</span>
              </div>
            </section>

            <section className="overview-grid">
              <div className="stat-card">
                <div className="card-label">DAILY PROGRESS</div>
                <div className="stat-value">
                  {syncReady ? `${progress}%` : "—"}
                </div>
                <div className="stat-note">
                  {completedCount} OF {todayTasks.length} TASKS
                </div>
              </div>

              <div className="stat-card">
                <div className="card-label">CURRENT STREAK</div>
                <div className="stat-value">
                  {habitStreak.ready ? habitStreak.current : "—"} <small>DAYS</small>
                </div>
                <div className="stat-note">{habitStreak.ready ? `${habitStreak.best} DAYS PERSONAL BEST` : "LOADING HABITS"}</div>
              </div>

              <div className="stat-card">
                <div className="card-label">ACTIVE QUESTS</div>
                <div className="stat-value">{questSummary.ready ? questSummary.active.length : "—"}</div>
                <div className="stat-note">{questSummary.success} COMPLETED CHALLENGES</div>
              </div>
            </section>

            <section className="content-grid">
              <div className="panel daily-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">DAILY EXECUTION</div>
                    <h2>Today's plan</h2>
                  </div>

                  <span className="panel-count">
                    {completedCount}/{todayTasks.length}
                  </span>
                </div>

                {syncError && (
                  <p
                    role="alert"
                    style={{ color: "#ff8585", fontSize: "12px" }}
                  >
                    {syncError}
                  </p>
                )}

                {!syncReady && !syncError && (
                  <p style={{ color: "#888", fontSize: "12px" }}>
                    Lade Tagesfortschritt ...
                  </p>
                )}

                {syncReady && todayTasks.length === 0 && (
                  <p style={{ color: "#888", fontSize: "13px" }}>
                    Für heute sind keine Aufgaben geplant.
                  </p>
                )}

                <div className="task-list">
                  {todayTasks.map((task, index) => {
                    const completed = isCompleted(task);

                    return (
                      <button
                        type="button"
                        disabled={!syncReady || saving}
                        className={`task-item ${
                          completed ? "completed" : ""
                        }`}
                        key={task.id}
                        onClick={() => toggleTask(task.id)}
                      >
                        <span className="task-number">
                          {task.time ??
                            String(index + 1).padStart(2, "0")}
                        </span>

                        <span className="task-name">
                          {task.title}
                        </span>

                        <span className="task-check">
                          {completed ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="text-button"
                  onClick={() => changePage("daily")}
                  style={{ marginTop: "20px" }}
                >
                  OPEN DAILY PLAN ↗
                </button>
              </div>

              <div className="right-column">
                <div className="panel">
                  <div className="eyebrow">RECOVERY</div>
                  <h2>Daily condition</h2>

                  <div className="recovery-item">
                    <span>Sleep</span>
                    <strong>{checkout?.sleep?.trim() || "—"} <small>h</small></strong>
                  </div>

                  <div className="recovery-item">
                    <span>Water</span>
                    <strong>{checkout?.water?.trim() || "—"} <small>litres</small></strong>
                  </div>

                  <div className="recovery-item">
                    <span>Energy</span>
                    <strong>{checkout?.energy?.trim() || "—"} <small>/ 5</small></strong>
                  </div>
                </div>

                <div className="panel quest-panel">
                  <div className="eyebrow">SIDE MISSIONS</div>
                  <h2>Sidequests</h2>
                  <p>{questSummary.ready ? (questSummary.active.length ? `${questSummary.active.length} aktive ${questSummary.active.length === 1 ? "Challenge" : "Challenges"} · ${questSummary.success} abgeschlossen` : "No active quests yet.") : "Loading sidequests ..."}</p>

                  <button
                    type="button"
                    className="text-button"
                    onClick={() => changePage("quests")}
                  >
                    EXPLORE QUESTS ↗
                  </button>
                </div>
              </div>
            </section>

            <section style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 310px), 1fr))", gap:16, marginTop:20}}>
              <div style={dashboardPanel}>
                <div className="eyebrow">TODAY'S HABITS</div>
                <h2 style={{margin:"8px 0 14px"}}>Habits · {habitsReady && habitDayReady ? `${habitsCompleted}/${todayHabits.length}` : "…"}</h2>
                {habitsReady && habitDayReady ? (todayHabits.length ? todayHabits.map(h =>
                  <button key={h.id} type="button" disabled={habitSaving} onClick={() => void toggleDashboardHabit(h.id)} style={{...dashboardButton, width:"100%", display:"flex", alignItems:"center", gap:12, textAlign:"left", marginBottom:8}}>
                    <span style={{fontSize:20, width:25}}>{dashboardHabitChecks.includes(h.id) ? "✓" : "○"}</span><span style={{flex:1, opacity:dashboardHabitChecks.includes(h.id) ? .6 : 1}}>{h.title}</span>
                  </button>
                ) : <p style={{color:"#999",fontSize:13}}>Heute keine Habits geplant.</p>) : <p style={{color:"#999",fontSize:13}}>Habits werden geladen …</p>}
                <button className="text-button" type="button" onClick={() => changePage("habits")}>ALLE HABITS ↗</button>
              </div>
              <div style={dashboardPanel}>
                <div className="eyebrow">TODAY'S TRAINING</div>
                <h2 style={{margin:"8px 0 14px"}}>{workoutToday ? `Gym ${workoutToday}` : "Regeneration / freier Tag"}</h2>
                <p style={{color:"#aaa",fontSize:13}}>{!trainingReady ? "Training wird geladen …" : !workoutToday ? "Heute ist kein festes Gym-Workout eingeplant." : trainingDone ? "✓ Training abgeschlossen" : "Workout noch nicht abgeschlossen"}</p>
                <button className="text-button" type="button" onClick={() => changePage("training")}>TRAINING ÖFFNEN ↗</button>
              </div>
              <div style={dashboardPanel}>
                <div className="eyebrow">ACTIVE SIDEQUESTS</div>
                <h2 style={{margin:"8px 0 14px"}}>{questSummary.ready ? `${questSummary.active.length} aktiv` : "Lädt …"}</h2>
                {questSummary.ready && (questSummary.active.length ? questSummary.active.map(q => <div key={q.id} style={{padding:"9px 0",borderBottom:"1px solid #333",fontSize:13}}><strong>{q.title}</strong><div style={{color:"#aaa",marginTop:4}}>{q.completedDates.length}/{q.duration} Tage · {q.completedDates.includes(today) ? "Heute erledigt ✓" : "Heute offen"}</div></div>) : <p style={{color:"#999",fontSize:13}}>Keine aktive Herausforderung.</p>)}
                <button className="text-button" type="button" onClick={() => changePage("quests")}>SIDEQUESTS ÖFFNEN ↗</button>
              </div>
              <div style={dashboardPanel}>
                <div className="eyebrow">DAILY REVIEW</div>
                <h2 style={{margin:"8px 0 14px"}}>Tagesabschluss</h2>
                <p style={{color:"#aaa",fontSize:13}}>{!journalReady || !checkoutReady ? "Wird geladen …" : journalSaved && checkoutSaved ? "✓ Journal und Check-out gespeichert" : journalSaved ? "Journal gespeichert · Check-out noch offen" : checkoutSaved ? "Check-out gespeichert · Journal noch offen" : "Noch nicht ausgefüllt"}</p>
                <button className="text-button" type="button" onClick={() => changePage("journal")}>JOURNAL ÖFFNEN ↗</button>
              </div>
            </section>
          </div>
        ) : activePage === "daily" ? (
          <DailyPlan />
        ) : activePage === "training" ? (
          <Training />
        ) : activePage === "habits" ? (
          <Habits />
        ) : activePage === "quests" ? (
          <Sidequests />
        ) : activePage === "journal" ? (
          <Journal />
        ) : activePage === "performance" ? (
          <Performance />
        ) : (
          <section className="placeholder-page">
            <div className="eyebrow">WINTER ARC / 2026–27</div>
            <h1>{activePageLabel}</h1>
            <p>This section will be built in the next development steps.</p>
          </section>
        )}
      </main>

      <nav className="mobile-navigation" aria-label="Mobile Hauptnavigation">
        {mainNavigation.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`mobile-nav-item ${
              activePage === item.id ? "active" : ""
            }`}
            onClick={() => changePage(item.id)}
          >
            <span>{item.icon}</span>
            <small>{item.label === "Dashboard" ? "Home" : item.label === "Daily Plan" ? "Plan" : item.label}</small>
          </button>
        ))}

        <button
          type="button"
          className={`mobile-nav-item ${
            isMorePage || moreOpen ? "active" : ""
          }`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          aria-label="Weitere Bereiche öffnen"
          onClick={() => {
            setMoreOpen((current) => !current);
            setProfileOpen(false);
          }}
        >
          <span>•••</span>
          <small>Mehr</small>
        </button>
      </nav>

      {moreOpen && (
        <div
          id="mobile-more-menu"
          role="menu"
          style={{
            position: "fixed",
            right: "12px",
            bottom: "calc(90px + env(safe-area-inset-bottom))",
            zIndex: 1000,
            width: "230px",
            padding: "10px",
            background: "#191919",
            border: "1px solid #444",
            borderRadius: "12px",
            boxShadow: "0 8px 35px #000c",
          }}
        >
          {moreNavigation.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => changePage(item.id)}
              role="menuitem"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                width: "100%",
                padding: "16px",
                color: activePage === item.id ? "#fff" : "#bbb",
                background:
                  activePage === item.id ? "#333" : "transparent",
                border: "none",
                borderRadius: "7px",
                textAlign: "left",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
