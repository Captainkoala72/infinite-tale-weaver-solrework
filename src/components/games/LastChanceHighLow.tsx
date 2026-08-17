import { useEffect, useRef, useState } from "react";

/**
 * LastChanceHighLow — the final wager against Death for Infinite Tale Weaver.
 *
 * Triggered when a doomed character's time runs out. The player must call the
 * next card HIGHER or LOWER, 3 times in a row, to escape death. One wrong
 * call and Death collects. A tied card is a push: draw again, streak unchanged.
 * Ace is high (A=14, K=13, Q=12, J=11).
 *
 * Fully self-contained: no dependencies beyond React. All styles are scoped
 * in the <style> block below (lcw- prefix).
 *
 * Wire-up:
 *   <LastChanceHighLow
 *     cards={serverCards}                  // ~15 ranks (2–14), dealt server-side
 *     characterName={adventure.characterName}
 *     onComplete={({ survived, correct, guesses }) => resolveLastChance(...)}
 *   />
 *
 * `guesses` is the full ordered guess list (including pushed guesses) so the
 * server can replay the card sequence and validate the outcome. If `cards`
 * is omitted, a local shuffle is used so the component can be previewed
 * standalone before the backend is wired up.
 */

type Guess = "higher" | "lower";
type Phase = "intro" | "playing" | "won" | "lost";
type Outcome = "correct" | "push" | null;

export interface LastChanceResult {
  survived: boolean;
  correct: number;
  guesses: Guess[];
}

export interface LastChanceHighLowProps {
  cards?: number[];
  characterName?: string;
  onComplete: (result: LastChanceResult) => void;
}

const STREAK_TARGET = 3;
const SUITS = ["\u2660", "\u2665", "\u2663", "\u2666"]; // spade, heart, club, diamond
const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

/** Cosmetic only — deterministic per position so re-renders don't reshuffle suits. */
function suitFor(index: number, rank: number): string {
  return SUITS[(index * 7 + rank * 3) % 4];
}

function isRed(suit: string): boolean {
  return suit === "\u2665" || suit === "\u2666";
}

function localFallbackDeck(): number[] {
  const pool: number[] = [];
  for (let r = 2; r <= 14; r++) pool.push(r, r);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 15);
}

