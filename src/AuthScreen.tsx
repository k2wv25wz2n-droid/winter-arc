
import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "./firebase";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String(err.code)
          : "";

      if (code === "auth/email-already-in-use") {
        setError("Diese E-Mail-Adresse ist bereits registriert.");
      } else if (code === "auth/weak-password") {
        setError("Bitte verwende ein stärkeres Passwort.");
      } else if (code === "auth/invalid-email") {
        setError("Bitte gib eine gültige E-Mail-Adresse ein.");
      } else if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        setError("E-Mail-Adresse oder Passwort ist nicht korrekt.");
      } else {
        setError("Die Anmeldung hat nicht funktioniert. Bitte erneut versuchen.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#090909",
        color: "#f5f5f5",
      }}
    >
      <div style={{ width: "100%", maxWidth: "390px" }}>
        <div
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: "48px",
            height: "48px",
            border: "1px solid #555",
            borderRadius: "12px",
            fontWeight: 800,
            fontSize: "23px",
          }}
        >
          W
        </div>

        <p
          style={{
            marginTop: "32px",
            color: "#888",
            letterSpacing: "3px",
            fontSize: "11px",
          }}
        >
          WINTER ARC / 2026–27
        </p>

        <h1 style={{ fontSize: "38px", margin: "12px 0" }}>
          {mode === "login" ? "Welcome back." : "Start your arc."}
        </h1>

        <p style={{ color: "#888", marginBottom: "32px" }}>
          {mode === "login"
            ? "Sign in to your performance system."
            : "Create your personal performance account."}
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="auth-email" style={{ fontSize: "12px" }}>
            E-Mail-Adresse
          </label>

          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="deine@email.de"
            style={inputStyle}
          />

          <label htmlFor="auth-password" style={{ fontSize: "12px" }}>
            Passwort
          </label>

          <input
            id="auth-password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mindestens 6 Zeichen"
            style={inputStyle}
          />

          {error && (
            <p role="alert" style={{ color: "#ff8585", fontSize: "12px" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "16px",
              marginTop: "14px",
              border: "none",
              borderRadius: "7px",
              background: "#f5f5f5",
              color: "#111",
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading
              ? "Bitte warten ..."
              : mode === "login"
                ? "Anmelden"
                : "Konto erstellen"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
          style={{
            marginTop: "24px",
            width: "100%",
            padding: "12px",
            background: "transparent",
            color: "#aaa",
            border: "none",
            cursor: "pointer",
          }}
        >
          {mode === "login"
            ? "Noch kein Konto? Registrieren"
            : "Bereits registriert? Anmelden"}
        </button>
      </div>
    </main>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: "9px",
  marginBottom: "23px",
  padding: "15px",
  background: "#161616",
  border: "1px solid #333",
  borderRadius: "7px",
  color: "#fff",
  fontSize: "15px",
};
