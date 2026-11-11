
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC_2lsnFC0Mi-mvo2nfEwSo8Wxh5FYDccE",
  authDomain: "winter-arc-7d17d.firebaseapp.com",
  projectId: "winter-arc-7d17d",
  storageBucket: "winter-arc-7d17d.firebasestorage.app",
  messagingSenderId: "175203641304",
  appId: "1:175203641304:web:f7ab7685badcc6392d34ad",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
