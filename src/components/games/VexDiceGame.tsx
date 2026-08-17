import { useEffect, useRef, useState } from "react";

/**
 * VexDiceGame — the Vex's Hexes dice event for Infinite Tale Weaver.
 *
 * Fully self-contained: no dependencies beyond React. All styles are scoped
 * in the <style> block below (vexhex- prefix) so it can be pasted into any
 * project without touching Tailwind config or global CSS.
 *
 * Wire-up:
 *   <VexDiceGame
 *     roll={serverRoll}                     // 1–6, generated server-side
 *     onComplete={({ won, pick, roll }) => resolveHexEvent(...)}
 *   />
 *
 * If `roll` is omitted the component rolls locally, so it can be previewed
 * standalone before the backend is wired up.
 */

type Parity = "even" | "odd";
type Phase = "pick" | "rolling" | "reveal";

export interface VexDiceGameResult {
  won: boolean;
  pick: Parity;
  roll: number;
}

export interface VexDiceGameProps {
  roll?: number;
  introLine?: string;
  onComplete: (result: VexDiceGameResult) => void;
}

/** Which of the 9 grid cells (0–8, row-major) show a pip for each face. */
const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const DEFAULT_INTRO =
  "The air sours. Vex uncoils out of the shadows, a bone die spinning between spectral fingers.";

