
import {
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const DAILY_TASKS = [
  "Morgenroutine",
  "Ernährung einhalten",
  "Training absolvieren",
  "Mobility & Regeneration",
  "Abend-Check-out",
];

export function getTodayKey(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDailyDocument(userId: string, date: string) {
  return doc(db, "users", userId, "days", date);
}

export function subscribeToDailyProgress(
  userId: string,
  date: string,
  onUpdate: (completedTasks: string[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    getDailyDocument(userId, date),
    (snapshot) => {
      const data = snapshot.data();

      console.log("FIREBASE LIVE UPDATE:", data);

      const tasks: unknown = data?.completedTasks;

      if (!Array.isArray(tasks)) {
        onUpdate([]);
        return;
      }

      onUpdate(
        tasks.filter(
          (task): task is string =>
            typeof task === "string" && DAILY_TASKS.includes(task)
        )
      );
    },
    (error) => {
      console.error("FIREBASE LISTENER ERROR:", error);
      onError(error);
    }
  );
}

export async function saveDailyProgress(
  userId: string,
  date: string,
  completedTasks: string[]
): Promise<void> {
  await setDoc(
    getDailyDocument(userId, date),
    {
      completedTasks,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}
