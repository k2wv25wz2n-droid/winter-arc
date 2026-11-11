
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, type User } from "firebase/auth";

import App from "./App";
import AuthScreen from "./AuthScreen";
import { auth } from "./firebase";
import "./index.css";

function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (error) => {
        console.error("Firebase-Anmeldung:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#090909",
          color: "#aaa",
          fontFamily: "sans-serif",
          letterSpacing: "2px",
        }}
      >
        WINTER ARC
      </div>
    );
  }

  return user ? <App /> : <AuthScreen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
