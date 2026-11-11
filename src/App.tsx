
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";

const STORAGE_KEY = "winter-arc-completed-tasks";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "daily", label: "Daily Plan", icon: "▦" },
  { id: "training", label: "Training", icon: "↗" },
  { id: "habits", label: "Habits", icon: "◉" },
  { id: "quests", label: "Sidequests", icon: "✳" },
  { id: "performance", label: "Performance", icon: "⌁" },
  { id: "journal", label: "Journal", icon: "▤" },
];

const initialTasks = [
  "Morgenroutine",
  "Ernährung einhalten",
  "Training absolvieren",
  "Mobility & Regeneration",
  "Abend-Check-out",
];

function loadCompletedTasks(): string[] {
  try {
    const savedTasks = localStorage.getItem(STORAGE_KEY);

    if (!savedTasks) return [];

    const parsedTasks: unknown = JSON.parse(savedTasks);

    if (!Array.isArray(parsedTasks)) return [];

    return parsedTasks.filter(
      (task): task is string =>
        typeof task === "string" && initialTasks.includes(task)
    );
  } catch {
    return [];
  }
}

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [completedTasks, setCompletedTasks] =
    useState<string[]>(loadCompletedTasks);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const progress = Math.round(
    (completedTasks.length / initialTasks.length) * 100
  );

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

  // Lokale Speicherung bleibt vorerst erhalten.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(completedTasks)
      );
    } catch (error) {
      console.error("Speichern fehlgeschlagen:", error);
    }
  }, [completedTasks]);

  function changePage(page: string) {
    setActivePage(page);
    setMoreOpen(false);
    setProfileOpen(false);
  }

  function toggleTask(task: string) {
    setCompletedTasks((current) =>
      current.includes(task)
        ? current.filter((item) => item !== task)
        : [...current, task]
    );
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
      {/* DESKTOP SIDEBAR */}
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

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">WINTER ARC / 2026–27</div>

          {/* PROFILMENÜ */}
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
                    style={{
                      color: "#ff8585",
                      fontSize: "11px",
                      margin: "8px",
                    }}
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
            {/* WELCOME */}
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
                PREPARATION PHASE
              </div>
            </section>

            {/* WINTER ARC PROGRESS */}
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
                <span>START IN</span>
                <strong>18 DAYS</strong>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: "0%" }}
                />
              </div>

              <div className="progress-caption">
                <span>DAY 00 / 55</span>
                <span>0 %</span>
              </div>
            </section>

            {/* OVERVIEW */}
            <section className="overview-grid">
              <div className="stat-card">
                <div className="card-label">DAILY PROGRESS</div>
                <div className="stat-value">{progress}%</div>
                <div className="stat-note">
                  {completedTasks.length} OF {initialTasks.length} TASKS
                </div>
              </div>

              <div className="stat-card">
                <div className="card-label">CURRENT STREAK</div>
                <div className="stat-value">
                  0 <small>DAYS</small>
                </div>
                <div className="stat-note">
                  BUILD YOUR CONSISTENCY
                </div>
              </div>

              <div className="stat-card">
                <div className="card-label">ACTIVE QUESTS</div>
                <div className="stat-value">0</div>
                <div className="stat-note">
                  OPTIONAL CHALLENGES
                </div>
              </div>
            </section>

            {/* DAILY PLAN AND RECOVERY */}
            <section className="content-grid">
              <div className="panel daily-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">DAILY EXECUTION</div>
                    <h2>Today's plan</h2>
                  </div>

                  <span className="panel-count">
                    {completedTasks.length}/{initialTasks.length}
                  </span>
                </div>

                <div className="task-list">
                  {initialTasks.map((task, index) => {
                    const completed = completedTasks.includes(task);

                    return (
                      <button
                        type="button"
                        className={`task-item ${
                          completed ? "completed" : ""
                        }`}
                        key={task}
                        onClick={() => toggleTask(task)}
                      >
                        <span className="task-number">
                          0{index + 1}
                        </span>

                        <span className="task-name">{task}</span>

                        <span className="task-check">
                          {completed ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="right-column">
                <div className="panel">
                  <div className="eyebrow">RECOVERY</div>
                  <h2>Daily condition</h2>

                  <div className="recovery-item">
                    <span>Sleep</span>
                    <strong>
                      — <small>h</small>
                    </strong>
                  </div>

                  <div className="recovery-item">
                    <span>Water</span>
                    <strong>
                      — <small>litres</small>
                    </strong>
                  </div>

                  <div className="recovery-item">
                    <span>Energy</span>
                    <strong>
                      — <small>/ 5</small>
                    </strong>
                  </div>
                </div>

                <div className="panel quest-panel">
                  <div className="eyebrow">SIDE MISSIONS</div>
                  <h2>Sidequests</h2>
                  <p>No active quests yet.</p>

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
          </div>
        ) : (
          <section className="placeholder-page">
            <div className="eyebrow">WINTER ARC / 2026–27</div>
            <h1>{activePageLabel}</h1>
            <p>
              This section will be built in the next development steps.
            </p>
          </section>
        )}
      </main>

      {/* MOBILE NAVIGATION */}
      <nav className="mobile-navigation">
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
            <small>{item.label}</small>
          </button>
        ))}

        <button
          type="button"
          className={`mobile-nav-item ${
            isMorePage || moreOpen ? "active" : ""
          }`}
          aria-expanded={moreOpen}
          onClick={() => {
            setMoreOpen((current) => !current);
            setProfileOpen(false);
          }}
        >
          <span>•••</span>
          <small>Mehr</small>
        </button>
      </nav>

      {/* MOBILE MORE MENU */}
      {moreOpen && (
        <div
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
