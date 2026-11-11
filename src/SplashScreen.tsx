
import { useEffect, useState } from "react";
import "./SplashScreen.css";

type Player = {
  name: string;
  group: "keeper" | "legend" | "koeln";
  line: string;
  image: string;
};

// Bilder liegen in public/players/
// BASE_URL berücksichtigt automatisch GitHub Pages.
const imageBase = `${import.meta.env.BASE_URL}players/`;

// Eigene Motivationssätze, keine Originalzitate.
const players: Player[] = [
  {
    name: "Manuel Neuer",
    group: "keeper",
    line: "MUT BEGINNT DORT, WO ZÖGERN ENDET.",
    image: "neuer.jpg",
  },
  {
    name: "Gianluigi Buffon",
    group: "keeper",
    line: "KONSTANZ IST EINE ENTSCHEIDUNG.",
    image: "buffon.jpg",
  },
  {
    name: "Oliver Kahn",
    group: "keeper",
    line: "GIB KEINEN BALL VERLOREN.",
    image: "kahn.jpg",
  },
  {
    name: "Marc-André ter Stegen",
    group: "keeper",
    line: "KONZENTRATION. BIS ZUM LETZTEN MOMENT.",
    image: "ter-stegen.jpg",
  },
  {
    name: "Lionel Messi",
    group: "legend",
    line: "LASS DEIN SPIEL FÜR DICH SPRECHEN.",
    image: "messi.jpg",
  },
  {
    name: "Cristiano Ronaldo",
    group: "legend",
    line: "ARBEITE, WENN NIEMAND ZUSIEHT.",
    image: "ronaldo.jpg",
  },
  {
    name: "Pelé",
    group: "legend",
    line: "JEDER TAG IST EINE NEUE CHANCE.",
    image: "pele.jpg",
  },
  {
    name: "Franz Beckenbauer",
    group: "legend",
    line: "ÜBERNIMM VERANTWORTUNG.",
    image: "beckenbauer.jpg",
  },
  {
    name: "Florian Wirtz",
    group: "legend",
    line: "TRAU DICH, DEN UNTERSCHIED ZU MACHEN.",
    image: "wirtz.jpg",
  },
  {
    name: "Lukas Podolski",
    group: "koeln",
    line: "SPIEL MIT DEM HERZEN.",
    image: "podolski.jpg",
  },
  {
    name: "Anthony Modeste",
    group: "koeln",
    line: "VERTRAU AUF DEINE STÄRKEN.",
    image: "modeste.jpg",
  },
  {
    name: "Timo Horn",
    group: "koeln",
    line: "DEIN NÄCHSTER EINGRIFF ZÄHLT.",
    image: "horn.jpg",
  },
];

function pickPlayer(): Player {
  const random = Math.random();

  const group =
    random < 0.4
      ? "keeper"
      : random < 0.7
        ? "legend"
        : "koeln";

  const matches = players.filter(
    (player) => player.group === group
  );

  return matches[
    Math.floor(Math.random() * matches.length)
  ];
}

export default function SplashScreen({
  onFinish,
}: {
  onFinish: () => void;
}) {
  const [player] = useState<Player>(pickPlayer);
  const [imageLoaded, setImageLoaded] = useState(false);

  const imageUrl = `${imageBase}${player.image}`;

  useEffect(() => {
    const timer = window.setTimeout(onFinish, 8000);

    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className="wa-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Winter Arc Startbildschirm"
      onClick={onFinish}
    >
      <div
        className="wa-splash-photo"
        style={
          imageLoaded
            ? { backgroundImage: `url("${imageUrl}")` }
            : undefined
        }
      />

      <img
        className="wa-splash-preload"
        src={imageUrl}
        alt=""
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageLoaded(false)}
      />

      <div className="wa-splash-shade" />

      <div className="wa-splash-top">
        <span>W / A</span>
        <span>WINTER ARC 2026 / 27</span>
      </div>

      <div className="wa-splash-copy">
        <div className="wa-splash-kicker">
          55 DAYS. ONE MISSION.
        </div>

        <h1>{player.line}</h1>

        <div className="wa-splash-player">
          {player.name.toUpperCase()}
        </div>

        <div className="wa-splash-track">
          <div className="wa-splash-fill" />
        </div>

        <div className="wa-splash-hint">
          TIPPEN ZUM ÜBERSPRINGEN
        </div>
      </div>
    </div>
  );
}
