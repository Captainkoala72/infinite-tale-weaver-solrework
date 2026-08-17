import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, Feather, Loader2, Mic, Send, Sparkles } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import { AdventureSettingsDialog } from "@/components/AdventureSettingsDialog";
import { ChoiceComposer } from "@/components/play/ChoiceComposer";
import { SceneBlock } from "@/components/play/SceneBlock";
import { StateSidebar } from "@/components/StateSidebar";
import { VoiceDialog } from "@/components/VoiceDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import { getSave, updateSaveState } from "@/lib/game/saves";
import { runOpeningTurn, runNextTurn, runVoiceSummaryTurn, runDeathScene } from "@/lib/game/openai";
import { generateImage, generateVideo } from "@/lib/game/gemini";
import { aiQuickPrompt } from "@/lib/game/ai.functions";
import {
  rollPreTurnHex,
  resolveHexEvent,
  rollCurseAndDescribe,
  startLastChance,
  resolveLastChance,
  getPendingFateEvent,
} from "@/lib/game/fate.functions";
import VexDiceGame from "@/components/games/VexDiceGame";
import LastChanceHighLow from "@/components/games/LastChanceHighLow";

import {
  applyDelta,
  buildAppearanceLock,
  buildCharacterDNA,
  DEFAULT_FATE,
  type FateMarker,
  type FateState,
  type GameState,
  type SceneRecord,
  type TurnResponse,
  type VoiceRequest,
} from "@/lib/game/types";
import { getFont } from "@/lib/game/fonts";
import { themeVars } from "@/lib/game/genre-theme";

export const Route = createFileRoute("/_authenticated/play/$saveId")({
  component: PlayPage,
});

