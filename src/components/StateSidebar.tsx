import type { GameState } from "@/lib/game/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Dices, Globe, Package, ScrollText, Skull, User, Users } from "lucide-react";
import { getGenreTheme } from "@/lib/game/genre-theme";

/** Deterministic "rarity" hue per item name so the borders feel varied but stable. */
function itemHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = [
    "oklch(0.78 0.14 70)", // gold
    "oklch(0.72 0.2 285)", // arcane purple
    "oklch(0.78 0.19 200)", // cyan
    "oklch(0.75 0.18 140)", // emerald
    "oklch(0.7 0.22 25)", // ember red
    "oklch(0.82 0.15 90)", // amber
  ];
  return palette[h % palette.length];
}

export function StateSidebar({ state }: { state: GameState }) {
  const activeQuests = state.quests.filter((q) => q.status === "active");
  const finishedQuests = state.quests.filter((q) => q.status !== "active");
  const codexNames = Object.keys(state.codex);
  const theme = getGenreTheme(state.meta.genre);
  const Icon = theme.icon;
  const genreLabel = theme.label === "Adventure" ? state.meta.genre || theme.label : theme.label;
  const protoName = state.meta.protagonist_name;
  const dna = protoName ? state.codex[protoName]?.dna : undefined;

  return (
    <ScrollArea className="h-full" role="region" aria-label="Adventure journal">
      <div className="space-y-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 text-sm lg:pt-4">
        {/* Adventure header */}
        <div className="hud-frame rounded-md p-3">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 font-hud text-[9px] px-1.5 py-0.5 rounded border border-[var(--accent)]/60 text-[var(--accent)]"
              style={{ background: "oklch(0 0 0 / 30%)" }}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {genreLabel}
            </span>
          </div>
          <h2 className="font-display text-lg leading-tight text-foreground">{state.meta.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{state.meta.tone || "Cinematic"}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {state.scenes.length} {state.scenes.length === 1 ? "scene" : "scenes"}
          </p>
        </div>

        {/* Character portrait / DNA */}
        {protoName && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="w-14 h-14 rounded-md border-2 border-[var(--accent)]/70 grid place-items-center text-[var(--accent)] shrink-0"
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, oklch(0.3 0.05 70), oklch(0.16 0.02 60))",
                }}
              >
                <User className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="font-hud text-[9px] text-muted-foreground">Protagonist</div>
                <div className="font-display text-base truncate text-foreground">{protoName}</div>
              </div>
            </div>
            {dna && (
              <div className="rounded-md border border-white/5 bg-black/25 p-2 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {dna}
              </div>
            )}
          </div>
        )}

        {(state.fate?.death_enabled || state.fate?.hexes_enabled) && (
          <section
            aria-labelledby="fate-status-heading"
            className="rounded-md border border-white/10 bg-black/20 p-3"
          >
            <h3 id="fate-status-heading" className="text-xs font-medium text-foreground">
              Fate in play
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.fate.death_enabled && (
                <Badge
                  variant="outline"
                  className="gap-1 border-red-400/30 text-[10px] text-red-200"
                >
                  <Skull className="h-3 w-3" aria-hidden="true" /> Death Mode
                </Badge>
              )}
              {state.fate.hexes_enabled && (
                <Badge
                  variant="outline"
                  className="gap-1 border-violet-400/30 text-[10px] text-violet-200"
                >
                  <Dices className="h-3 w-3" aria-hidden="true" /> Vex's Hexes
                </Badge>
              )}
            </div>
            {state.fate.curse_active && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-100/75" role="status">
                A doom is active
                {typeof state.fate.curse_messages_remaining === "number"
                  ? ` · ${state.fate.curse_messages_remaining} turns remain`
                  : ""}
                .
              </p>
            )}
          </section>
        )}

        <div className="engraved-rule" />

        <Accordion type="multiple" defaultValue={["inv", "quests"]} className="w-full">
          <AccordionItem value="inv" className="border-white/10">
            <AccordionTrigger className="font-hud text-[10px] tracking-widest">
              <span className="flex items-center gap-1.5">
                <Package className="h-3 w-3" aria-hidden="true" />
                Inventory · {state.inventory.length}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {state.inventory.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">Your pack is empty.</p>
              ) : (
                <ul className="space-y-2">
                  {state.inventory.map((i) => {
                    const hue = itemHue(i.name);
                    return (
                      <li
                        key={i.name}
                        className="group relative rounded-md pl-3 pr-2 py-1.5 bg-black/25 border border-white/5"
                        style={{ borderLeft: `3px solid ${hue}` }}
                        title={i.description}
                      >
                        <div className="font-medium text-foreground text-sm leading-tight">
                          {i.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2">
                          {i.description}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="quests" className="border-white/10">
            <AccordionTrigger className="font-hud text-[10px] tracking-widest">
              <span className="flex items-center gap-1.5">
                <ScrollText className="h-3 w-3" aria-hidden="true" />
                Quest Log · {activeQuests.length}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
              {activeQuests.length === 0 && finishedQuests.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No open threads. Yet.</p>
              ) : null}
              {activeQuests.map((q) => (
                <div key={q.id} className="rounded-md bg-black/25 border border-white/5 p-2">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]"
                      style={{ boxShadow: "0 0 8px var(--accent-glow)" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground text-sm leading-tight">
                        {q.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{q.notes}</div>
                    </div>
                  </div>
                </div>
              ))}
              {finishedQuests.map((q) => (
                <div
                  key={q.id}
                  className="rounded-md bg-black/25 border border-white/5 p-2 opacity-60"
                >
                  <div className="font-medium flex items-center gap-2 text-sm">
                    {q.title}
                    <Badge
                      variant={q.status === "done" ? "secondary" : "destructive"}
                      className="text-[9px] font-hud"
                    >
                      {q.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{q.notes}</div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="codex" className="border-white/10">
            <AccordionTrigger className="font-hud text-[10px] tracking-widest">
              <span className="flex items-center gap-1.5">
                <Users className="h-3 w-3" aria-hidden="true" />
                Codex · {codexNames.length}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
              {codexNames.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No souls remembered.</p>
              ) : (
                codexNames.map((name) => (
                  <div key={name} className="rounded-md bg-black/25 border border-white/5 p-2">
                    <div className="font-medium text-foreground text-sm">{name}</div>
                    <div className="text-[11px] text-muted-foreground italic">
                      {state.codex[name].personality}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Last seen: {state.codex[name].last_seen}
                    </div>
                  </div>
                ))
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="world" className="border-white/10">
            <AccordionTrigger className="font-hud text-[10px] tracking-widest">
              <span className="flex items-center gap-1.5">
                <Globe className="h-3 w-3" aria-hidden="true" />
                World
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              {Object.keys(state.world.locations).length > 0 && (
                <div>
                  <div className="font-hud text-[9px] text-muted-foreground mb-1">Locations</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {Object.entries(state.world.locations).map(([n, d]) => (
                      <li key={n}>
                        <b className="text-foreground">{n}</b> — {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(state.world.factions).length > 0 && (
                <div>
                  <div className="font-hud text-[9px] text-muted-foreground mb-1">Factions</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {Object.entries(state.world.factions).map(([n, d]) => (
                      <li key={n}>
                        <b className="text-foreground">{n}</b> — {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(state.world.reputation).length > 0 && (
                <div>
                  <div className="font-hud text-[9px] text-muted-foreground mb-1">Reputation</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {Object.entries(state.world.reputation).map(([n, v]) => (
                      <li key={n}>
                        {n}:{" "}
                        <span className={v >= 0 ? "text-[var(--accent)]" : "text-destructive"}>
                          {v > 0 ? `+${v}` : v}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {state.world.facts.length > 0 && (
                <div>
                  <div className="font-hud text-[9px] text-muted-foreground mb-1">Known facts</div>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    {state.world.facts.slice(-10).map((f, i) => (
                      <li key={`${f}-${i}`}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(state.world.locations).length === 0 &&
                Object.keys(state.world.factions).length === 0 &&
                Object.keys(state.world.reputation).length === 0 &&
                state.world.facts.length === 0 && (
                  <p className="text-muted-foreground text-xs italic">Uncharted.</p>
                )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ScrollArea>
  );
}
