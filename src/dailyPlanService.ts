import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_TASKS, type DailyPlanTask, type DailyPlanEntry } from "./dailyPlanTypes";

function getTasksDocument(userId: string) {
  return doc(db, "users", userId, "settings", "dailyPlan");
}
function getDayDocument(userId: string, date: string) {
  return doc(db, "users", userId, "dailyPlanDays", date);
}
function isDailyPlanTask(value: unknown): value is DailyPlanTask {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return typeof task.id === "string" && typeof task.title === "string" &&
    (task.time === null || typeof task.time === "string") &&
    ["daily", "weekdays", "once"].includes(String(task.repeat)) &&
    Array.isArray(task.weekdays) && task.weekdays.every((day) => typeof day === "number" && day >= 0 && day <= 6) &&
    (task.date === null || typeof task.date === "string") &&
    ["routine", "training", "nutrition", "recovery", "other"].includes(String(task.category)) &&
    typeof task.active === "boolean" && typeof task.createdAt === "string";
}
export function subscribeToPlanTasks(userId: string, onUpdate: (tasks: DailyPlanTask[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(getTasksDocument(userId), (snapshot) => {
    if (!snapshot.exists()) { onUpdate(DEFAULT_TASKS); return; }
    const tasks: unknown = snapshot.data().tasks;
    onUpdate(Array.isArray(tasks) ? tasks.filter(isDailyPlanTask) : DEFAULT_TASKS);
  }, onError);
}
export async function savePlanTasks(userId: string, tasks: DailyPlanTask[]): Promise<void> {
  await setDoc(getTasksDocument(userId), { tasks, updatedAt: new Date().toISOString() }, { merge: true });
}
export function subscribeToPlanDay(userId: string, date: string, onUpdate: (entry: DailyPlanEntry) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(getDayDocument(userId, date), (snapshot) => {
    const data = snapshot.data();
    const completedTaskIds = Array.isArray(data?.completedTaskIds)
      ? data.completedTaskIds.filter((id: unknown): id is string => typeof id === "string") : [];
    const plannedTasks = Array.isArray(data?.plannedTasks)
      ? data.plannedTasks.filter(isDailyPlanTask) : undefined;
    onUpdate({ date, completedTaskIds, updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : "", ...(plannedTasks ? { plannedTasks } : {}) });
  }, onError);
}
export async function savePlanDay(userId: string, entry: DailyPlanEntry): Promise<void> {
  await setDoc(getDayDocument(userId, entry.date), {
    completedTaskIds: entry.completedTaskIds,
    updatedAt: new Date().toISOString(),
    ...(entry.plannedTasks !== undefined ? { plannedTasks: entry.plannedTasks } : {}),
  }, { merge: true });
}
// Speichert den Stand des heutigen Tages unabhängig von den Häkchen.
// Bei historischen Tagen niemals nachträglich einen Snapshot erzeugen.
export async function saveTodayTaskSnapshot(userId: string, date: string, tasks: DailyPlanTask[]): Promise<void> {
  await setDoc(getDayDocument(userId, date), { plannedTasks: tasks }, { merge: true });
}
