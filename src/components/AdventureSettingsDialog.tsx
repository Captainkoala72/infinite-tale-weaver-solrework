import { useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_FONT_ID, FONTS } from "@/lib/game/fonts";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  TEXT_MODELS,
  VIDEO_MODELS,
} from "@/lib/game/models";
import type { Appearance, GameState } from "@/lib/game/types";
import { VOICES } from "@/lib/game/voices";

export type AdventureSettingsChanges = {
  title: string;
  genre: string;
  tone: string;
  protagonist_name: string;
  protagonist: string;
  appearance: Appearance;
  art_style: string;
  model: string;
  narrator_voice: string;
  narrator_font: string;
  image_enabled: boolean;
  image_model: string;
  video_enabled: boolean;
  video_model: string;
  death_enabled: boolean;
  hexes_enabled: boolean;
};

type Draft = AdventureSettingsChanges;

const APPEARANCE_FIELDS: Array<{
  key: keyof Appearance;
  label: string;
  placeholder: string;
}> = [
  { key: "gender", label: "Gender presentation", placeholder: "woman, man, non-binary…" },
  { key: "age", label: "Age", placeholder: "late twenties" },
  { key: "height", label: "Height", placeholder: "tall" },
  { key: "build", label: "Build", placeholder: "wiry" },
  { key: "skin", label: "Skin tone", placeholder: "warm brown" },
  { key: "eyes", label: "Eyes", placeholder: "grey-green" },
  { key: "hair_style", label: "Hair style", placeholder: "cropped curls" },
  { key: "hair_color", label: "Hair color", placeholder: "black" },
  { key: "glasses", label: "Glasses", placeholder: "round brass frames or none" },
  { key: "facial_hair", label: "Facial hair", placeholder: "short beard or none" },
  { key: "tattoos", label: "Tattoos", placeholder: "black star behind the left ear" },
  { key: "scars", label: "Scars or markings", placeholder: "thin scar across the right brow" },
  { key: "outfit", label: "Signature outfit", placeholder: "weathered coat and tall boots" },
  { key: "extras", label: "Distinguishing details", placeholder: "brass compass on a chain" },
];

function draftFromState(state: GameState): Draft {
  return {
    title: state.meta.title,
    genre: state.meta.genre,
    tone: state.meta.tone,
    protagonist_name: state.meta.protagonist_name,
    protagonist: state.meta.protagonist,
    appearance: { ...state.meta.appearance },
    art_style: state.meta.art_style,
    model: state.model,
    narrator_voice: state.meta.narrator_voice || "Kore",
    narrator_font: state.meta.narrator_font || DEFAULT_FONT_ID,
    image_enabled: state.meta.image_enabled !== false,
    image_model: state.meta.image_model || DEFAULT_IMAGE_MODEL,
    video_enabled: !!state.meta.video_enabled,
    video_model: state.meta.video_model || DEFAULT_VIDEO_MODEL,
    death_enabled: !!state.fate?.death_enabled,
    hexes_enabled: !!state.fate?.hexes_enabled,
  };
}

