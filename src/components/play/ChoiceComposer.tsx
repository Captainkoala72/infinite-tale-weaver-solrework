import { Plus, Wand2 } from "lucide-react";

export type ConjuringState = "idle" | "casting" | "fading";

export function ChoiceComposer({
  choices,
  fontFamily,
  conjuring,
  onSelect,
  onDraft,
  onConjure,
}: {
  choices: string[];
  fontFamily: string;
  conjuring: ConjuringState;
  onSelect: (choice: string) => void;
  onDraft: (choice: string) => void;
  onConjure: () => void;
}) {
  return (
    <section aria-label="Suggested actions">
      <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
        {choices.map((choice, index) => (
          <div
            key={`${index}-${choice}`}
            className="choice-chip flex min-h-11 min-w-[82%] snap-start overflow-hidden rounded-md focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-1 focus-within:ring-offset-background sm:min-w-0"
            style={{ fontFamily }}
          >
            <button
              type="button"
              onClick={() => onSelect(choice)}
              aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left focus-visible:outline-none"
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded border border-[var(--accent)]/50 font-hud text-[10px] text-[var(--accent)]"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="flex-1 text-sm leading-snug">{choice}</span>
            </button>
            <button
              type="button"
              onClick={() => onDraft(choice)}
              aria-label={`Add “${choice}” to your draft`}
              title="Add to your draft"
              className="grid w-11 shrink-0 place-items-center border-l border-white/10 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onConjure}
          disabled={conjuring !== "idle"}
          className="choice-chip flex min-h-11 min-w-[82%] snap-start items-center gap-2 rounded-md px-3 py-2 text-left disabled:cursor-wait disabled:opacity-60 sm:col-span-2 sm:min-w-0"
          style={{ fontFamily, borderColor: "oklch(0.65 0.2 300 / 60%)" }}
        >
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded border font-hud text-[10px]"
            style={{ color: "oklch(0.85 0.2 300)", borderColor: "oklch(0.85 0.2 300 / 60%)" }}
            aria-hidden="true"
          >
            <Wand2 className="h-3 w-3" />
          </span>
          <span
            className="flex-1 text-sm italic leading-snug"
            style={{ color: "oklch(0.9 0.15 290)" }}
          >
            {conjuring !== "idle" ? "Conjuring a new path…" : "Suggest a different action"}
          </span>
        </button>
      </div>

      <p className="text-center font-hud text-[9px] text-muted-foreground/70">
        Press <span className="text-[var(--accent)]">1–{Math.min(choices.length, 9)}</span> to
        choose · use <Plus className="inline h-3 w-3" aria-label="plus" /> to edit first
      </p>
    </section>
  );
}
