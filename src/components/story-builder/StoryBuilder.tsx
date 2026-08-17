import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Dices,
  Image,
  Loader2,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createSave } from "@/lib/game/saves";
import { newGameState, type Appearance } from "@/lib/game/types";
import { FONTS } from "@/lib/game/fonts";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  TEXT_MODELS,
  VIDEO_MODELS,
} from "@/lib/game/models";
import { VOICES } from "@/lib/game/voices";
import { getGenreTheme, themeVars } from "@/lib/game/genre-theme";
import {
  APPEARANCE_OPTIONS,
  APPEARANCE_PRESETS,
  ART_STYLES,
  CAREER_TYPES,
  createEmptyDraft,
  GENRES,
  resolvedArtStyle,
  resolvedGenre,
  resolvedTone,
  SPORTS,
  STARTING_POINTS,
  STORY_DRAFT_KEY,
  SURPRISE_CONCEPTS,
  TONES,
  type StoryBuilderDraft,
} from "./story-builder-data";

const STEPS = [
  { title: "The World", short: "World", icon: BookOpen },
  { title: "Your Character", short: "Character", icon: UserRound },
  { title: "How It Plays", short: "Play", icon: WandSparkles },
] as const;

type FieldErrors = Partial<
  Record<
    | "title"
    | "premise"
    | "customGenre"
    | "customTone"
    | "customArtStyle"
    | "sport"
    | "protagonistName"
    | "background",
    string
  >
>;

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function loadDraft(): StoryBuilderDraft {
  const empty = createEmptyDraft();
  if (typeof window === "undefined") return empty;
  try {
    const stored = window.localStorage.getItem(STORY_DRAFT_KEY);
    if (!stored) return empty;
    const parsed = JSON.parse(stored) as Partial<StoryBuilderDraft>;
    return {
      ...empty,
      ...parsed,
      appearance: { ...empty.appearance, ...parsed.appearance },
    };
  } catch {
    try {
      window.localStorage.removeItem(STORY_DRAFT_KEY);
    } catch {
      // Storage can reject both reads and cleanup in strict privacy modes.
    }
    return empty;
  }
}

function persistDraft(draft: StoryBuilderDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage may be unavailable in strict privacy modes. The builder still works in memory.
  }
}

function randomAppearance(): Appearance {
  return {
    gender: pick(APPEARANCE_OPTIONS.gender),
    age: pick(APPEARANCE_OPTIONS.age),
    height: pick(APPEARANCE_OPTIONS.height),
    build: pick(APPEARANCE_OPTIONS.build),
    skin: pick(APPEARANCE_OPTIONS.skin),
    hair_style: pick(APPEARANCE_OPTIONS.hair_style),
    hair_color: pick(APPEARANCE_OPTIONS.hair_color),
    eyes: pick(APPEARANCE_OPTIONS.eyes),
    glasses: Math.random() < 0.25 ? pick(APPEARANCE_OPTIONS.glasses.slice(1)) : "none",
    facial_hair: Math.random() < 0.3 ? pick(APPEARANCE_OPTIONS.facial_hair.slice(1)) : "none",
    tattoos: "",
    scars: "",
    outfit: "",
    extras: "",
  };
}

function validateStep(draft: StoryBuilderDraft, step: number): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (draft.title.trim().length < 3) errors.title = "Use at least 3 characters for the title.";
    if (draft.premise.trim().length < 15) {
      errors.premise = "Give the story engine at least one sentence to begin with.";
    }
    if (draft.genre === "Custom" && !draft.customGenre.trim()) {
      errors.customGenre = "Name your custom genre.";
    }
    if (draft.tone === "Custom" && !draft.customTone.trim()) {
      errors.customTone = "Describe the tone you want.";
    }
    if (draft.artStyle === "Custom" && !draft.customArtStyle.trim()) {
      errors.customArtStyle = "Describe the visual style you want.";
    }
    if (resolvedGenre(draft).toLowerCase() === "sports" && !draft.sport.trim()) {
      errors.sport = "Choose or name a sport.";
    }
  }
  if (step === 1) {
    if (draft.protagonistName.trim().length < 2) {
      errors.protagonistName = "Give your protagonist a name.";
    }
    if (draft.background.trim().length < 10) {
      errors.background = "Add a short background so the story knows who you are.";
    }
  }
  return errors;
}