export function AdventureSettingsDialog({
  state,
  onSave,
}: {
  state: GameState;
  onSave: (next: AdventureSettingsChanges) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFromState(state));

  const fateEventActive = !!(
    state.fate?.is_locked ||
    state.fate?.pending_event_id ||
    state.fate?.curse_active
  );

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
    if (nextOpen) setDraft(draftFromState(state));
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateAppearance(key: keyof Appearance, value: string) {
    setDraft((current) => ({
      ...current,
      appearance: { ...current.appearance, [key]: value },
    }));
  }

  async function save() {
    if (saving || !draft.title.trim() || !draft.genre.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        genre: draft.genre.trim(),
        tone: draft.tone.trim(),
        protagonist_name: draft.protagonist_name.trim() || "Protagonist",
        protagonist: draft.protagonist.trim(),
        art_style: draft.art_style.trim(),
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save adventure settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Open adventure settings">
          <Settings className="mr-1 h-4 w-4" aria-hidden="true" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 pt-[env(safe-area-inset-top)] [&>button]:top-[max(1rem,env(safe-area-inset-top))] sm:h-[min(90dvh,760px)] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:rounded-lg sm:pt-0 sm:[&>button]:top-4">
        <DialogHeader className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pt-6">
          <DialogTitle>Adventure settings</DialogTitle>
          <DialogDescription>Tune future chapters without leaving your story.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="story" className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 overflow-x-auto border-b border-white/10 px-4 py-3 sm:px-6">
            <TabsList className="grid w-full min-w-[430px] grid-cols-3">
              <TabsTrigger value="story">Story & character</TabsTrigger>
              <TabsTrigger value="experience">AI & media</TabsTrigger>
              <TabsTrigger value="fate">Fate modes</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-5 py-5 sm:px-6">
              <TabsContent value="story" className="mt-0 space-y-6">
                <section aria-labelledby="identity-heading" className="space-y-4">
                  <div>
                    <h3 id="identity-heading" className="font-medium text-foreground">
                      Adventure identity
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      The title and tone can change freely at any time.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Title" htmlFor="adventure-title">
                      <Input
                        id="adventure-title"
                        value={draft.title}
                        onChange={(event) => update("title", event.target.value)}
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Tone" htmlFor="adventure-tone">
                      <Input
                        id="adventure-tone"
                        value={draft.tone}
                        onChange={(event) => update("tone", event.target.value)}
                        placeholder="Hopeful, tense, darkly funny…"
                      />
                    </Field>
                  </div>
                </section>

                <section
                  aria-labelledby="continuity-heading"
                  className="space-y-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
                      aria-hidden="true"
                    />
                    <div>
                      <h3 id="continuity-heading" className="font-medium text-foreground">
                        Continuity-sensitive details
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        These changes guide future narration and artwork. Earlier scenes stay
                        exactly as written.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Genre" htmlFor="adventure-genre">
                      <Input
                        id="adventure-genre"
                        value={draft.genre}
                        onChange={(event) => update("genre", event.target.value)}
                        placeholder="Dark fantasy, solar punk…"
                      />
                    </Field>
                    <Field label="Art style" htmlFor="adventure-art-style">
                      <Input
                        id="adventure-art-style"
                        value={draft.art_style}
                        onChange={(event) => update("art_style", event.target.value)}
                        placeholder="Painterly cinematic realism…"
                      />
                    </Field>
                    <Field label="Protagonist name" htmlFor="protagonist-name">
                      <Input
                        id="protagonist-name"
                        value={draft.protagonist_name}
                        onChange={(event) => update("protagonist_name", event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Protagonist direction"
                      htmlFor="protagonist-direction"
                      className="sm:col-span-2"
                    >
                      <Textarea
                        id="protagonist-direction"
                        value={draft.protagonist}
                        onChange={(event) => update("protagonist", event.target.value)}
                        rows={4}
                        placeholder="Background, personality, goals, flaws…"
                      />
                    </Field>
                  </div>

                  <details className="group rounded-md border border-white/10 bg-black/15">
                    <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Detailed appearance
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Optional
                      </span>
                    </summary>
                    <div className="grid gap-4 border-t border-white/10 p-3 sm:grid-cols-2">
                      {APPEARANCE_FIELDS.map((field) => (
                        <Field
                          key={field.key}
                          label={field.label}
                          htmlFor={`appearance-${field.key}`}
                          className={
                            field.key === "outfit" || field.key === "extras"
                              ? "sm:col-span-2"
                              : undefined
                          }
                        >
                          <Input
                            id={`appearance-${field.key}`}
                            value={draft.appearance[field.key]}
                            onChange={(event) => updateAppearance(field.key, event.target.value)}
                            placeholder={field.placeholder}
                          />
                        </Field>
                      ))}
                    </div>
                  </details>
                </section>
              </TabsContent>

              <TabsContent value="experience" className="mt-0 space-y-6">
                <section aria-labelledby="narration-heading" className="space-y-4">
                  <div>
                    <h3 id="narration-heading" className="font-medium text-foreground">
                      Narration
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      These choices apply to future turns and playback.
                    </p>
                  </div>
                  <Field label="Text model" htmlFor="text-model">
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Narrator voice" htmlFor="narrator-voice">
                      <Select
                        value={draft.narrator_voice}
                        onValueChange={(value) => update("narrator_voice", value)}
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
                    <Field label="Reading font" htmlFor="narrator-font">
                      <Select
                        value={draft.narrator_font}
                        onValueChange={(value) => update("narrator_font", value)}
                      >
                        <SelectTrigger id="narrator-font">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          {FONTS.map((font) => (
                            <SelectItem key={font.id} value={font.id}>
                              {font.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <p
                    className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-muted-foreground"
                    style={{
                      fontFamily: FONTS.find((font) => font.id === draft.narrator_font)?.family,
                    }}
                  >
                    The old lighthouse creaked as the storm rolled in.
                  </p>
                </section>

                <section
                  aria-labelledby="media-heading"
                  className="space-y-4 border-t border-white/10 pt-5"
                >
                  <div>
                    <h3 id="media-heading" className="font-medium text-foreground">
                      Scene artwork
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Choose still illustrations or short, silent video scenes.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-black/15 p-3">
                    <Label htmlFor="scene-media" className="min-w-0 cursor-pointer">
                      <span className="block text-sm text-foreground">Generate scene media</span>
                      <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                        Turn this off for a faster, text-only reading experience.
                      </span>
                    </Label>
                    <Switch
                      id="scene-media"
                      checked={draft.image_enabled}
                      onCheckedChange={(checked) => update("image_enabled", checked)}
                    />
                  </div>
                  {draft.image_enabled && (
                    <div className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-black/15 p-3">
                      <Label htmlFor="video-scenes" className="min-w-0 cursor-pointer">
                        <span className="block text-sm text-foreground">Generate video scenes</span>
                        <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                          Off uses still illustrations, which are faster to create.
                        </span>
                      </Label>
                      <Switch
                        id="video-scenes"
                        checked={draft.video_enabled}
                        onCheckedChange={(checked) => update("video_enabled", checked)}
                      />
                    </div>
                  )}
                  {draft.image_enabled &&
                    (draft.video_enabled ? (
                      <Field label="Video model" htmlFor="video-model">
                        <Select
                          value={draft.video_model}
                          onValueChange={(value) => update("video_model", value)}
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
                    ) : (
                      <Field label="Image model" htmlFor="image-model">
                        <Select
                          value={draft.image_model}
                          onValueChange={(value) => update("image_model", value)}
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
                    ))}
                </section>
              </TabsContent>

              <TabsContent value="fate" className="mt-0 space-y-4">
                <div>
                  <h3 className="font-medium text-foreground">Optional danger</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Fate modes change future turns. They can be adjusted unless an unresolved fate
                    event is underway.
                  </p>
                </div>

                <FateSwitch
                  id="death-mode"
                  label="Death Mode"
                  description="A hidden doom can begin. If the final Last Chance is lost, the adventure ends permanently."
                  checked={draft.death_enabled}
                  disabled={fateEventActive}
                  onCheckedChange={(checked) => update("death_enabled", checked)}
                />
                <FateSwitch
                  id="hex-mode"
                  label="Vex's Hexes"
                  description="Before some actions, Vex may demand an even-or-odd wager that changes what happens next."
                  checked={draft.hexes_enabled}
                  disabled={fateEventActive}
                  onCheckedChange={(checked) => update("hexes_enabled", checked)}
                />

                {fateEventActive && (
                  <p
                    role="status"
                    className="rounded-md border border-amber-400/25 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100/80"
                  >
                    Resolve the active fate event before changing Death Mode or Vex's Hexes. Your
                    other settings can still be saved now.
                  </p>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-white/10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || !draft.title.trim() || !draft.genre.trim()}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FateSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/15 p-4">
      <Label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
          {description}
        </span>
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={disabled ? `${id}-locked` : undefined}
      />
      {disabled && (
        <span id={`${id}-locked`} className="sr-only">
          Locked while a fate event is active.
        </span>
      )}
    </div>
  );
}