function PlayPage() {
  const { saveId } = Route.useParams();
  const qc = useQueryClient();

  const {
    data: save,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["save", saveId],
    queryFn: () => getSave(saveId),
  });

  const [state, setState] = useState<GameState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<false | "thinking" | "imaging">(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceReq, setVoiceReq] = useState<VoiceRequest | null>(null);
  const [conjuring, setConjuring] = useState<"idle" | "casting" | "fading">("idle");
  const recentConjuredRef = useRef<string[]>([]);
  const [hexOverlay, setHexOverlay] = useState<null | {
    eventId: string;
    roll: number;
    pendingAction: string | null;
  }>(null);
  const [lastChanceOverlay, setLastChanceOverlay] = useState<null | {
    eventId: string;
    cards: number[];
  }>(null);
  const [ended, setEnded] = useState(false);

  const initRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const checkScrollRef = useRef<(() => void) | undefined>(undefined);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (!save || state) return;
    setState(save.state as GameState);
  }, [save, state]);

  useEffect(() => {
    if (!state || initRef.current) return;
    if (state.scenes.length === 0 && state.history.length === 0) {
      initRef.current = true;
      void openingTurn(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const found = root.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!found) return;
    const viewport = found;
    viewportRef.current = viewport;

    function check() {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowScrollBtn(distance > 80);
    }
    checkScrollRef.current = check;

    viewport.addEventListener("scroll", check, { passive: true });
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    check();

    return () => viewport.removeEventListener("scroll", check);
  }, [state?.scenes.length]);

  useEffect(() => {
    checkScrollRef.current?.();
  }, [state?.scenes.length]);

  const latestScene = useMemo(() => state?.scenes[state.scenes.length - 1], [state]);

  async function persist(next: GameState) {
    await updateSaveState(saveId, next);
    setState(next);
    void qc.invalidateQueries({ queryKey: ["save", saveId] });
  }

  async function applyTurn(
    prev: GameState,
    resp: TurnResponse,
    userAction: string | null,
    opts?: {
      fatePatch?: Partial<FateState>;
      markerText?: string;
      markerKind?: FateMarker["kind"];
      skipFateDecrement?: boolean;
    },
  ) {
    let next = applyDelta(prev, resp.state_delta);
    if (!next.meta.art_style) {
      const anyCodex = Object.values(next.codex)[0];
      if (anyCodex?.dna) {
        const m = anyCodex.dna.match(/art style:\s*([^\n.]+)/i);
        next = {
          ...next,
          meta: { ...next.meta, art_style: m?.[1]?.trim() ?? anyCodex.dna.split(".")[0] },
        };
      }
    }
    const history = [...next.history];
    if (userAction) history.push({ role: "user", content: userAction });
    history.push({
      role: "assistant",
      content: JSON.stringify({
        narration: resp.narration,
        choices: resp.choices,
        image_prompt: resp.image_prompt,
        state_delta: resp.state_delta,
        voice_request: resp.voice_request,
      }),
    });
    next.history = history;

    const scene: SceneRecord = {
      id: crypto.randomUUID(),
      image_data_url: null,
      image_prompt: resp.image_prompt,
      narration: resp.narration,
      choices: resp.choices,
    };
    next.scenes = [...next.scenes, scene];
    next.current_choices = resp.choices;
    next.current_voice_request = resp.voice_request;

    // Fate bookkeeping: consume one-turn modifiers, decrement curse countdown & misfortune.
    const fate: FateState = { ...(next.fate ?? { ...DEFAULT_FATE }) };
    if (!opts?.skipFateDecrement) {
      fate.next_hex_modifier = null;
      fate.survived_last_chance = false;
      if (fate.misfortune_remaining > 0) fate.misfortune_remaining -= 1;
      if (fate.curse_active && typeof fate.curse_messages_remaining === "number") {
        fate.curse_messages_remaining = Math.max(0, fate.curse_messages_remaining - 1);
      }
    }
    Object.assign(fate, opts?.fatePatch ?? {});
    next.fate = fate;

    if (opts?.markerText && opts.markerKind) {
      next.fate_markers = [
        ...(next.fate_markers ?? []),
        {
          id: crypto.randomUUID(),
          kind: opts.markerKind,
          text: opts.markerText,
          at_scene_index: next.scenes.length - 1,
        },
      ];
    }
    await persist(next);

    if (resp.image_prompt && next.meta.image_enabled !== false) {
      setBusy("imaging");
      const lock = buildAppearanceLock(next.meta.protagonist_name, next.meta.appearance);
      const promptName = next.meta.protagonist_name?.toLowerCase();
      const mentionsProtagonist = promptName
        ? resp.image_prompt.toLowerCase().includes(promptName)
        : true;
      const finalPrompt =
        lock && mentionsProtagonist ? `${lock}\n\n${resp.image_prompt}` : resp.image_prompt;
      const useVideo = !!next.meta.video_enabled;
      const gen = useVideo
        ? generateVideo(finalPrompt, next.meta.video_model)
        : generateImage(finalPrompt, next.meta.image_model);
      gen
        .then(async (dataUrl) => {
          let mediaUrl = dataUrl;
          try {
            const { saveSceneImage } = await import("@/lib/game/image-storage");
            const storedUrl = await saveSceneImage(saveId, scene.id, dataUrl);
            if (typeof storedUrl === "string" && storedUrl) mediaUrl = storedUrl;
          } catch (err) {
            toast.warning(
              err instanceof Error
                ? `Scene media is visible for this session but was not saved: ${err.message}`
                : "Scene media is visible for this session but was not saved.",
            );
          }
          setState((s) => {
            if (!s) return s;
            const scenes = s.scenes.map((sc) =>
              sc.id === scene.id ? { ...sc, image_data_url: mediaUrl } : sc,
            );
            return { ...s, scenes };
          });
        })
        .catch((err) =>
          toast.error(
            err instanceof Error ? err.message : useVideo ? "Video failed" : "Image failed",
          ),
        )
        .finally(() => setBusy(false));
    }

    if (resp.voice_request) setVoiceReq(resp.voice_request);

    // If the curse just ran out, trigger Last Chance instead of another turn.
    if (fate.curse_active && fate.curse_messages_remaining === 0 && !fate.is_locked) {
      try {
        const { eventId, cards } = await startLastChance({ data: { saveId } });
        const locked: GameState = {
          ...next,
          fate: { ...next.fate, is_locked: true, pending_event_id: eventId },
        };
        try {
          await persist(locked);
        } catch (saveError) {
          setState(locked);
          toast.error(
            saveError instanceof Error
              ? `The final wager began, but its lock was not saved: ${saveError.message}`
              : "The final wager began, but its lock was not saved.",
          );
        }
        setLastChanceOverlay({ eventId, cards });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fate stumbled");
      }
    }
  }

  async function openingTurn(s: GameState) {
    setBusy("thinking");
    try {
      const resp = await runOpeningTurn(s);
      await applyTurn(s, resp, null, { skipFateDecrement: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Turn failed");
      initRef.current = false;
    } finally {
      setBusy((b) => (b === "thinking" ? false : b));
    }
  }

  function scrollToBottom() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }

  async function runTurnWithFate(current: GameState, trimmed: string) {
    setBusy("thinking");
    try {
      const resp = await runNextTurn(current, trimmed);
      await applyTurn(current, resp, trimmed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Turn failed");
    } finally {
      setBusy((b) => (b === "thinking" ? false : b));
    }
  }

  async function submitAction(action: string) {
    if (!state || busy || ended || hexOverlay || lastChanceOverlay) return;
    const trimmed = action.trim();
    if (!trimmed) return;
    setInput("");

    const fate = state.fate ?? DEFAULT_FATE;

    // If a curse is already ticking, skip further hex/curse rolls and just play.
    if (!fate.is_locked && !fate.curse_active) {
      // Try Death curse roll first (if enabled); if it triggers, this turn still plays normally.
      if (fate.death_enabled) {
        try {
          setBusy("thinking");
          const story_context = [
            `Genre: ${state.meta.genre}`,
            `Tone: ${state.meta.tone}`,
            `Protagonist: ${state.meta.protagonist_name} — ${state.meta.protagonist}`,
            `Recent narration:\n${state.scenes
              .slice(-2)
              .map((s) => s.narration)
              .join("\n\n")
              .slice(0, 2000)}`,
          ].join("\n\n");
          const res = await rollCurseAndDescribe({
            data: {
              saveId,
              deathEnabled: true,
              curseAlreadyActive: false,
              isLocked: false,
              story_context,
              model: state.model,
            },
          });
          if (res.triggered && res.description) {
            const cursed: GameState = {
              ...state,
              fate: {
                ...fate,
                curse_active: true,
                curse_description: res.description,
                curse_messages_remaining: res.remaining,
              },
            };
            setState(cursed);
            await runTurnWithFate(cursed, trimmed);
            return;
          }
        } catch (err) {
          console.warn("[fate] curse roll failed", err);
        } finally {
          setBusy(false);
        }
      }

      // Otherwise, try a Vex hex roll.
      if (fate.hexes_enabled) {
        try {
          const { event } = await rollPreTurnHex({
            data: {
              saveId,
              hexesEnabled: true,
              isLocked: false,
              hasPendingEvent: !!fate.pending_event_id,
            },
          });
          if (event) {
            const locked: GameState = {
              ...state,
              fate: { ...fate, is_locked: true, pending_event_id: event.eventId },
            };
            try {
              await persist(locked);
            } catch (saveError) {
              // Keep the server-created event playable even if the state write
              // briefly fails; resolving it can persist the unlocked state.
              setState(locked);
              toast.error(
                saveError instanceof Error
                  ? `The hex began, but its lock was not saved: ${saveError.message}`
                  : "The hex began, but its lock was not saved.",
              );
            }
            try {
              localStorage.setItem(`hex-pending-action:${event.eventId}`, trimmed);
            } catch {
              /* ignore */
            }
            setHexOverlay({ eventId: event.eventId, roll: event.roll, pendingAction: trimmed });
            return;
          }
        } catch (err) {
          console.warn("[fate] hex roll failed", err);
        }
      }
    }

    await runTurnWithFate(state, trimmed);
  }

  async function handleHexComplete(pick: "even" | "odd") {
    if (!state || !hexOverlay) return;
    const { eventId, pendingAction } = hexOverlay;
    try {
      const res = await resolveHexEvent({ data: { saveId, eventId, pick } });
      const fate = state.fate ?? DEFAULT_FATE;
      const patched: FateState = { ...fate, is_locked: false, pending_event_id: null };
      if (res.won) {
        patched.next_hex_modifier = "win";
      } else if (fate.death_enabled) {
        try {
          const story_context = [
            `Genre: ${state.meta.genre}`,
            `Tone: ${state.meta.tone}`,
            `Protagonist: ${state.meta.protagonist_name} — ${state.meta.protagonist}`,
            `Recent narration:\n${state.scenes
              .slice(-2)
              .map((s) => s.narration)
              .join("\n\n")
              .slice(0, 2000)}`,
          ].join("\n\n");
          const curse = await rollCurseAndDescribe({
            data: {
              saveId,
              deathEnabled: true,
              curseAlreadyActive: false,
              isLocked: false,
              force: true,
              story_context,
              model: state.model,
            },
          });
          if (curse.triggered && curse.description) {
            patched.curse_active = true;
            patched.curse_description = curse.description;
            patched.curse_messages_remaining = curse.remaining;
          } else {
            patched.next_hex_modifier = "lose";
          }
        } catch {
          patched.next_hex_modifier = "lose";
        }
      } else {
        patched.next_hex_modifier = "lose";
        patched.misfortune_remaining = Math.max(patched.misfortune_remaining, 2);
      }
      const next: GameState = { ...state, fate: patched };
      const marker: FateMarker = {
        id: crypto.randomUUID(),
        kind: "hex",
        text: res.won ? "Vex was answered true." : "Vex was answered false.",
        at_scene_index: next.scenes.length - 1,
      };
      next.fate_markers = [...(next.fate_markers ?? []), marker];
      setState(next);
      setHexOverlay(null);
      let resumeAction = pendingAction;
      if (!resumeAction) {
        try {
          resumeAction = localStorage.getItem(`hex-pending-action:${eventId}`);
        } catch {
          /* ignore */
        }
      }
      try {
        localStorage.removeItem(`hex-pending-action:${eventId}`);
      } catch {
        /* ignore */
      }
      if (resumeAction) await runTurnWithFate(next, resumeAction);
      else await persist(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The die refuses to settle");
      setHexOverlay(null);
    }
  }

  async function handleLastChanceComplete(result: {
    survived: boolean;
    guesses: ("higher" | "lower")[];
  }) {
    if (!state || !lastChanceOverlay) return;
    const { eventId } = lastChanceOverlay;
    try {
      const res = await resolveLastChance({ data: { saveId, eventId, guesses: result.guesses } });
      setLastChanceOverlay(null);
      const fate = state.fate ?? DEFAULT_FATE;
      if (res.survived) {
        const next: GameState = {
          ...state,
          fate: {
            ...fate,
            is_locked: false,
            pending_event_id: null,
            curse_active: false,
            curse_description: null,
            curse_messages_remaining: null,
            survived_last_chance: true,
          },
        };
        setState(next);
        setBusy("thinking");
        try {
          const resp = await runNextTurn(
            next,
            "[fate] the doom is denied — narrate the improbable escape",
          );
          await applyTurn(next, resp, null, {
            markerText: "The doom was denied.",
            markerKind: "last_chance_survived",
            skipFateDecrement: true,
          });
        } finally {
          setBusy(false);
        }
      } else {
        // Death scene.
        const next: GameState = {
          ...state,
          fate: { ...fate, is_locked: true, pending_event_id: null },
        };
        setState(next);
        setBusy("thinking");
        try {
          const resp = await runDeathScene(next);
          await applyTurn(next, resp, null, {
            markerText: "The end.",
            markerKind: "death",
            skipFateDecrement: true,
          });
          setEnded(true);
        } finally {
          setBusy(false);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fate refuses to be resolved");
    }
  }

  // Restore any unresolved fate event on reload.
  useEffect(() => {
    if (!state) return;
    if (hexOverlay || lastChanceOverlay) return;
    if (!state.fate?.pending_event_id) return;
    let cancelled = false;
    (async () => {
      try {
        const { event } = await getPendingFateEvent({ data: { saveId } });
        if (cancelled) return;
        if (!event) {
          const unlocked: GameState = {
            ...state,
            fate: { ...state.fate, is_locked: false, pending_event_id: null },
          };
          setState(unlocked);
          void updateSaveState(saveId, unlocked).catch(() => {});
          return;
        }
        if (event.type === "hex" && typeof event.roll === "number") {
          setHexOverlay({ eventId: event.id, roll: event.roll, pendingAction: null });
        } else if (event.type === "last_chance" && Array.isArray(event.cards)) {
          setLastChanceOverlay({ eventId: event.id, cards: event.cards });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.fate?.pending_event_id]);

  async function handleVoiceEnded(transcript: string) {
    if (!state || !voiceReq) return;
    const characterName = voiceReq.character_name;
    setVoiceReq(null);
    if (!transcript.trim()) {
      toast.info("Voice session ended.");
      return;
    }
    setBusy("thinking");
    try {
      const resp = await runVoiceSummaryTurn(state, characterName, transcript);
      await applyTurn(
        state,
        resp,
        `[voice with ${characterName}] ${transcript.slice(0, 400)}${transcript.length > 400 ? "…" : ""}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice follow-up failed");
    } finally {
      setBusy((b) => (b === "thinking" ? false : b));
    }
  }

  // Number-key shortcuts (1-4) for dialogue choices
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!latestScene || busy || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["TEXTAREA", "INPUT", "SELECT", "BUTTON"].includes(target.tagName) ||
          target.closest('[role="dialog"]'))
      )
        return;
      const n = Number(e.key);
      if (Number.isFinite(n) && n >= 1 && n <= Math.min(latestScene.choices.length, 9)) {
        e.preventDefault();
        submitAction(latestScene.choices[n - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestScene, busy]);

  async function conjurePrompt() {
    if (!state || conjuring !== "idle" || busy) return;
    setConjuring("casting");
    try {
      const scenes = state.scenes ?? [];
      const recent = scenes.slice(-3);
      const recentScene = scenes[scenes.length - 1];
      const existing = (recentScene?.choices ?? []).map((c, i) => `  ${i + 1}. ${c}`).join("\n");
      const narrationBlock = recent
        .map(
          (s, i) =>
            `Scene ${scenes.length - recent.length + i + 1}:\n${(s.narration ?? "").slice(0, 600)}`,
        )
        .join("\n\n");
      const inv = (state.inventory ?? [])
        .slice(0, 8)
        .map((it) => it.name)
        .filter(Boolean)
        .join(", ");
      const quests = (state.quests ?? [])
        .filter((q) => q.status === "active")
        .slice(0, 4)
        .map((q) => q.title)
        .join(", ");
      const codexNames = Object.keys(state.codex ?? {})
        .filter((n) => n !== "protagonist")
        .slice(-8);
      const npcs = codexNames.join(", ");
      const locs = "";
      const forbidden = recentConjuredRef.current.slice(-6);
      const context = [
        `Genre: ${state.meta.genre}`,
        `Title: ${state.meta.title}`,
        inv ? `Inventory: ${inv}` : "",
        quests ? `Active quests: ${quests}` : "",
        npcs ? `Known NPCs: ${npcs}` : "",
        locs ? `Known locations: ${locs}` : "",
        narrationBlock ? `Recent narration:\n${narrationBlock}` : "",
        existing ? `Offered choices (DO NOT paraphrase or restate any of these):\n${existing}` : "",
        forbidden.length
          ? `Previously conjured suggestions (DO NOT repeat the same topic or verb — pick a genuinely different direction):\n${forbidden.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}`
          : "",
        `Seed: ${Math.random().toString(36).slice(2, 10)}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const { prompt } = await aiQuickPrompt({ data: { context, model: state.model } });
      const cleaned =
        prompt
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)[0] ?? prompt.trim();
      recentConjuredRef.current = [...recentConjuredRef.current, cleaned].slice(-8);
      setConjuring("fading");
      setInput((prev) => (prev ? `${prev} ${cleaned}` : cleaned));
      setTimeout(() => setConjuring("idle"), 450);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Conjuring failed");
      setConjuring("idle");
    }
  }

  if (error) {
    return (
      <div className="min-h-[100dvh]">
        <TopBar />
        <div className="p-8 text-destructive">Could not load: {String(error)}</div>
      </div>
    );
  }
  if (isLoading || !state) {
    return (
      <div className="min-h-[100dvh]">
        <TopBar />
        <div
          className="flex items-center gap-2 p-8 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading adventure…
        </div>
      </div>
    );
  }

  const fontFamily = getFont(state.meta.narrator_font).family;

  return (
    <div
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)]"
      style={{ fontFamily, ...themeVars(state.meta.genre) }}
    >
      <TopBar
        title={state.meta.title}
        actions={
          <AdventureSettingsDialog
            state={state}
            onSave={async (changes) => {
              const continuityChanged =
                changes.protagonist_name !== state.meta.protagonist_name ||
                changes.protagonist !== state.meta.protagonist ||
                changes.art_style !== state.meta.art_style ||
                JSON.stringify(changes.appearance) !== JSON.stringify(state.meta.appearance);
              let codex = state.codex;
              if (continuityChanged) {
                const previousName = state.meta.protagonist_name;
                const previousEntry = state.codex[previousName];
                codex = { ...state.codex };
                if (previousName !== changes.protagonist_name) delete codex[previousName];
                codex[changes.protagonist_name] = {
                  dna: `${buildCharacterDNA(changes.protagonist_name, changes.appearance)}${changes.art_style ? ` Art style: ${changes.art_style}.` : ""}`,
                  personality: changes.protagonist || previousEntry?.personality || "",
                  last_seen: previousEntry?.last_seen || "current adventure",
                };
              }
              const fateEventActive = !!(
                state.fate?.is_locked ||
                state.fate?.pending_event_id ||
                state.fate?.curse_active
              );
              const next: GameState = {
                ...state,
                model: changes.model,
                codex,
                meta: {
                  ...state.meta,
                  title: changes.title,
                  genre: changes.genre,
                  tone: changes.tone,
                  protagonist_name: changes.protagonist_name,
                  protagonist: changes.protagonist,
                  appearance: changes.appearance,
                  art_style: changes.art_style,
                  narrator_voice: changes.narrator_voice,
                  narrator_font: changes.narrator_font,
                  image_enabled: changes.image_enabled,
                  image_model: changes.image_model,
                  video_enabled: changes.image_enabled && changes.video_enabled,
                  video_model: changes.video_model,
                },
                fate: {
                  ...(state.fate ?? DEFAULT_FATE),
                  death_enabled: fateEventActive ? state.fate.death_enabled : changes.death_enabled,
                  hexes_enabled: fateEventActive ? state.fate.hexes_enabled : changes.hexes_enabled,
                },
              };
              await persist(next);
              toast.success("Adventure settings saved");
            }}
          />
        }
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Main story column */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <ScrollArea className="flex-1" ref={scrollRef as never}>
            <div className="mx-auto max-w-3xl space-y-8 p-4 pb-8 sm:p-6 sm:pb-10">
              {state.scenes.map((scene, i) => (
                <SceneBlock
                  key={scene.id}
                  scene={scene}
                  sceneNumber={i + 1}
                  isLatest={i === state.scenes.length - 1}
                  state={state}
                />
              ))}

              {busy === "thinking" && (
                <div
                  className="scene-enter flex items-center gap-2.5 text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <Feather className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                  <span>GM is writing</span>
                  <span className="flex gap-1 ml-1">
                    <span className="gm-dot" style={{ animationDelay: "0s" }} />
                    <span className="gm-dot" style={{ animationDelay: "0.15s" }} />
                    <span className="gm-dot" style={{ animationDelay: "0.3s" }} />
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Scroll-to-bottom */}
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            className={`rune-btn absolute bottom-[calc(8rem+env(safe-area-inset-bottom))] right-4 z-20 rounded-full p-2.5 shadow-lg transition-opacity duration-200 sm:right-5 ${showScrollBtn ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <ArrowDown className="h-5 w-5" />
          </button>

          {/* Action bar / command line */}
          <div
            className="shrink-0 border-t border-white/10 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
            style={{
              background:
                "linear-gradient(180deg, oklch(0.16 0.014 60 / 85%), oklch(0.14 0.014 60 / 95%))",
            }}
          >
            <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
              {latestScene && latestScene.choices.length > 0 && !busy && (
                <ChoiceComposer
                  choices={latestScene.choices}
                  fontFamily={fontFamily}
                  conjuring={conjuring}
                  onSelect={(choice) => void submitAction(choice)}
                  onDraft={(choice) =>
                    setInput((previous) => (previous ? `${previous} ${choice}` : choice))
                  }
                  onConjure={() => void conjurePrompt()}
                />
              )}

              {state.current_voice_request && !voiceOpen && !busy && (
                <Button
                  variant="default"
                  className="w-full rune-btn pulse-cta font-hud text-[11px]"
                  onClick={() => {
                    setVoiceReq(state.current_voice_request);
                    setVoiceOpen(true);
                  }}
                >
                  <Mic className="mr-1 h-4 w-4" />
                  Speak to {state.current_voice_request.character_name}
                </Button>
              )}

              <form
                className="flex gap-2 items-stretch"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitAction(input);
                }}
              >
                <div className="flex-1 relative">
                  <label htmlFor="player-action" className="sr-only">
                    Your action
                  </label>
                  <Textarea
                    id="player-action"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="What do you do?"
                    rows={2}
                    disabled={!!busy || conjuring === "casting"}
                    className="bg-black/40 border-white/10 focus-visible:ring-[var(--accent)] resize-none pl-8"
                    style={{ fontFamily }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitAction(input);
                      }
                    }}
                  />
                  <Feather className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--accent)]/60" />
                  {conjuring !== "idle" && (
                    <div
                      className={`conjure-overlay ${conjuring === "fading" ? "fading" : ""}`}
                      aria-hidden
                    >
                      <span className="conjure-rune" style={{ left: "12%", animationDelay: "0s" }}>
                        ✦
                      </span>
                      <span
                        className="conjure-rune"
                        style={{ left: "34%", animationDelay: "0.4s" }}
                      >
                        ❈
                      </span>
                      <span
                        className="conjure-rune"
                        style={{ left: "56%", animationDelay: "0.8s" }}
                      >
                        ✧
                      </span>
                      <span
                        className="conjure-rune"
                        style={{ left: "78%", animationDelay: "1.2s" }}
                      >
                        ❋
                      </span>
                      <div
                        className="absolute inset-0 flex items-center justify-center font-hud text-[10px] tracking-widest uppercase"
                        style={{
                          color: "oklch(0.9 0.15 290)",
                          textShadow: "0 0 12px oklch(0.7 0.25 290)",
                        }}
                      >
                        Conjuring…
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!!busy || !input.trim()}
                    className="rune-btn h-full min-h-[44px]"
                    aria-label="Send action"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="lg:hidden font-hud"
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Open adventure journal</span>
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="right"
                      className="flex h-[100dvh] w-[min(22rem,92vw)] flex-col p-0 [&>button]:top-[max(1rem,env(safe-area-inset-top))]"
                      style={themeVars(state.meta.genre)}
                    >
                      <SheetHeader className="sr-only">
                        <SheetTitle>Adventure journal</SheetTitle>
                      </SheetHeader>
                      <div className="flex-1 overflow-hidden">
                        <StateSidebar state={state} />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex w-80 border-l border-white/10 flex-col h-full overflow-hidden hud-panel">
          <StateSidebar state={state} />
        </aside>
      </div>

      <VoiceDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        request={voiceReq}
        onEnded={(t) => {
          setVoiceOpen(false);
          handleVoiceEnded(t);
        }}
      />

      {hexOverlay && (
        <VexDiceGame roll={hexOverlay.roll} onComplete={(r) => void handleHexComplete(r.pick)} />
      )}
      {lastChanceOverlay && (
        <LastChanceHighLow
          cards={lastChanceOverlay.cards}
          characterName={state.meta.protagonist_name}
          onComplete={(r) =>
            void handleLastChanceComplete({ survived: r.survived, guesses: r.guesses })
          }
        />
      )}
      {ended && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-30 flex justify-center">
          <div className="hud-panel px-6 py-3 rounded-md font-display text-lg text-[var(--accent)] text-glow border border-[var(--accent)]/40">
            ✦ The End ✦
          </div>
        </div>
      )}
    </div>
  );
}