function protagonistPrompt(draft: StoryBuilderDraft): string {
  return [
    draft.background.trim(),
    draft.personality.trim() && `Personality: ${draft.personality.trim()}`,
    draft.goal.trim() && `Goal: ${draft.goal.trim()}`,
    draft.flaw.trim() && `Flaw: ${draft.flaw.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function StoryBuilder({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StoryBuilderDraft>(loadDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [creating, setCreating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const genre = resolvedGenre(draft) || "Adventure";
  const theme = getGenreTheme(genre);
  const GenreIcon = theme.icon;
  const progress = ((step + 1) / STEPS.length) * 100;
  const open = controlledOpen ?? internalOpen;

  const hasDraft = useMemo(
    () => Boolean(draft.title || draft.premise || draft.protagonistName || draft.background),
    [draft],
  );

  function update<K extends keyof StoryBuilderDraft>(key: K, value: StoryBuilderDraft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      persistDraft(next);
      return next;
    });
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateAppearance<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setDraft((current) => {
      const next = { ...current, appearance: { ...current.appearance, [key]: value } };
      persistDraft(next);
      return next;
    });
  }

  function applyConcept(scope: "world" | "character" | "all") {
    const concept = pick(SURPRISE_CONCEPTS);
    setDraft((current) => {
      let next = { ...current };
      if (scope === "world" || scope === "all") {
        next = {
          ...next,
          title: concept.title ?? next.title,
          premise: concept.premise ?? next.premise,
          genre: concept.genre ?? next.genre,
          tone: concept.tone ?? next.tone,
          artStyle: concept.artStyle ?? next.artStyle,
          customGenre: "",
          customTone: "",
          customArtStyle: "",
        };
      }
      if (scope === "character" || scope === "all") {
        next = {
          ...next,
          protagonistName: concept.protagonistName ?? next.protagonistName,
          background: concept.background ?? next.background,
          personality: concept.personality ?? next.personality,
          goal: concept.goal ?? next.goal,
          flaw: concept.flaw ?? next.flaw,
        };
      }
      if (scope === "all") next.appearance = randomAppearance();
      persistDraft(next);
      return next;
    });
    setErrors({});
  }

  function quickStart() {
    applyConcept("all");
    setStep(2);
    toast.success("A complete setup is ready to review.");
  }

  function reset() {
    const empty = createEmptyDraft();
    setDraft(empty);
    setStep(0);
    setErrors({});
    setDetailsOpen(false);
    setAdvancedOpen(false);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORY_DRAFT_KEY);
      } catch {
        // The in-memory draft was still cleared.
      }
    }
  }

  function setOpenValue(nextOpen: boolean) {
    if (onOpenChange) onOpenChange(nextOpen);
    else setInternalOpen(nextOpen);
  }

  function changeOpen(nextOpen: boolean) {
    if (!creating) setOpenValue(nextOpen);
  }

  function goNext() {
    const nextErrors = validateStep(draft, step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goToStep(nextStep: number) {
    if (nextStep <= step) {
      setStep(nextStep);
      setErrors({});
      return;
    }
    const nextErrors = validateStep(draft, step);
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) setStep(nextStep);
  }

  async function createAdventure() {
    const worldErrors = validateStep(draft, 0);
    const characterErrors = validateStep(draft, 1);
    const allErrors = { ...worldErrors, ...characterErrors };
    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      setStep(Object.keys(worldErrors).length ? 0 : 1);
      toast.error("A couple of story details still need your attention.");
      return;
    }

    setCreating(true);
    try {
      const state = newGameState({
        title: draft.title.trim(),
        genre,
        tone: resolvedTone(draft) || "Cinematic",
        premise: draft.premise.trim(),
        protagonist: protagonistPrompt(draft),
        protagonist_name: draft.protagonistName.trim(),
        character: {
          background: draft.background.trim(),
          personality: draft.personality.trim(),
          goal: draft.goal.trim(),
          flaw: draft.flaw.trim(),
        },
        appearance: draft.appearance,
        sports:
          genre.toLowerCase() === "sports"
            ? {
                sport: draft.sport.trim(),
                career_type: draft.careerType,
                starting_point: draft.startingPoint,
              }
            : undefined,
        art_style: resolvedArtStyle(draft),
        model: draft.model,
        narrator_voice: draft.narratorVoice,
        narrator_font: draft.narratorFont,
        image_enabled: draft.imageEnabled,
        image_model: draft.imageEnabled ? draft.imageModel : undefined,
        video_enabled: draft.imageEnabled && draft.videoEnabled,
        video_model: draft.videoEnabled ? draft.videoModel : undefined,
        death_enabled: draft.deathEnabled,
        hexes_enabled: draft.hexesEnabled,
      });
      const save = await createSave(draft.title.trim(), genre, state);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(STORY_DRAFT_KEY);
        } catch {
          // Story creation succeeded even if browser storage is unavailable.
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["saves"] });
      setOpenValue(false);
      reset();
      navigate({ to: "/play/$saveId", params: { saveId: save.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create this adventure.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="lg" className="rune-btn px-5 font-medium">
            <Plus className="mr-2 h-4 w-4" />
            Create new story
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 p-0 sm:h-[min(92dvh,860px)] sm:max-h-[92dvh] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-2xl sm:border"
        style={themeVars(genre)}
      >
        <header className="shrink-0 border-b border-white/10 bg-background/95 px-4 py-4 sm:px-6">
          <DialogHeader className="pr-9 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                  Infinite Tale Weaver
                </p>
                <DialogTitle className="font-display text-2xl sm:text-3xl">
                  Create a new story
                </DialogTitle>
                <DialogDescription className="mt-1 max-w-2xl text-sm">
                  Set the creative compass now. You can adjust AI, narration, and future-scene
                  settings later.
                </DialogDescription>
              </div>
              <div className="flex gap-2 pr-5 sm:pr-0">
                {hasDraft && (
                  <Button type="button" variant="ghost" size="sm" onClick={reset}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={quickStart}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Quick start
                </Button>
              </div>
            </div>
          </DialogHeader>

          <nav className="mt-4" aria-label="Story setup progress">
            <div className="mb-2 grid grid-cols-3 gap-1 sm:gap-3">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const complete = index < step;
                const current = index === step;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => goToStep(index)}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-xs transition-colors sm:justify-start sm:px-2",
                      current && "bg-[var(--accent)]/10 text-[var(--accent)]",
                      !current && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px]",
                        (current || complete) && "border-[var(--accent)] text-[var(--accent)]",
                      )}
                    >
                      {complete ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="hidden truncate sm:inline">{item.title}</span>
                    <span className="truncate sm:hidden">{item.short}</span>
                  </button>
                );
              })}
            </div>
            <Progress
              value={progress}
              className="h-1"
              aria-label={`${Math.round(progress)}% complete`}
            />
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:py-8">
            <div>
              {step === 0 && (
                <WorldStep
                  draft={draft}
                  errors={errors}
                  update={update}
                  onSurprise={() => applyConcept("world")}
                />
              )}
              {step === 1 && (
                <CharacterStep
                  draft={draft}
                  errors={errors}
                  update={update}
                  updateAppearance={updateAppearance}
                  detailsOpen={detailsOpen}
                  setDetailsOpen={setDetailsOpen}
                  onSurprise={() => applyConcept("character")}
                  onRandomAppearance={() => update("appearance", randomAppearance())}
                />
              )}
              {step === 2 && (
                <PlayStep
                  draft={draft}
                  update={update}
                  advancedOpen={advancedOpen}
                  setAdvancedOpen={setAdvancedOpen}
                />
              )}
            </div>
            <StorySummary draft={draft} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-background/95 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (step ? setStep((current) => current - 1) : changeOpen(false))}
              disabled={creating}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {step ? "Back" : "Keep draft & close"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={createAdventure}
                disabled={creating}
                className="rune-btn"
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {creating ? "Weaving your story…" : "Begin the adventure"}
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function StepHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
        {eyebrow}
      </p>
      <h2 id={id} className="mt-1 font-display text-3xl text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function OptionCard({
  selected,
  title,
  description,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative min-h-24 rounded-xl border bg-card/60 p-3 text-left transition-all hover:border-white/25 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {icon}
        {selected && (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-background">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </button>
  );
}

type UpdateDraft = <K extends keyof StoryBuilderDraft>(key: K, value: StoryBuilderDraft[K]) => void;

function WorldStep({
  draft,
  errors,
  update,
  onSurprise,
}: {
  draft: StoryBuilderDraft;
  errors: FieldErrors;
  update: UpdateDraft;
  onSurprise: () => void;
}) {
  const isSports = resolvedGenre(draft).toLowerCase() === "sports";
  return (
    <section aria-labelledby="world-step-heading">
      <div className="flex items-start justify-between gap-4">
        <StepHeading
          id="world-step-heading"
          eyebrow="Step 1 of 3"
          title="Build the world"
          description="Give the weaver a strong opening idea, then choose the mood and visual language. You can be precise or leave room for surprise."
        />
        <Button type="button" variant="outline" size="sm" onClick={onSurprise} className="shrink-0">
          <Dices className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Surprise me</span>
        </Button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="story-title" label="Story title" error={errors.title}>
            <Input
              id="story-title"
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="The Lighthouse Below"
              autoComplete="off"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "story-title-error" : undefined}
            />
          </Field>
          <Field id="story-tone" label="Tone">
            <Select value={draft.tone} onValueChange={(value) => update("tone", value)}>
              <SelectTrigger id="story-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {tone}
                  </SelectItem>
                ))}
                <SelectItem value="Custom">Custom tone…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field
          id="story-premise"
          label="Opening premise"
          hint="One or two sentences is enough. Focus on the disruption that starts the story."
          error={errors.premise}
        >
          <Textarea
            id="story-premise"
            rows={3}
            value={draft.premise}
            onChange={(event) => update("premise", event.target.value)}
            placeholder="At low tide, a lighthouse rises from beneath the harbor and begins signaling your name."
            aria-invalid={Boolean(errors.premise)}
            aria-describedby={errors.premise ? "story-premise-error" : "story-premise-hint"}
          />
        </Field>

        {draft.tone === "Custom" && (
          <Field id="custom-tone" label="Describe the tone" error={errors.customTone}>
            <Input
              id="custom-tone"
              value={draft.customTone}
              onChange={(event) => update("customTone", event.target.value)}
              placeholder="Rain-soaked, intimate, with flashes of bitter humor"
              aria-invalid={Boolean(errors.customTone)}
              aria-describedby={errors.customTone ? "custom-tone-error" : undefined}
            />
          </Field>
        )}

        <fieldset>
          <legend className="mb-3 text-sm font-medium">Genre</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {GENRES.map((option) => {
              const optionTheme = getGenreTheme(option.value);
              const Icon = optionTheme.icon;
              return (
                <OptionCard
                  key={option.value}
                  selected={draft.genre === option.value}
                  title={option.value}
                  description={option.description}
                  icon={<Icon className="h-4 w-4 text-[var(--accent)]" />}
                  onClick={() => update("genre", option.value)}
                />
              );
            })}
            <OptionCard
              selected={draft.genre === "Custom"}
              title="Your own genre"
              description="Invent a hybrid or describe something specific"
              icon={<Sparkles className="h-4 w-4 text-[var(--accent)]" />}
              onClick={() => update("genre", "Custom")}
            />
          </div>
        </fieldset>

        {draft.genre === "Custom" && (
          <Field id="custom-genre" label="Custom genre" error={errors.customGenre}>
            <Input
              id="custom-genre"
              value={draft.customGenre}
              onChange={(event) => update("customGenre", event.target.value)}
              placeholder="Solarpunk gothic romance"
              aria-invalid={Boolean(errors.customGenre)}
              aria-describedby={errors.customGenre ? "custom-genre-error" : undefined}
            />
          </Field>
        )}

        <fieldset>
          <legend className="mb-3 text-sm font-medium">Visual style</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {ART_STYLES.map((option) => (
              <OptionCard
                key={option.value}
                selected={draft.artStyle === option.value}
                title={option.value}
                description={option.description}
                icon={<Image className="h-4 w-4 text-[var(--accent)]" />}
                onClick={() => update("artStyle", option.value)}
              />
            ))}
            <OptionCard
              selected={draft.artStyle === "Custom"}
              title="Custom art direction"
              description="Write your own look for generated scenes"
              icon={<Sparkles className="h-4 w-4 text-[var(--accent)]" />}
              onClick={() => update("artStyle", "Custom")}
            />
          </div>
        </fieldset>

        {draft.artStyle === "Custom" && (
          <Field id="custom-art-style" label="Custom art direction" error={errors.customArtStyle}>
            <Input
              id="custom-art-style"
              value={draft.customArtStyle}
              onChange={(event) => update("customArtStyle", event.target.value)}
              placeholder="Hand-cut paper diorama with dramatic stage lighting"
              aria-invalid={Boolean(errors.customArtStyle)}
              aria-describedby={errors.customArtStyle ? "custom-art-style-error" : undefined}
            />
          </Field>
        )}

        {isSports && (
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
            <h3 className="font-display text-lg">Career setup</h3>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              These choices anchor the league, stakes, and progression of your sports story.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="sport" label="Sport" error={errors.sport}>
                <Select value={draft.sport} onValueChange={(value) => update("sport", value)}>
                  <SelectTrigger id="sport" aria-invalid={Boolean(errors.sport)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map((sport) => (
                      <SelectItem key={sport} value={sport}>
                        {sport}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="career-type" label="Your role">
                <Select
                  value={draft.careerType}
                  onValueChange={(value) => update("careerType", value)}
                >
                  <SelectTrigger id="career-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAREER_TYPES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="starting-point" label="Starting point">
                <Select
                  value={draft.startingPoint}
                  onValueChange={(value) => update("startingPoint", value)}
                >
                  <SelectTrigger id="starting-point">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STARTING_POINTS.map((point) => (
                      <SelectItem key={point} value={point}>
                        {point}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CharacterStep({
  draft,
  errors,
  update,
  updateAppearance,
  detailsOpen,
  setDetailsOpen,
  onSurprise,
  onRandomAppearance,
}: {
  draft: StoryBuilderDraft;
  errors: FieldErrors;
  update: UpdateDraft;
  updateAppearance: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  onSurprise: () => void;
  onRandomAppearance: () => void;
}) {
  return (
    <section aria-labelledby="character-step-heading">
      <div className="flex items-start justify-between gap-4">
        <StepHeading
          id="character-step-heading"
          eyebrow="Step 2 of 3"
          title="Meet your protagonist"
          description="A useful character has something they want and something that gets in the way. Appearance is optional, but helps illustrations stay consistent."
        />
        <Button type="button" variant="outline" size="sm" onClick={onSurprise} className="shrink-0">
          <Dices className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">New concept</span>
        </Button>
      </div>

      <div className="space-y-6">
        <Field id="character-name" label="Character name" error={errors.protagonistName}>
          <Input
            id="character-name"
            value={draft.protagonistName}
            onChange={(event) => update("protagonistName", event.target.value)}
            placeholder="Mara Venn"
            autoComplete="off"
            aria-invalid={Boolean(errors.protagonistName)}
            aria-describedby={errors.protagonistName ? "character-name-error" : undefined}
          />
        </Field>

        <Field
          id="character-background"
          label="Background"
          hint="What shaped them before page one?"
          error={errors.background}
        >
          <Textarea
            id="character-background"
            rows={3}
            value={draft.background}
            onChange={(event) => update("background", event.target.value)}
            placeholder="A disgraced cartographer who charts places that should not exist."
            aria-invalid={Boolean(errors.background)}
            aria-describedby={
              errors.background ? "character-background-error" : "character-background-hint"
            }
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="character-personality"
            label="Personality"
            hint="A few traits or a short sentence."
          >
            <Textarea
              id="character-personality"
              rows={2}
              value={draft.personality}
              onChange={(event) => update("personality", event.target.value)}
              placeholder="Observant, dry-witted, slow to trust"
              aria-describedby="character-personality-hint"
            />
          </Field>
          <Field id="character-goal" label="Driving goal" hint="What keeps them moving?">
            <Textarea
              id="character-goal"
              rows={2}
              value={draft.goal}
              onChange={(event) => update("goal", event.target.value)}
              placeholder="Learn why the drowned lighthouse remembers her"
              aria-describedby="character-goal-hint"
            />
          </Field>
        </div>

        <Field
          id="character-flaw"
          label="Flaw or complication"
          hint="Optional, but excellent fuel for consequences."
        >
          <Input
            id="character-flaw"
            value={draft.flaw}
            onChange={(event) => update("flaw", event.target.value)}
            placeholder="She would rather face danger alone than admit she needs help."
            aria-describedby="character-flaw-hint"
          />
        </Field>

        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Appearance direction</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a starting silhouette, or let every scene surprise you.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onRandomAppearance}>
              <Dices className="mr-1.5 h-3.5 w-3.5" />
              Randomize appearance
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {APPEARANCE_PRESETS.map((preset) => (
              <OptionCard
                key={preset.label}
                selected={Object.entries(preset.appearance).every(
                  ([key, value]) => draft.appearance[key as keyof Appearance] === value,
                )}
                title={preset.label}
                description={preset.description}
                onClick={() => update("appearance", { ...draft.appearance, ...preset.appearance })}
              />
            ))}
          </div>
        </div>

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">
              <span>Detailed appearance (optional)</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", detailsOpen && "rotate-180")}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 rounded-xl border bg-card/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(APPEARANCE_OPTIONS) as Array<keyof typeof APPEARANCE_OPTIONS>).map(
                (key) => (
                  <AppearanceSelect
                    key={key}
                    field={key}
                    value={draft.appearance[key]}
                    options={APPEARANCE_OPTIONS[key]}
                    onChange={(value) => updateAppearance(key, value)}
                  />
                ),
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="appearance-outfit" label="Signature outfit">
                <Input
                  id="appearance-outfit"
                  value={draft.appearance.outfit}
                  onChange={(event) => updateAppearance("outfit", event.target.value)}
                  placeholder="Weathered blue coat, brass compass"
                />
              </Field>
              <Field id="appearance-markings" label="Scars or markings">
                <Input
                  id="appearance-markings"
                  value={draft.appearance.scars}
                  onChange={(event) => updateAppearance("scars", event.target.value)}
                  placeholder="Thin scar across the right brow"
                />
              </Field>
              <Field id="appearance-tattoos" label="Tattoos">
                <Input
                  id="appearance-tattoos"
                  value={draft.appearance.tattoos}
                  onChange={(event) => updateAppearance("tattoos", event.target.value)}
                  placeholder="Black star behind the left ear"
                />
              </Field>
              <Field id="appearance-extras" label="Other distinguishing details">
                <Input
                  id="appearance-extras"
                  value={draft.appearance.extras}
                  onChange={(event) => updateAppearance("extras", event.target.value)}
                  placeholder="Prosthetic hand, raven companion"
                />
              </Field>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </section>
  );
}

const APPEARANCE_LABELS: Partial<Record<keyof Appearance, string>> = {
  gender: "Gender presentation",
  age: "Age",
  height: "Height",
  build: "Build",
  skin: "Skin tone",
  hair_style: "Hair style",
  hair_color: "Hair color",
  eyes: "Eye color",
  glasses: "Glasses",
  facial_hair: "Facial hair",
};

function AppearanceSelect<K extends keyof typeof APPEARANCE_OPTIONS>({
  field,
  value,
  options,
  onChange,
}: {
  field: K;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const id = `appearance-${field.replaceAll("_", "-")}`;
  return (
    <Field id={id} label={APPEARANCE_LABELS[field] ?? field}>
      <Select
        value={value || "__surprise"}
        onValueChange={(next) => onChange(next === "__surprise" ? "" : next)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__surprise">Surprise me</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function SettingToggle({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  warning,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border bg-card/50 p-4",
        checked && "border-[var(--accent)]/50 bg-[var(--accent)]/5",
      )}
    >
      <div>
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
          {warning && <ShieldAlert className="h-4 w-4 text-[var(--accent)]" />}
          {title}
        </Label>
        <p id={`${id}-description`} className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={`${id}-description`}
      />
    </div>
  );
}

function PlayStep({
  draft,
  update,
  advancedOpen,
  setAdvancedOpen,
}: {
  draft: StoryBuilderDraft;
  update: UpdateDraft;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
}) {
  const mediaMode = !draft.imageEnabled ? "text" : draft.videoEnabled ? "video" : "image";
  return (
    <section aria-labelledby="play-step-heading">
      <StepHeading
        id="play-step-heading"
        eyebrow="Step 3 of 3"
        title="Choose how it plays"
        description="Set the reading experience and decide how much danger can enter the tale. AI and media controls remain editable after the story begins."
      />

      <div className="space-y-7">
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Scene presentation</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <OptionCard
              selected={mediaMode === "text"}
              title="Text only"
              description="Fastest and most focused reading experience"
              icon={<BookOpen className="h-4 w-4 text-[var(--accent)]" />}
              onClick={() => {
                update("imageEnabled", false);
                update("videoEnabled", false);
              }}
            />
            <OptionCard
              selected={mediaMode === "image"}
              title="Illustrated"
              description="Create a still image for each major scene"
              icon={<Image className="h-4 w-4 text-[var(--accent)]" />}
              onClick={() => {
                update("imageEnabled", true);
                update("videoEnabled", false);
              }}
            />
            <OptionCard
              selected={mediaMode === "video"}
              title="Cinematic clips"
              description="Use short generated videos when available"
              icon={<Sparkles className="h-4 w-4 text-[var(--accent)]" />}
              onClick={() => {
                update("imageEnabled", true);
                update("videoEnabled", true);
              }}
            />
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="narrator-voice"
            label="Narrator voice"
            hint="Used when you listen to story text."
          >
            <Select
              value={draft.narratorVoice}
              onValueChange={(value) => update("narratorVoice", value)}
            >
              <SelectTrigger id="narrator-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {VOICES.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.label} · {voice.gender}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            id="narrator-font"
            label="Story font"
            hint="Choose the typeface used for narration."
          >
            <Select
              value={draft.narratorFont}
              onValueChange={(value) => update("narratorFont", value)}
            >
              <SelectTrigger id="narrator-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {FONTS.map((font) => (
                  <SelectItem key={font.id} value={font.id}>
                    <span style={{ fontFamily: font.family }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-medium">Danger modes</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Both are optional. They can be toggled later unless a fate event is already underway.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingToggle
              id="death-mode"
              title="Death Mode"
              description="Consequences may become fatal. A last-chance challenge can save you, but a loss ends the tale."
              checked={draft.deathEnabled}
              onCheckedChange={(checked) => update("deathEnabled", checked)}
              warning
            />
            <SettingToggle
              id="hex-mode"
              title="Vex's Hexes"
              description="A trickster may interrupt with a wager that bends fortune for or against your next choice."
              checked={draft.hexesEnabled}
              onCheckedChange={(checked) => update("hexesEnabled", checked)}
              warning
            />
          </div>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">
              <span>Advanced AI & media settings</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 rounded-xl border bg-card/40 p-4">
            <Field
              id="text-model"
              label="Story model"
              hint="Only configured providers will be available at runtime."
            >
              <Select value={draft.model} onValueChange={(value) => update("model", value)}>
                <SelectTrigger id="text-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {TEXT_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {draft.imageEnabled && (
              <Field id="image-model" label="Image model">
                <Select
                  value={draft.imageModel || DEFAULT_IMAGE_MODEL}
                  onValueChange={(value) => update("imageModel", value)}
                >
                  <SelectTrigger id="image-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {IMAGE_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {draft.videoEnabled && (
              <Field id="video-model" label="Video model">
                <Select
                  value={draft.videoModel || DEFAULT_VIDEO_MODEL}
                  onValueChange={(value) => update("videoModel", value)}
                >
                  <SelectTrigger id="video-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {VIDEO_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
            <div>
              <h3 className="font-display text-lg">Ready for page one</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Review the setup summary, then begin. Your draft stays on this device if you close
                the builder.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StorySummary({ draft }: { draft: StoryBuilderDraft }) {
  const genre = resolvedGenre(draft) || "Genre not chosen";
  const theme = getGenreTheme(genre);
  const Icon = theme.icon;
  const media = !draft.imageEnabled
    ? "Text only"
    : draft.videoEnabled
      ? "Cinematic clips"
      : "Illustrated";
  return (
    <aside
      className="h-fit rounded-2xl border bg-card/60 p-4 lg:sticky lg:top-0"
      aria-label="Story setup summary"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[var(--accent)]">
        <Icon className="h-4 w-4" />
        Story preview
      </div>
      <h3 className="mt-4 font-display text-2xl leading-tight">
        {draft.title.trim() || "Your untitled tale"}
      </h3>
      <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
        {draft.premise.trim() || "Your opening premise will appear here."}
      </p>

      <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
        <SummaryRow label="Genre" value={genre} />
        <SummaryRow label="Tone" value={resolvedTone(draft) || "—"} />
        <SummaryRow label="Art" value={resolvedArtStyle(draft) || "—"} />
        <SummaryRow label="Hero" value={draft.protagonistName.trim() || "Not named yet"} />
        <SummaryRow label="Scenes" value={media} />
      </dl>

      {(draft.deathEnabled || draft.hexesEnabled) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {draft.deathEnabled && (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs">
              Death Mode
            </span>
          )}
          {draft.hexesEnabled && (
            <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-xs">
              Vex's Hexes
            </span>
          )}
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Saved locally as you type. Nothing is created until you begin the adventure.
      </p>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] text-right text-foreground">{value}</dd>
    </div>
  );
}