export default function VexDiceGame({ roll, introLine, onComplete }: VexDiceGameProps) {
  const finalRoll = useRef<number>(
    roll && roll >= 1 && roll <= 6 ? Math.floor(roll) : 1 + Math.floor(Math.random() * 6),
  );
  const [phase, setPhase] = useState<Phase>("pick");
  const [pick, setPick] = useState<Parity | null>(null);
  const [face, setFace] = useState<number>(finalRoll.current);

  const intervalRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const reducedMotion =
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  const parityOfRoll: Parity = finalRoll.current % 2 === 0 ? "even" : "odd";
  const won = pick !== null && pick === parityOfRoll;

  function choose(p: Parity) {
    if (phase !== "pick") return;
    setPick(p);
    setPhase("rolling");

    const spinMs = reducedMotion ? 350 : 1700;

    if (!reducedMotion) {
      intervalRef.current = window.setInterval(() => {
        setFace(1 + Math.floor(Math.random() * 6));
      }, 90);
      timeoutsRef.current.push(
        window.setTimeout(() => {
          if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
          intervalRef.current = null;
          setFace(finalRoll.current);
        }, spinMs),
      );
    } else {
      setFace(finalRoll.current);
    }

    timeoutsRef.current.push(window.setTimeout(() => setPhase("reveal"), spinMs + 500));
  }

  function finish() {
    onComplete({ won, pick: pick as Parity, roll: finalRoll.current });
  }

  const dieStateClass =
    phase === "rolling" ? "is-rolling" : phase === "reveal" ? (won ? "is-won" : "is-lost") : "";

  return (
    <div className="vexhex-overlay" role="dialog" aria-modal="true" aria-label="Vex's Hexes">
      <style>{CSS}</style>

      <div
        className={`vexhex-panel ${phase === "reveal" ? (won ? "panel-won" : "panel-lost") : ""}`}
      >
        <div className="vexhex-eyebrow">A Hex Event</div>
        <h2 className="vexhex-title">Vex Appears</h2>
        <p className="vexhex-flavor">{introLine ?? DEFAULT_INTRO}</p>

        <div className={`vexhex-die ${dieStateClass}`} aria-label={`Die showing ${face}`}>
          <div className="vexhex-die-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={`vexhex-pip ${PIP_MAP[face].includes(i) ? "on" : ""}`} />
            ))}
          </div>
        </div>

        {phase === "pick" && (
          <div className="vexhex-stage">
            <p className="vexhex-prompt">
              Call the die. <em>Vex does not take no for an answer.</em>
            </p>
            <div className="vexhex-choices">
              <button className="vexhex-btn-choice" onClick={() => choose("even")}>
                Even
              </button>
              <button className="vexhex-btn-choice" onClick={() => choose("odd")}>
                Odd
              </button>
            </div>
          </div>
        )}

        {phase === "rolling" && (
          <div className="vexhex-stage">
            <p className="vexhex-caption">
              You call <strong>{pick}</strong>. The die tumbles…
            </p>
          </div>
        )}

        {phase === "reveal" && (
          <div className="vexhex-stage">
            <p className="vexhex-caption">
              It lands on <strong>{finalRoll.current}</strong> — {parityOfRoll}.
            </p>
            <h3 className={`vexhex-verdict ${won ? "won" : "lost"}`}>
              {won ? "Fortune Smiles" : "Misfortune"}
            </h3>
            <p className="vexhex-flavor">
              {won
                ? "Vex hisses, cheated. Luck rides with you into what comes next."
                : "Vex grins wide, and something cold settles over the road ahead."}
            </p>
            <button className="vexhex-btn-continue" onClick={finish}>
              Continue the story
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Literata:ital,wght@0,400;0,600;1,400&display=swap');

.vexhex-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(12, 8, 4, 0.85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.vexhex-panel {
  width: 100%;
  max-width: 400px;
  padding: 32px 28px 28px;
  text-align: center;
  background: linear-gradient(170deg, #241a0e 0%, #1a1208 100%);
  border: 1px solid #4a3b22;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.4);
  animation: vexhexRise 0.45s ease-out both;
  transition: box-shadow 0.6s ease;
}
.vexhex-panel.panel-won {
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 44px rgba(229, 166, 63, 0.18);
}
.vexhex-panel.panel-lost {
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 44px rgba(199, 62, 46, 0.2);
}

.vexhex-eyebrow {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: #b98a3e;
  margin-bottom: 10px;
}

.vexhex-title {
  font-family: 'Cinzel', serif;
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 12px;
  color: #a9e3b8;
  text-shadow: 0 0 22px rgba(143, 214, 160, 0.35);
}

.vexhex-flavor {
  font-family: 'Literata', serif;
  font-style: italic;
  font-size: 15px;
  line-height: 1.55;
  color: #cdbfa3;
  margin: 0 0 22px;
}

.vexhex-die {
  width: 92px;
  height: 92px;
  margin: 0 auto 22px;
  border-radius: 16px;
  background: linear-gradient(145deg, #f0e7d3, #d6c7a6);
  box-shadow: inset 0 -4px 8px rgba(90, 70, 40, 0.35), 0 6px 18px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.5s ease;
}
.vexhex-die.is-rolling {
  animation: vexhexTumble 0.45s ease-in-out infinite;
  box-shadow: inset 0 -4px 8px rgba(90, 70, 40, 0.35), 0 0 30px rgba(143, 214, 160, 0.4);
}
.vexhex-die.is-won {
  animation: vexhexSettle 0.5s ease-out both;
  box-shadow: inset 0 -4px 8px rgba(90, 70, 40, 0.35), 0 0 34px rgba(229, 166, 63, 0.55);
}
.vexhex-die.is-lost {
  animation: vexhexSettle 0.5s ease-out both;
  box-shadow: inset 0 -4px 8px rgba(90, 70, 40, 0.35), 0 0 34px rgba(199, 62, 46, 0.55);
}

.vexhex-die-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  width: 64px;
  height: 64px;
}
.vexhex-pip {
  place-self: center;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #241a0e;
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 0.08s linear, transform 0.08s linear;
}
.vexhex-pip.on {
  opacity: 1;
  transform: scale(1);
}

.vexhex-stage { animation: vexhexFade 0.35s ease-out both; }

.vexhex-prompt {
  font-family: 'Literata', serif;
  font-size: 15px;
  color: #e8ddc7;
  margin: 0 0 18px;
}
.vexhex-prompt em { color: #a9e3b8; }

.vexhex-choices {
  display: flex;
  gap: 14px;
  justify-content: center;
}

.vexhex-btn-choice {
  font-family: 'Cinzel', serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 13px 30px;
  color: #e5a63f;
  background: rgba(229, 166, 63, 0.06);
  border: 1px solid #6b5426;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}
.vexhex-btn-choice:hover {
  background: rgba(229, 166, 63, 0.16);
  border-color: #b98a3e;
  transform: translateY(-1px);
}
.vexhex-btn-choice:focus-visible,
.vexhex-btn-continue:focus-visible {
  outline: 2px solid #e5a63f;
  outline-offset: 2px;
}

.vexhex-caption {
  font-family: 'Literata', serif;
  font-size: 14px;
  color: #a4957c;
  margin: 0 0 6px;
}
.vexhex-caption strong { color: #e8ddc7; text-transform: capitalize; }

.vexhex-verdict {
  font-family: 'Cinzel', serif;
  font-size: 22px;
  font-weight: 700;
  margin: 10px 0 8px;
}
.vexhex-verdict.won { color: #f4c56a; text-shadow: 0 0 18px rgba(229, 166, 63, 0.45); }
.vexhex-verdict.lost { color: #d9604e; text-shadow: 0 0 18px rgba(199, 62, 46, 0.45); }

.vexhex-btn-continue {
  font-family: 'Cinzel', serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-top: 6px;
  padding: 13px 28px;
  color: #1a1208;
  background: linear-gradient(180deg, #e5a63f, #b98a3e);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: filter 0.2s ease, transform 0.15s ease;
}
.vexhex-btn-continue:hover { filter: brightness(1.12); transform: translateY(-1px); }

@keyframes vexhexRise {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes vexhexTumble {
  0%   { transform: rotate(-14deg) translateY(0); }
  25%  { transform: rotate(8deg) translateY(-10px); }
  50%  { transform: rotate(16deg) translateY(0); }
  75%  { transform: rotate(-6deg) translateY(-6px); }
  100% { transform: rotate(-14deg) translateY(0); }
}
@keyframes vexhexSettle {
  0%   { transform: scale(1.18) rotate(4deg); }
  60%  { transform: scale(0.96) rotate(-2deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes vexhexFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .vexhex-panel, .vexhex-stage { animation: none; }
  .vexhex-die.is-rolling, .vexhex-die.is-won, .vexhex-die.is-lost { animation: none; }
}
`;