export default function LastChanceHighLow({
  cards,
  characterName,
  onComplete,
}: LastChanceHighLowProps) {
  const deckRef = useRef<number[]>(
    cards && cards.length >= 4 ? cards.slice() : localFallbackDeck(),
  );
  const guessesRef = useRef<Guess[]>([]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0); // position of the current face-up card
  const [streak, setStreak] = useState(0);
  const [flipped, setFlipped] = useState(false); // next card revealed?
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const timeoutsRef = useRef<number[]>([]);
  useEffect(() => () => timeoutsRef.current.forEach((t) => window.clearTimeout(t)), []);

  const reducedMotion =
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const name = characterName?.trim() || "Your character";
  const deck = deckRef.current;
  const current = deck[index];
  const next = deck[index + 1];

  function later(fn: () => void, ms: number) {
    timeoutsRef.current.push(window.setTimeout(fn, reducedMotion ? Math.min(ms, 200) : ms));
  }

  function guess(g: Guess) {
    if (phase !== "playing" || busy) return;
    setBusy(true);
    guessesRef.current.push(g);
    setFlipped(true);

    later(() => {
      if (next === current) {
        // Push: fate stays its hand — consume the card, streak unchanged.
        setOutcome("push");
        later(() => advance(), 1300);
        return;
      }
      const correct = next > current === (g === "higher");
      if (correct) {
        const newStreak = streak + 1;
        setStreak(newStreak);
        setOutcome("correct");
        if (newStreak >= STREAK_TARGET) {
          later(() => setPhase("won"), 1100);
        } else {
          later(() => advance(), 1300);
        }
      } else {
        setPhase("lost");
      }
    }, 750);
  }

  function advance() {
    // Safety refill — shouldn't happen with a 15-card deal.
    if (index + 2 >= deckRef.current.length - 1) {
      deckRef.current = deckRef.current.concat(localFallbackDeck());
    }
    setIndex((i) => i + 1);
    setFlipped(false);
    setOutcome(null);
    setBusy(false);
  }

  const note =
    outcome === "push"
      ? "A matched card — fate stays its hand. Draw again."
      : outcome === "correct"
        ? streak === 1
          ? "One. Death's grip loosens."
          : streak === 2
            ? "Two. Hold your nerve."
            : "Three."
        : "Will the next card be higher or lower?";

  return (
    <div className="lcw-overlay" role="dialog" aria-modal="true" aria-label="A wager with Death">
      <style>{CSS}</style>

      <div
        className={`lcw-panel ${phase === "won" ? "panel-won" : ""} ${phase === "lost" ? "panel-lost" : ""}`}
      >
        <div className="lcw-eyebrow">Your Final Hour</div>
        <h2 className="lcw-title">A Wager with Death</h2>

        {phase === "intro" && (
          <div className="lcw-stage">
            <p className="lcw-flavor">
              {name}'s thread is nearly cut. But Death is a gambler, and it offers one last game:
              call the next card higher or lower — three times, without a miss — and walk free.
            </p>
            <p className="lcw-rules">Ace is high. A matched card is a stay of fate — draw again.</p>
            <button className="lcw-btn-primary" onClick={() => setPhase("playing")}>
              Draw the first card
            </button>
          </div>
        )}

        {phase === "playing" && (
          <div className="lcw-stage">
            <div className="lcw-streak" aria-label={`${streak} of ${STREAK_TARGET} correct`}>
              {Array.from({ length: STREAK_TARGET }).map((_, i) => (
                <span key={i} className={`lcw-sigil ${i < streak ? "lit" : ""}`}>
                  {"\u25C6"}
                </span>
              ))}
            </div>

            <div className="lcw-cards">
              <CardFace rank={current} suit={suitFor(index, current)} />
              <div className={`lcw-flip ${flipped ? "is-flipped" : ""}`}>
                <div className="lcw-flip-inner">
                  <div className="lcw-flip-front">
                    <div className="lcw-card lcw-card-back">
                      <span className="lcw-card-back-mark">{"\u2726"}</span>
                    </div>
                  </div>
                  <div className="lcw-flip-back">
                    <CardFace rank={next} suit={suitFor(index + 1, next)} />
                  </div>
                </div>
              </div>
            </div>

            <p className={`lcw-note ${outcome === "correct" ? "good" : ""}`}>{note}</p>

            <div className="lcw-choices">
              <button className="lcw-btn-choice" disabled={busy} onClick={() => guess("higher")}>
                Higher
              </button>
              <button className="lcw-btn-choice" disabled={busy} onClick={() => guess("lower")}>
                Lower
              </button>
            </div>
          </div>
        )}

        {phase === "won" && (
          <div className="lcw-stage">
            <h3 className="lcw-verdict won">Death, Denied</h3>
            <p className="lcw-flavor">
              Three true calls. Death folds its hand and withdraws into the dark — your story
              continues.
            </p>
            <button
              className="lcw-btn-primary"
              onClick={() =>
                onComplete({ survived: true, correct: streak, guesses: guessesRef.current })
              }
            >
              Return to the story
            </button>
          </div>
        )}

        {phase === "lost" && (
          <div className="lcw-stage">
            <h3 className="lcw-verdict lost">The Wager Is Lost</h3>
            <p className="lcw-flavor">
              The card falls, and with it, your fate. Death collects what it is owed.
            </p>
            <button
              className="lcw-btn-ember"
              onClick={() =>
                onComplete({ survived: false, correct: streak, guesses: guessesRef.current })
              }
            >
              Witness the end
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardFace({ rank, suit }: { rank: number; suit: string }) {
  const red = isRed(suit);
  return (
    <div className={`lcw-card ${red ? "red" : ""}`}>
      <span className="lcw-corner tl">
        {rankLabel(rank)}
        <em>{suit}</em>
      </span>
      <span className="lcw-center">{suit}</span>
      <span className="lcw-corner br">
        {rankLabel(rank)}
        <em>{suit}</em>
      </span>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Literata:ital,wght@0,400;0,600;1,400&display=swap');

.lcw-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 6, 4, 0.88);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.lcw-panel {
  width: 100%;
  max-width: 440px;
  padding: 32px 28px 28px;
  text-align: center;
  background: linear-gradient(170deg, #221709 0%, #170f06 100%);
  border: 1px solid #4a3220;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.4);
  animation: lcwRise 0.45s ease-out both;
  transition: box-shadow 0.6s ease;
}
.lcw-panel.panel-won {
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 48px rgba(229, 166, 63, 0.2);
}
.lcw-panel.panel-lost {
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 48px rgba(199, 62, 46, 0.25);
}

.lcw-eyebrow {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: #c05038;
  margin-bottom: 10px;
}

.lcw-title {
  font-family: 'Cinzel', serif;
  font-size: 27px;
  font-weight: 700;
  margin: 0 0 14px;
  color: #e8ddc7;
  text-shadow: 0 0 24px rgba(199, 62, 46, 0.25);
}

.lcw-flavor {
  font-family: 'Literata', serif;
  font-style: italic;
  font-size: 15px;
  line-height: 1.6;
  color: #cdbfa3;
  margin: 0 0 18px;
}

.lcw-rules {
  font-family: 'Literata', serif;
  font-size: 12.5px;
  color: #8c7c60;
  margin: 0 0 22px;
}

.lcw-stage { animation: lcwFade 0.35s ease-out both; }

.lcw-streak {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 20px;
}
.lcw-sigil {
  font-size: 17px;
  color: #4a3b22;
  transition: color 0.3s ease, text-shadow 0.3s ease, transform 0.3s ease;
}
.lcw-sigil.lit {
  color: #f4c56a;
  text-shadow: 0 0 14px rgba(229, 166, 63, 0.6);
  transform: scale(1.15);
}

.lcw-cards {
  display: flex;
  gap: 22px;
  justify-content: center;
  align-items: center;
  margin-bottom: 18px;
}

.lcw-card {
  position: relative;
  width: 104px;
  height: 150px;
  border-radius: 10px;
  background: linear-gradient(160deg, #f2e9d6, #ddcfae);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(90, 70, 40, 0.25);
  color: #241a0e;
  font-family: 'Literata', serif;
}
.lcw-card.red { color: #a83a28; }

.lcw-corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.05;
}
.lcw-corner em { font-style: normal; font-size: 13px; }
.lcw-corner.tl { top: 8px; left: 9px; }
.lcw-corner.br { bottom: 8px; right: 9px; transform: rotate(180deg); }

.lcw-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
}

.lcw-card-back {
  background: linear-gradient(160deg, #2b1f10, #1c1308);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(185, 138, 62, 0.45), inset 0 0 0 7px rgba(185, 138, 62, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.lcw-card-back-mark {
  font-size: 30px;
  color: #b98a3e;
  text-shadow: 0 0 16px rgba(229, 166, 63, 0.4);
}

.lcw-flip { perspective: 800px; width: 104px; height: 150px; }
.lcw-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.65s cubic-bezier(0.4, 0.1, 0.2, 1);
}
.lcw-flip.is-flipped .lcw-flip-inner { transform: rotateY(180deg); }
.lcw-flip-front, .lcw-flip-back {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.lcw-flip-back { transform: rotateY(180deg); }

.lcw-note {
  font-family: 'Literata', serif;
  font-size: 14px;
  min-height: 20px;
  color: #a4957c;
  margin: 0 0 16px;
  transition: color 0.3s ease;
}
.lcw-note.good { color: #f4c56a; }

.lcw-choices {
  display: flex;
  gap: 14px;
  justify-content: center;
}

.lcw-btn-choice {
  font-family: 'Cinzel', serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 13px 26px;
  color: #e5a63f;
  background: rgba(229, 166, 63, 0.06);
  border: 1px solid #6b5426;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease, opacity 0.2s ease;
}
.lcw-btn-choice:hover:not(:disabled) {
  background: rgba(229, 166, 63, 0.16);
  border-color: #b98a3e;
  transform: translateY(-1px);
}
.lcw-btn-choice:disabled { opacity: 0.45; cursor: default; }

.lcw-btn-primary {
  font-family: 'Cinzel', serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 13px 28px;
  color: #1a1208;
  background: linear-gradient(180deg, #e5a63f, #b98a3e);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: filter 0.2s ease, transform 0.15s ease;
}
.lcw-btn-primary:hover { filter: brightness(1.12); transform: translateY(-1px); }

.lcw-btn-ember {
  font-family: 'Cinzel', serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 13px 28px;
  color: #f0e0d8;
  background: linear-gradient(180deg, #8e2f22, #6d2318);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: filter 0.2s ease, transform 0.15s ease;
}
.lcw-btn-ember:hover { filter: brightness(1.15); transform: translateY(-1px); }

.lcw-btn-choice:focus-visible, .lcw-btn-primary:focus-visible, .lcw-btn-ember:focus-visible {
  outline: 2px solid #e5a63f;
  outline-offset: 2px;
}

.lcw-verdict {
  font-family: 'Cinzel', serif;
  font-size: 23px;
  font-weight: 700;
  margin: 6px 0 10px;
}
.lcw-verdict.won { color: #f4c56a; text-shadow: 0 0 20px rgba(229, 166, 63, 0.5); }
.lcw-verdict.lost { color: #d9604e; text-shadow: 0 0 20px rgba(199, 62, 46, 0.5); }

@keyframes lcwRise {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes lcwFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .lcw-panel, .lcw-stage { animation: none; }
  .lcw-flip-inner { transition: none; }
  .lcw-sigil { transition: none; }
}
`;
