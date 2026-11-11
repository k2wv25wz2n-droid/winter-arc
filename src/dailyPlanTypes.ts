export type TaskRepeat = "daily" | "weekdays" | "once";

export type DailyPlanTask = {
  id: string;
  title: string;
  time: string | null;
  repeat: TaskRepeat;
  weekdays: number[];
  date: string | null;
  category: "routine" | "training" | "nutrition" | "recovery" | "other";
  active: boolean;
  createdAt: string;
};

export type DailyPlanEntry = {
  date: string;
  completedTaskIds: string[];
  updatedAt: string;
  // Fehlt bei alten Einträgen; nicht rückwirkend erfinden.
  plannedTasks?: DailyPlanTask[];
};

export const DEFAULT_TASKS: DailyPlanTask[] = [
  { id: "morning-routine", title: "Morgenroutine", time: "06:00", repeat: "daily", weekdays: [], date: null, category: "routine", active: true, createdAt: "2026-11-01T00:00:00.000Z" },
  { id: "nutrition", title: "Ernährung einhalten", time: null, repeat: "daily", weekdays: [], date: null, category: "nutrition", active: true, createdAt: "2026-11-01T00:00:00.000Z" },
  { id: "training", title: "Training absolvieren", time: null, repeat: "weekdays", weekdays: [0, 3, 5], date: null, category: "training", active: true, createdAt: "2026-11-01T00:00:00.000Z" },
  { id: "mobility", title: "Mobility & Regeneration", time: null, repeat: "daily", weekdays: [], date: null, category: "recovery", active: true, createdAt: "2026-11-01T00:00:00.000Z" },
  { id: "evening-checkout", title: "Abend-Check-out", time: "21:30", repeat: "daily", weekdays: [], date: null, category: "routine", active: true, createdAt: "2026-11-01T00:00:00.000Z" },
];

export function getTasksForDate(tasks: DailyPlanTask[], date: string): DailyPlanTask[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return tasks.filter((task) => {
    if (!task.active) return false;
    if (task.repeat === "daily") return true;
    if (task.repeat === "weekdays") return task.weekdays.includes(weekday);
    return task.repeat === "once" && task.date === date;
  }).sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}
