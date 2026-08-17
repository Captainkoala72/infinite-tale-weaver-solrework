import { useMemo } from "react";

/** Slow-drifting embers over a dark background. Pure CSS animation. */
export function EmberField({ count = 24 }: { count?: number }) {
  const embers = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const size = 2 + Math.random() * 3;
      const duration = 9 + Math.random() * 10;
      const delay = -Math.random() * duration;
      const drift = (Math.random() * 80 - 40).toFixed(0) + "px";
      const opacity = 0.4 + Math.random() * 0.5;
      return { i, left, size, duration, delay, drift, opacity };
    });
  }, [count]);

  return (
    <div className="ember-field" aria-hidden>
      {embers.map((e) => (
        <span
          key={e.i}
          className="ember"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            animationDuration: `${e.duration}s`,
            animationDelay: `${e.delay}s`,
            opacity: e.opacity,
            // @ts-expect-error custom prop
            "--drift": e.drift,
          }}
        />
      ))}
    </div>
  );
}
